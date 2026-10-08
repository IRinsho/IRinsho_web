/* =========================================================
 *  林夕的小站 · 专属后台（本地服务）
 *  ---------------------------------------------------------
 *  启动：  npm run admin        （然后浏览器打开 http://127.0.0.1:4322）
 *
 *  设计原则：
 *    · 零依赖 —— 只用 Node 内置模块，不给项目加任何包袱
 *    · 只监听 127.0.0.1 —— 外网碰不到
 *    · 写操作全部走白名单 + 自动备份（.admin/backups/）
 *    · 预览用的 Markdown 渲染器就是站点自己的 src/lib/markdown.js
 *      → 后台看到的和网站上的完全一致
 * ======================================================= */

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { existsSync } = fs;

import {
  safeResolve, readNote, writeNote, deleteNote, listNotes, listNoteFiles,
  listPhotos, readPhotoMeta, readConfig, readVideos, readLinks, readTheme,
  makeNoteFileName, backupFile, atomicWrite, assertPhotoKey
} from './file-store.mjs';

import {
  patchJsFile, writeJsFile, loadJsModule, applyChanges, findDefaultObject, findTopLevelKeys,
  readJsSource, restoreEol,
  replaceArrayElement, appendArrayElement, removeArrayElement,
  setObjectEntry, removeObjectEntry, syntaxOk, toJs
} from './js-data.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/* ROOT 默认是项目根（IRinsho_web）；测试时可以用 ADMIN_ROOT 指到别处 */
const ROOT = process.env.ADMIN_ROOT
  ? path.resolve(process.env.ADMIN_ROOT)
  : path.resolve(__dirname, '..', '..');
const UI_DIR = path.join(ROOT, 'public', 'admin');         // 后台界面
const ADMIN_DIR = path.join(ROOT, '.admin');               // 后台自己的数据（不进 git）
const AUTH_FILE = path.join(ADMIN_DIR, 'auth.json');
const PORT = Number(process.env.ADMIN_PORT || 4322);

/* =========================================================
 *  鉴权：首个访问的人设置密码，之后用 HMAC 签名的 Cookie
 * ======================================================= */

function ensureAdminDir() {
  fs.mkdirSync(ADMIN_DIR, { recursive: true });
}

function readAuth() {
  try { return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')); } catch { return null; }
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function saveAuth(password) {
  ensureAdminDir();
  const salt = crypto.randomBytes(16).toString('hex');
  const rec = {
    salt,
    hash: hashPassword(password, salt),
    secret: crypto.randomBytes(32).toString('hex'),
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(AUTH_FILE, JSON.stringify(rec, null, 2), { mode: 0o600 });
  return rec;
}

function verifyPassword(password) {
  const rec = readAuth();
  if (!rec) return false;
  const h = hashPassword(password, rec.salt);
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(rec.hash));
}

function sign(secret, payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return body + '.' + mac;
}

function verifyToken(token) {
  const rec = readAuth();
  if (!rec || !token) return null;
  const [body, mac] = String(token).split('.');
  if (!body || !mac) return null;
  const expect = crypto.createHmac('sha256', rec.secret).update(body).digest('base64url');
  if (mac.length !== expect.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** 调试开关是否生效：必须同时满足「显式开启」+「请求来自本机」 */
function devNoAuth(req) {
  if (process.env.ADMIN_DEV_NOAUTH !== '1') return false;
  const ip = req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function currentUser(req) {
  if (devNoAuth(req)) return { u: 'admin', dev: true };
  return verifyToken(parseCookies(req).irinsho_admin);
}

/* 登录失败限流：同一 IP 连续失败 8 次锁 5 分钟 */
const failures = new Map();
function tooManyFailures(ip) {
  const f = failures.get(ip);
  if (!f) return false;
  if (Date.now() - f.at > 5 * 60 * 1000) { failures.delete(ip); return false; }
  return f.count >= 8;
}
function noteFailure(ip) {
  const f = failures.get(ip) || { count: 0, at: Date.now() };
  f.count++; f.at = Date.now();
  failures.set(ip, f);
}

/* =========================================================
 *  工具
 * ======================================================= */

function json(res, data, status = 200, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
}

function readBody(req, limit = 30 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      const type = String(req.headers['content-type'] || '');
      if (type.includes('application/json')) {
        try { resolve(JSON.parse(buf.toString('utf8') || '{}')); }
        catch (e) { reject(new Error('JSON 解析失败：' + e.message)); }
      } else {
        resolve(buf);
      }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8'
};

async function serveStatic(res, absPath) {
  try {
    const st = await fsp.stat(absPath);
    if (st.isDirectory()) return serveStatic(res, path.join(absPath, 'index.html'));
    const ext = path.extname(absPath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(absPath).pipe(res);
    return true;
  } catch {
    return false;
  }
}

/* 站点自己的 Markdown 渲染器（预览用，保证和线上一致） */
let mdModule = null;
async function renderPreview(markdown, currentRel) {
  if (!mdModule) mdModule = await import(pathToFileURL(path.join(ROOT, 'src', 'lib', 'markdown.js')).href);
  const notes = (await listNotes(ROOT)).map((n) => ({
    id: n.id, title: n.title, date: n.date, category: n.category,
    tags: n.tags, file: n.rel
  }));
  const html = mdModule.renderMarkdown(markdown, {
    notes,
    linkIndex: mdModule.buildLinkIndex(notes),
    base: '/notes/'
  });
  return await localizeImages(html);
}

/**
 * 预览专用：把指向「已发布站点」的图片地址换成本地文件。
 *
 * 为什么需要：笔记里的图常常是 Obsidian 粘贴进来的，
 * 形如 ![](https://xxx.cos.ap-hongkong.myqcloud.com/images/Pasted%20image%2020260922161730.png)
 * —— 那个地址在线上是好的，但本地预览时是 404。
 * 只要 blog/attachments/ 里有同名文件，就改用本地文件显示。
 *
 * ⚠ 这**只影响预览显示**，绝不改动磁盘上的笔记正文一个字。
 */
async function localizeImages(html) {
  const dir = path.join(ROOT, 'blog', 'attachments');
  let files = [];
  try { files = await fsp.readdir(dir); } catch { return html; }

  // 文件名（不含扩展名）→ 实际文件名，用于忽略扩展名差异地匹配
  const byStem = new Map();
  for (const f of files) {
    byStem.set(path.basename(f, path.extname(f)), f);
    byStem.set(f, f);
  }

  return html.replace(/(<img\b[^>]*?\bsrc=")([^"]+)(")/g, (whole, pre, src, post) => {
    if (/^(data:|\/blog-attach\/|\/media\/)/.test(src)) return whole;

    let name = '';
    try {
      const clean = src.split('?')[0].split('#')[0];
      name = decodeURIComponent(clean.split('/').pop() || '');
    } catch {
      name = src.split('/').pop() || '';
    }
    if (!name) return whole;

    const hit = byStem.get(name) || byStem.get(path.basename(name, path.extname(name)));
    if (!hit) return whole;
    return `${pre}/blog-attach/${encodeURIComponent(hit)}${post}`;
  });
}

/* 图片在后台里的预览地址。
 * 传进来的可能是：
 *   'media/images/a.webp'  → public/ 下的路径
 *   'img/xxx.jpg'          → 项目根下的路径（上传接口返回的就是这种）
 * 两种都拼成浏览器能访问的绝对路径，别再套一层前缀（套错会变成 /img-raw/img/...）。
 */
const mediaUrl = (p) => {
  const s = String(p || '').replace(/^\/+/, '');
  if (!s) return '';
  if (s.startsWith('media/')) return '/' + s;
  if (s.startsWith('img/')) return '/img-raw/' + s.slice(4);
  return '/' + s;
};

/* =========================================================
 *  构建与发布
 *  ---------------------------------------------------------
 *  在后台点一下「构建」= 在这里跑一次 npm run sync && astro build。
 *  日志实时推给前端，跑完把结果记进历史。
 * ======================================================= */

const buildState = {
  id: 0,
  running: false,
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  command: '',
  lines: [],
  history: [],
  child: null
};

/* 日志最多留这么多行，避免长时间构建把内存撑爆 */
const MAX_LOG_LINES = 4000;

function pushLog(text) {
  for (const line of String(text).replace(/\r/g, '').split('\n')) {
    if (line === '' && buildState.lines[buildState.lines.length - 1] === '') continue;
    buildState.lines.push(line);
  }
  if (buildState.lines.length > MAX_LOG_LINES) {
    buildState.lines.splice(0, buildState.lines.length - MAX_LOG_LINES);
  }
}

/* npm 在 Windows 上是 npm.cmd；直接用 node 跑脚本更稳 */
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function startBuild({ withSync = true, upload = false } = {}) {
  buildState.id += 1;
  buildState.running = true;
  buildState.startedAt = Date.now();
  buildState.finishedAt = null;
  buildState.exitCode = null;
  buildState.lines = [];
  buildState.command = withSync ? 'npm run build' : 'npx astro build';

  pushLog(`[${new Date().toLocaleTimeString('zh-CN')}] 开始构建：${buildState.command}`);
  pushLog(`工作目录：${ROOT}`);
  pushLog('');

  const args = withSync ? ['run', 'build'] : ['exec', '--', 'astro', 'build'];
  const child = spawn(NPM, args, {
    cwd: ROOT,
    windowsHide: true,
    shell: process.platform === 'win32',   // npm.cmd 需要 shell 才能起得来
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
  });
  buildState.child = child;

  child.stdout.on('data', (d) => pushLog(d.toString('utf8')));
  child.stderr.on('data', (d) => pushLog(d.toString('utf8')));

  child.on('error', (e) => {
    pushLog('');
    pushLog('启动构建失败：' + e.message);
    pushLog('多半是环境里找不到 npm。可以在项目目录手动跑一次 npm run build 看看。');
    finishBuild(-1);
  });

  child.on('close', (code) => {
    pushLog('');
    if (code === 0) {
      pushLog('✓ 构建成功。成品在 dist/ 文件夹里。');
      pushLog(upload
        ? '接着会自动上传（这一版还没接上传，先手动传 dist/ 吧）。'
        : '下一步：把 dist/ 里的内容传到腾讯云 COS（同名覆盖）。');
    } else {
      pushLog(`✗ 构建失败，退出码 ${code}。上面最后几行就是原因。`);
    }
    finishBuild(code);
  });
}

function finishBuild(code) {
  buildState.running = false;
  buildState.exitCode = code;
  buildState.finishedAt = Date.now();
  buildState.child = null;
  buildState.history.unshift({
    id: buildState.id,
    command: buildState.command,
    startedAt: buildState.startedAt,
    finishedAt: buildState.finishedAt,
    exitCode: code,
    seconds: Math.round((buildState.finishedAt - buildState.startedAt) / 1000)
  });
  buildState.history = buildState.history.slice(0, 20);
}

/** 把 { "me.friend.url": "x" } 这种点号路径展开成嵌套对象 */
function nestChanges(changes) {
  const out = {};
  for (const [key, value] of Object.entries(changes || {})) {
    const parts = String(key).split('.');
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = cur[parts[i]] || {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }
  return out;
}

/** 读一个标量值的文本范围（从 vStart 起，到这一项的逗号/换行为止） */
function scanScalarEnd(src, vStart, limit) {
  let i = vStart;
  let d = 0;
  while (i < limit) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < limit) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) { i++; break; } i++; }
      continue;
    }
    if (c === '{' || c === '[' || c === '(') d++;
    if (c === '}' || c === ']' || c === ')') d--;
    if (d === 0 && (c === ',' || c === '\n')) break;
    i++;
  }
  return i;
}

/**
 * 改嵌套字段（例如 me.friend.url）。
 *
 * 只对「对象里的标量」动手，路径不通就跳过——不猜、不新建。
 * 而且必须显式给 targetKey，避免同名子键在别的对象里被误改。
 */
export function applyNestedChanges(src, nested, targetKeys) {
  const region = findDefaultObject(src);
  if (region.open !== '{') throw new Error('config.js 的 export default 不是对象');
  const entries = findTopLevelKeys(src, region);

  const jobs = [];
  for (const [topKey, patch] of Object.entries(nested)) {
    // 只处理「明确的那些顶层键」，防止误伤同名子键
    if (targetKeys && !targetKeys.includes(topKey)) continue;
    const hit = entries.find((e) => e.key === topKey);
    if (!hit) continue;

    for (const [subKey, value] of Object.entries(patch)) {
      const re = new RegExp('(^|[\\s,{])' + subKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*');
      const slice = src.slice(hit.valueStart, hit.valueEnd);
      const m = slice.match(re);
      if (!m) continue;

      const vStart = hit.valueStart + m.index + m[0].length;
      const vEnd = scanScalarEnd(src, vStart, hit.valueEnd);
      const before = src.slice(vStart, vEnd);
      const next = toJs(value, 1);

      const beforeIsBlock = /^[\[{]/.test(before.trim());
      const nextIsBlock = /^[\[{]/.test(next.trim());
      if (beforeIsBlock !== nextIsBlock) continue;   // 类型不符，宁可不改
      if (before.trim() === next.trim()) continue;

      jobs.push({ start: vStart, end: vEnd, after: next, path: topKey + '.' + subKey });
    }
  }

  jobs.sort((a, b) => b.start - a.start);
  let text = src;
  for (const j of jobs) text = text.slice(0, j.start) + j.after + text.slice(j.end);
  return { text, changed: jobs.map((j) => j.path) };
}

/* =========================================================
 *  接口
 * ======================================================= */

const routes = {

  /* ---- 登录 ---- */
  'GET /api/session': async (req, res) => {
    const rec = readAuth();
    const user = currentUser(req);
    json(res, {
      configured: !!rec,
      authed: !!user,
      dev: !!(user && user.dev),
      root: ROOT,
      version: '0.1.0'
    });
  },

  'POST /api/setup': async (req, res) => {
    if (readAuth()) return json(res, { error: '密码已经设置过了' }, 400);
    const { password } = await readBody(req);
    if (!password || String(password).length < 6) {
      return json(res, { error: '密码至少 6 位' }, 400);
    }
    const rec = saveAuth(String(password));
    const token = sign(rec.secret, { u: 'admin', exp: Date.now() + 30 * 24 * 3600 * 1000 });
    json(res, { ok: true }, 200, {
      'Set-Cookie': `irinsho_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${30 * 24 * 3600}`
    });
  },

  'POST /api/login': async (req, res) => {
    const ip = req.socket.remoteAddress || 'x';
    if (tooManyFailures(ip)) return json(res, { error: '失败次数太多，请 5 分钟后再试' }, 429);
    const rec = readAuth();
    if (!rec) return json(res, { error: '还没设置密码' }, 400);
    const { password } = await readBody(req);
    if (!password || !verifyPassword(String(password))) {
      noteFailure(ip);
      return json(res, { error: '密码不对' }, 401);
    }
    failures.delete(ip);
    const token = sign(rec.secret, { u: 'admin', exp: Date.now() + 30 * 24 * 3600 * 1000 });
    json(res, { ok: true }, 200, {
      'Set-Cookie': `irinsho_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${30 * 24 * 3600}`
    });
  },

  'POST /api/logout': async (req, res) => {
    json(res, { ok: true }, 200, { 'Set-Cookie': 'irinsho_admin=; Path=/; Max-Age=0' });
  },

  /* ---- 仪表盘 ---- */
  'GET /api/dashboard': async (req, res) => {
    const notes = await listNotes(ROOT);
    const photos = await listPhotos(ROOT);
    const { data: videos } = await readVideos(ROOT);
    const { data: links } = await readLinks(ROOT);
    const drafts = notes.filter((n) => n.draft);

    const recent = notes.slice()
      .sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
      .slice(0, 6)
      .map((n) => ({
        rel: n.rel, title: n.title, date: n.date, category: n.category,
        draft: n.draft, mtime: n.mtime, chars: n.chars
      }));

    json(res, {
      counts: {
        notes: notes.length,
        drafts: drafts.length,
        photos: photos.length,
        videos: videos.length,
        links: Array.isArray(links) ? links.length : 0
      },
      drafts: drafts.map((n) => ({ rel: n.rel, title: n.title, date: n.date, chars: n.chars })),
      recent,
      albums: Object.entries(photos.reduce((acc, p) => {
        acc[p.album] = (acc[p.album] || 0) + 1; return acc;
      }, {})).map(([name, count]) => ({ name, count }))
    });
  },

  /* ---- 笔记 ---- */
  'GET /api/notes': async (req, res) => {
    json(res, { notes: await listNotes(ROOT) });
  },

  'GET /api/note': async (req, res, url) => {
    const rel = url.searchParams.get('rel');
    if (!rel) return json(res, { error: '缺少 rel 参数' }, 400);
    try {
      const note = await readNote(ROOT, rel);
      const html = await renderPreview(note.body, rel);
      json(res, { note, html });
    } catch (e) {
      json(res, { error: '读不到这篇笔记：' + e.message }, 404);
    }
  },

  'POST /api/note/save': async (req, res) => {
    const { rel, fields = {}, body = '', renameTo } = await readBody(req);
    if (!rel) return json(res, { error: '缺少 rel' }, 400);
    try {
      const original = await readNote(ROOT, rel);       // 拿原始字段顺序与未知字段
      const target = (renameTo && renameTo !== rel) ? renameTo : rel;

      await writeNote(ROOT, target, fields, body, original);
      if (target !== rel) await deleteNote(ROOT, rel);  // 改名：旧文件已自动备份

      const saved = await readNote(ROOT, target);
      json(res, { ok: true, rel: target, id: saved.id, savedAt: new Date().toISOString() });
    } catch (e) {
      json(res, { error: e.message }, 400);
    }
  },

  'POST /api/note/create': async (req, res) => {
    const { title = '未命名', date, folder = '' } = await readBody(req);
    const today = new Date().toISOString().slice(0, 10);
    const fileName = makeNoteFileName(title, date || today, true);
    const rel = (folder ? folder.replace(/^\/+|\/+$/g, '') + '/' : '') + fileName;
    try {
      if ((await listNoteFiles(ROOT)).includes(rel)) {
        return json(res, { error: '同名笔记已存在：' + rel }, 409);
      }
      await writeNote(ROOT, rel, {
        title,
        date: date || today,
        tags: [],
        draft: true
      }, `# ${title}\n\n在这里开始写……\n`, null);
      json(res, { ok: true, rel });
    } catch (e) {
      json(res, { error: e.message }, 400);
    }
  },

  'POST /api/note/delete': async (req, res) => {
    const { rel } = await readBody(req);
    if (!rel) return json(res, { error: '缺少 rel' }, 400);
    try {
      await deleteNote(ROOT, rel);
      json(res, { ok: true });
    } catch (e) {
      json(res, { error: e.message }, 400);
    }
  },

  'POST /api/preview': async (req, res) => {
    const { markdown = '' } = await readBody(req);
    try {
      json(res, { html: await renderPreview(markdown) });
    } catch (e) {
      json(res, { error: e.message }, 400);
    }
  },

  /* ---- 相册 ---- */
  'GET /api/photos': async (req, res) => {
    const photos = await listPhotos(ROOT);
    const { data: meta } = await readPhotoMeta(ROOT);
    json(res, {
      photos: photos.map((p) => ({
        ...p,
        url: '/img-raw/' + p.rel,       // 后台里直接看原图
        fileUrl: '/img-raw/' + p.rel,
        meta: meta[p.rel] || null
      })),
      metaRaw: meta
    });
  },

  /* ---- 视频 ---- */
  'GET /api/videos': async (req, res) => {
    const { data } = await readVideos(ROOT);
    json(res, {
      videos: (data || []).map((v, i) => ({
        index: i,
        title: v.title || '',
        desc: v.desc || '',
        category: v.category || '',
        tags: v.tags || [],
        date: v.date || '',
        duration: v.duration || '',
        ratio: v.ratio || '',
        poster: v.poster || '',
        posterUrl: v.poster ? mediaUrl(v.poster) : '',
        source: v.douyin ? 'douyin' : (v.embed ? 'embed' : (v.src ? 'local' : '')),
        link: v.douyin || v.embed || v.src || '',
        playInline: v.playInline,
        live: v.live,
        hasStream: !!v.stream
      }))
    });
  },

  /* ---- 友链 ---- */
  'GET /api/links': async (req, res) => {
    const { data } = await readLinks(ROOT);
    json(res, { links: data || [] });
  },

  /* ---- 站点配置：读 + 写 ---- */
  'GET /api/config': async (req, res) => {
    const { data } = await readConfig(ROOT);
    const { vars } = await readTheme(ROOT);
    json(res, { config: data, vars });
  },

  /**
   * 改配置。changes 的键支持两种写法：
   *   'site'                  → 顶层字段
   *   'me.friend.url'         → 嵌套字段（需要同时给出 targetKeys 白名单）
   */
  'POST /api/config/save': async (req, res) => {
    const { changes, targetKeys } = await readBody(req);
    if (!changes || typeof changes !== 'object') return json(res, { error: '缺少 changes' }, 400);

    try {
      const abs = path.join(ROOT, 'src', 'data', 'config.js');
      const { src, crlf } = await readJsSource(abs);

      const flat = {};
      const nested = {};
      for (const [key, value] of Object.entries(changes)) {
        if (String(key).includes('.')) nested[key] = value;
        else flat[key] = value;
      }

      // 1) 顶层字段：直接走 applyChanges（类型守卫在里面）
      let text = src;
      const changed = [];
      if (Object.keys(flat).length) {
        const r = applyChanges(text, flat);
        text = r.text;
        changed.push(...r.changed);
      }

      // 2) 嵌套字段：走点号路径替换
      if (Object.keys(nested).length) {
        const r = applyNestedChanges(text, nestChanges(nested), targetKeys);
        text = r.text;
        changed.push(...r.changed);
      }

      if (!changed.length) return json(res, { ok: true, changed: [], skipped: true });

      await writeJsFile(ROOT, 'src/data/config.js', text, crlf);
      json(res, { ok: true, changed });
    } catch (e) {
      json(res, { error: e.message }, 400);
    }
  },

  /* ---- 配色外观：写 CSS 变量 ---- */
  'GET /api/theme': async (req, res) => {
    const { vars } = await readTheme(ROOT);
    json(res, { vars });
  },

  'POST /api/theme/save': async (req, res) => {
    const { vars } = await readBody(req);
    if (!vars || typeof vars !== 'object') return json(res, { error: '缺少 vars' }, 400);

    const { abs, rel } = safeResolve(ROOT, 'public/assets/css/style.css');
    const src = await fsp.readFile(abs, 'utf8');

    const blockMatch = src.match(/:root\s*\{([\s\S]*?)\}/);
    if (!blockMatch) return json(res, { error: '在 style.css 里找不到 :root 变量块' }, 400);

    let block = blockMatch[1];
    const applied = [];
    for (const [name, value] of Object.entries(vars)) {
      if (!/^--[\w-]+$/.test(name)) continue;                       // 只认 CSS 变量名
      if (!/^[#a-zA-Z0-9\s,.()%'"-]+$/.test(String(value))) continue; // 挡住能逃出声明的东西
      const re = new RegExp('(' + name.replace(/[-]/g, '\\-') + '\\s*:\\s*)([^;]+)(;)');
      if (!re.test(block)) continue;
      const next = block.replace(re, (m, p1, p2, p3) => p1 + String(value).trim() + p3);
      if (next !== block) { block = next; applied.push(name); }
    }

    if (!applied.length) return json(res, { ok: true, changed: [], skipped: true });

    const text = src.slice(0, blockMatch.index) +
      blockMatch[0].replace(blockMatch[1], block) +
      src.slice(blockMatch.index + blockMatch[0].length);

    await backupFile(ROOT, rel);
    await atomicWrite(abs, text);
    json(res, { ok: true, changed: applied });
  },

  /* ---- 相册：改图片元信息 ---- */
  'POST /api/photos/meta': async (req, res) => {
    const { rel, meta } = await readBody(req);
    if (!rel) return json(res, { error: '缺少 rel' }, 400);
    try {
      const key = assertPhotoKey(rel);
      const { abs } = safeResolve(ROOT, 'src/data/photo-meta.js');
      const { src, crlf } = await readJsSource(abs);
      const r = setObjectEntry(src, key, meta || {});
      if (!r.changed) return json(res, { ok: true, skipped: true });
      await writeJsFile(ROOT, 'src/data/photo-meta.js', r.text, crlf);
      json(res, { ok: true, rel: key });
    } catch (e) {
      json(res, { error: e.message }, 400);
    }
  },

  'POST /api/photos/meta/delete': async (req, res) => {
    const { rel } = await readBody(req);
    try {
      const key = assertPhotoKey(rel);
      const { abs } = safeResolve(ROOT, 'src/data/photo-meta.js');
      const { src, crlf } = await readJsSource(abs);
      const r = removeObjectEntry(src, key);
      if (!r.changed) return json(res, { ok: true, skipped: true });
      await writeJsFile(ROOT, 'src/data/photo-meta.js', r.text, crlf);
      json(res, { ok: true });
    } catch (e) {
      json(res, { error: e.message }, 400);
    }
  },

  /* ---- 相册：给图片打标签 / 改分类（按文件改） ---- */
  'POST /api/photos/quick': async (req, res) => {
    const { rel, patch } = await readBody(req);
    if (!rel || !patch) return json(res, { error: '缺少参数' }, 400);
    try {
      const key = assertPhotoKey(rel);          // ← 挡住 ../../evil 这类键
      const absData = path.join(ROOT, 'src', 'data', 'photo-meta.js');
      const current = (await loadJsModule(absData)) || {};
      const merged = { ...(current[key] || {}), ...patch };
      // 去掉空字段，保持文件干净
      for (const k of Object.keys(merged)) {
        const v = merged[k];
        if (v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length)) delete merged[k];
      }
      const { src, crlf } = await readJsSource(absData);
      const r = setObjectEntry(src, key, merged);
      if (!r.changed) return json(res, { ok: true, skipped: true });
      await writeJsFile(ROOT, 'src/data/photo-meta.js', r.text, crlf);
      json(res, { ok: true, meta: merged });
    } catch (e) {
      json(res, { error: e.message }, 400);
    }
  },

  /* ---- 相册：上传（带压缩） ---- */
  'POST /api/photos/upload': async (req, res, url) => {
    const raw = await readBody(req, 200 * 1024 * 1024);   // 单张最大 200MB
    if (!Buffer.isBuffer(raw) || !raw.length) return json(res, { error: '没有收到文件内容' }, 400);

    // POST /api/photos/upload?name=xxx.jpg&album=旅行
    const name = url.searchParams.get('name') || `upload-${Date.now()}.jpg`;
    const album = (url.searchParams.get('album') || '').replace(/^\/+|\/+$/g, '');

    const safeName = path.basename(name).replace(/[\\/:*?"<>|]/g, '_');
    if (!/\.(jpe?g|png|webp|gif|avif|bmp|heic|heif)$/i.test(safeName)) {
      return json(res, { error: '这不是支持的图片格式：' + safeName }, 400);
    }

    const rel = (album ? album + '/' : '') + safeName;          // 相对 img/ 的路径
    const { abs, rel: relNorm } = safeResolve(ROOT, 'img/' + rel);

    let outBuf = raw;
    let note = '原图直接保存（没找到 sharp，未压缩）';
    let width = null, height = null;

    try {
      const sharp = (await import('sharp')).default;
      const img = sharp(raw, { failOn: 'none' }).rotate();   // rotate() 按 EXIF 自动摆正
      const meta = await img.metadata();
      const maxEdge = 2000;
      const longest = Math.max(meta.width || 0, meta.height || 0);
      let pipeline = img;
      if (longest > maxEdge) {
        pipeline = pipeline.resize({
          width: (meta.width || 0) >= (meta.height || 0) ? maxEdge : undefined,
          height: (meta.height || 0) > (meta.width || 0) ? maxEdge : undefined,
          withoutEnlargement: true
        });
      }
      outBuf = await pipeline.webp({ quality: 82 }).toBuffer();   // 顺带丢掉 EXIF（含 GPS）
      const outMeta = await sharp(outBuf).metadata();
      width = outMeta.width; height = outMeta.height;
      note = `已压缩成 WebP（${width}×${height}，质量 82，EXIF 已丢弃）`;
    } catch (e) {
      note = '原图直接保存（压缩不可用：' + String(e.message || e).slice(0, 80) + '）';
    }

    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await atomicWrite(abs, outBuf);

    json(res, {
      ok: true,
      // rel 统一是「相对 img/ 的路径」，和 /api/photos 列表里的 rel 保持一致
      rel: relNorm.startsWith('img/') ? relNorm.slice(4) : relNorm,
      album: album || '未分类',
      bytes: outBuf.length,
      note,
      url: '/img-raw/' + relNorm.replace(/^img\//, '')
    });
  },

  /* ---- 视频 ---- */
  'POST /api/videos/save': async (req, res) => {
    const { index, video } = await readBody(req);
    try {
      const rel = 'src/data/videos.js';
      const { abs } = safeResolve(ROOT, rel);
      const { src, crlf } = await readJsSource(abs);
      const r = index === null || index === undefined
        ? appendArrayElement(src, video)
        : replaceArrayElement(src, Number(index), video);
      if (!r.changed) return json(res, { ok: true, skipped: true });
      await writeJsFile(ROOT, rel, r.text, crlf);
      json(res, { ok: true });
    } catch (e) {
      json(res, { error: e.message }, 400);
    }
  },

  'POST /api/videos/delete': async (req, res) => {
    const { index } = await readBody(req);
    try {
      const rel = 'src/data/videos.js';
      const { abs } = safeResolve(ROOT, rel);
      const { src, crlf } = await readJsSource(abs);
      const r = removeArrayElement(src, Number(index));
      if (!r.changed) return json(res, { ok: true, skipped: true });
      await writeJsFile(ROOT, rel, r.text, crlf);
      json(res, { ok: true });
    } catch (e) {
      json(res, { error: e.message }, 400);
    }
  },

  /* ---- 友链 ---- */
  'POST /api/links/save': async (req, res) => {
    const { index, link } = await readBody(req);
    try {
      const rel = 'src/data/links.js';
      const { abs } = safeResolve(ROOT, rel);
      const { src, crlf } = await readJsSource(abs);
      const clean = {};
      for (const [k, v] of Object.entries(link || {})) {
        if (v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length)) continue;
        clean[k] = v;
      }
      const r = index === null || index === undefined
        ? appendArrayElement(src, clean)
        : replaceArrayElement(src, Number(index), clean);
      if (!r.changed) return json(res, { ok: true, skipped: true });
      await writeJsFile(ROOT, rel, r.text, crlf);
      json(res, { ok: true });
    } catch (e) {
      json(res, { error: e.message }, 400);
    }
  },

  'POST /api/links/delete': async (req, res) => {
    const { index } = await readBody(req);
    try {
      const rel = 'src/data/links.js';
      const { abs } = safeResolve(ROOT, rel);
      const { src, crlf } = await readJsSource(abs);
      const r = removeArrayElement(src, Number(index));
      if (!r.changed) return json(res, { ok: true, skipped: true });
      await writeJsFile(ROOT, rel, r.text, crlf);
      json(res, { ok: true });
    } catch (e) {
      json(res, { error: e.message }, 400);
    }
  },

  /* ---- 构建发布 ---- */
  'POST /api/build/start': async (req, res) => {
    const { withSync = true, upload = false } = await readBody(req).catch(() => ({}));
    if (buildState.running) return json(res, { error: '已经有一个构建在跑了', id: buildState.id }, 409);
    startBuild({ withSync, upload });
    json(res, { ok: true, id: buildState.id });
  },

  'GET /api/build/state': async (req, res, url) => {
    const since = Number(url.searchParams.get('since') || 0);
    json(res, {
      id: buildState.id,
      running: buildState.running,
      startedAt: buildState.startedAt,
      finishedAt: buildState.finishedAt,
      exitCode: buildState.exitCode,
      command: buildState.command,
      lines: buildState.lines.slice(since).map((l, i) => ({ n: since + i, text: l })),
      total: buildState.lines.length,
      history: buildState.history
    });
  },

  /* 在资源管理器里打开 dist（只在本机跑得通，云端会失败，失败也无所谓） */
  'POST /api/open-dist': async (req, res) => {
    const dist = path.join(ROOT, 'dist');
    if (!existsSync(dist)) return json(res, { ok: false, error: '还没有 dist 文件夹，先构建一次' });
    const cmd = process.platform === 'win32' ? 'explorer'
      : process.platform === 'darwin' ? 'open' : 'xdg-open';
    try {
      spawn(cmd, [dist], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
      json(res, { ok: true });
    } catch (e) {
      json(res, { ok: false, error: e.message });
    }
  },

  /* ---- 内容体检（只读报告） ---- */
  'GET /api/health': async (req, res) => {
    const allNotes = await listNotes(ROOT);
    const photos = await listPhotos(ROOT);
    const issues = [];
    const today = new Date().toISOString().slice(0, 10);

    // 下划线开头 / README 是「说明与模板」，里面写 [[笔记名]] 这种例子是正常的，
    // 不参与体检，否则每次都会报一堆假问题。
    const isInternal = (rel) => rel.split('/').some((seg) => seg.startsWith('_')) ||
      /(^|\/)README\.md$/i.test(rel);
    const notes = allNotes.filter((n) => !isInternal(n.rel));
    const skipped = allNotes.length - notes.length;

    for (const n of notes) {
      if (n.date && n.date > today) {
        issues.push({ level: 'warn', kind: 'future-date', rel: n.rel, title: n.title,
          message: `日期 ${n.date} 在未来（今天 ${today}）` });
      }
      if (n.chars < 20) {
        issues.push({ level: 'info', kind: 'empty-body', rel: n.rel, title: n.title,
          message: `正文只有 ${n.chars} 个字，可能是空草稿` });
      }
      if (!n.category) {
        issues.push({ level: 'info', kind: 'no-category', rel: n.rel, title: n.title,
          message: '没有分类（会归到「未分类」）' });
      }
    }

    // 重复标题
    const byTitle = notes.reduce((acc, n) => {
      (acc[n.title] = acc[n.title] || []).push(n); return acc;
    }, {});
    for (const [title, list] of Object.entries(byTitle)) {
      if (list.length > 1 && title) {
        issues.push({ level: 'warn', kind: 'dup-title', title,
          message: `有 ${list.length} 篇同名：${list.map((n) => n.rel).join('、')}` });
      }
    }

    // 双链指向不存在的笔记
    let md = null;
    try { md = await import(pathToFileURL(path.join(ROOT, 'src', 'lib', 'markdown.js')).href); } catch {}
    if (md) {
      const idx = md.buildLinkIndex(notes.map((n) => ({ id: n.id, title: n.title, file: n.rel })));
      for (const n of notes) {
        let full;
        try { full = await readNote(ROOT, n.rel); } catch { continue; }
        for (const m of full.body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
          const target = m[1].trim();
          if (/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(target)) continue;
          const key = target.toLowerCase().replace(/\s+/g, ' ').replace(/[-_]+/g, ' ');
          if (!idx[key]) {
            issues.push({ level: 'warn', kind: 'broken-wikilink', rel: n.rel, title: n.title,
              message: `双链 [[${target}]] 找不到对应笔记` });
          }
        }
      }
    }

    // 笔记里的图片：分两类
    //   · ![[本地图]]  → 必须能在 blog/attachments/ 里找到
    //   · ![](http...) → 指向外站，**不能凭本地有没有同名文件就下结论**，
    //                    这里只做静态提示；真要确认得联网检查（见 /api/health/images）
    const attachNames = new Set();
    try {
      for (const f of await fsp.readdir(path.join(ROOT, 'blog', 'attachments'))) {
        attachNames.add(f);
        attachNames.add(path.basename(f, path.extname(f)));
      }
    } catch { /* 没有 attachments 目录也正常 */ }

    let externalImageCount = 0;
    for (const n of notes) {
      let full;
      try { full = await readNote(ROOT, n.rel); } catch { continue; }

      for (const m of full.body.matchAll(/!\[\[([^\]|]+)/g)) {
        const t = m[1].trim();
        if (!attachNames.has(t) && !attachNames.has(path.basename(t, path.extname(t)))) {
          issues.push({ level: 'warn', kind: 'missing-image', rel: n.rel, title: n.title,
            message: `插图 ![[${t}]] 在 blog/attachments/ 里找不到（线上会显示成空）` });
        }
      }

      for (const m of full.body.matchAll(/!\[[^\]]*\]\(\s*(https?:\/\/[^)\s]+)/g)) {
        externalImageCount++;
        void m;
      }
    }

    json(res, {
      ok: issues.filter((i) => i.level === 'warn').length === 0,
      issues,
      externalImages: externalImageCount,   // 前端可点「联网检查这些图」
      scanned: { notes: notes.length, photos: photos.length, skipped }
    });
  },

  /* ---- 联网检查笔记里的外站图片：真的去请求，不靠猜 ---- */
  'POST /api/health/images': async (req, res) => {
    const notes = await listNotes(ROOT);
    const targets = [];   // { url, rel, title }

    for (const n of notes) {
      let full;
      try { full = await readNote(ROOT, n.rel); } catch { continue; }
      for (const m of full.body.matchAll(/!\[[^\]]*\]\(\s*(https?:\/\/[^)\s]+)/g)) {
        targets.push({ url: m[1], rel: n.rel, title: n.title });
      }
    }

    const results = new Map();          // url → { ok, status }
    const unique = [...new Set(targets.map((t) => t.url))];

    async function checkOne(url) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      try {
        let r = await fetch(url, { method: 'HEAD', signal: ctrl.signal, redirect: 'follow' });
        // 有些对象存储不认 HEAD，退回只取第一个字节的 GET
        if (r.status === 405 || r.status === 501) {
          r = await fetch(url, { method: 'GET', signal: ctrl.signal, headers: { Range: 'bytes=0-0' } });
        }
        return { ok: r.ok, status: r.status };
      } catch (e) {
        const aborted = e && (e.name === 'AbortError' || e.name === 'TimeoutError');
        return { ok: false, status: 0, error: aborted ? '超时' : String(e.message || e) };
      } finally {
        clearTimeout(timer);
      }
    }

    // 并发 6，避免一次打太多请求
    const queue = unique.slice();
    await Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => {
      while (queue.length) {
        const url = queue.shift();
        results.set(url, await checkOne(url));
      }
    }));

    const broken = [];
    for (const t of targets) {
      const r = results.get(t.url);
      if (r && !r.ok) broken.push({ url: t.url, status: r.status || r.error, rel: t.rel, title: t.title });
    }

    json(res, { checked: unique.length, ok: broken.length === 0, broken });
  }
};

/* =========================================================
 *  主循环
 * ======================================================= */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = decodeURIComponent(url.pathname);

  try {
    /* --- API --- */
    if (pathname.startsWith('/api/')) {
      const key = `${req.method} ${pathname}`;
      const handler = routes[key];

      // 公开接口（不需要登录）
      const PUBLIC = ['GET /api/session', 'POST /api/login', 'POST /api/setup'];
      if (!handler) return json(res, { error: `没有这个接口：${key}` }, 404);
      if (!PUBLIC.includes(key) && !currentUser(req)) {
        return json(res, { error: '未登录' }, 401);
      }
      return await handler(req, res, url);
    }

    /* --- 图片预览：public/media/** --- */
    if (pathname.startsWith('/media/')) {
      const rel = pathname.slice('/media/'.length);
      const abs = path.join(ROOT, 'public', 'media', rel);
      if (!abs.startsWith(path.join(ROOT, 'public', 'media'))) {
        res.writeHead(403); return res.end('forbidden');
      }
      if (await serveStatic(res, abs)) return;
      res.writeHead(404); return res.end('not found');
    }

    /* --- 笔记附件预览：blog/attachments/** --- */
    if (pathname.startsWith('/blog-attach/')) {
      const rel = pathname.slice('/blog-attach/'.length);
      const attachRoot = path.join(ROOT, 'blog', 'attachments');
      const abs = path.join(attachRoot, rel);
      if (!abs.startsWith(attachRoot)) {
        res.writeHead(403); return res.end('forbidden');
      }
      if (await serveStatic(res, abs)) return;
      res.writeHead(404); return res.end('not found');
    }

    /* --- 原图预览：img/** --- */
    if (pathname.startsWith('/img-raw/')) {
      const rel = pathname.slice('/img-raw/'.length);
      const abs = path.join(ROOT, 'img', rel);
      if (!abs.startsWith(path.join(ROOT, 'img'))) {
        res.writeHead(403); return res.end('forbidden');
      }
      if (await serveStatic(res, abs)) return;
      res.writeHead(404); return res.end('not found');
    }

    /* --- 后台界面 ---
       界面文件放在 public/admin/，对外路由是 /admin/*。
       所以 /admin/admin.css 要映射成 public/admin/admin.css（前缀只吃掉一次）。 */
    const uiPrefix = '/admin';
    let uiRel = pathname;
    if (uiRel === uiPrefix || uiRel === uiPrefix + '/' || uiRel === '/') {
      uiRel = '/index.html';
    } else if (uiRel.startsWith(uiPrefix + '/')) {
      uiRel = uiRel.slice(uiPrefix.length);
    }
    const uiPath = path.join(UI_DIR, uiRel.replace(/^\/+/, ''));
    if (uiPath.startsWith(UI_DIR) && await serveStatic(res, uiPath)) return;

    // 单页应用兜底：任何非资源路径都回 index.html
    if (!path.extname(pathname) && await serveStatic(res, path.join(UI_DIR, 'index.html'))) return;

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  } catch (err) {
    console.error('[admin] 出错：', err);
    json(res, { error: String(err && err.message || err) }, 500);
  }
});

/**
 * 启动服务。
 * @param port 不传就用 ADMIN_PORT / 4322；传 0 表示随便给个空闲端口（测试用）
 */
export function startServer({ port = PORT, quiet = false } = {}) {
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      ensureAdminDir();
      const rec = readAuth();
      const actual = server.address().port;
      if (!quiet && process.env.ADMIN_QUIET !== '1') {
        console.log('');
        console.log('  ┌─────────────────────────────────────────────┐');
        console.log('  │   林夕的小站 · 专属后台                     │');
        console.log('  ├─────────────────────────────────────────────┤');
        console.log(`  │   地址：http://127.0.0.1:${actual}`);
        console.log(`  │   项目：${ROOT}`);
        console.log(`  │   状态：${rec ? '已设密码，直接登录' : '首次使用，会让你设置密码'}`);
        console.log('  └─────────────────────────────────────────────┘');
        console.log('');
      }
      resolve({ port: actual, server, root: ROOT });
    });
  });
}

export { routes, ROOT };

/* 作为主程序运行时才自动启动；被 import（测试）时不占端口 */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain && process.env.ADMIN_IMPORT_ONLY !== '1') {
  await startServer();
  process.on('SIGINT', () => { console.log('\n后台已停止。'); process.exit(0); });
}
