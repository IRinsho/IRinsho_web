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
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { patchVideos } from './patch-videos.mjs';
// 抖音取画面：用 DevTools 协议精确截取 <video> 区域（不下载视频）
import { captureDouyinFrame } from './douyin-frames.mjs';

// 给 loadSharp() 用的 CommonJS require（sharp 是 CJS 包）
const require = createRequire(import.meta.url);
// 复用页面那套链接解析（抖音 / B站 / YouTube 都能认出来），避免两处逻辑不一致
import { resolveEmbed } from '../src/lib/embeds.js';

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

/**
 * 明确不是图片的地址（脚本 / 样式 / 埋点 / 监控）。
 * ⚠ 这条是踩过坑加的：字节的 zjcdn / snssdk 既放图片也放 JS，
 *   之前把 `.../bdms/xxx.js` 当成封面下载了，浏览器解不开 →
 *   卡片变成一块空的深色板。
 */
const NOT_IMAGE = /\.(js|mjs|css|json|map|html?)(\?|$)|(^|[/._-])(bdms|sdk|monitor|slardar|collect|analytics|log)([/._-]|$)|zijieapi|bytescm|bytecdn|bytedns|lf\d?-|snssdk|zjcdn|wallpaper|extension|sprite|banner|promo|activity|placeholder/i;

/** 可能是图片的域名（图床） */
const IMAGE_HOST = /douyinpic\.com|douyin\.com\/img|byteimg|imagex|tos-cn|[a-z0-9-]*sign\.[a-z0-9.-]*douyinpic|aweme[\w-]*\.(jpe?g|png|webp)/i;

/** 明确的图片扩展名 */
const IMAGE_EXT = /\.(jpe?g|png|webp|avif|heic|bmp)(\?|~|$|&)/i;

/** 抖音图床常见特征：~tplv / ~c5_ / /img/ / origin_cover 等 */
const IMAGE_HINT = /~tplv|~c5_|\/img\/|origin_cover|image_type=|imagex|\.image/i;

/** 这个地址像不像一张封面 */
function looksLikeCover(u) {
  if (!u) return false;
  if (isNoiseImage(u)) return false;
  if (NOT_IMAGE.test(u)) return false;
  // 三条里命中一条就收：图床域名 / 明确图片扩展名 / 抖音图片特征
  return IMAGE_HOST.test(u) || IMAGE_EXT.test(u) || IMAGE_HINT.test(u);
}

/**
 * 从 HTML 里按优先级找一张封面。
 * 抖音的页面结构经常变，所以这里多留几条路，能命中一条就够。
 *
 * ⚠ 关键点：抖音把视频数据塞在 <script id="RENDER_DATA"> 这类数据脚本里，
 *   而且内容是 **URL 编码过的**（%7B%22...%22%7D）。直接正则扫原始 HTML
 *   是找不到封面的 —— 必须先把这些脚本解出来再扫。这是之前抓不到的根因。
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

  // 3) 数据脚本里的 JSON（RENDER_DATA / _ROUTER_DATA / INITIAL_STATE ...）
  //    这是抖音真正放封面的地方，且通常被 URL 编码过
  for (const text of dataScripts(html)) {
    const fromJson = coversFromJson(text);
    if (fromJson.length) return fromJson[0];
    const hit = firstImageUrl(text);
    if (hit) return hit;
  }

  // 4) 原始 HTML 里直接找 JSON 字段（有些接口返回没编码）
  const fromRaw = coversFromJson(html);
  if (fromRaw.length) return fromRaw[0];

  // 5) 任何抖音图床地址（放宽到「像封面」即可）
  const hit = firstImageUrl(html);
  if (hit) return hit;

  // 6) 兜底：页面里任何 og:image（哪怕域名不认识）
  for (const tag of meta) {
    const c = tag.match(/content=["']([^"']+)["']/i);
    if (c && !isNoiseImage(c[1])) return c[1];
  }

  return '';
}

/** 安全地做一次 URL 解码（内容里混着坏 % 时不至于抛错） */
function safeDecode(s) {
  try {
    return decodeURIComponent(String(s || ''));
  } catch (e) {
    return String(s || '');
  }
}

/**
 * 把页面里的「数据脚本」内容解出来。
 *
 * 做法很粗暴但有效：**扫描所有 <script> 块**，只要里面提到 cover / 图床域名 /
 * aweme 之类关键词，就把它连同「URL 解码后」的版本一起交出去。
 * 这样不管抖音是用 <script id="RENDER_DATA">、window._ROUTER_DATA = {...}
 * 还是 __INITIAL_STATE__，都能覆盖到。
 *
 * （之前只按固定 id 匹配 + 用非贪婪 {.*?} 匹配变量，会被第一个 } 截断，
 *   是抓不到数据的另一个原因。）
 */
function dataScripts(html) {
  const out = [];
  const seen = new Set();

  const push = (body) => {
    if (!body) return;
    const raw = String(body).trim();
    if (!raw) return;
    // 原文 + 一层解码 + 两层解码（抖音常做 URL 编码）
    for (const text of [raw, safeDecode(raw), safeDecode(safeDecode(raw))]) {
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push(text);
    }
  };

  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1] || '';
    if (raw.length < 20) continue;
    // 只处理可能含数据的脚本，避免把无关的 JS 也搬来搬去
    if (!/(cover|douyinpic|imagex|byteimg|zjcdn|aweme|create_time|RENDER_DATA|ROUTER_DATA)/i.test(raw)) continue;
    push(raw);
  }

  return out;
}

/** 在一段文本里找第一个「像封面」的图片地址（含被转义的写法） */
function firstImageUrl(text) {
  // 注意：字符类里**不能**排除反斜杠，否则 https:\/\/a.com\/b.jpg
  // 会在第一个 \/ 处被截断成半截地址。先连着反斜杠一起匹配，再统一清掉。
  const re = /https?:(?:\\?\/){2}[^"'\s)]+/gi;
  let m;
  while ((m = re.exec(text))) {
    const u = m[0].replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/\\/g, '');
    if (looksLikeCover(u)) return u;
  }
  return '';
}

/** 把 JSON 里所有可能是封面的字段挖出来（origin_cover / cover / dynamic_cover ...） */
function coversFromJson(text) {
  const found = [];
  const re = /"(?:origin_cover|dynamic_cover|cover|cover_url|poster|thumbnail|thumb)"\s*:\s*(\{[^{}]*\}|"[^"]*")/g;
  let m;
  while ((m = re.exec(text))) {
    const chunk = m[1];
    // { "url_list": ["https://..."] }
    const urls = chunk.match(/https?:(?:\\?\/){2}[^"\s]+/g) || [];
    for (const u of urls) {
      const clean = u.replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/\\/g, '');
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

/** 抖音的通用站点标题（这些不是视频标题，抓到要丢掉） */
const GENERIC_TITLES = /在抖音记录美好生活|抖音记录美好生活|记录美好生活|抖音[-–|]\s*记录|抖音短视频|^抖音$|^Douyin$|抖音网页版/i;

/** 从页面里读标题 / 日期 / 时长 */
function extractMeta(html) {
  if (!html) return {};

  const scripts = dataScripts(html);   // 解码后的数据脚本（真正放信息的地方）

  /* ---------- 标题 ---------- */
  const candidates = [];

  const ogTitle = html.match(
    /<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]*content=["']([^"']+)["']/i
  );
  if (ogTitle) candidates.push(ogTitle[1]);

  // 数据脚本里的 desc / share_title / title（抖音视频文案常放在 desc）
  for (const text of scripts) {
    for (const key of ['desc', 'share_title', 'title', 'item_title', 'aweme_desc']) {
      const v = jsonScalar(text, [key]);
      if (v) candidates.push(v);
    }
  }

  // 原始 HTML 里的（没编码的情况）
  for (const key of ['desc', 'share_title', 'item_title']) {
    const v = jsonScalar(html, [key]);
    if (v) candidates.push(v);
  }

  const t = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (t) candidates.push(t[1]);

  let title = '';
  for (const c of candidates) {
    const cleaned = unescapeUnicode(decodeEntities(c))
      .replace(/\s*[-–|]\s*(抖音|Douyin)\s*$/i, '')   // 去掉「xxx - 抖音」后缀
      .replace(/^【[^】]*】\s*/, '')                  // 去掉【作者】前缀
      .replace(/\s+/g, ' ')
      .trim();
    // 太短、或就是抖音通用站点标题 → 不要
    if (!cleaned || cleaned.length < 2) continue;
    if (GENERIC_TITLES.test(cleaned)) continue;
    title = cleaned.slice(0, 60);
    break;
  }

  /* ---------- 日期（create_time 通常是 10 位秒级时间戳） ---------- */
  const dateKeys = ['create_time', 'createTime', 'publish_time', 'publishTime', 'create_date'];
  let date = '';
  for (const text of scripts) {
    date = fmtDate(jsonScalar(text, dateKeys));
    if (date) break;
  }
  if (!date) date = fmtDate(jsonScalar(html, dateKeys));

  /* ---------- 时长（duration 通常是毫秒） ---------- */
  const durKeys = ['duration', 'video_duration', 'videoDuration', 'item_duration'];
  let duration = '';
  for (const text of scripts) {
    duration = fmtDuration(jsonScalar(text, durKeys));
    if (duration) break;
  }
  if (!duration) duration = fmtDuration(jsonScalar(html, durKeys));

  return { title, date, duration };
}

/* ---------- 本机浏览器当渲染引擎（抖音这类客户端渲染页面的正解） ----------
 *  抖音的 HTML 里没有封面，但**渲染之后**的页面里有。
 *  Windows 自带 Edge（或装了 Chrome），它们都能无头运行：
 *      msedge --headless=new --dump-dom <url>
 *  等于用你自己的浏览器把页面跑一遍，再把渲染后的 DOM 吐出来给我们找封面。
 *  全程自动，不需要登录，也不需要 npm 装任何依赖。 */
const BROWSER_CANDIDATES = [
  process.env['PROGRAMFILES'] && `${process.env['PROGRAMFILES']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  process.env['PROGRAMFILES(X86)'] && `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  process.env['LOCALAPPDATA'] && `${process.env['LOCALAPPDATA']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  process.env['PROGRAMFILES'] && `${process.env['PROGRAMFILES']}\\Google\\Chrome\\Application\\chrome.exe`,
  process.env['PROGRAMFILES(X86)'] && `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
  process.env['LOCALAPPDATA'] && `${process.env['LOCALAPPDATA']}\\Google\\Chrome\\Application\\chrome.exe`
].filter(Boolean);

function findBrowser() {
  for (const p of BROWSER_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  return '';
}

/** 无头渲染一个页面，返回渲染后的 DOM（失败返回空串） */
function renderDom(browser, url, waitMs = 10000) {
  const profile = mkdtempSync(join(tmpdir(), 'irinsho-render-'));
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--mute-audio',
    '--hide-scrollbars',
    '--user-data-dir=' + profile,
    `--virtual-time-budget=${waitMs}`,
    '--dump-dom',
    url
  ];
  const r = spawnSync(browser, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 60000
  });
  return r.stdout || '';
}

/** 无头渲染并截图，返回图片 Buffer（失败返回 null） */
function renderShot(browser, url, size = '900,1400') {
  const profile = mkdtempSync(join(tmpdir(), 'irinsho-shot-'));
  const out = join(profile, 'shot.png');
  spawnSync(browser, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--hide-scrollbars',
    '--user-data-dir=' + profile,
    `--window-size=${size}`,
    '--virtual-time-budget=10000',
    '--screenshot=' + out,
    url
  ], { encoding: 'utf8', timeout: 60000 });
  try {
    if (existsSync(out)) {
      const buf = readFileSync(out);
      if (buf.length > 4096) return buf;
    }
  } catch (e) { /* 忽略 */ }
  return null;
}

/** 从渲染后的页面文字里找发布日期 */
function dateFromText(html) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ');
  const m = text.match(/(\d{4})\s*[-/年.]\s*(\d{1,2})\s*[-/月.]\s*(\d{1,2})/);
  if (!m) return '';
  const p = (x) => String(x).padStart(2, '0');
  return `${m[1]}-${p(m[2])}-${p(m[3])}`;
}

/* ---------- 抓一条视频的封面 + 信息 ----------
 *
 *  实测结论（2026-09 验证）：
 *    · 抖音视频页 / 分享页都是**客户端渲染**：HTML 里只有 App 骨架，
 *      连 douyinpic 图片域名都不出现，视频数据由浏览器加载 JS 后再请求
 *    · 抖音的详情接口 /aweme/v1/web/aweme/detail/ 返回
 *      HTTP 403 "Blocked by ArgusSecurityPlugin Uifid Not Found"
 *      —— 需要浏览器端签名，纯服务端过不去
 *    · 老的 /web/api/v2/aweme/iteminfo/ 已废弃，返回空
 *  ⇒ 所以抖音封面**无法**用服务端抓取解决，只能靠播放器页面碰运气，
 *    或者用 coverUrl / npm run cover 手动补（见 README）。
 *
 *  B 站 / YouTube 相反，有公开接口，可以真正自动抓：
 *    · YouTube：https://img.youtube.com/vi/<id>/maxresdefault.jpg（试几个尺寸）
 *    · B 站：https://api.bilibili.com/x/web-interface/view?bvid=<BV>
 *            返回 JSON，里面 cover / title / pubdate / duration 全都有
 */
async function resolveOne(entry, opts = {}) {
  const raw = String(entry.douyin || entry.embed || '').trim();
  if (!raw) return { ok: false, reason: '没有填 douyin / embed' };

  const r = resolveEmbed(raw);
  const platform = r.platform || '';

  if (platform === 'YouTube') return await resolveYouTube(r.embed);
  if (platform === 'B站') return await resolveBilibili(r.embed);
  if (platform === '抖音') return await resolveDouyin(raw, opts);
  return { ok: false, reason: '认不出这个链接属于哪个平台（支持抖音 / B站 / YouTube）' };
}

/* ---------- YouTube：封面地址可推导，标题 / 日期 / 时长在 watch 页里 ---------- */
async function resolveYouTube(embedUrl) {
  const id = (String(embedUrl).match(/\/embed\/([\w-]{6,})/) || [])[1];
  if (!id) return { ok: false, reason: '没能从链接里取出 YouTube 视频 id' };

  // 顺手读 watch 页：YouTube 把标题 / 发布日期 / 时长服务端渲染在 HTML 里，
  // 不需要任何签名（和抖音完全不同）
  let meta = {};
  try {
    const res = await fetchWithTimeout(
      `https://www.youtube.com/watch?v=${id}`,
      { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' } },
      15000
    );
    if (res.ok) {
      const html = await res.text();
      const len = (html.match(/"lengthSeconds":"(\d+)"/) || [])[1];
      const up = (html.match(/"uploadDate":"([^"]+)"/) || [])[1]
        || (html.match(/"publishDate":"([^"]+)"/) || [])[1];
      const t = (html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/) || [])[1];
      meta = {
        title: t ? unescapeUnicode(decodeEntities(t)) : '',
        date: up ? fmtDate(up) : '',
        duration: len ? fmtDuration(Number(len)) : ''
      };
    }
  } catch (e) { /* 读不到就只给封面 */ }

  // 封面：尺寸从大到小试，第一个能下到的就用
  const sizes = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault'];
  for (const s of sizes) {
    const url = `https://img.youtube.com/vi/${id}/${s}.jpg`;
    try {
      const res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } }, 12000);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      // 没有大图时 YouTube 会返回一张 120x90 的灰色占位图，用体积筛掉
      if (buf.length < 3000) continue;
      // YouTube 缩略图固定 16:9
      return { ok: true, cover: url, numId: id, source: 'YouTube ' + s, meta: { ...meta, ratio: '16:9' } };
    } catch (e) { /* 试下一个尺寸 */ }
  }

  // 封面拿不到但信息拿到了，也算有用
  if (meta.title || meta.date || meta.duration) {
    return { ok: false, reason: '封面各尺寸都没取到', meta };
  }
  return { ok: false, reason: 'YouTube 封面各尺寸都拿不到' };
}

/* ---------- B 站：公开接口，封面 / 标题 / 日期 / 时长一次拿全 ---------- */
async function resolveBilibili(embedUrl) {
  const bv = (String(embedUrl).match(/(BV[0-9A-Za-z]{8,14})/) || [])[1];
  if (!bv) return { ok: false, reason: '没能从链接里取出 BV 号' };

  try {
    const res = await fetchWithTimeout(
      `https://api.bilibili.com/x/web-interface/view?bvid=${bv}`,
      { headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' } },
      15000
    );
    if (!res.ok) return { ok: false, reason: 'B 站接口返回 HTTP ' + res.status };
    const json = await res.json();
    const d = json && json.data;
    if (!d) return { ok: false, reason: 'B 站接口没有返回数据（可能视频被删或需要登录）' };

    const cover = String(d.pic || '').replace(/^http:/, 'https:');
    // 接口会给出真实画面尺寸 —— 竖屏视频（例如 1080x1920）也能正确识别，
    // 不用再去猜比例
    const dim = d.dimension || {};
    const ratio = dim.width && dim.height ? `${dim.width}:${dim.height}` : '';
    return {
      ok: true,
      cover,
      numId: bv,
      source: 'B站接口',
      meta: {
        title: String(d.title || '').trim(),
        date: d.pubdate ? fmtDate(d.pubdate) : '',
        duration: d.duration ? fmtDuration(d.duration) : '',
        ratio
      }
    };
  } catch (e) {
    return { ok: false, reason: 'B 站接口请求失败：' + e.message };
  }
}

/* ---------- 抖音：只能碰碰运气（播放器页），拿不到就说清楚 ---------- */
async function resolveDouyin(raw, opts = {}) {
  // 整段分享口令 → 抠链接
  const urlMatch = raw.match(/https?:\/\/[^\s"'<>）)】]+/i);
  let url = urlMatch ? urlMatch[0] : raw;
  if (!/^https?:\/\//i.test(url)) {
    if (/^\d{10,25}$/.test(url)) url = 'https://www.douyin.com/video/' + url;
    else return { ok: false, reason: '不是链接也不是数字 id：' + raw };
  }

  // 跟跳转：短链 → 真实地址（顺带拿数字 id）
  const hop = await followRedirect(url);
  const finalUrl = hop.url || url;
  const numId = ((finalUrl.match(/\/video\/(\d{10,25})/) || [])[1]) || '';

  if (!numId) {
    return {
      ok: false,
      numId,
      finalUrl,
      meta: {},
      tried: ['没拿到数字视频 id（短链要能跳转到 /video/<数字>）'],
      reason: '没能拿到数字视频 id；请用 www.douyin.com/video/<数字> 这种完整链接'
    };
  }

  // ① 官方播放器页（有时带 og:image）
  const playerUrl = `https://open.douyin.com/player/video?vid=${numId}`;
  try {
    const res = await fetchWithTimeout(playerUrl, {
      headers: { ...FETCH_HEADERS, Referer: 'https://www.douyin.com/' }
    }, 15000);
    if (res.ok) {
      const html = await res.text();
      if (process.env.DSH_DUMP_COVER === '1') {
        try {
          const f = join(tmpdir(), `irinsho-douyin-player-${numId}.html`);
          writeFileSync(f, html, 'utf8');
          console.log(`      [诊断] 播放器页 → ${f}（${html.length} 字节）`);
        } catch (e) { /* 忽略 */ }
      }
      const cover = extractCover(html);
      // 只认「抖音视频自己的封面图」那种特征（~tplv-dy-aweme / aweme-images）。
      // 不加这道限制的话，可能抓到页面里的广告图或播放器的默认占位图
      // （实测抓到过一张牛油果库存照）。
      if (cover && /aweme-images|~tplv-dy-aweme|dy-aweme/i.test(cover)) {
        return { ok: true, cover, numId, source: '抖音播放器页', meta: extractMeta(html) };
      }
    }
  } catch (e) { /* 继续下面的浏览器渲染 */ }

  // ② 正解：用 DevTools 协议连上本机无头 Edge/Chrome，
  //    跑完 JS 之后**只截 <video> 那一块**，顺便读时长 / 分辨率 / 日期。
  //    （命令行 --screenshot 只能整页截，会带上抖音 UI 和大片灰底，不能用；
  //      canvas 取帧会被跨域 tainted 挡住；CDP 的 captureScreenshot 两者都不受限。）
  {
    const cap = await captureDouyinFrame(numId, {
      coverDir: opts.coverDir,
      log: (m) => console.log(m)
    });

    if (cap.ok) {
      return {
        ok: true,
        localFile: cap.file,
        numId,
        source: `CDP 精确截图（${cap.clip.width}×${cap.clip.height}）`,
        meta: {
          date: cap.date || '',
          duration: cap.duration || '',
          ratio: cap.ratio || ''
        }
      };
    }

    return {
      ok: false,
      numId,
      finalUrl,
      meta: {},
      tried: [`CDP 截图失败：${cap.reason}`],
      reason: '抖音不把封面交给服务端，CDP 精确截图也没成功'
    };
  }
}

/** 用文件头判断是不是真图片（返回 'jpeg' / 'png' / 'webp' / 'gif' / 'avif' / ''） */
function magicImage(buf) {
  if (!buf || buf.length < 12) return '';
  const b = buf;
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (b.toString('ascii', 4, 8) === 'ftyp') {
    const brand = b.toString('ascii', 8, 12);
    if (/avif|avis/i.test(brand)) return 'avif';
    if (/heic|heix|hevc|mif1/i.test(brand)) return 'heic';
  }
  return '';
}

/** 加载 sharp（本地优先，回退到 DSH 自带；都没有就返回 null） */
function loadSharp() {
  const cands = ['sharp', 'D:/Deepseek Harness Desktop/resources/dsh/node_modules/sharp'];
  if (process.env.DSH_HOME) {
    cands.push(join(process.env.DSH_HOME, '..', 'Deepseek Harness Desktop', 'resources', 'dsh', 'node_modules', 'sharp'));
  }
  for (const c of cands) {
    try {
      const s = require(c);
      if (typeof s === 'function') return s;
    } catch (e) { /* 试下一个 */ }
  }
  return null;
}

/**
 * 处理浏览器截图：
 *  · trim() 把四周纯色（通常是播放器外面的白边）裁掉
 *  · 缩到最长边 1400 并转成 jpg，体积更小
 * 拿不到 sharp 或处理失败就原样返回 PNG。
 */
async function tidyShot(shot) {
  const sharp = loadSharp();
  if (!sharp) return { buf: shot, ext: '.png' };
  try {
    const buf = await sharp(shot)
      .trim({ threshold: 12 })          // 去掉均匀的纯色边框
      .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 84 })
      .toBuffer();
    if (buf && buf.length > 2048) return { buf, ext: '.jpg' };
  } catch (e) { /* 处理失败就用原图 */ }
  return { buf: shot, ext: '.png' };
}

/* ---------- 下载封面 ---------- */
async function download(coverUrl, destAbs) {
  // 抖音的图床有时会检查 Referer，带上更稳（对别的域名也无害）
  const referer = /douyinpic|douyin\.com|byteimg|zjcdn/i.test(coverUrl)
    ? 'https://www.douyin.com/'
    : undefined;

  const res = await fetchWithTimeout(
    coverUrl,
    {
      headers: {
        'User-Agent': UA,
        'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8',
        ...(referer ? { Referer: referer } : {})
      }
    },
    20000
  );
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error('文件太小（' + buf.length + ' 字节），可能不是图片');

  // ★ 用文件头确认它真的是图片。
  //   抖音对不认识的请求会返回 200 + 一段 JS（实测踩过：
  //   下来一个 300KB 的 bdms 监控脚本，存成 .jpg 后浏览器解不开，
  //   卡片就变成一块空的深色板）。
  const kind = magicImage(buf);
  const type = String(res.headers.get('content-type') || '');
  if (!kind) {
    const head = buf.toString('utf8', 0, 80).replace(/\s+/g, ' ').slice(0, 60);
    throw new Error(`返回的不是图片（content-type: ${type || '未知'}；开头是「${head}」）`);
  }
  if (kind === 'gif') throw new Error('返回的是 GIF，跳过');

  const ext = kind === 'jpeg' ? '.jpg'
    : kind === 'png' ? '.png'
    : kind === 'webp' ? '.webp'
    : '.avif';

  const dest = destAbs.replace(/\.[a-z0-9]+$/i, '') + ext;
  writeFileSync(dest, buf);
  return { dest, bytes: buf.length, kind };
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
  // 总时间预算：断网 / 抖音卡住时不要让同步卡太久
  // （无头渲染一条抖音大约 10~20 秒，所以留宽一点）
  const budgetMs = options.budgetMs || 90000;
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

    // 已经有手填 poster 了，而且文件确实在 → 尊重它
    const manualPosterOk = v.poster && existsSync(
      join(root, 'public', String(v.poster).replace(/\\/g, '/').replace(/^(\.?\/)+/, ''))
    );
    if (manualPosterOk) {
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

    // 上次没抓到 → 按退避策略决定这次还试不试。
    // 注意：时间戳可能是「未来」（系统时间改过、机器时钟漂移），
    // 那种情况下 now - at 是负数，会永远小于间隔 → 永久跳过。
    // 所以这里限制最多跳过 2 倍间隔，保证一定会重试。
    if (!force && prev && prev.fails) {
      const waitMs = FAIL_BACKOFF_SEC[Math.min(prev.fails, FAIL_BACKOFF_SEC.length - 1)] * 1000;
      const since = Date.now() - (prev.at || 0);
      const shouldTry = since >= waitMs || since < -waitMs;
      if (!shouldTry) {
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
      r = await resolveOne(v, { coverDir });
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
      if (Array.isArray(r.tried) && r.tried.length) {
        for (const line of r.tried) say('        · ' + line);
      }
      if (r.numId) say(`      视频 id：${r.numId}`);

      // 抖音这种情况给明确的下一步，而不是让人反复跑
      if (String(r.reason).includes('抖音')) {
        say('      抖音的视频页是客户端渲染，详情接口需要浏览器签名（实测 403）。');
        say('      现在的做法是用你本机的 Edge/Chrome 无头渲染 + 截图；如果这次没成，');
        say('      可以手动补一张（在项目目录里跑 npm run cover，粘一个图片地址）。');
        say('      完全不填封面也不难看：页面会生成一张设计过的底图。');
      }
      // 封面没抓到，但标题/日期/时长可能抓到了，先留着。
      // ⚠ 之前这里写成 poster: ''，结果一次「临时抓取失败」就会把上一次
      //   已经抓好的封面从页面上抹掉（用户看到的就是「怎么又回去了」）。
      //   现在改成：只要缓存里的封面文件还在，就继续用它。
      const keepFile = (prev && prev.file && existsSync(join(root, 'public', prev.file)))
        ? prev.file
        : '';
      if (meta.title || meta.date || meta.duration || keepFile) {
        out[key] = {
          poster: keepFile,
          title: meta.title || '',
          date: meta.date || '',
          duration: meta.duration || ''
        };
        if (keepFile) say(`      封面沿用上一次抓到的：${keepFile}`);
        if (meta.title || meta.date || meta.duration) {
          say(`      但抓到了信息：${[meta.title, meta.date, meta.duration].filter(Boolean).join('  /  ')}`);
        }
      }
      // 记下失败次数和时间，下次按退避间隔再试
      cache[key] = {
        file: (prev && prev.file) || '',
        at: Date.now(),
        fails: ((prev && prev.fails) || 0) + 1,
        numId: r.numId || (prev && prev.numId) || '',
        title: meta.title || (prev && prev.title) || '',
        date: meta.date || (prev && prev.date) || '',
        duration: meta.duration || (prev && prev.duration) || ''
      };
      continue;
    }

    // CDP 精确截图那条路：图已经落盘，还带回了时长 / 比例 / 日期
    if (r.localFile) {
      out[key] = {
        poster: r.localFile,
        title: meta.title || '',
        date: meta.date || '',
        duration: meta.duration || '',
        ratio: meta.ratio || ''
      };
      cache[key] = {
        file: r.localFile, at: Date.now(), fails: 0, numId: r.numId || '',
        title: meta.title || '', date: meta.date || '',
        duration: meta.duration || '', ratio: meta.ratio || ''
      };
      got++;
      say(`    ✓ 封面 ${r.localFile}（${r.source || '截图'}）`);
      if (meta.duration) say(`      时长：${meta.duration}`);
      if (meta.ratio) say(`      比例：${meta.ratio}`);
      if (meta.date) say(`      日期：${meta.date}`);
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
      if (info.ratio && !v.ratio) fields.ratio = info.ratio;
      // poster：原来写的值如果指向一个**不存在的文件**，就当成没填、用新抓到的补上。
      // （踩过坑：之前抓到一张错误的图并写进 poster，文件后来被删掉，
      //   页面就一直请求不存在的文件，卡片永远空白。）
      const oldPosterOk = v.poster && existsSync(
        join(root, 'public', String(v.poster).replace(/\\/g, '/').replace(/^(\.?\/)+/, ''))
      );
      const overwrite = [];
      if (info.poster && v.cover !== false && !oldPosterOk) {
        fields.poster = info.poster;
        // 旧值指向一个已经不存在的文件 → 它是坏值，允许覆盖
        if (v.poster) overwrite.push('poster');
      }
      if (!Object.keys(fields).length) return null;
      return {
        index: i,
        title: v.title || info.title || '',
        match: [key],
        fields,
        overwrite
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
    info.ratio = cur.ratio || info.ratio || '';
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
    if (val.title || val.date || val.duration || val.ratio) {
      L.push(`    title:    ${q(val.title)},`);
      L.push(`    date:     ${q(val.date)},`);
      L.push(`    duration: ${q(val.duration)},`);
      L.push(`    ratio:    ${q(val.ratio)}`);
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
    .catch((e) => {
      // ⚠ 这里**故意也用退出码 0**：
      //    这个脚本现在挂在 `npm run dev` / `npm run build` 的 && 链里，
      //    一旦它报错退出非 0，后面的 astro dev / astro build 就不会执行，
      //    结果就是「网页打不开」。抓封面失败不该拖垮整站，
      //    所以只把错误醒目地打出来，然后放行。
      console.error('\n! 抓封面这一步出错了（不影响网站启动，已跳过）：' + (e && e.message ? e.message : e));
      if (e && e.stack) console.error(String(e.stack).split('\n').slice(1, 4).map((l) => '  ' + l.trim()).join('\n'));
      console.error('  想单独排查：node tools/sync-covers.mjs --force --dump\n');
      process.exit(0);
    });
}
