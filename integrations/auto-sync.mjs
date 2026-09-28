/* =========================================================
 *  自动同步（Astro 集成）
 *  ---------------------------------------------------------
 *  挂上之后，开发服务器一启动就会自己跑：
 *
 *    1. 启动时自动同步一次：img/ 图片、抖音封面、blog/ 笔记
 *    2. 之后你往 img/ 或 blog/ 里丢文件、改文件，它会自动再同步
 *       （抖音封面只在「有视频还没抓到封面」时才会去请求网络）
 *
 *  也就是说：正常情况下你不需要再手动敲 npm run sync。
 *  直接双击「启动网站.cmd」，剩下的它自己会做。
 *
 *  注意：这个集成只在 npm run dev 时生效（astro.config.mjs 里用 command === 'dev' 判断），
 *  构建时由 npm run build 里的 npm run sync 负责，不会重复跑。
 * ======================================================= */
import { watch, existsSync, statSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SILENT = { quiet: true };

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 列一层目录（带类型） */
function readDir(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true }).map((d) => ({
      name: d.name,
      isDir: d.isDirectory(),
      full: join(dir, d.name)
    }));
  } catch (e) {
    return [];
  }
}

/** 递归记录目录下所有文件的「路径 + 修改时间 + 大小」，作为变更指纹 */
function snapshot(dir, map = new Map()) {
  if (!existsSync(dir)) return map;
  for (const { name, isDir, full } of readDir(dir)) {
    if (name.startsWith('.')) continue;
    if (isDir) snapshot(full, map);
    else {
      try {
        const st = statSync(full);
        map.set(full, st.mtimeMs + ':' + st.size);
      } catch (e) { /* 文件刚好被删了，忽略 */ }
    }
  }
  return map;
}

/** 判断两个指纹有没有差异 */
function diff(a, b) {
  if (a.size !== b.size) return true;
  for (const [k, v] of a) if (b.get(k) !== v) return true;
  return false;
}

export function irinshoAutoSync() {
  return {
    name: 'irinsho-auto-sync',
    hooks: {
      'astro:config:setup': ({ command, config }) => {
        if (command !== 'dev') return;

        const root = resolve(fileURLToPath(config.root));
        let running = false;
        let queued = false;

        async function syncAll(why) {
          if (running) { queued = true; return; }
          running = true;
          const t0 = Date.now();
          console.log(`\n[自动同步] ${why} …`);

          // 图片（img/ → public/media/images/）
          try {
            const mod = await import(
              pathToFileURL(join(root, 'tools', 'sync-photos.mjs')).href + '?t=' + Date.now()
            );
            await mod.syncPhotos(SILENT);
          } catch (e) {
            console.log('  ! 图片同步失败：' + e.message);
          }

          // 本地视频截帧（只处理没填 poster 的本地视频；没装 ffmpeg 会自己跳过）
          try {
            const mod = await import(
              pathToFileURL(join(root, 'tools', 'sync-frames.mjs')).href + '?t=' + Date.now()
            );
            const r = await mod.syncFrames(SILENT);
            if (r && r.got) console.log(`  本地视频截帧：新截 ${r.got} 张封面`);
            if (r && r.hasFfmpeg === false) {
              console.log('  （没装 ffmpeg，本地视频没自动截封面；外链视频可跑 npm run cover）');
            }
          } catch (e) {
            console.log('  ! 本地视频截帧失败：' + e.message);
          }

          // 外链封面 + 标题 / 日期 / 时长
          // （B站 / YouTube 走公开接口；抖音走无头浏览器精确截图）
          // 这一步慢（抖音一条 10~20 秒），所以特意放在后台，不挡启动。
          try {
            console.log('  抓取视频封面 / 信息（B站 / YouTube / 抖音，可能要几十秒）…');
            const mod = await import(
              pathToFileURL(join(root, 'tools', 'sync-covers.mjs')).href + '?t=' + Date.now()
            );
            const r = await mod.syncCovers(SILENT);
            if (r && (r.got || r.failed)) {
              console.log(`  封面：新抓 ${r.got} 条，失败 ${r.failed} 条`);
              if (r.failed && !r.got) {
                console.log('  外链封面抓不到时：在项目目录跑 npm run cover 补一张');
              }
            }
          } catch (e) {
            console.log('  ! 封面同步失败：' + e.message);
          }

          // 笔记（blog/ → src/data/notes.generated.js）
          try {
            const mod = await import(
              pathToFileURL(join(root, 'tools', 'build-blog.mjs')).href + '?t=' + Date.now()
            );
            if (typeof mod.buildBlog === 'function') await mod.buildBlog(SILENT);
            else if (typeof mod.buildNotes === 'function') await mod.buildNotes(SILENT);
          } catch (e) {
            // build-blog.mjs 可能是「直接运行」式脚本，没有导出函数 —— 那就跳过，
            // 由 npm run dev 前面的 npm run sync 负责
          }

          running = false;
          const sec = ((Date.now() - t0) / 1000).toFixed(1);
          console.log(`[自动同步] 完成（${sec}s）`);
          console.log('  提示：浏览器里按 Ctrl+F5 刷新，才能看到新同步出来的图片 / 封面。\n');

          if (queued) { queued = false; syncAll('检测到新的改动'); }
        }

        // 启动后 400ms 跑第一次（错开 Astro 自己的启动输出）
        setTimeout(() => syncAll(`启动时自动同步 ${stamp()}`), 400);

        // 监听 img/ 和 blog/ 的变化
        const watched = [
          { dir: join(root, 'img'), label: 'img/' },
          { dir: join(root, 'blog'), label: 'blog/' }
        ];

        for (const w of watched) {
          if (!existsSync(w.dir)) continue;

          let snap = snapshot(w.dir);
          let timer = null;

          try {
            watch(w.dir, { recursive: true }, () => {
              // 防抖：编辑器保存常常触发多次事件
              clearTimeout(timer);
              timer = setTimeout(() => {
                const next = snapshot(w.dir);
                if (!diff(snap, next)) return;
                snap = next;
                syncAll(`${w.label} 有变化，自动同步`);
              }, 600);
            });
          } catch (e) {
            console.log(`  （${w.label} 无法监听系统事件，改用 5 秒轮询）`);
          }

          // 兜底轮询：有些平台支持不了 recursive watch
          setInterval(() => {
            const next = snapshot(w.dir);
            if (!diff(snap, next)) return;
            snap = next;
            syncAll(`${w.label} 有变化，自动同步`);
          }, 5000);
        }
      }
    }
  };
}
