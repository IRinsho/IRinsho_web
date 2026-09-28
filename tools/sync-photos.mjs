/* =========================================================
 *  图片同步引擎
 *  ---------------------------------------------------------
 *  职责：扫描 img/ 文件夹，把图片压缩成 WebP 存进 media/images/，
 *        并重新生成 src/data/photos.generated.js。
 *
 *  规则：
 *    · img/ 是唯一图片源。以后加图 = 往 img/ 里丢文件
 *    · img/ 的子文件夹名 = 相册分类名（如 img/旅行/xxx.jpg → 相册「旅行」）
 *    · img/ 根目录下的图片 → 相册「未分类」
 *    · 文件名（去掉扩展名）= 默认标题
 *    · 只处理新增和改动过的图片，没变过的直接跳过（靠 .photo-sync.json 记录）
 *    · 从 img/ 删掉图片，对应的压缩图和记录会一起清掉
 *
 *  直接运行： node tools/sync-photos.mjs [--max 2000] [--quality 82] [--force]
 *  被复用：   serve.mjs 启动时和检测到 img/ 变化时会调用 syncPhotos()
 *
 *  手动改过的标题/描述/标签写在 data/photo-meta.js，本脚本不会碰那个文件。
 * ======================================================= */
import { createRequire } from 'node:module';
import {
  readdirSync, statSync, mkdirSync, writeFileSync, readFileSync,
  existsSync, unlinkSync, copyFileSync
} from 'node:fs';
import { join, extname, basename, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SUPPORTED = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.tif', '.tiff',
  '.avif', '.heic', '.heif', '.bmp'
]);
const DEFAULT_ALBUM = '未分类';
const MANIFEST = '.photo-sync.json';

/* 输出位置：压缩后的图片放 public/ 下，数据以 ES 模块写到 src/data/ */
const OUT_DIR_REL = 'public/media/images';       // 图片输出目录
const OUT_URL_PREFIX = 'media/images';           // 页面里引用的路径前缀（asset() 会补 base）
const DATA_OUT = 'src/data/photos.generated.js'; // 生成的数据文件

/* ---------- 加载 sharp：本地优先，回退到 DSH 自带；都没有就降级 ---------- */
function loadSharp() {
  const candidates = [
    'sharp',
    'D:/Deepseek Harness Desktop/resources/dsh/node_modules/sharp'
  ];
  if (process.env.DSH_HOME) {
    candidates.push(join(process.env.DSH_HOME, '..', 'Deepseek Harness Desktop', 'resources', 'dsh', 'node_modules', 'sharp'));
  }
  for (const c of candidates) {
    try {
      const s = require(c);
      if (s && typeof s === 'function') return s;
    } catch (e) { /* 试下一个 */ }
  }
  return null;
}

/* ---------- 工具函数 ---------- */
const posix = p => p.split(sep).join('/');
const pad = n => String(n).padStart(2, '0');

function dateOf(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function albumOf(rel) {
  const dir = dirname(rel);
  return (!dir || dir === '.') ? DEFAULT_ALBUM : posix(dir);
}

// 文件名安全化：去扩展名、替换非法字符、保留中文
function safeBase(rel) {
  const raw = basename(rel, extname(rel));
  const cleaned = raw.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^[.\s]+|[.\s]+$/g, '');
  return (cleaned || 'photo').slice(0, 80);
}

function formatKb(n) { return (n / 1024).toFixed(0) + ' KB'; }
function savedLabel(before, after) {
  const diff = 100 - (after / before) * 100;
  return diff >= 0 ? `省 ${diff.toFixed(0)}%` : `增大 ${(-diff).toFixed(0)}%`;
}

/* ---------- 扫描 img/ ---------- */
function scan(imgDir) {
  const out = [];
  if (!existsSync(imgDir)) return out;
  (function walk(dir) {
    let entries;
    try { entries = readdirSync(dir).sort(); } catch (e) { return; }
    for (const name of entries) {
      if (name.startsWith('.')) continue;
      const abs = join(dir, name);
      let st;
      try { st = statSync(abs); } catch (e) { continue; }
      if (st.isDirectory()) walk(abs);
      else if (SUPPORTED.has(extname(abs).toLowerCase())) {
        out.push({
          abs,
          rel: posix(relative(imgDir, abs)),
          mtimeMs: st.mtimeMs,
          size: st.size
        });
      }
    }
  })(imgDir);
  return out;
}

/* ---------- 主流程 ---------- */
export async function syncPhotos(options = {}) {
  const root = options.root || ROOT;
  const quiet = !!options.quiet;
  const force = !!options.force;
  const maxEdge = options.max || 2000;
  const quality = options.quality || 82;
  const log = quiet ? () => {} : (...a) => console.log(...a);

  const imgDir = join(root, 'img');
  const outDir = join(root, OUT_DIR_REL);
  const manifestPath = join(root, MANIFEST);
  const dataPath = join(root, DATA_OUT);
  // URL 路径（media/images/x.webp）→ 磁盘路径（public/media/images/x.webp）
  const diskPath = (urlPath) => join(root, 'public', urlPath);

  mkdirSync(imgDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  const sharp = options.sharp === undefined ? loadSharp() : options.sharp;
  const mode = sharp ? 'webp' : 'copy';

  // 读上次的同步记录
  let manifest = { version: 1, files: {} };
  if (existsSync(manifestPath)) {
    try {
      const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (parsed && parsed.files) manifest = parsed;
    } catch (e) { /* 记录坏了就当作全新同步 */ }
  }

  const sources = scan(imgDir);

  /* --- 第一步：确定每张图的输出路径（保持稳定，不随便改名） --- */
  const taken = new Set();
  for (const s of sources) {
    const prev = manifest.files[s.rel];
    if (prev && prev.out && prev.mode === mode) taken.add(basename(prev.out, extname(prev.out)).toLowerCase());
  }
  for (const s of sources) {
    const prev = manifest.files[s.rel];
    if (prev && prev.out && prev.mode === mode) { s.out = prev.out; continue; }
    const ext = mode === 'webp' ? '.webp' : extname(s.rel).toLowerCase();
    let base = safeBase(s.rel), name = base, i = 2;
    while (taken.has(name.toLowerCase())) { name = `${base}-${i++}`; }
    taken.add(name.toLowerCase());
    s.out = posix(join(OUT_URL_PREFIX, name + ext));
  }

  /* --- 第二步：处理新增 / 改动过的图片 --- */
  const next = {};
  let added = 0, updated = 0, skipped = 0, failed = 0;
  let bytesBefore = 0, bytesAfter = 0;

  for (const s of sources) {
    const prev = manifest.files[s.rel];
    const outAbs = diskPath(s.out);
    const unchanged = !force && prev && prev.mode === mode &&
      prev.mtimeMs === s.mtimeMs && prev.size === s.size && existsSync(outAbs);

    if (unchanged) {
      skipped++;
      next[s.rel] = prev;
      continue;
    }

    try {
      if (mode === 'webp') {
        const info = await sharp(s.abs, { failOn: 'none' })
          .rotate()                                  // 按 EXIF 方向摆正
          .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
          .webp({ quality })                         // 不调用 withMetadata()，EXIF/GPS 会被丢弃
          .toFile(outAbs);
        const after = statSync(outAbs).size;
        bytesBefore += s.size; bytesAfter += after;
        next[s.rel] = {
          out: s.out, mode, mtimeMs: s.mtimeMs, size: s.size,
          width: info.width, height: info.height, outSize: after,
          shrink: savedLabel(s.size, after), from: formatKb(s.size), to: formatKb(after)
        };
        if (prev) updated++; else added++;
        log(`  ✓ ${s.rel}  →  ${s.out}`);
        log(`      ${formatKb(s.size)}  →  ${formatKb(after)}  (${savedLabel(s.size, after)})  ${prev ? '已更新' : '新增'}`);
      } else {
        // 没有 sharp：原图直接复制过去，不压缩（保证网站仍然能显示）
        copyFileSync(s.abs, outAbs);
        next[s.rel] = {
          out: s.out, mode, mtimeMs: s.mtimeMs, size: s.size,
          outSize: s.size, shrink: '未压缩', from: formatKb(s.size), to: formatKb(s.size)
        };
        if (prev) updated++; else added++;
        log(`  ✓ ${s.rel}  →  ${s.out}  （未压缩，原图复制）`);
      }
    } catch (e) {
      failed++;
      log(`  ✗ ${s.rel} 处理失败：${e.message}`);
      if (prev) next[s.rel] = prev;      // 失败就沿用上次的记录，不要丢图
    }
  }

  /* --- 第三步：清理已经从 img/ 删掉的图片 --- */
  let removed = 0;
  for (const rel of Object.keys(manifest.files)) {
    if (next[rel]) continue;
    const old = manifest.files[rel];
    if (old && old.out) {
      const p = diskPath(old.out);
      if (existsSync(p)) { try { unlinkSync(p); removed++; } catch (e) {} }
    }
  }

  /* --- 第四步：写回同步记录 --- */
  writeFileSync(manifestPath, JSON.stringify({ version: 1, updatedAt: Date.now(), files: next }, null, 2), 'utf8');

  /* --- 第五步：生成 src/data/photos.generated.js --- */
  const rows = sources
    .filter(s => next[s.rel])
    .map(s => ({ src: next[s.rel].out, rel: s.rel, album: albumOf(s.rel), date: dateOf(s.mtimeMs) }))
    .sort((a, b) => a.album.localeCompare(b.album, 'zh') || a.rel.localeCompare(b.rel, 'zh'));

  mkdirSync(dirname(dataPath), { recursive: true });
  writeFileSync(dataPath, buildPhotosJs(rows, mode), 'utf8');

  /* --- 汇总 --- */
  const summary = { total: sources.length, added, updated, skipped, removed, failed, mode, bytesBefore, bytesAfter };
  if (!quiet) {
    const parts = [];
    if (added) parts.push(`新增 ${added}`);
    if (updated) parts.push(`更新 ${updated}`);
    if (skipped) parts.push(`跳过 ${skipped}`);
    if (removed) parts.push(`清理 ${removed}`);
    if (failed) parts.push(`失败 ${failed}`);
    console.log('\n' + '-'.repeat(58));
    console.log(`img/ 共 ${sources.length} 张   ${parts.join('  ') || '无变化'}`);
    if (bytesBefore) {
      console.log(`体积 ${formatKb(bytesBefore)} → ${formatKb(bytesAfter)}（${savedLabel(bytesBefore, bytesAfter)}）`);
    }
    if (!sharp) {
      console.log('\n提示：没找到 sharp，本次未做压缩，网站直接引用 img/ 里的原图。');
      console.log('      想要自动压缩，可在本目录执行：npm i -D sharp');
    }
    console.log('已更新 src/data/photos.generated.js');
    console.log('-'.repeat(58) + '\n');
  }
  return summary;
}

/* ---------- 生成 src/data/photos.generated.js 的内容 ---------- */
function buildPhotosJs(rows, mode) {
  const q = v => JSON.stringify(v).replace(/<\//g, '<\\/');
  const L = [];
  L.push('/* =========================================================');
  L.push(' *  ⚠ 本文件由 tools/sync-photos.mjs 自动生成，手改会被覆盖！');
  L.push(' *');
  L.push(' *  想加图片 → 把图片丢进 img/ 文件夹（子文件夹名 = 相册名），然后运行 npm run sync');
  L.push(' *  想改标题 → 编辑 src/data/photo-meta.js（那个文件不会被覆盖）');
  L.push(' *  想改分类 → 把图片移到 img/ 下另一个子文件夹里');
  L.push(' *');
  L.push(' *  生成时间：' + new Date().toLocaleString('zh-CN'));
  L.push(mode === 'webp'
    ? ' *  压缩模式：已转 WebP，最长边 2000px'
    : ' *  压缩模式：未压缩（缺少 sharp），原图直接复制');
  L.push(` *  共 ${rows.length} 张`);
  L.push(' * ======================================================= */');
  L.push('export default [');
  for (const r of rows) {
    L.push('  {');
    L.push(`    src:   ${q(r.src)},`);
    L.push(`    file:  ${q(r.rel)},`);
    L.push(`    album: ${q(r.album)},`);
    L.push(`    date:  ${q(r.date)}`);
    L.push('  },');
  }
  L.push('];');
  L.push('');
  return L.join('\n');
}

/* ---------- 作为脚本直接运行时 ---------- */
const invokedDirectly = process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const opts = { force: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--force') opts.force = true;
    else if (argv[i] === '--quiet') opts.quiet = true;
    else if (argv[i] === '--max') opts.max = parseInt(argv[++i], 10);
    else if (argv[i] === '--quality') opts.quality = parseInt(argv[++i], 10);
  }
  console.log('\n扫描 img/ 文件夹…');
  syncPhotos(opts)
    // ⚠ 不管有几张图处理失败，都退出码 0：
    //   本脚本挂在 npm run dev / build 的 && 链上，退出码 1 会让
    //   后面的 astro build 直接不执行（部署构建失败就是这么来的）。
    //   失败的那几张会保留原图 / 跳过，网站照常能构建。
    .then(r => {
      if (r && r.failed) {
        console.warn(`\n! 有 ${r.failed} 张图片没处理成功（已跳过，不影响构建）：`);
        console.warn('  想单独看细节：node tools/sync-photos.mjs\n');
      }
      process.exit(0);
    })
    // 故意也用退出码 0：本脚本挂在 npm run dev / build 的 && 链里，
    // 退出非 0 会让后面的 astro 不执行（网站打不开）。失败只提示，不阻断。
    .catch(e => {
      console.error('\n! 图片同步出错（不影响网站启动，已跳过）：' + e.message);
      process.exit(0);
    });
}
