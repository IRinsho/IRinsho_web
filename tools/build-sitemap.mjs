/* =========================================================
 *  站点地图 + robots.txt 生成器（静态站 SEO，零依赖）
 *  ---------------------------------------------------------
 *  · 读取 src/data/config.js 的 site 和 src/data/notes.generated.js
 *  · site 填了 → 生成 public/sitemap.xml（静态路由 + 每篇笔记详情页）
 *  · public/robots.txt 始终生成（site 填了会附上 Sitemap 行）
 *  · 出错只打印提示、退出码 0 —— 和 sync-frames / sync-covers / build-blog
 *    一致，绝不拦住后面的 astro dev / astro build。
 *  · 挂在 package.json 的 sync 链末尾：build-blog 之后运行，笔记数据最新。
 * ======================================================= */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const escapeXml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

async function main() {
  try {
    const config = (await import('../src/data/config.js')).default;
    const site = String(config.site || '').trim().replace(/\/+$/, '');

    // robots.txt：无论有没有 site 都写一份
    const robots = site
      ? `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`
      : `User-agent: *\nAllow: /\n`;
    mkdirSync(join(root, 'public'), { recursive: true });
    writeFileSync(join(root, 'public', 'robots.txt'), robots, 'utf8');

    if (!site) {
      console.log('[sitemap] 未配置 config.site，跳过 sitemap.xml（robots.txt 已写基础版）');
      return;
    }

    const staticPaths = ['/', '/photos/', '/videos/', '/notes/', '/me/', '/links/'];
    const notes = (await import('../src/data/notes.generated.js')).default || [];
    const notePaths = notes.map((n) => `/notes/${encodeURI(n.id)}/`);

    const urls = staticPaths.concat(notePaths).sort();
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls.map((u) => `  <url><loc>${escapeXml(site + u)}</loc></url>`),
      '</urlset>',
      ''
    ].join('\n');

    writeFileSync(join(root, 'public', 'sitemap.xml'), xml, 'utf8');
    console.log(`[sitemap] 已生成 public/sitemap.xml（${urls.length} 个地址）`);
  } catch (e) {
    console.warn('[sitemap] 生成失败（已跳过，不影响构建）:', e && e.message ? e.message : e);
  }
}

main();
