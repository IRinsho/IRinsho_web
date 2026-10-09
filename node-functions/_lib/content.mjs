/* =========================================================
 *  云端内容服务
 *  ---------------------------------------------------------
 *  把本地版 admin/server/file-store.mjs 里**已经测过的纯逻辑**直接复用：
 *    parseFrontmatter / buildFrontmatter / composeNote / mergeFields / pickChanged
 *  只把「读写磁盘」换成「读写 GitHub」。
 *
 *  这样两边的行为完全一致：字段顺序、数组写法、未知字段、正文空行
 *  都按原样保留；`pinned: "true"` 也照样会被规范成真布尔。
 * ======================================================= */

import vm from 'node:vm';

import {
  parseFrontmatter, buildFrontmatter, composeNote, mergeFields, pickChanged,
  FIELD_KEYS, assertPhotoKey
} from '../../admin/server/file-store.mjs';

import {
  findDefaultObject, findTopLevelKeys, applyChanges,
  replaceArrayElement, appendArrayElement, removeArrayElement,
  setObjectEntry, removeObjectEntry, toJs
} from '../../admin/server/js-data.mjs';

/* ---------------- 常量 ---------------- */

export const BLOG_DIR = 'blog';
export const ATTACH_DIR = 'blog/attachments';
export const CONFIG_PATH = 'src/data/config.js';
export const VIDEOS_PATH = 'src/data/videos.js';
export const LINKS_PATH = 'src/data/links.js';
export const PHOTO_META_PATH = 'src/data/photo-meta.js';

/* ---------------- 小工具 ---------------- */

export function isoDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export function idFromFile(fileName) {
  return String(fileName)
    .replace(/\.md$/i, '')
    .replace(/^\d{4}[-_.]\d{1,2}[-_.]\d{1,2}[-_. ]*/, '')
    .trim();
}

function titleFromFile(fileName) {
  return idFromFile(fileName) || fileName;
}

function dateFromFile(fileName) {
  const m = String(fileName).match(/^(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})/);
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function folderOf(rel) {
  const parts = String(rel).split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : '';
}

function normalizeTags(v) {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (!v) return [];
  return String(v).split(/[,，]/).map((s) => s.trim()).filter(Boolean);
}

/**
 * 把 `export default` 换成 `module.exports = `，好让脚本解析器吃得下。
 *
 * ⚠ 必须锚定行首（^...m）。这些文件的开头注释里常常写着
 *   「内容包在 export default { ... } 里」这种说明文字，
 *   用不带锚点的正则会替换到**注释里那一句**，
 *   而真正的导出语句原封不动 —— 结果是解析报 "Unexpected token 'export'"。
 *   config.js 就正好踩了这个坑。
 */
function maskExportDefault(src) {
  return String(src).replace(/^([ \t]*)export\s+default\s/gm, '$1module.exports = ');
}

/**
 * 语法检查（云端版，不 spawn 子进程）。
 *
 * `vm.Script` 与 `new Function` 都是**脚本**解析器，不认 ESM 的 `export default`，
 * 所以先遮罩再检查。这样既保住「语法不过就不写入」这条保护，又不会误杀正常文件。
 */
export function syntaxOk(source) {
  const masked = maskExportDefault(source);
  try {
    new vm.Script(masked, { filename: 'check.mjs' });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: String(e && e.message || e) };
  }
}

/** 路径安全：云端版也要挡住 ../ 之类 */
export function assertSafeRel(rel, { allow = ['blog/', 'img/', 'src/data/', 'public/media/'] } = {}) {
  const raw = String(rel == null ? '' : rel).replace(/\\/g, '/');
  if (!raw) throw new Error('路径不能为空');
  if (raw.includes('\0')) throw new Error('路径里有非法字符');
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) throw new Error('不接受绝对路径');
  if (raw.split('/').some((s) => s === '..')) throw new Error('路径里不允许出现 ..');
  if (!allow.some((p) => raw.startsWith(p))) throw new Error('不在允许写入的目录里：' + raw);
  return raw;
}

/* ---------------- 笔记 ---------------- */

/** 把仓库里的一个 .md 读成结构化笔记 */
export function noteFromSource(rel, raw) {
  const { data, body, keys, arrayStyles } = parseFrontmatter(raw);
  const fileName = rel.split('/').pop();

  const had = {};
  for (const k of FIELD_KEYS) had[k] = Object.prototype.hasOwnProperty.call(data, k);
  const implicit = {};
  for (const k of FIELD_KEYS) implicit[k] = !had[k];

  const fields = {
    title: data.title !== undefined && data.title !== '' ? data.title : titleFromFile(fileName),
    date: data.date || dateFromFile(fileName) || '',
    category: data.category || folderOf(rel.replace(/^blog\//, '')),
    tags: normalizeTags(data.tags),
    summary: data.summary || '',
    cover: data.cover || '',
    pinned: data.pinned === true,
    draft: data.draft === true
  };

  const fullRel = rel.startsWith('blog/') ? rel : BLOG_DIR + '/' + rel;
  return {
    rel: fullRel.slice(BLOG_DIR.length + 1),        // 对外统一给「相对 blog/」的路径
    repoPath: fullRel,                              // 仓库里的真实路径
    id: idFromFile(fileName),
    fileName,
    folder: folderOf(rel.replace(/^blog\//, '')),
    fields,
    had,
    implicit,
    rawFields: data,
    rawOrder: keys || [],
    arrayStyles: arrayStyles || {},
    body,
    chars: body.replace(/\s/g, '').length
  };
}

/** 列出全部笔记（按日期倒序） */
export async function listNotes(store) {
  const files = (await store.listDeep(BLOG_DIR)).filter((f) => /\.md$/i.test(f.name) && !f.name.startsWith('.'));
  const out = [];

  for (const f of files) {
    try {
      const r = await store.read(f.path);
      if (!r) continue;
      const n = noteFromSource(f.path, r.text);
      out.push({
        rel: n.rel, repoPath: n.repoPath, id: n.id, fileName: n.fileName, folder: n.folder,
        title: n.fields.title, date: n.fields.date, category: n.fields.category,
        tags: n.fields.tags, summary: n.fields.summary, cover: n.fields.cover,
        pinned: n.fields.pinned, draft: n.fields.draft, chars: n.chars
      });
    } catch (e) {
      out.push({ rel: f.path.replace(/^blog\//, ''), error: String(e.message || e) });
    }
  }

  return out.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

/** 读一篇（含正文） */
export async function readNote(store, rel) {
  const repoPath = rel.startsWith('blog/') ? rel : BLOG_DIR + '/' + rel;
  const r = await store.read(repoPath);
  if (!r) throw new Error('找不到这篇笔记：' + rel);
  return noteFromSource(repoPath, r.text);
}

/** 由标题生成文件名 */
export function makeNoteFileName(title, date, withDate = true) {
  const safe = String(title || '未命名')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || '未命名';
  const prefix = withDate && date ? String(date) + ' ' : '';
  return prefix + safe + '.md';
}

/**
 * 保存一篇笔记（最小 diff）。
 * original 给定时按「只改用户动过的字段」处理。
 */
export async function saveNote(store, { rel, fields, body, original }) {
  const repoPath = assertSafeRel(
    rel.startsWith('blog/') ? rel : BLOG_DIR + '/' + rel,
    { allow: ['blog/'] }
  );
  if (!/\.md$/i.test(repoPath)) throw new Error('笔记文件名必须以 .md 结尾');

  const src = original || null;
  const rawFields = src ? src.rawFields : {};
  const rawOrder = src ? src.rawOrder : [];
  const arrayStyles = src ? src.arrayStyles : {};

  const picked = src ? pickChanged(fields, src) : { changes: fields, cleared: [] };
  const merged = mergeFields(rawFields, rawOrder, picked.changes, picked.cleared);
  const text = composeNote(merged.data, body, merged.order, arrayStyles);

  const check = syntaxOk(text);
  void check;   // .md 不是 JS，不需要语法检查

  await store.write(repoPath, text, `后台更新笔记：${repoPath.replace(/^blog\//, '')}`);
  return { rel: repoPath.slice(BLOG_DIR.length + 1), bytes: Buffer.byteLength(text) };
}

export async function deleteNote(store, rel) {
  const repoPath = assertSafeRel(
    rel.startsWith('blog/') ? rel : BLOG_DIR + '/' + rel,
    { allow: ['blog/'] }
  );
  await store.remove(repoPath, `后台删除笔记：${repoPath.replace(/^blog\//, '')}`);
  return { rel: repoPath.slice(BLOG_DIR.length + 1) };
}

/* ---------------- 数据文件（config / videos / links / photo-meta） ---------------- */

/** 读一个 .js 数据文件的源码（统一换行，避免 CRLF 把边界算偏） */
export async function readJsSource(store, repoPath) {
  const r = await store.read(repoPath);
  if (!r) throw new Error('找不到文件：' + repoPath);
  const crlf = r.text.includes('\r\n');
  return { src: r.text.replace(/\r\n/g, '\n'), crlf };
}

/** 写回（保留原换行风格 + 语法检查） */
export async function writeJsSource(store, repoPath, src, crlf, message) {
  const text = crlf ? src.replace(/\n/g, '\r\n') : src;
  const check = syntaxOk(text);
  if (!check.ok) {
    throw new Error('改完的代码语法有问题，已放弃写入（你的文件没有被改动）：' + check.message);
  }
  await store.write(repoPath, text, message || `后台更新 ${repoPath}`);
  return { bytes: Buffer.byteLength(text) };
}

/** 改 config.js：支持 'site' 和 'me.friend.url' 两种键 */
export async function patchConfig(store, changes, targetKeys) {
  const { src, crlf } = await readJsSource(store, CONFIG_PATH);

  const flat = {};
  const nested = {};
  for (const [k, v] of Object.entries(changes || {})) {
    if (String(k).includes('.')) nested[k] = v;
    else flat[k] = v;
  }

  let text = src;
  const changed = [];

  if (Object.keys(flat).length) {
    const r = applyChanges(text, flat);
    text = r.text;
    changed.push(...r.changed);
  }

  if (Object.keys(nested).length) {
    const r = applyNested(text, nestChanges(nested), targetKeys);
    text = r.text;
    changed.push(...r.changed);
  }

  if (!changed.length) return { changed: [], skipped: true };
  await writeJsSource(store, CONFIG_PATH, text, crlf, `后台改站点配置：${changed.join('、')}`);
  return { changed };
}

/** 把 { 'me.friend.url': 'x' } 展开成嵌套对象 */
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

/** 读一个标量值的文本范围 */
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
 * 只在明确的顶层键里找子键，避免同名子键在别处被误改。
 */
export function applyNested(src, nested, targetKeys) {
  const region = findDefaultObject(src);
  if (region.open !== '{') throw new Error('这个文件的 export default 不是对象');
  const entries = findTopLevelKeys(src, region);

  const jobs = [];
  for (const [topKey, patch] of Object.entries(nested)) {
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
      const nextIsBlock = /^\[{|^\{/.test(next.trim());
      if (beforeIsBlock !== nextIsBlock) continue;
      if (before.trim() === next.trim()) continue;

      jobs.push({ start: vStart, end: vEnd, after: next, path: topKey + '.' + subKey });
    }
  }

  jobs.sort((a, b) => b.start - a.start);
  let text = src;
  for (const j of jobs) text = text.slice(0, j.start) + j.after + text.slice(j.end);
  return { text, changed: jobs.map((j) => j.path) };
}

/** 读 videos.js / links.js 的数组内容（用 vm 求值，等价于 import） */
export async function readArrayFile(store, repoPath) {
  const { src } = await readJsSource(store, repoPath);
  const value = evalDefault(src);
  return { src, value: Array.isArray(value) ? value : [] };
}

/** 读 photo-meta.js（对象） */
export async function readObjectFile(store, repoPath) {
  const { src } = await readJsSource(store, repoPath);
  const value = evalDefault(src);
  return { src, value: value && typeof value === 'object' ? value : {} };
}

/**
 * 在隔离沙箱里求值 `export default <字面量>`。
 * 这些数据文件只包含字面量（对象/数组/字符串/数字/布尔），
 * 所以用 vm 跑一遍是安全的 —— 比 import() 更适合函数运行时。
 */
function evalDefault(src) {
  const masked = maskExportDefault(src);
  const sandbox = { module: { exports: null }, console };
  vm.createContext(sandbox);
  try {
    new vm.Script(masked, { filename: 'data.js' }).runInContext(sandbox, { timeout: 2000 });
  } catch (e) {
    throw new Error('读取数据文件失败：' + String(e.message || e));
  }
  return sandbox.module.exports;
}

/** 改数组文件里的某一条 / 追加 / 删除 */
export async function saveArrayEntry(store, repoPath, { index, value, label }) {
  const { src, crlf } = await readJsSource(store, repoPath);
  const clean = {};
  for (const [k, v] of Object.entries(value || {})) {
    if (v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length)) continue;
    clean[k] = v;
  }
  const r = (index === null || index === undefined)
    ? appendArrayElement(src, clean)
    : replaceArrayElement(src, Number(index), clean);
  if (!r.changed) return { skipped: true };
  await writeJsSource(store, repoPath, r.text, crlf, `${label || '后台更新'}：${clean.title || clean.name || ''}`);
  return { ok: true };
}

export async function deleteArrayEntry(store, repoPath, index, label) {
  const { src, crlf } = await readJsSource(store, repoPath);
  const r = removeArrayElement(src, Number(index));
  if (!r.changed) return { skipped: true };
  await writeJsSource(store, repoPath, r.text, crlf, `${label || '后台删除'}第 ${Number(index) + 1} 条`);
  return { ok: true };
}

/** 改 photo-meta.js 里某张图的元信息 */
export async function setPhotoMeta(store, imgRel, meta) {
  const key = assertPhotoKey(imgRel);
  const { src, crlf } = await readJsSource(store, PHOTO_META_PATH);
  const r = setObjectEntry(src, key, meta || {});
  if (!r.changed) return { skipped: true };
  await writeJsSource(store, PHOTO_META_PATH, r.text, crlf, `后台改图片信息：${key}`);
  return { ok: true, rel: key };
}

export async function removePhotoMeta(store, imgRel) {
  const key = assertPhotoKey(imgRel);
  const { src, crlf } = await readJsSource(store, PHOTO_META_PATH);
  const r = removeObjectEntry(src, key);
  if (!r.changed) return { skipped: true };
  await writeJsSource(store, PHOTO_META_PATH, r.text, crlf, `后台删除图片信息：${key}`);
  return { ok: true };
}

/* ---------------- 配色（CSS 变量） ---------------- */

export const CSS_PATH = 'public/assets/css/style.css';

export async function readTheme(store) {
  const r = await store.read(CSS_PATH);
  if (!r) return { vars: {}, raw: '' };
  const block = r.text.match(/:root\s*\{([\s\S]*?)\}/);
  const vars = {};
  if (block) {
    for (const m of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  }
  return { vars, raw: r.text };
}

export async function saveTheme(store, vars) {
  const r = await store.read(CSS_PATH);
  if (!r) throw new Error('找不到 style.css');
  const src = r.text;
  const blockMatch = src.match(/:root\s*\{([\s\S]*?)\}/);
  if (!blockMatch) throw new Error('在 style.css 里找不到 :root 变量块');

  let block = blockMatch[1];
  const applied = [];
  for (const [name, value] of Object.entries(vars || {})) {
    if (!/^--[\w-]+$/.test(name)) continue;
    if (!/^[#a-zA-Z0-9\s,.()%'"-]+$/.test(String(value))) continue;
    const re = new RegExp('(' + name.replace(/[-]/g, '\\-') + '\\s*:\\s*)([^;]+)(;)');
    if (!re.test(block)) continue;
    const next = block.replace(re, (m, p1, p2, p3) => p1 + String(value).trim() + p3);
    if (next !== block) { block = next; applied.push(name); }
  }
  if (!applied.length) return { changed: [], skipped: true };

  const text = src.slice(0, blockMatch.index) + blockMatch[0].replace(blockMatch[1], block) +
    src.slice(blockMatch.index + blockMatch[0].length);
  await store.write(CSS_PATH, text, `后台改配色：${applied.join('、')}`);
  return { changed: applied };
}

/* ---------------- 相册（图片） ---------------- */

/**
 * 列出 img/ 下的图片（元信息从 photo-meta.js 合并）。
 *
 * ⚠ 图片地址必须指向**站点上真正存在的文件**：
 *   `img/` 里放的是原图（119178066_p0.jpg，531 KB），
 *   而 `npm run sync` 会把它们压缩成 WebP 放进 `public/media/images/`
 *   （119178066_p0.webp，68 KB），站点上线后只有后者。
 *   以前这里直接给 `/img/xxx.jpg` —— 线上根本没有那个目录，缩略图全白。
 *   所以必须去 media/images/ 核对一遍真实文件名。
 */
export async function listPhotos(store) {
  const files = (await store.listDeep('img')).filter((f) =>
    /\.(jpe?g|png|webp|gif|avif|heic|heif|bmp)$/i.test(f.name));

  // 站点上真正存在的图片（压缩后的）
  let siteFiles = [];
  try {
    siteFiles = (await store.listDeep('public/media/images')).filter((f) => f.type !== 'dir');
  } catch { /* 目录不存在也正常 */ }

  const byName = new Map(siteFiles.map((f) => [f.name, f.path]));
  const byStem = new Map();          // 去掉扩展名的同名文件（处理 jpg → webp 的改名）
  for (const f of siteFiles) {
    const stem = f.name.replace(/\.[^.]+$/, '');
    if (!byStem.has(stem)) byStem.set(stem, f.path);
  }

  let meta = {};
  try {
    const r = await store.read(PHOTO_META_PATH);
    if (r) meta = evalDefault(r.text.replace(/\r\n/g, '\n')) || {};
  } catch { /* 没有 photo-meta 也正常 */ }

  return files.map((f) => {
    const rel = f.path.replace(/^img\//, '');
    const folder = rel.includes('/') ? rel.split('/').slice(0, -1).join('/') : '';
    const m = meta[rel] || null;

    // 优先站点上那张：同名同扩展名优先，其次同名的其它格式
    const sitePath = byName.get(f.name)
      || byStem.get(f.name.replace(/\.[^.]+$/, ''))
      || '';

    return {
      rel, repoPath: f.path,
      name: f.name,
      album: (m && m.album) || folder || '未分类',
      size: f.size,
      meta: m,
      /* 界面显示用的地址：站点上有压缩版就用它（线上一定能显示） */
      url: sitePath ? '/' + sitePath.replace(/^public\//, '') : '',
      sitePath,
      /* 还没同步过：界面可以提示「跑一次同步才会出现在相册里」 */
      needsSync: !sitePath
    };
  }).sort((a, b) => a.rel.localeCompare(b.rel));
}

/**
 * 上传一张图片到 img/。
 * 注意：GitHub Contents API 单文件上限 1 MB，所以这里必须先校验大小。
 */
export async function uploadPhoto(store, { name, album, base64 }) {
  const buf = Buffer.from(String(base64 || ''), 'base64');
  if (!buf.length) throw new Error('没有收到图片内容');
  if (buf.length > 1024 * 1024) {
    throw new Error(
      `图片 ${(buf.length / 1024 / 1024).toFixed(2)} MB，超过 GitHub 单文件 1 MB 限制。` +
      '请让浏览器先压缩（后台界面会自动压），或用电脑端上传。'
    );
  }

  const safeName = String(name || 'upload.jpg')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '-');
  if (!/\.(jpe?g|png|webp|gif|avif|bmp|heic|heif)$/i.test(safeName)) {
    throw new Error('不支持的图片格式：' + safeName);
  }

  const cleanAlbum = String(album || '').replace(/^\/+|\/+$/g, '');
  const repoPath = assertSafeRel('img/' + (cleanAlbum ? cleanAlbum + '/' : '') + safeName, { allow: ['img/'] });

  await store.write(repoPath, buf, `后台上传图片：${repoPath.replace(/^img\//, '')}`);
  return { rel: repoPath.replace(/^img\//, ''), bytes: buf.length };
}
