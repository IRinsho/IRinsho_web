/* =========================================================
 *  文件仓库（File Store）
 *  ---------------------------------------------------------
 *  后台的「手脚」：负责安全地读写项目里的内容文件。
 *
 *  它只做四件事：
 *    1. 解析 / 生成 notes 的 frontmatter（YAML 子集）
 *    2. 读写笔记、图片、config.js / videos.js / links.js
 *    3. 每次写入前自动备份到 .admin/backups/
 *    4. 所有路径都过白名单，防止写到项目外面去
 *
 *  所有函数都是「无状态」的，路径由调用方传进来（本地 / 云端共用同一套逻辑）。
 * ======================================================= */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/* ---------------- 路径安全 ---------------- */

/** 允许后台写入的顶层目录（相对项目根） */
export const WRITE_ALLOW = [
  'blog',
  'img',
  'src/data',
  'public/media',
  'public/assets/css'
];

/** 允许后台写入的具体文件（相对项目根） */
export const WRITE_FILES = [
  'public/assets/css/style.css'
];

/**
 * 把相对路径解析成绝对路径，并确保它落在白名单里。
 *
 * 注意顺序：**先检查有没有 `..`，再 resolve**。
 * 因为 path.resolve 会把 `a/../../b` 折叠掉，等折叠完再检查就抓不到越界了。
 */
export function safeResolve(root, rel) {
  const raw = String(rel == null ? '' : rel).replace(/\\/g, '/');

  if (path.isAbsolute(raw) || /^[A-Za-z]:/.test(raw)) {
    throw new Error(`不接受绝对路径：${rel}`);
  }
  const segments = raw.split('/');
  if (segments.some((s) => s === '..')) {
    throw new Error(`路径里不允许出现 ..，拒绝访问：${rel}`);
  }
  if (raw.includes('\0')) {
    throw new Error('路径里有非法字符');
  }

  const abs = path.resolve(root, raw);
  const relNorm = path.relative(root, abs).replace(/\\/g, '/');
  if (!relNorm || relNorm.startsWith('..') || path.isAbsolute(relNorm)) {
    throw new Error(`路径越界，拒绝访问：${rel}`);
  }

  const allowed = WRITE_ALLOW.some((dir) => relNorm === dir || relNorm.startsWith(dir + '/'))
    || WRITE_FILES.includes(relNorm);
  if (!allowed) {
    throw new Error(`不在可写白名单里，拒绝访问：${relNorm}`);
  }
  return { abs, rel: relNorm };
}

/* ---------------- frontmatter ---------------- */

/**
 * 解析 YAML 子集（只认 Obsidian frontmatter 里常见的写法）：
 *   key: value          key: "value"
 *   key: [a, b]         key:            key:
 *     - a                 （空值）         - a
 *     - b
 *
 * 两个刻意的处理：
 *   · `pinned: "true"` 这种「带引号的布尔」也认成 true
 *     —— Obsidian 里手写引号很常见，不认的话站点的置顶会静默失效
 *   · 数组的书写风格（块状 / 行内）会记下来，回写时保持原样，git diff 才干净
 */
export function parseFrontmatter(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { data: {}, body: text, hadFm: false, keys: [], arrayStyles: {} };

  const data = {};
  const keys = [];
  const arrayStyles = {};
  const lines = m[1].split('\n');
  let curKey = null;

  for (const line of lines) {
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue;

    // 数组项：  - value
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && curKey && Array.isArray(data[curKey])) {
      arrayStyles[curKey] = 'block';
      data[curKey].push(scalar(item[1]));
      continue;
    }

    const kv = line.match(/^([A-Za-z0-9_\u4e00-\u9fa5-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const rest = kv[2].trim();

    if (!keys.includes(key)) keys.push(key);

    if (rest === '') {
      data[key] = [];        // 也可能是「空值」或「换行数组」的开头，看下面有没有 `- `
      curKey = key;
      continue;
    }
    curKey = null;
    if (/^\[.*\]$/.test(rest)) {
      arrayStyles[key] = 'inline';
      data[key] = rest.slice(1, -1).split(',').map((s) => scalar(s.trim())).filter((s) => s !== '');
    } else {
      data[key] = scalar(rest);
    }
  }

  // 声明了 key 但下面既没有 `- ` 也没有值 → 是「空值」，不是空数组
  for (const k of Object.keys(data)) {
    if (Array.isArray(data[k]) && data[k].length === 0) data[k] = '';
  }

  return { data, body: text.slice(m[0].length), hadFm: true, keys, arrayStyles };
}

function scalar(v) {
  let s = String(v == null ? '' : v).trim();
  const quoted = (s.startsWith('"') && s.endsWith('"') && s.length > 1) ||
                 (s.startsWith("'") && s.endsWith("'") && s.length > 1);
  if (quoted) s = s.slice(1, -1);
  // 带引号的布尔也当布尔（Obsidian 手写常见）
  if (s === 'true') return true;
  if (s === 'false') return false;
  return s;
}

/** 需要引号的字符串：含冒号、井号、逗号、方括号、引号，或以特殊字符开头 */
function needsQuote(s) {
  return /[:#,[\]{}"']/.test(s) || /^[\s&*!|>%@`-]/.test(s);
}

function fmValue(v, style) {
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    // 非空的块状数组在 buildFrontmatter 里就处理掉了，这里只剩行内写法
    return `[${v.map((x) => String(x)).join(', ')}]`;
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const s = String(v == null ? '' : v);
  if (s === '') return '';
  if (typeof v === 'number') return s;
  if (needsQuote(s)) return JSON.stringify(s);
  return s;
}

/**
 * 把对象写成 frontmatter。
 *  · keyOrder 给定时按它排（保留原作者写的顺序），新字段追加在末尾
 *  · arrayStyles 记着每个数组原本是块状还是行内
 */
export function buildFrontmatter(data, keyOrder, arrayStyles) {
  const order = Array.isArray(keyOrder) ? keyOrder.slice() : [];
  for (const k of Object.keys(data)) if (!order.includes(k)) order.push(k);

  const out = [];
  for (const k of order) {
    if (!(k in data)) continue;
    const v = data[k];
    if (Array.isArray(v) && v.length && (arrayStyles || {})[k] !== 'inline') {
      // 块状数组：
      //   tags:
      //     - C语言
      out.push(`${k}:`);
      for (const item of v) {
        const s = String(item);
        out.push(`  - ${needsQuote(s) ? JSON.stringify(s) : s}`);
      }
      continue;
    }
    out.push(fmLine(k, fmValue(v, (arrayStyles || {})[k])));
  }
  return `---\n${out.join('\n')}\n---\n`;
}

/** 拼 `key: value`；空值写成 `key:`（不要留一个尾空格，否则 diff 很脏） */
function fmLine(k, written) {
  return written === '' ? `${k}:` : `${k}: ${written}`;
}

export function composeNote(data, body, keyOrder, arrayStyles) {
  const cleanBody = String(body || '').replace(/\r\n?/g, '\n');
  // ⚠ 不要动正文开头/结尾的空行。
  //   正文是原样解析出来的，用户没改就得原样写回去 ——
  //   否则「打开再保存」会悄悄吃掉 frontmatter 后的空行，
  //   git diff 就会莫名其妙地变脏。
  return buildFrontmatter(data, keyOrder, arrayStyles) + cleanBody;
}

/** 后台认得的字段（顺序即新建笔记时的默认顺序） */
export const FIELD_KEYS = ['title', 'date', 'category', 'tags', 'summary', 'cover', 'pinned', 'draft', 'slug'];

/**
 * 合并：以原文件的 key 集合与顺序为准，只应用后台明确要改的字段。
 *
 * 三个入参分工明确，互不越界：
 *   rawFields  原文件里所有字段（含 cssclasses 这类后台不认识的）
 *   rawOrder   原文件的字段顺序
 *   changes    要写入 / 覆盖的字段（只含用户真的改过的）
 *   removed    要整行删掉的字段名（用户把原来的值清空了）
 *
 * 关键：changes 里**没有**的字段一律保持原值，绝不用 undefined 去覆盖。
 */
export function mergeFields(rawFields, rawOrder, changes = {}, removed = []) {
  const data = {};
  const order = Array.isArray(rawOrder) && rawOrder.length ? rawOrder.slice() : [];
  for (const k of order) data[k] = rawFields[k];

  const put = (k, v) => {
    if (!order.includes(k)) order.push(k);
    data[k] = v;
  };

  for (const [k, v] of Object.entries(changes)) put(k, v);

  // 清空 = 整行删掉（写 `summary:` 会留下一个没意义的空字段）
  const drop = new Set(removed);
  for (const k of drop) delete data[k];
  const finalOrder = order.filter((k) => !drop.has(k) && k in data);

  // undefined / null 统一成空值（写成 `key:` 更干净）
  for (const k of Object.keys(data)) {
    if (data[k] === undefined || data[k] === null) data[k] = '';
  }
  return { data, order: finalOrder };
}

/* ---------------- 笔记 ---------------- */

/** 文件名 → id（和站点 build-blog.mjs 的规则保持一致：去扩展名、去开头日期） */
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

/** 递归列出 blog/ 下所有 .md（跳过隐藏目录、.trash、attachments） */
export async function listNoteFiles(root) {
  const base = path.join(root, 'blog');
  const out = [];
  async function walk(dir, rel) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      if (e.name === 'attachments') continue;
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) await walk(path.join(dir, e.name), r);
      else if (/\.md$/i.test(e.name)) out.push(r);
    }
  }
  await walk(base, '');
  return out.sort();
}

/**
 * 读一篇笔记的完整信息（frontmatter + 正文 + 从文件推导的默认值）
 */
export async function readNote(root, rel) {
  const abs = path.join(root, 'blog', rel);
  const raw = await fsp.readFile(abs, 'utf8');
  const { data, body, keys, arrayStyles } = parseFrontmatter(raw);
  const fileName = path.basename(rel);
  const stat = await fsp.stat(abs);

  // 哪些字段是 frontmatter 里真的写了的（用来区分「用户填的空」和「文件里没有」）
  const had = {};
  for (const k of FIELD_KEYS) had[k] = Object.prototype.hasOwnProperty.call(data, k);

  const fields = {
    title: data.title !== undefined && data.title !== '' ? data.title : titleFromFile(fileName),
    date: data.date || dateFromFile(fileName) || isoDate(stat.mtime),
    category: data.category || folderOf(rel),
    tags: normalizeTags(data.tags),
    summary: data.summary || '',
    cover: data.cover || '',
    pinned: data.pinned === true,
    draft: data.draft === true
  };

  // 哪些是「推导出来的」（文件里没写）：这些值原样送回时不该被写进文件
  const implicit = {};
  for (const k of FIELD_KEYS) implicit[k] = !had[k];

  return {
    rel,
    id: idFromFile(fileName),
    fileName,
    folder: folderOf(rel),
    fields,                                   // 给表单看的（含推导出来的默认值）
    had,                                      // 文件里真正写过哪些字段
    implicit,                                 // 哪些是推导值
    rawFields: data,
    rawOrder: keys || [],
    arrayStyles: arrayStyles || {},
    rawPinned: data.pinned,                   // 原样保留，方便排查「引号里写的 true」这类怪值
    rawDraft: data.draft,
    body,
    mtime: stat.mtimeMs,
    size: stat.size,
    chars: body.replace(/\s/g, '').length
  };
}

/**
 * 比较「表单现在填的」和「文件里原本的」，挑出真正要动的地方。
 *
 * 返回 { changes, cleared }：
 *   changes —— 要写入的字段（含用户新填的内容）
 *   cleared —— 用户主动清空的字段名（原文件里有，现在填成空了）
 *
 * 没碰过的字段两个都不进 —— 这样「打开再保存」不会凭空多出几行。
 */
export function pickChanged(form, original) {
  const changes = {};
  const cleared = [];

  for (const k of FIELD_KEYS) {
    if (!form || !(k in form)) continue;
    const v = form[k];
    const empty = v === '' || v === null || v === undefined ||
      (Array.isArray(v) && v.length === 0);
    const hadIt = !!(original && original.had && original.had[k]);
    const wasImplicit = !!(original && original.implicit && original.implicit[k]);
    const before = original && original.fields ? original.fields[k] : undefined;
    const same = JSON.stringify(norm(before)) === JSON.stringify(norm(v));

    if (hadIt) {
      // 文件里本来就写了：值没变就不动；清空了就删掉那一行
      if (same) continue;
      if (empty) cleared.push(k);
      else changes[k] = v;
      continue;
    }

    // 文件里没写这个字段
    if (wasImplicit && same) continue;   // 是推导出来的默认值（日期/分类），原样送回 → 不写
    if (empty) continue;                 // 空的也不写
    changes[k] = v;                       // 否则说明用户真的填了东西
  }

  return { changes, cleared };
}

function norm(v) {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'boolean') return v;
  return v === undefined || v === null ? '' : String(v);
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

export function isoDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

/** 列表用（不含正文，快） */
export async function listNotes(root) {
  const files = await listNoteFiles(root);
  const out = [];
  for (const rel of files) {
    try {
      const n = await readNote(root, rel);
      out.push({
        rel: n.rel,
        id: n.id,
        fileName: n.fileName,
        folder: n.folder,
        title: n.fields.title,
        date: n.fields.date,
        category: n.fields.category,
        tags: n.fields.tags,
        summary: n.fields.summary,
        cover: n.fields.cover,
        pinned: n.fields.pinned,
        draft: n.fields.draft,
        chars: n.chars,
        mtime: n.mtime
      });
    } catch (err) {
      out.push({ rel, error: String(err.message || err) });
    }
  }
  return out.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

/* ---------------- 备份 ---------------- */

/** 同一个文件的备份最多留这么多份，超出就把最老的删掉 */
const MAX_BACKUPS_PER_FILE = 30;
/** 备份最多留这么多天 */
const MAX_BACKUP_AGE_DAYS = 60;

export async function backupFile(root, rel) {
  const abs = path.join(root, rel);
  let buf;
  try {
    buf = await fsp.readFile(abs);
  } catch {
    return null; // 新文件，没东西可备份
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeRel = rel.replace(/[\\/]/g, '__');
  const dir = path.join(root, '.admin', 'backups');
  await fsp.mkdir(dir, { recursive: true });
  const target = path.join(dir, `${stamp}__${safeRel}`);
  await fsp.writeFile(target, buf);

  // 顺手清理：不让备份目录无限膨胀（后台改得越多、这里长得越快）
  cleanupBackups(dir, safeRel).catch(() => {});
  return target;
}

async function cleanupBackups(dir, safeRel) {
  let files;
  try { files = await fsp.readdir(dir); } catch { return; }

  const mine = files
    .filter((f) => f.endsWith('__' + safeRel))
    .sort();                                  // 文件名以 ISO 时间戳开头，字典序即时间序
  const cutoff = Date.now() - MAX_BACKUP_AGE_DAYS * 86400 * 1000;

  const doomed = [];
  // 太老的
  for (const f of mine) {
    const stamp = f.split('__')[0].replace(/-/g, (m, i) => m);   // 2026-10-08T14-00-18-178Z
    const iso = stamp.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z');
    const t = Date.parse(iso);
    if (!Number.isNaN(t) && t < cutoff) doomed.push(f);
  }
  // 超量的（保留最新的 N 份）
  if (mine.length > MAX_BACKUPS_PER_FILE) {
    doomed.push(...mine.slice(0, mine.length - MAX_BACKUPS_PER_FILE));
  }

  for (const f of new Set(doomed)) {
    try { await fsp.rm(path.join(dir, f), { force: true }); } catch { /* 忽略 */ }
  }
}

/** 原子写：先写临时文件再 rename，避免半截文件 */
export async function atomicWrite(abs, content) {
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  const tmp = abs + '.tmp-' + process.pid;
  await fsp.writeFile(tmp, content);
  await fsp.rename(tmp, abs);
}

/* ---------------- 笔记写入 ---------------- */

/**
 * 保存一篇笔记。
 * original 给定时走「最小 diff」：未知字段、字段顺序、数组风格、没碰过的字段全部保留。
 */
export async function writeNote(root, rel, form, body, original) {
  const { abs, rel: relNorm } = safeResolve(root, 'blog/' + rel);
  if (!/\.md$/i.test(relNorm)) throw new Error('笔记文件名必须以 .md 结尾');

  const src = original || null;
  const rawFields = src ? src.rawFields : {};
  const rawOrder = src ? src.rawOrder : [];
  const arrayStyles = src ? src.arrayStyles : {};

  const { changes, cleared } = src
    ? pickChanged(form, src)
    : { changes: form, cleared: [] };   // 新建笔记：表单里填的全写

  const merged = mergeFields(rawFields, rawOrder, changes, cleared);
  const text = composeNote(merged.data, body, merged.order, arrayStyles);

  await backupFile(root, relNorm);
  await atomicWrite(abs, text);
  return { rel: relNorm, bytes: Buffer.byteLength(text), fields: merged.data, order: merged.order };
}

export async function deleteNote(root, rel) {
  const { abs, rel: relNorm } = safeResolve(root, 'blog/' + rel);
  await backupFile(root, relNorm);
  await fsp.unlink(abs);
  return { rel: relNorm };
}

/** 由标题生成文件名（可选日期前缀） */
export function makeNoteFileName(title, date, withDate = true) {
  const safe = String(title || '未命名')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || '未命名';
  const prefix = withDate && date ? String(date).replace(/-/g, '-') + ' ' : '';
  return prefix + safe + '.md';
}

/* ---------------- 图片 ---------------- */

export async function listPhotos(root) {
  const base = path.join(root, 'img');
  const out = [];
  async function walk(dir, rel) {
    let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) await walk(path.join(dir, e.name), r);
      else if (/\.(jpe?g|png|webp|gif|avif|heic|bmp)$/i.test(e.name)) {
        const st = await fsp.stat(path.join(dir, e.name));
        out.push({
          rel: r,
          name: e.name,
          album: rel || '未分类',
          size: st.size,
          mtime: st.mtimeMs
        });
      }
    }
  }
  await walk(base, '');
  return out.sort((a, b) => b.mtime - a.mtime);
}

/* ---------------- 照片元数据（photo-meta.js） ---------------- */

/* ---------------- 数据文件（读） ----------------
 * ⚠ 每次都必须加时间戳查询串。
 *   Node 会按 URL 缓存 ES 模块，不加的话改完再读拿到的还是旧内容
 *   —— 这在「读 → 改 → 写」流程里会造成静默丢改动。
 */
async function importFresh(abs) {
  const url = 'file://' + abs.replace(/\\/g, '/') + '?t=' + Date.now() + '-' + Math.random().toString(36).slice(2);
  const mod = await import(url);
  return mod.default;
}

/* ---------------- 照片元数据（photo-meta.js） ---------------- */

/**
 * 校验 photo-meta.js 的 key 是不是一个正常的图片相对路径。
 *
 * 为什么要单独校验：这个 key 会作为**对象键**写进 .js 文件，
 * 不校验的话 `"../../evil"` 这种也能当键被写进去，把数据文件搞脏。
 * （它不会真的写到项目外面，但会污染数据、也可能被后续脚本误用。）
 */
export function assertPhotoKey(rel) {
  const raw = String(rel == null ? '' : rel);
  if (!raw) throw new Error('缺少图片路径');
  if (raw.includes('\0')) throw new Error('图片路径里有非法字符');
  if (path.isAbsolute(raw) || /^[A-Za-z]:/.test(raw)) throw new Error('图片路径不能是绝对路径');
  if (raw.startsWith('/') || raw.startsWith('\\')) throw new Error('图片路径不能以斜杠开头');
  if (raw.replace(/\\/g, '/').split('/').some((s) => s === '..')) {
    throw new Error('图片路径里不允许出现 ..');
  }
  if (!/\.(jpe?g|png|webp|gif|avif|bmp|heic|heif)$/i.test(raw)) {
    throw new Error('图片路径必须以图片扩展名结尾：' + raw);
  }
  return raw.replace(/\\/g, '/');
}

export async function readPhotoMeta(root) {
  const abs = path.join(root, 'src', 'data', 'photo-meta.js');
  const raw = await fsp.readFile(abs, 'utf8');
  return { raw, data: (await importFresh(abs)) || {} };
}

export async function readConfig(root) {
  const abs = path.join(root, 'src', 'data', 'config.js');
  const raw = await fsp.readFile(abs, 'utf8');
  return { raw, data: (await importFresh(abs)) || {} };
}

export async function readVideos(root) {
  const abs = path.join(root, 'src', 'data', 'videos.js');
  const raw = await fsp.readFile(abs, 'utf8');
  return { raw, data: (await importFresh(abs)) || [] };
}

export async function readLinks(root) {
  const abs = path.join(root, 'src', 'data', 'links.js');
  const raw = await fsp.readFile(abs, 'utf8');
  return { raw, data: (await importFresh(abs)) || [] };
}

/* ---------------- 配色变量（style.css） ---------------- */

export async function readTheme(root) {
  const abs = path.join(root, 'public', 'assets', 'css', 'style.css');
  const raw = await fsp.readFile(abs, 'utf8');
  const block = raw.match(/:root\s*\{([\s\S]*?)\}/);
  const vars = {};
  if (block) {
    for (const m of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      vars[m[1]] = m[2].trim();
    }
  }
  return { raw, vars };
}

export function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}
