/* =========================================================
 *  封面 + 信息抓取引擎（抖音）
 *  ---------------------------------------------------------
 *  职责：读到 src/data/videos.js 里填了 douyin / embed 的视频，联网：
 *        1. 跟跳转，拿到真实的数字视频 id（短码 / 短链都能纠正）
 *        2. 抓封面 → 下载到 public/media/covers/（存本地，不怕签名过期）
 *        3. 顺便读标题 / 发布日期 / 时长
 *        4. 把「缺的字段」补回 videos.js（已有的值绝不覆盖）
 *        5. 生成 src/data/covers.generated.js 和 meta 给页面兜底
 *
 *  用法： npm run sync:covers      （或 npm run sync 一起跑）
 *
 *  为什么封面要下载到本地：
 *    · 抖音的图片地址带签名，过一段时间就失效，页面会变空图
 *    · 直接引外链，用户浏览器每次都要连抖音，慢且可能被防盗链挡
 *    · 存成本地 webp 之后，封面永久有效、离线也能看
 *
 *  抓不到时（视频被删、抖音改版、网络不通）不会报错退出，
 *  只是跳过那一条并打印原因，页面会退回用 poster 或渐变兜底。
 * ======================================================= */
import {
  readFileSync, writeFileSync, mkdirSync, existsSync, statSync
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { patchVideos } from './patch-videos.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const COVER_DIR_REL = 'public/media/covers';
const COVER_URL_PREFIX = 'media/covers';
const DATA_OUT = 'src/data/covers.generated.js';
const CACHE = '.cover-sync.json';

/** 抓失败后的重试间隔（秒）：越失败越久，避免每次启动都去打抖音 */
const FAIL_BACKOFF_SEC = [20, 300, 1800, 7200, 43200];

/** 浏览器 UA：抖音桌面页对无 UA 的请求会直接返回空壳 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const FETCH_HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9'
};

/** 有些入口（m.douyin.com）要移动端 UA 才返回带 og: 的页面 */
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/* ---------- 小工具 ---------- */

/** 文件名安全化（保留中文，去掉非法字符） */
function safeName(s, fallback = 'cover') {
  const cleaned = String(s || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '-')
    .replace(/^[.\s-]+|[.\s-]+$/g, '');
  return (cleaned || fallback).slice(0, 60);
}

/** 带超时的 fetch（网络不通时不至于卡死构建） */
async function fetchWithTimeout(url, options = {}, ms = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 跟一次跳转，拿到最终地址。
 * v.douyin.com 短链 → www.douyin.com/video/数字 就是这么拿到的。
 */
async function followRedirect(url, maxHop = 5) {
  let current = url;
  for (let i = 0; i < maxHop; i++) {
    let res;
    try {
      res = await fetchWithTimeout(current, { headers: FETCH_HEADERS, redirect: 'manual' }, 12000);
    } catch (e) {
      return { url: current, error: e.message };
    }
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      try {
        current = new URL(loc, current).href;
      } catch (e) {
        return { url: current, error: 'Location 头解析失败' };
      }
      continue;
    }
    return { url: current, response: res };
  }
  return { url: current, error: '跳转次数过多' };
}

/* ---------- 从 HTML 里找封面 ---------- */

/** 常见的「假封面」占位图，抓到这些等于没抓到 */
function isNoiseImage(u) {
  if (!u) return true;
  if (/\.(gif)(\?|$)/i.test(u)) return true;
  if (/(logo|avatar|default|placeholder|icon)/i.test(u)) return true;
  return false;
}

/** 抖音的图集/封面地址通常长这样：.../img/xxx~c5_300x400.jpeg 或 p3-sign 签名地址 */
function looksLikeCover(u) {
  if (isNoiseImage(u)) return false;
  return /douyinpic\.com|douyin\.com\/img|aweme|imagex|tos-cn|byteimg|zjcdn|snssdk/i.test(u);
}

/**
 * 从 HTML 里按优先级找一张封面。
 * 抖音的页面结构经常变，所以这里多留几条路，能命中一条就够。
 */
export function extractCover(html) {
  if (!html) return '';

  // 1) og:image / twitter:image —— 分享卡片的封面，最稳
  const meta = html.match(
    /<meta[^>]+(?:property|name)=["'](?:og:image|og:image:url|twitter:image|twitter:image:src)["'][^>]*>/gi
  ) || [];
  for (const tag of meta) {
    const c = tag.match(/content=["']([^"']+)["']/i);
    if (c && looksLikeCover(c[1])) return c[1];
  }

  // 2) itemprop / JSON-LD 里的缩略图字段
  const itemprop = html.match(/itemprop=["'](?:image|thumbnailUrl)["'][^>]*content=["']([^"']+)["']/i);
  if (itemprop && looksLikeCover(itemprop[1])) return itemprop[1];

  const jsonLd = html.match(/"(?:thumbnailUrl|image)"\s*:\s*"(https?:[^"]+)"/i);
  if (jsonLd && looksLikeCover(jsonLd[1])) return jsonLd[1];

  // 3) 页面里的 JSON 数据（RENDER_DATA / __pace_f / 各种 state）
  const fromJson = coversFromJson(html);
  if (fromJson.length) return fromJson[0];

  // 4) 任何抖音图床地址（放宽到「像封面」即可）
  const anyImg = html.match(
    /https?:\\?\/\\?\/[^"'\s\\)]+(?:douyinpic|imagex|byteimg|zjcdn)[^"'\s\\)]*/gi
  ) || [];
  for (const raw of anyImg) {
    const u = raw.replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
    if (looksLikeCover(u)) return u;
  }

  // 5) 兜底：页面里任何 og:image（哪怕域名不认识）
  for (const tag of meta) {
    const c = tag.match(/content=["']([^"']+)["']/i);
    if (c && !isNoiseImage(c[1])) return c[1];
  }

  return '';
}

/** 把 JSON 里所有可能是封面的字段挖出来（origin_cover / cover / dynamic_cover ...） */
function coversFromJson(text) {
  const found = [];
  const re = /"(?:origin_cover|dynamic_cover|cover|cover_url|poster)"\s*:\s*(\{[^{}]*\}|"[^"]*")/g;
  let m;
  while ((m = re.exec(text))) {
    const chunk = m[1];
    // { "url_list": ["https://..."] }
    const urls = chunk.match(/https?:\/\/[^"\\\s]+/g) || [];
    for (const u of urls) {
      const clean = u.replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
      if (looksLikeCover(clean)) found.push(clean);
    }
  }
  return found;
}

/* ---------- 元信息：标题 / 日期 / 时长 ---------- */

/** HTML 实体还原（&amp; &#39; 之类） */
function decodeEntities(s) {
  return String(s || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

/**
 * 从页面 JSON 里取一个标量字段。
 * 兼容 "create_time":1700000000 和 "createTime":"1700000000" 两种写法。
 */
function jsonScalar(html, keys) {
  for (const key of keys) {
    const re = new RegExp('"' + key + '"\\s*:\\s*("([^"]*)"|(\\d+(?:\\.\\d+)?))');
    const m = html.match(re);
    if (m) {
      const val = m[2] !== undefined ? m[2] : m[3];
      if (val !== undefined && val !== null && String(val).trim() !== '') return String(val).trim();
    }
  }
  return '';
}

/** 抖音把中文转义成 \uXXXX，还原一下 */
function unescapeUnicode(s) {
  return String(s || '').replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
    String.fromCharCode(parseInt(h, 16))
  );
}

/** 时间戳 / 各种日期写法 → 2026-09-28 */
function fmtDate(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  if (/^\d{9,13}$/.test(raw)) {
    let n = Number(raw);
    if (n < 1e12) n *= 1000; // 10 位是秒，补成毫秒
    const d = new Date(n);
    if (!isNaN(d.getTime())) {
      const p = (x) => String(x).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }
    return '';
  }
  const m = raw.match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
  if (m) {
    const p = (x) => String(x).padStart(2, '0');
    return `${m[1]}-${p(m[2])}-${p(m[3])}`;
  }
  return '';
}

/** 毫秒 / 秒 / "00:26" → "00:26" */
function fmtDuration(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(raw)) {
    const parts = raw.split(':');
    return parts.length === 2 ? `${parts[0].padStart(2, '0')}:${parts[1]}` : raw;
  }
  const n = Number(raw);
  if (!isFinite(n) || n <= 0) return '';
  let sec = n > 1000 ? Math.round(n / 1000) : Math.round(n); // >1000 当毫秒
  const h = Math.floor(sec / 3600);
  sec -= h * 3600;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  const p = (x) => String(x).padStart(2, '0');
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

/** 从页面里读标题 / 日期 / 时长 */
function extractMeta(html) {
  if (!html) return {};

  // 标题：og:title > <title> > JSON 里的 desc
  let title = '';
  const ogTitle = html.match(
    /<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]*content=["']([^"']+)["']/i
  );
  if (ogTitle) title = ogTitle[1];
  if (!title) {
    const t = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (t) title = t[1];
  }
  if (!title) title = jsonScalar(html, ['desc', 'title', 'share_title']);

  title = unescapeUnicode(decodeEntities(title))
    .replace(/\s*[-–|]\s*(抖音|Douyin)\s*$/i, '')   // 去掉「xxx - 抖音」后缀
    .replace(/^【[^】]*】\s*/, '')                  // 去掉【作者】前缀
    .trim();

  // 日期
  const date = fmtDate(
    jsonScalar(html, ['create_time', 'createTime', 'publish_time', 'publishTime'])
  );

  // 时长
  const duration = fmtDuration(
    jsonScalar(html, ['duration', 'video_duration', 'videoDuration', 'item_duration'])
  );

  return { title, date, duration };
}

/* ---------- 抓一条视频的封面 + 信息 ---------- */
async function resolveOne(entry) {
  const raw = String(entry.douyin || entry.embed || '').trim();
  if (!raw) return { ok: false, reason: '没有填 douyin / embed' };

  // 整段分享口令 → 抠链接
  const urlMatch = raw.match(/https?:\/\/[^\s"'<>）)】]+/i);
  let url = urlMatch ? urlMatch[0] : raw;

  // 纯数字或纯短码 → 拼成网页地址
  if (!/^https?:\/\//i.test(url)) {
    if (/^\d{10,25}$/.test(url)) url = 'https://www.douyin.com/video/' + url;
    else return { ok: false, reason: '不是链接也不是数字 id：' + raw };
  }

  if (!/douyin\.com/i.test(url)) return { ok: false, reason: '目前只支持抖音，其它平台请手填 poster' };

  // 先跟跳转：短链 → 真实地址（顺带能拿到数字 id）
  const hop = await followRedirect(url);
  const finalUrl = hop.url || url;
  const idMatch = finalUrl.match(/\/video\/(\d{10,25})/);
  const numId = idMatch ? idMatch[1] : '';

  // 抖音对不同入口返回的内容差别很大：分享页常有 og: 标签，桌面页常常是空壳。
  // 所以按候选地址逐个试，谁先给出封面 / 信息就用谁。
  const candidates = buildCandidates(numId, url, finalUrl);

  let lastReason = '没有可用的地址';
  let lastHtmlLength = 0;
  let best = { meta: {}, numId };

  for (const cand of candidates) {
    let html = '';
    let status = 0;
    try {
      const res = await fetchWithTimeout(cand.url, { headers: { ...FETCH_HEADERS, ...(cand.headers || {}) } }, 15000);
      status = res.status;
      if (!res.ok) { lastReason = `${cand.label} 返回 HTTP ${res.status}`; continue; }
      html = await res.text();
    } catch (e) {
      lastReason = `${cand.label} 请求失败：${e.message}`;
      continue;
    }

    lastHtmlLength = html.length;

    // 诊断模式：把每个候选地址的返回都存下来
    if (process.env.DSH_DUMP_COVER === '1') {
      try {
        const f = join(tmpdir(), `irinsho-douyin-${numId || 'x'}-${cand.tag}.html`);
        writeFileSync(f, html, 'utf8');
        console.log(`      [诊断] ${cand.label} → ${f}（${html.length} 字节，HTTP ${status}）`);
      } catch (e) { /* 存不下就算了 */ }
    }

    const meta = extractMeta(html);
    // 保留「信息最多的那一次」，万一所有候选都没有封面，还能拿它补标题日期
    const score = (meta.title ? 1 : 0) + (meta.date ? 1 : 0) + (meta.duration ? 1 : 0);
    const bestScore = (best.meta.title ? 1 : 0) + (best.meta.date ? 1 : 0) + (best.meta.duration ? 1 : 0);
    if (score > bestScore) best = { meta, numId };

    const cover = extractCover(html);
    if (cover) {
      const m = extractMeta(html);
      return {
        ok: true,
        cover,
        finalUrl: cand.url,
        numId,
        source: cand.label,
        meta: {
          title: m.title || best.meta.title || '',
          date: m.date || best.meta.date || '',
          duration: m.duration || best.meta.duration || ''
        },
        htmlLength: html.length
      };
    }

    lastReason = html.length < 3000
      ? `${cand.label} 只返回了 ${html.length} 字节的空壳`
      : `${cand.label} 的页面里没有封面地址`;
  }

  return {
    ok: false,
    reason: `试了 ${candidates.length} 个入口都没抓到：${lastReason}`,
    finalUrl,
    numId,
    meta: best.meta,
    htmlLength: lastHtmlLength
  };
}

/**
 * 列出可以试的抖音页面地址（按「最可能带 og: 标签」排前面）。
 * 抖音不同入口返回的 HTML 差别很大，多试几个能显著提高成功率。
 */
function buildCandidates(numId, originalUrl, finalUrl) {
  const list = [];
  const seen = new Set();

  const push = (tag, label, url, headers) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    list.push({ tag, label, url, headers });
  };

  if (numId) {
    // 分享页：通常是最轻、最容易带 og:image / og:title 的那个
    push('share', '分享页', `https://www.iesdouyin.com/share/video/${numId}/`);
    push('share-m', '移动分享页', `https://www.iesdouyin.com/share/video/${numId}/`, { 'User-Agent': MOBILE_UA });
    push('share-www', '分享页(备)', `https://www.douyin.com/share/video/${numId}/`);
    // 桌面页
    push('www', '桌面页', `https://www.douyin.com/video/${numId}`);
    push('www-referer', '桌面页(带 referer)', `https://www.douyin.com/video/${numId}`, {
      Referer: 'https://www.douyin.com/'
    });
    // 移动端站
    push('m', '移动站', `https://m.douyin.com/share/video/${numId}`, { 'User-Agent': MOBILE_UA });
  }

  // 用户自己填的地址也试一次（万一它本身就带 og:）
  if (originalUrl) push('origin', '你填的地址', originalUrl);
  if (finalUrl && finalUrl !== originalUrl) push('final', '跳转后的地址', finalUrl);

  return list;
}

/* ---------- 下载封面 ---------- */
async function download(coverUrl, destAbs) {
  const res = await fetchWithTimeout(
    coverUrl,
    { headers: { 'User-Agent': UA, 'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8' } },
    20000
  );
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error('文件太小（' + buf.length + ' 字节），可能不是图片');

  // 判断扩展名：抖音封面主流是 jpeg/webp
  const type = String(res.headers.get('content-type') || '');
  const ext = /png/i.test(type) ? '.png'
    : /webp/i.test(type) ? '.webp'
    : /gif/i.test(type) ? '.gif'
    : '.jpg';

  const dest = destAbs.replace(/\.[a-z0-9]+$/i, '') + ext;
  writeFileSync(dest, buf);
  return { dest, bytes: buf.length };
}

/* ---------- 从 videos.js 里读出视频列表 ---------- */
async function loadVideos(root) {
  const file = join(root, 'src', 'data', 'videos.js');
  if (!existsSync(file)) return [];
  try {
    // 用动态 import 读，避免自己写 JS 解析器
    const mod = await import(pathToFileURL(file).href + '?t=' + Date.now());
    const list = mod.default || [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    // videos.js 写坏了不要连带把 dev / build 卡住，交给 Astro 去报那个错
    console.log('  ! 读取 src/data/videos.js 失败，本次跳过封面抓取：' + e.message);
    return [];
  }
}

/* ---------- 主流程 ---------- */
export async function syncCovers(options = {}) {
  const root = options.root || ROOT;
  const quiet = !!options.quiet;
  const force = !!options.force;
  const say = quiet ? () => {} : (...a) => console.log(...a);

  const coverDir = join(root, COVER_DIR_REL);
  const cachePath = join(root, CACHE);
  const dataPath = join(root, DATA_OUT);
  mkdirSync(coverDir, { recursive: true });

  let cache = {};
  if (existsSync(cachePath)) {
    try { cache = JSON.parse(readFileSync(cachePath, 'utf8')) || {}; } catch (e) { cache = {}; }
  }

  const videos = await loadVideos(root);
  // 需要处理的是「填了 douyin / embed」的视频。
  // 填了 poster 也照抓 —— 因为抖音链接的封面比手填的封面准得多，
  // 页面在抓到之后会优先用抓来的（想保留手填的封面就写 cover: false）。
  // 本地视频（只有 src）永远不抓。
  const targets = videos
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => (v.douyin || v.embed) && v.cover !== false && !v.coverUrl);

  say('\n抓取视频封面…');
  if (!targets.length) {
    say('  没有需要自动抓封面的视频（没有 douyin / embed，或已写了 cover: false / coverUrl）。');
  }

  const out = {};
  let got = 0, skipped = 0, failed = 0;
  const notes = [];

  // 总时间预算：断网 / 抖音卡住时，不要让 npm run dev 卡在抓封面这一步
  const budgetMs = options.budgetMs || 45000;
  const startedAt = Date.now();
  let budgetOut = false;

  /* ---------- 手动兜底：填了 coverUrl 就直接下载它 ---------- */
  // 自动抓取万一被抖音挡住，你可以：
  //   浏览器打开视频页 → F12 → Network → 找一张图片 → 右键 Copy image address
  //   粘到 videos.js 的 coverUrl: '那个地址'
  // 这里不需要解析页面，直接下载，成功率 100%
  for (const { v, i } of targets) {
    const manual = String(v.coverUrl || '').trim();
    if (!manual) continue;
    const key = String(v.douyin || v.embed).trim();
    const label = v.title || ('第 ' + (i + 1) + ' 条');

    // 已经有手填 poster 了 → 尊重它（同时也能防止它被后面的自动抓取清掉）
    if (v.poster) {
      out[key] = { poster: v.poster, title: v.title || '', date: v.date || '', duration: v.duration || '' };
      continue;
    }

    const prev = cache[key];
    if (!force && prev && prev.file && prev.manual === manual && existsSync(join(root, 'public', prev.file))) {
      out[key] = { poster: prev.file, title: v.title || '', date: prev.date || '', duration: prev.duration || '' };
      continue;
    }

    say(`  → ${label}  使用手动封面 coverUrl…`);
    const name = safeName(prev && prev.numId ? prev.numId : (v.title || 'cover-' + (i + 1)));
    try {
      const saved = await download(manual, join(coverDir, name + '.jpg'));
      const rel = COVER_URL_PREFIX + '/' + saved.dest.split(/[\\/]/).pop();
      out[key] = { poster: rel, title: v.title || '', date: v.date || '', duration: v.duration || '' };
      cache[key] = { file: rel, at: Date.now(), fails: 0, manual, source: 'coverUrl', numId: (prev && prev.numId) || '' };
      got++;
      say(`    ✓ 封面 ${rel}  (${(saved.bytes / 1024).toFixed(0)} KB)`);
    } catch (e) {
      failed++;
      say(`    ✗ 下载 coverUrl 失败：${e.message}`);
    }
  }

  for (const { v, i } of targets) {
    const label = v.title || ('第 ' + (i + 1) + ' 条');
    const key = String(v.douyin || v.embed).trim();
    const prev = cache[key];

    // 已经抓过、文件还在 → 直接用（信息也一并沿用）
    if (!force && prev && prev.file && existsSync(join(root, 'public', prev.file))) {
      out[key] = {
        poster: prev.file,
        title: prev.title || v.title || '',
        date: prev.date || '',
        duration: prev.duration || ''
      };
      skipped++;
      say(`  · ${label}  已有封面，跳过（${prev.file}）`);
      continue;
    }

    // 上次没抓到 → 按退避策略决定这次还试不试
    if (!force && prev && prev.fails) {
      const waitMs = FAIL_BACKOFF_SEC[Math.min(prev.fails, FAIL_BACKOFF_SEC.length - 1)] * 1000;
      const since = Date.now() - (prev.at || 0);
      if (since < waitMs) {
        skipped++;
        const left = Math.ceil((waitMs - since) / 1000);
        const leftText = left >= 60 ? Math.ceil(left / 60) + ' 分钟' : left + ' 秒';
        say(`  · ${label}  上次没抓到，约 ${leftText}后再试（已失败 ${prev.fails} 次；想立刻重试加 --force）`);
        continue;
      }
    }

    if (Date.now() - startedAt > budgetMs) {
      if (!budgetOut) {
        say(`  ! 抓封面超过 ${Math.round(budgetMs / 1000)} 秒，剩下的先跳过（下次运行会继续）。`);
        budgetOut = true;
      }
      failed++;
      continue;
    }

    say(`  → ${label}  正在抓…`);
    let r;
    try {
      r = await resolveOne(v);
    } catch (e) {
      r = { ok: false, reason: e.message };
    }

    if (r.numId) {
      notes.push({ label, douyin: v.douyin || v.embed, numId: r.numId, finalUrl: r.finalUrl });
    }

    const meta = r.meta || {};

    if (!r.ok) {
      failed++;
      say(`    ✗ ${r.reason}`);
      if (typeof r.htmlLength === 'number') say(`      页面大小：${r.htmlLength} 字节`);
      if (r.numId) say(`      视频 id：${r.numId}`);
      if (r.finalUrl) say(`      真实地址：${r.finalUrl}`);
      say('      想让我按真实页面结构改提取规则的话，用这个命令再跑一次：');
      say('        node tools/sync-covers.mjs --force --dump');
      say('      它会把抖音返回的原始页面存到系统临时目录并打印路径，把那个文件发我即可。');
      // 封面没抓到，但标题/日期/时长可能抓到了，先留着
      const preTitle = (prev && prev.title) || '';
      const preDate = (prev && prev.date) || '';
      const preDur = (prev && prev.duration) || '';
      if (meta.title || meta.date || meta.duration) {
        out[key] = { poster: '', title: meta.title || '', date: meta.date || '', duration: meta.duration || '' };
        say(`      但抓到了信息：${[meta.title, meta.date, meta.duration].filter(Boolean).join('  /  ')}`);
      }
      // 记下失败次数和时间，下次按退避间隔再试
      cache[key] = {
        file: (prev && prev.file) || '',
        at: Date.now(),
        fails: ((prev && prev.fails) || 0) + 1,
        numId: r.numId || (prev && prev.numId) || '',
        title: meta.title || preTitle,
        date: meta.date || preDate,
        duration: meta.duration || preDur
      };
      continue;
    }

    const name = safeName(r.numId || (v.title || 'cover-' + (i + 1)));
    try {
      const saved = await download(r.cover, join(coverDir, name + '.jpg'));
      const rel = COVER_URL_PREFIX + '/' + saved.dest.split(/[\\/]/).pop();
      out[key] = { poster: rel, title: meta.title || '', date: meta.date || '', duration: meta.duration || '' };
      cache[key] = {
        file: rel, at: Date.now(), fails: 0, source: r.cover, numId: r.numId || '',
        title: meta.title || '', date: meta.date || '', duration: meta.duration || ''
      };
      got++;
      say(`    ✓ 封面 ${rel}  (${(saved.bytes / 1024).toFixed(0)} KB)`);
      if (r.source) say(`      来源：${r.source}`);
      if (meta.title) say(`      标题：${meta.title}`);
      if (meta.date) say(`      日期：${meta.date}`);
      if (meta.duration) say(`      时长：${meta.duration}`);
    } catch (e) {
      failed++;
      say(`    ✗ 下载封面失败：${e.message}`);
      cache[key] = {
        file: (prev && prev.file) || '',
        at: Date.now(),
        fails: ((prev && prev.fails) || 0) + 1,
        numId: r.numId || '',
        title: meta.title || '', date: meta.date || '', duration: meta.duration || ''
      };
    }
  }

  /* ---------- 把抓到的信息补回 videos.js（只填空的，不覆盖你写的） ---------- */
  const patchEntries = videos
    .map((v, i) => {
      const key = String(v.douyin || v.embed || '').trim();
      const info = out[key];
      if (!key || !info) return null;

      const fields = {};
      if (info.title && !v.title) fields.title = info.title;
      if (info.date && !v.date) fields.date = info.date;
      if (info.duration && !v.duration) fields.duration = info.duration;
      if (info.poster && v.cover !== false) fields.poster = info.poster;

      if (!Object.keys(fields).length) return null;
      return {
        index: i,
        title: v.title || info.title || '',
        match: [key],
        fields
      };
    })
    .filter(Boolean);

  let patched = [];
  if (patchEntries.length) {
    try {
      const res = patchVideos({ root, entries: patchEntries });
      patched = res.changed || [];
    } catch (e) {
      say('  ! 回填 videos.js 失败（不影响页面显示）：' + e.message);
    }
  }

  /* ---------- 页面兜底：重新读一次 videos.js ---------- */
  // 能写进 videos.js 的已经写了；读不出来的（字段已被你填过、或文件改写失败）
  // 由生成的这个文件兜底，保证页面一定有值可用
  const videosAfter = await loadVideos(root);
  const byKey = {};
  for (const v of videosAfter) {
    const key = String(v.douyin || v.embed || '').trim();
    if (key) byKey[key] = v;
  }
  for (const [key, info] of Object.entries(out)) {
    const cur = byKey[key] || {};
    info.title = cur.title || info.title || '';
    info.date = cur.date || info.date || '';
    info.duration = cur.duration || info.duration || '';
  }

  /* ---------- 写缓存 ---------- */
  writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');

  /* ---------- 写生成的数据文件 ---------- */
  const q = (s) => JSON.stringify(String(s == null ? '' : s)).replace(/<\//g, '<\\/');
  const L = [];
  L.push('/* =========================================================');
  L.push(' *  ⚠ 本文件由 tools/sync-covers.mjs 自动生成，手改会被覆盖！');
  L.push(' *');
  L.push(' *  作用：抖音视频的「封面 / 标题 / 日期 / 时长」。');
  L.push(' *        封面已下载到 public/media/covers/，不怕链接签名过期。');
  L.push(' *        页面在 videos.js 里对应字段为空时，用这里的值兜底。');
  L.push(' *');
  L.push(' *  想自己指定 → 直接在 src/data/videos.js 里填 poster / title / date / duration');
  L.push(' *              （你填的值永远优先，这里只做兜底）');
  L.push(' *  想重新抓   → 删除 .cover-sync.json，或运行 npm run sync:covers -- --force');
  L.push(' *');
  L.push(' *  生成时间：' + new Date().toLocaleString('zh-CN'));
  L.push(` *  共 ${Object.keys(out).length} 条`);
  L.push(' * ======================================================= */');
  L.push('export default {');
  for (const [k, val] of Object.entries(out)) {
    L.push(`  ${q(k)}: {`);
    L.push(`    poster:   ${q(val.poster)},`);
    if (val.title || val.date || val.duration) {
      L.push(`    title:    ${q(val.title)},`);
      L.push(`    date:     ${q(val.date)},`);
      L.push(`    duration: ${q(val.duration)}`);
    }
    L.push('  },');
  }
  L.push('};');
  L.push('');
  writeFileSync(dataPath, L.join('\n'), 'utf8');

  /* ---------- 报告回填结果 ---------- */
  if (!quiet && patched.length) {
    console.log('\n已把抓到的信息补进 src/data/videos.js（只填了空字段）：');
    for (const p of patched) {
      console.log(`  · ${p.title || ('第 ' + (p.index + 1) + ' 条')}  →  ${p.fields.join('、')}`);
    }
  }

  /* ---------- 给一条「可以更好」的建议 ---------- */
  if (!quiet) {
    const shortCodes = notes.filter((n) => {
      const s = String(n.douyin || '');
      return /douyin\.com\/video\/[0-9A-Za-z_-]{4,}$/.test(s) && !/\/video\/\d{10,25}/.test(s);
    });
    if (shortCodes.length) {
      console.log('\n提示：下面这些抖音链接不是数字视频 id，播放器可能不认。');
      console.log('     照着右边的数字改一下 douyin 字段，站内就能直接播放：');
      for (const n of shortCodes) {
        console.log(`  · ${n.label}`);
        console.log(`      现在：${n.douyin}`);
        if (n.numId) console.log(`      建议：douyin: '${n.numId}'`);
        else console.log('      （没能拿到数字 id，请用浏览器打开链接，复制地址栏里 /video/ 后面的数字）');
      }
    }
  }

  const summary = { total: targets.length, got, skipped, failed, mode: 'douyin' };
  if (!quiet) {
    console.log('-'.repeat(58));
    console.log(`需要封面 ${targets.length} 条   新抓 ${got}   跳过 ${skipped}   失败 ${failed}`);
    console.log('已更新 src/data/covers.generated.js');
    console.log('-'.repeat(58) + '\n');
  } else if (failed) {
    // 自动同步模式（quiet）下也别把问题吞掉，给一行提示
    console.log(`  ! 有 ${failed} 条视频的封面没抓到，详情：node tools/sync-covers.mjs --force --dump`);
  }
  return summary;
}

/* ---------- 直接运行时 ---------- */
const invokedDirectly = process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  const argv = process.argv.slice(2);
  if (argv.includes('--dump')) process.env.DSH_DUMP_COVER = '1';
  const opts = { force: argv.includes('--force'), quiet: argv.includes('--quiet') };
  syncCovers(opts)
    .then(() => process.exit(0))
    .catch((e) => { console.error('抓封面失败：' + e.message); process.exit(1); });
}
