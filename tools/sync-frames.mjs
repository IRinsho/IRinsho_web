/* =========================================================
 *  本地视频截帧（生成封面）
 *  ---------------------------------------------------------
 *  职责：给 videos.js 里用 src 指向本地文件的视频，
 *        用 ffmpeg 截一帧存成封面，并写进 poster 字段。
 *
 *  用法： npm run sync:frames     （npm run sync 会自动带上）
 *
 *  为什么只处理本地视频：
 *    抖音 / B站 / YouTube 的视频文件不在本地，也拿不到直链
 *    （抖音的详情接口要浏览器签名，实测 403），所以截不了帧。
 *    外链视频请用 npm run cover 手动配封面，或者写 live: true
 *    让卡片直接显示播放器画面。
 *
 *  依赖：需要系统里有 ffmpeg。没有就跳过，并打印一行提示
 *        （不会报错中断，也不会影响其它同步）。
 * ======================================================= */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { patchVideos } from './patch-videos.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const COVER_DIR_REL = 'public/media/covers';
const COVER_URL_PREFIX = 'media/covers';
const CACHE = '.frame-sync.json';

/** 截第几秒。太靠前常常是黑场/开场动画，1.5 秒比较稳 */
const DEFAULT_AT = 1.5;

function safeName(s, fallback = 'frame') {
  const cleaned = String(s || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '-')
    .replace(/^[.\s-]+|[.\s-]+$/g, '');
  return (cleaned || fallback).slice(0, 60);
}

/** 系统里有没有 ffmpeg（有返回值就是版本号） */
function ffmpegVersion() {
  try {
    const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
    if (r.status !== 0) return '';
    return String(r.stdout || '').split('\n')[0].trim();
  } catch (e) {
    return '';
  }
}

/**
 * 用 ffprobe 读视频信息（时长 / 画面尺寸）。
 * ffprobe 跟 ffmpeg 一起装，一般同在 PATH 里。
 */
function probeVideo(srcAbs) {
  try {
    const r = spawnSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height:format=duration',
      '-of', 'json',
      srcAbs
    ], { encoding: 'utf8' });
    if (r.status !== 0) return null;
    const info = JSON.parse(r.stdout || '{}');
    const st = (info.streams && info.streams[0]) || {};
    const dur = Number((info.format && info.format.duration) || 0);
    return {
      width: Number(st.width) || 0,
      height: Number(st.height) || 0,
      seconds: isFinite(dur) && dur > 0 ? dur : 0
    };
  } catch (e) {
    return null;
  }
}

/** 秒 → 00:26 / 01:02:03 */
function fmtDuration(sec) {
  const n = Math.round(Number(sec) || 0);
  if (n <= 0) return '';
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  const p = (x) => String(x).padStart(2, '0');
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

/** 用 ffmpeg 截一帧 */
function grabFrame(srcAbs, destAbs, atSec) {
  const args = [
    '-y',                       // 覆盖已有文件
    '-ss', String(atSec),       // 定位到第几秒
    '-i', srcAbs,
    '-frames:v', '1',           // 只要一帧
    '-q:v', '3',                // jpg 质量
    destAbs
  ];
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (r.status !== 0) {
    // -ss 放在 -i 前面有时会截不到（极短的视频），退一步放到后面再试
    const r2 = spawnSync('ffmpeg', ['-y', '-i', srcAbs, '-frames:v', '1', '-q:v', '3', destAbs], { encoding: 'utf8' });
    if (r2.status !== 0) {
      const msg = String((r2.stderr || r.stderr || '')).split('\n').filter(Boolean).slice(-2).join(' ');
      throw new Error(msg || 'ffmpeg 执行失败');
    }
  }
  if (!existsSync(destAbs)) throw new Error('ffmpeg 没有生成文件');
  return statSync(destAbs).size;
}

async function loadVideos(root) {
  const file = join(root, 'src', 'data', 'videos.js');
  if (!existsSync(file)) return [];
  try {
    const mod = await import(pathToFileURL(file).href + '?t=' + Date.now());
    return Array.isArray(mod.default) ? mod.default : [];
  } catch (e) {
    console.log('  ! 读取 src/data/videos.js 失败，跳过截帧：' + e.message);
    return [];
  }
}

/* ---------- 主流程 ---------- */
export async function syncFrames(options = {}) {
  const root = options.root || ROOT;
  const quiet = !!options.quiet;
  const force = !!options.force;
  const say = quiet ? () => {} : (...a) => console.log(...a);

  // 部署构建：云端一般没装 ffmpeg，也没必要重截（封面已提交进仓库）
  if (process.env.IRINSHO_FETCH !== '1' &&
      (process.platform !== 'win32' || process.env.CI || process.env.EDGEONE ||
       process.env.VERCEL || process.env.NETLIFY || process.env.GITHUB_ACTIONS)) {
    const hasFf = !!ffmpegVersion();
    if (!hasFf) {
      if (!quiet) {
        console.log('\n本地视频截帧：');
        console.log('  · 检测到部署环境且没有 ffmpeg，跳过（用仓库里已截好的封面）。');
      }
      return { total: 0, got: 0, skipped: 0, failed: 0, hasFfmpeg: false, skippedByEnv: true };
    }
  }

  const videos = await loadVideos(root);

  // 只处理本地视频（有 src）。封面、时长、日期、比例都尽量自动补齐，
  // 但**只填空字段**，你写过的值一律不动。
  const targets = videos
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => v.src && v.cover !== false);

  if (!targets.length) return { total: 0, got: 0, skipped: 0, failed: 0, hasFfmpeg: true };

  const version = ffmpegVersion();
  if (!version) {
    if (!quiet) {
      console.log('\n本地视频自动补信息：');
      console.log('  ! 没找到 ffmpeg / ffprobe，跳过（不影响其它同步）。');
      console.log('    装上之后可以自动做三件事：截封面、读时长、读画面比例。');
      console.log('      winget install Gyan.FFmpeg        （或到 ffmpeg.org 下 Windows 版）');
      console.log('    不装也行：在 videos.js 里给这条填 poster / duration / ratio。');
    }
    return { total: targets.length, got: 0, skipped: 0, failed: 0, hasFfmpeg: false };
  }

  const coverDir = join(root, COVER_DIR_REL);
  mkdirSync(coverDir, { recursive: true });

  const cachePath = join(root, CACHE);
  let cache = {};
  if (existsSync(cachePath)) {
    try { cache = JSON.parse(readFileSync(cachePath, 'utf8')) || {}; } catch (e) { cache = {}; }
  }

  say('\n本地视频截帧…');
  const patchEntries = [];
  let got = 0, skipped = 0, failed = 0;

  for (const { v, i } of targets) {
    const label = v.title || ('第 ' + (i + 1) + ' 条');
    const srcRel = String(v.src).replace(/\\/g, '/').replace(/^(\.?\/)+/, '');
    const srcAbs = join(root, 'public', srcRel);

    if (!existsSync(srcAbs)) {
      failed++;
      say(`  ✗ ${label}  找不到视频文件：public/${srcRel}`);
      continue;
    }

    const st = statSync(srcAbs);
    const mtime = st.mtimeMs;
    const at = Number(v.frameAt) > 0 ? Number(v.frameAt) : DEFAULT_AT;
    const prev = cache[srcRel];

    // 封面这块：已经截过、视频没改过、图还在 → 不用重截
    const coverReady = !v.poster && prev && prev.file && prev.mtime === mtime &&
      existsSync(join(root, 'public', prev.file));

    // 需要补哪些字段（只填空的，你写过的绝不动）
    const fields = {};
    if (v.poster) fields.poster = '';                     // 已有封面 → 不碰
    else if (prev && prev.file && existsSync(join(root, 'public', prev.file))) fields.poster = prev.file;

    // 用 ffprobe 读时长 / 画面尺寸（读不到就跳过，不影响其它字段）
    const probe = probeVideo(srcAbs);
    if (probe) {
      if (!v.duration && probe.seconds) fields.duration = fmtDuration(probe.seconds);
      if (!v.ratio && probe.width && probe.height) fields.ratio = `${probe.width}:${probe.height}`;
    }

    // 日期：没有就用视频文件的修改时间（你随时可以手改覆盖）
    if (!v.date) {
      const d = new Date(st.mtimeMs);
      const p = (x) => String(x).padStart(2, '0');
      fields.date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }

    // 封面：需要截就截
    if (!v.poster && !coverReady) {
      const name = safeName(v.title || srcRel.replace(extname(srcRel), ''));
      const destAbs = join(coverDir, name + '.jpg');
      say(`  → ${label}  正在截第 ${at} 秒…`);
      try {
        const bytes = grabFrame(srcAbs, destAbs, at);
        const rel = COVER_URL_PREFIX + '/' + destAbs.split(/[\\/]/).pop();
        cache[srcRel] = { file: rel, mtime, at, bytes };
        fields.poster = rel;
        got++;
        say(`    ✓ 封面 ${rel}  (${(bytes / 1024).toFixed(0)} KB)`);
        if (fields.duration) say(`      时长：${fields.duration}`);
        if (fields.ratio) say(`      比例：${fields.ratio}`);
        if (fields.date) say(`      日期：${fields.date}（取自文件修改时间）`);
      } catch (e) {
        failed++;
        say(`    ✗ 截帧失败：${e.message}`);
      }
    } else {
      skipped++;
      const extra = [fields.duration && '时长', fields.ratio && '比例', fields.date && '日期']
        .filter(Boolean).join('、');
      if (extra) say(`  · ${label}  封面已有，补 ${extra}`);
    }

    const real = Object.entries(fields).filter(([, val]) => val);
    if (real.length) {
      patchEntries.push({
        index: i,
        title: label,
        match: [String(v.src)],
        fields: Object.fromEntries(real)
      });
    }
  }

  writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');

  // 把截到的封面写回 videos.js（只填空字段）
  if (patchEntries.length) {
    try {
      const res = patchVideos({ root, entries: patchEntries });
      const changed = res.changed || [];
      if (!quiet && changed.length) {
        console.log('\n已把截好的封面写进 src/data/videos.js：');
        for (const c of changed) console.log(`  · ${c.title}  →  ${c.fields.join('、')}`);
      }
    } catch (e) {
      say('  ! 回填 videos.js 失败（不影响页面显示）：' + e.message);
    }
  }

  if (!quiet) {
    console.log(`  截帧：新截 ${got}   跳过 ${skipped}   失败 ${failed}`);
    if (failed) console.log('  提示：截不到的话可以在 videos.js 里给这条写 frameAt: 3（换个时间点）或直接填 poster。');
  }

  return { total: targets.length, got, skipped, failed, hasFfmpeg: true };
}

/* ---------- 直接运行时 ---------- */
const invokedDirectly = process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  const argv = process.argv.slice(2);
  syncFrames({ force: argv.includes('--force'), quiet: argv.includes('--quiet') })
    .then(() => process.exit(0))
    // 故意也用退出码 0：本脚本挂在 npm run dev / build 的 && 链里，
    // 退出非 0 会让后面的 astro 不执行（网站打不开）。失败只提示，不阻断。
    .catch((e) => {
      console.error('\n! 本地视频截帧出错（不影响网站启动，已跳过）：' + e.message);
      process.exit(0);
    });
}
