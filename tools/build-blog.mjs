/* =========================================================
 *  Blog 构建脚本
 *  ---------------------------------------------------------
 *  职责：扫描 blog/ 文件夹里的 Markdown，生成 src/data/notes.generated.js
 *
 *  你的写作流程：
 *    在 Obsidian 里打开 blog/ 这个文件夹当仓库 → 写笔记 → 保存
 *    本地：双击 启动网站.cmd（会自动构建）
 *    线上：git push（GitHub Actions 会自动构建并部署）
 *
 *  目录规则：
 *    · blog/ 的子文件夹名 = 笔记分类（如 blog/技术开发/xxx.md → 分类「技术开发」）
 *    · 以 _ 开头的文件 / 文件夹不发布（放模板和说明用）
 *    · .obsidian、.trash 等隐藏目录自动跳过
 *    · 笔记里引用的图片放在 blog/attachments/ 即可，会自动复制到 media/notes/
 *
 *  直接运行： node tools/build-blog.mjs
 *  被复用：   serve.mjs 启动时和检测到 blog/ 变化时会调用 buildBlog()
 * ======================================================= */
import {
  readdirSync, statSync, mkdirSync, writeFileSync, readFileSync,
  existsSync, copyFileSync
} from 'node:fs';
import { join, extname, basename, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const BLOG = 'blog';
const OUT = 'src/data/notes.generated.js';     // 生成的数据文件（ES 模块）
const ASSET_DIR = 'public/media/notes';        // 笔记里的图片复制到这里
const ASSET_URL = 'media/notes';               // 页面里引用的路径前缀（asset() 会补 base）
const DEFAULT_CAT = '未分类';
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.bmp']);

const posix = p => p.split(sep).join('/');

/* ---------------- 迷你 YAML 解析（只认 frontmatter 常用写法） ---------------- */
function parseYamlLite(text) {
  const out = {};
  const lines = text.split(/\r?\n/);
  let key = null;
  for (const line of lines) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && key) {
      if (!Array.isArray(out[key])) out[key] = [];
      out[key].push(stripQuotes(listItem[1].trim()));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    key = kv[1];
    const raw = kv[2].trim();
    if (raw === '') { out[key] = ''; continue; }          // 可能是块状数组的开头
    if (/^\[.*\]$/.test(raw)) {
      out[key] = raw.slice(1, -1).split(',')
        .map(s => stripQuotes(s.trim())).filter(Boolean);
    } else if (/^(true|false)$/i.test(raw)) {
      out[key] = /^true$/i.test(raw);
    } else {
      out[key] = stripQuotes(raw);
    }
  }
  return out;
}
function stripQuotes(s) {
  return String(s).replace(/^["']|["']$/g, '');
}

/* ---------------- 解析一篇 Markdown ---------------- */
function parseNote(raw) {
  const fm = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const data = fm ? parseYamlLite(fm[1]) : {};
  let body = fm ? raw.slice(fm[0].length) : raw;
  body = body.replace(/%%[\s\S]*?%%/g, '');               // 去掉 Obsidian 注释
  return { data, body: body.trim() };
}

function slugify(s) {
  return String(s)
    .replace(/^\d{4}-\d{2}-\d{2}[-_ ]*/, '')              // 去掉文件名里的日期前缀
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'note';
}

function dateFromName(name) {
  const m = basename(name).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}
function dateOf(ms) {
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ---------------- 扫描 blog/ ---------------- */
function walk(dir, root, acc) {
  let entries;
  try { entries = readdirSync(dir).sort(); } catch (e) { return acc; }
  for (const name of entries) {
    const abs = join(dir, name);
    let st;
    try { st = statSync(abs); } catch (e) { continue; }
    if (st.isDirectory()) {
      if (name.startsWith('.')) continue;                  // .obsidian / .trash
      walk(abs, root, acc);
    } else {
      acc.push({ abs, rel: posix(relative(root, abs)), mtimeMs: st.mtimeMs, size: st.size });
    }
  }
  return acc;
}

/* ---------------- 主流程 ---------------- */
export function buildBlog(options = {}) {
  const root = options.root || ROOT;
  const quiet = !!options.quiet;
  const log = quiet ? () => {} : (...a) => console.log(...a);

  const blogDir = join(root, BLOG);
  const assetDir = join(root, ASSET_DIR);
  mkdirSync(blogDir, { recursive: true });

  const files = walk(blogDir, blogDir, []);

  // 图片索引（用于解析 ![[图片名]]）
  const images = {};
  files.filter(f => IMAGE_EXT.has(extname(f.abs).toLowerCase()))
    .forEach(f => { images[basename(f.abs)] = f.abs; });

  // 要发布的 Markdown
  const mds = files.filter(f =>
    extname(f.abs).toLowerCase() === '.md' &&
    !basename(f.abs).startsWith('_') &&
    basename(f.abs).toLowerCase() !== 'readme.md'
  );

  const usedIds = new Set();
  const notes = [];
  let skippedDraft = 0, copiedAssets = 0;

  for (const f of mds) {
    const { data, body } = parseNote(readFileSync(f.abs, 'utf8'));
    if (data.draft === true || String(data.draft).toLowerCase() === 'true') { skippedDraft++; continue; }

    const relDir = posix(dirname(f.rel));
    const category = data.category || (relDir === '.' ? DEFAULT_CAT : relDir);
    const title = data.title || basename(f.abs, '.md').replace(/^\d{4}-\d{2}-\d{2}[-_ ]*/, '');
    const date = data.date ? String(data.date) : (dateFromName(f.rel) || dateOf(f.mtimeMs));

    // 生成唯一 id
    let id = slugify(data.slug || data.id || basename(f.abs, '.md'));
    if (usedIds.has(id)) { let i = 2; while (usedIds.has(`${id}-${i}`)) i++; id = `${id}-${i}`; }
    usedIds.add(id);

    // 解析 ![[图片]] 与 ![](路径)
    let content = body;
    content = content.replace(/!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (m, name, alt) => {
      const key = basename(name.trim());
      const src = images[key];
      if (!src) { log(`  ! ${f.rel} 引用的图片找不到：${name.trim()}`); return ''; }
      mkdirSync(assetDir, { recursive: true });
      const target = join(assetDir, key);
      try {
        if (!existsSync(target) || statSync(src).size !== statSync(target).size) {
          copyFileSync(src, target); copiedAssets++;
        }
      } catch (e) { /* 复制失败就继续 */ }
      return `![${alt || key}](${ASSET_URL}/${key})`;
    });

    // 解析 [[双向链接]]
    content = content.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, target, label) => label || target);

    // 正文开头若有一级标题且和标题重复，去掉，避免阅读页出现两个大标题
    const h1 = content.match(/^#\s+(.+?)\s*$/m);
    if (h1 && h1.index === 0 && (h1[1].trim() === title || !data.title)) {
      content = content.slice(h1[0].length).trim();
    }
    content = content.replace(/\n{3,}/g, '\n\n').trim();   // 去掉连续空行

    // 封面：frontmatter cover 可以是文件名、![[图片]] 或路径
    let cover = data.cover ? String(data.cover).replace(/^!?\[\[|\]\]$/g, '').trim() : '';
    if (cover && !cover.includes('/')) {
      const src = images[basename(cover)];
      if (src) {
        mkdirSync(assetDir, { recursive: true });
        try { copyFileSync(src, join(assetDir, basename(cover))); copiedAssets++; } catch (e) {}
        cover = `${ASSET_URL}/${basename(cover)}`;
      } else { cover = ''; }
    }

    notes.push({
      id,
      title,
      category,
      tags: Array.isArray(data.tags) ? data.tags.map(String)
        : (data.tags ? String(data.tags).split(/[,，]\s*/).filter(Boolean) : []),
      date,
      summary: data.summary ? String(data.summary) : '',
      cover,
      content,
      _mtime: f.mtimeMs,
      _rel: f.rel
    });
  }

  notes.sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.title.localeCompare(b.title, 'zh'));

  // 写 src/data/notes.generated.js
  // 用 JSON.stringify 序列化，并把 </ 转义掉，防止正文里的 </script> 破坏页面
  const esc = s => JSON.stringify(s).replace(/<\//g, '<\\/');
  const L = [];
  L.push('/* =========================================================');
  L.push(' *  ⚠ 本文件由 tools/build-blog.mjs 从 blog/ 文件夹自动生成，手改会被覆盖！');
  L.push(' *');
  L.push(' *  想加笔记 → 在 blog/ 里新建 .md 文件（用 Obsidian 写最方便）');
  L.push(' *  想改分类 → 放进 blog/ 下不同的子文件夹，或写 category: 字段');
  L.push(' *  想改内容 → 改 blog/ 里对应的 .md 文件，然后运行 npm run sync');
  L.push(' *');
  L.push(` *  生成时间：${new Date().toLocaleString('zh-CN')}`);
  L.push(` *  共 ${notes.length} 篇${skippedDraft ? `（另有 ${skippedDraft} 篇标了 draft 未发布）` : ''}`);
  L.push(' * ======================================================= */');
  L.push('export default [');
  for (const n of notes) {
    L.push('  {');
    L.push(`    id: ${esc(n.id)},`);
    L.push(`    title: ${esc(n.title)},`);
    L.push(`    category: ${esc(n.category)},`);
    L.push(`    tags: ${JSON.stringify(n.tags)},`);
    L.push(`    date: ${esc(n.date)},`);
    L.push(`    summary: ${esc(n.summary)},`);
    if (n.cover) L.push(`    cover: ${esc(n.cover)},`);
    L.push(`    content: ${esc(n.content)}`);
    L.push('  },');
  }
  L.push('];');
  L.push('');

  mkdirSync(dirname(join(root, OUT)), { recursive: true });
  writeFileSync(join(root, OUT), L.join('\n'), 'utf8');

  const summary = { total: notes.length, drafts: skippedDraft, assets: copiedAssets, files: mds.length };
  if (!quiet) {
    log('');
    if (notes.length) {
      notes.forEach(n => log(`  ✓ ${n.category} / ${n.title}   [${n.date}]`));
    } else {
      log('  （blog/ 里还没有要发布的笔记）');
    }
    log('\n' + '-'.repeat(58));
    log(`blog/ 共 ${mds.length} 个 md 文件 → 发布 ${notes.length} 篇` +
      (skippedDraft ? `，跳过草稿 ${skippedDraft} 篇` : '') +
      (copiedAssets ? `，复制图片 ${copiedAssets} 张` : ''));
    log(`已更新 ${OUT}`);
    log('-'.repeat(58) + '\n');
  }
  return summary;
}

/* ---------------- 作为脚本直接运行 ---------------- */
const invokedDirectly = process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  console.log('\n扫描 blog/ 文件夹…');
  try {
    buildBlog({});
  } catch (e) {
    console.error('构建失败：' + e.message);
    process.exit(1);
  }
}
