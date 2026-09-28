/* =========================================================
 *  封面抓取引擎（抖音）
 *  ---------------------------------------------------------
 *  职责：读到 src/data/videos.js 里填了 douyin 的视频，
 *        联网把那一页的封面图抓下来，存进 public/media/covers/，
 *        并生成 src/data/covers.generated.js 给页面用。
 *
 *  用法： npm run sync:covers      （或 npm run sync 一起跑）
 *
 *  为什么做成「下载到本地」而不是直接引用抖音的图片地址：
 *    · 抖音的图片地址带签名，过一段时间就失效，页面会变空图
 *    · 直接引外链，用户浏览器每次都要连抖音，慢且可能被防盗链挡
 *    · 存成本地 webp 之后，封面永久有效、离线也能看
 *
 *  抓不到封面时（视频被删、抖音改版、网络不通）不会报错退出，
 *  只是跳过那一条并打印原因，页面会退回用 poster 或渐变兜底。
 * ======================================================= */
import {
  readFileSync, writeFileSync, mkdirSync, existsSync, statSync
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const COVER_DIR_REL = 'public/media/covers';
const COVER_URL_PREFIX = 'media/covers';
const DATA_OUT = 'src/data/covers.generated.js';
const CACHE = '.cover-sync.json';

/** 浏览器 UA：抖音桌面页对无 UA 的请求会直接返回空壳 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const FETCH_HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9'
};

/* ---------- 小工具 ---------- */
function log(...a) { console.log(...a); }

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
  if (/(logo|avatar|default|placeholder)/i.test(u)) return true;
  return false;
}

/** 抖音的图集/封面地址通常长这样：.../img/xxx~c5_300x400.jpeg 或 p3-sign 签名地址 */
function looksLikeCover(u) {
  if (isNoiseImage(u)) return false;
  return /douyinpic\.com|douyin\.com\/img|aweme|imagex|tos-cn|byteimg/i.test(u);
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
      const clean = u.replace(/\\u002F/gi, '/').replace(/\\\//g, '/');      if (looksLikeCover(clean)) found.push(clean);
    }
  }
  return found;
}

/** 从 HTML 里按优先级找一张封面 */
export function extractCover(html) {
  if (!html) return '';

  // 1) og:image / twitter:image —— 分享卡片的封面，最稳
  const meta = html.match(
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi
  ) || [];
  for (const tag of meta) {
    const c = tag.match(/content=["']([^"']+)["']/i);
    if (c && looksLikeCover(c[1])) return c[1];
  }

  // 2) 页面里的 JSON 数据（RENDER_DATA / __pace_f / 各种 state）
  const fromJson = coversFromJson(html);
  if (fromJson.length) return fromJson[0];

  // 3) 直接扫 HTML 里的图片地址
  const anyImg = html.match(/https?:\/\/[^"'\s\\)]+(?:douyinpic|imagex|byteimg)[^"'\s\\)]*/gi) || [];
  for (const u of anyImg) {
    if (looksLikeCover(u)) return u;
  }

  return '';
}

/* ---------- 抓一条视频的封面 ---------- */
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

  // 拉页面
  let html = '';
  try {
    const res = hop.response && hop.response.ok
      ? hop.response
      : await fetchWithTimeout(finalUrl, { headers: FETCH_HEADERS }, 15000);
    if (!res.ok) return { ok: false, reason: '页面返回 HTTP ' + res.status, finalUrl, numId };
    html = await res.text();
  } catch (e) {
    return { ok: false, reason: '请求失败：' + e.message, finalUrl, numId };
  }

  const cover = extractCover(html);
  if (!cover) {
    return {
      ok: false,
      reason: html.length < 2000
        ? '页面是 JS 空壳（抖音可能挡了请求），没抓到封面'
        : '页面里没找到 og:image 之类的封面地址（抖音可能改版了）',
      finalUrl,
      numId
    };
  }

  return { ok: true, cover, finalUrl, numId, pageTitle: (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '' };
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
  // 需要抓封面的是「填了 douyin / embed」的视频。
  // 填了 poster 也照抓 —— 因为抖音链接的封面比手填的封面准得多，
  // 页面在抓到之后会优先用抓来的（想保留手填的封面就写 cover: false）。
  // 本地视频（只有 src）永远不抓。
  const targets = videos
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => (v.douyin || v.embed) && v.cover !== false);

  say('\n抓取视频封面…');
  if (!targets.length) {
    say('  没有需要抓封面的视频（没有 douyin / embed，或者写了 cover: false）。');
  }

  const out = {};
  let got = 0, skipped = 0, failed = 0;
  const notes = [];

  // 总时间预算：断网 / 抖音卡住时，不要让 npm run dev 卡在抓封面这一步
  const budgetMs = options.budgetMs || 45000;
  const startedAt = Date.now();
  let budgetOut = false;

  for (const { v, i } of targets) {
    const label = v.title || ('第 ' + (i + 1) + ' 条');
    const key = String(v.douyin || v.embed).trim();
    const prev = cache[key];

    // 已经抓过、文件还在 → 直接用
    if (!force && prev && prev.file && existsSync(join(root, 'public', prev.file))) {
      out[key] = { poster: prev.file, title: v.title };
      skipped++;
      say(`  · ${label}  已有封面，跳过（${prev.file}）`);
      continue;
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

    if (!r.ok) {
      failed++;
      say(`    ✗ ${r.reason}`);
      if (r.numId) say(`      真实地址：${r.finalUrl}`);
      continue;
    }

    const name = safeName(r.numId || (v.title || 'cover-' + (i + 1)));
    try {
      const saved = await download(r.cover, join(coverDir, name + '.jpg'));
      const rel = COVER_URL_PREFIX + '/' + saved.dest.split(/[\\/]/).pop();
      out[key] = { poster: rel, title: v.title };
      cache[key] = { file: rel, at: Date.now(), source: r.cover, numId: r.numId || '' };
      got++;
      say(`    ✓ ${rel}  (${(saved.bytes / 1024).toFixed(0)} KB)`);
    } catch (e) {
      failed++;
      say(`    ✗ 下载封面失败：${e.message}`);
    }
  }

  /* ---------- 写缓存 ---------- */
  writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');

  /* ---------- 写生成的数据文件 ---------- */
  const q = (s) => JSON.stringify(String(s == null ? '' : s)).replace(/<\//g, '<\\/');
  const L = [];
  L.push('/* =========================================================');
  L.push(' *  ⚠ 本文件由 tools/sync-covers.mjs 自动生成，手改会被覆盖！');
  L.push(' *');
  L.push(' *  作用：把「抖音视频链接」对应的封面图（已下载到 public/media/covers/）');
  L.push(' *        关联到视频上。页面在视频没填 poster 时用这里的封面兜底。');
  L.push(' *');
  L.push(' *  想自己指定封面 → 在 src/data/videos.js 里填 poster 字段（优先级更高）');
  L.push(' *  想重新抓一遍  → 删除 .cover-sync.json，或运行 npm run sync:covers -- --force');
  L.push(' *');
  L.push(' *  生成时间：' + new Date().toLocaleString('zh-CN'));
  L.push(` *  共 ${Object.keys(out).length} 条`);
  L.push(' * ======================================================= */');
  L.push('export default {');
  for (const [k, val] of Object.entries(out)) {
    L.push(`  ${q(k)}: ${q(val.poster)},`);
  }
  L.push('};');
  L.push('');
  writeFileSync(dataPath, L.join('\n'), 'utf8');

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
  }
  return summary;
}

/* ---------- 直接运行时 ---------- */
const invokedDirectly = process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const opts = { force: argv.includes('--force'), quiet: argv.includes('--quiet') };
  syncCovers(opts)
    .then(() => process.exit(0))
    .catch((e) => { console.error('抓封面失败：' + e.message); process.exit(1); });
}
