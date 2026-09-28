/* =========================================================
 *  手动补封面（自动抓取被抖音挡住时的兜底）
 *  ---------------------------------------------------------
 *  用法：
 *     npm run cover            （在当前项目目录里跑）
 *
 *  它会问你两个问题：
 *     1. 哪条视频？（按标题里的一段字匹配，直接回车 = 第一条没封面的）
 *     2. 封面图的地址？（或者本机图片文件的路径）
 *
 *  然后它会：
 *     · 把图片下载 / 复制到 public/media/covers/
 *     · 写进 src/data/videos.js 的 poster 字段（保留注释和格式）
 *
 *  图片地址怎么拿（10 秒）：
 *     浏览器打开抖音视频页 → F12 → Network → 找一张 douyinpic.com 的图
 *     → 右键 Copy image address → 粘过来
 *  也可以直接给本机文件路径，例如：
 *     C:\Users\123\Pictures\封面.jpg
 * ======================================================= */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { patchVideos } from './patch-videos.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COVER_DIR_REL = 'public/media/covers';
const COVER_URL_PREFIX = 'media/covers';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function safeName(s, fallback = 'cover') {
  const cleaned = String(s || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '-')
    .replace(/^[.\s-]+|[.\s-]+$/g, '');
  return (cleaned || fallback).slice(0, 60);
}

/** 读取 videos.js（只读，用于找记录） */
async function loadVideos() {
  const file = join(ROOT, 'src', 'data', 'videos.js');
  const mod = await import(pathToFileURL(file).href + '?t=' + Date.now());
  return Array.isArray(mod.default) ? mod.default : [];
}

async function saveImage(source, baseName) {
  const coverDir = join(ROOT, COVER_DIR_REL);
  mkdirSync(coverDir, { recursive: true });

  const isUrl = /^https?:\/\//i.test(source);

  if (!isUrl) {
    // 本机文件
    if (!existsSync(source)) throw new Error('找不到这个文件：' + source);
    const ext = (extname(source) || '.jpg').toLowerCase();
    const dest = join(coverDir, safeName(baseName) + ext);
    copyFileSync(source, dest);
    const size = readFileSync(dest).length;
    return { rel: COVER_URL_PREFIX + '/' + dest.split(/[\\/]/).pop(), size };
  }

  const res = await fetch(source, {
    headers: { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' }
  });
  if (!res.ok) throw new Error('下载失败，HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error('文件太小（' + buf.length + ' 字节），可能不是图片');

  const type = String(res.headers.get('content-type') || '');
  const ext = /png/i.test(type) ? '.png'
    : /webp/i.test(type) ? '.webp'
    : /gif/i.test(type) ? '.gif'
    : '.jpg';

  const dest = join(coverDir, safeName(baseName) + ext);
  writeFileSync(dest, buf);
  return { rel: COVER_URL_PREFIX + '/' + dest.split(/[\\/]/).pop(), size: buf.length };
}

/* ---------- 主流程 ---------- */
const rl = createInterface({ input: stdin, output: stdout });

try {
  console.log('\n手动补封面\n' + '-'.repeat(46));

  const videos = await loadVideos();
  const external = videos
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => v.douyin || v.embed);

  if (!external.length) {
    console.log('videos.js 里没有填 douyin / embed 的视频。');
    process.exit(0);
  }

  console.log('现有的外链视频：');
  for (const { v, i } of external) {
    const has = v.poster ? '  （已有封面：' + v.poster + '）' : '';
    console.log(`  [${i}] ${v.title || '(无标题)'}${has}`);
  }

  const pick = (await rl.question('\n哪一条？（输入上面的编号，直接回车 = 第一条没封面的）> ')).trim();

  let target = null;
  if (pick === '') {
    target = external.find(({ v }) => !v.poster) || external[0];
  } else if (/^\d+$/.test(pick)) {
    target = external.find(({ i }) => String(i) === pick) || null;
  } else {
    // 按标题模糊匹配
    target = external.find(({ v }) => String(v.title || '').includes(pick)) || null;
  }

  if (!target) {
    console.log('没找到匹配的视频，退出。');
    process.exit(1);
  }

  console.log(`\n选中的是：${target.v.title || '(无标题)'}`);
  console.log(`链接：${target.v.douyin || target.v.embed}`);

  const source = (await rl.question('\n封面图片地址（或本机图片路径）> ')).trim();
  if (!source) {
    console.log('没有输入，退出。');
    process.exit(1);
  }

  const baseName = target.v.title || ('cover-' + target.i);
  console.log('\n正在保存封面…');
  const saved = await saveImage(source, baseName);
  console.log(`  ✓ ${saved.rel}  (${(saved.size / 1024).toFixed(0)} KB)`);

  // 写进 videos.js 的 poster 字段（保留注释 / 格式）
  const key = String(target.v.douyin || target.v.embed).trim();
  const res = patchVideos({
    root: ROOT,
    entries: [{ index: target.i, title: target.v.title || '', match: [key], fields: { poster: saved.rel } }]
  });

  const changed = (res.changed || [])[0];
  if (changed) {
    console.log(`  ✓ 已写进 src/data/videos.js：poster: '${saved.rel}'`);
  } else {
    // 可能原来就有 poster（非空）→ patchVideos 不会覆盖，这里提示手工改
    console.log('  ! videos.js 里这条已经有 poster 了，没有覆盖。');
    console.log(`    想换成新的封面，把 poster 那行手动改成：'${saved.rel}'`);
  }

  console.log('\n完成。浏览器里按 Ctrl+F5 刷新即可看到。\n');
} catch (e) {
  console.error('\n失败：' + e.message + '\n');
  process.exitCode = 1;
} finally {
  rl.close();
}
