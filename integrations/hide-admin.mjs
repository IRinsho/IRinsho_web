/**
 * 构建收尾：把「只有本地用」的后台界面从产物里剔掉。
 *
 * 两个后台要分清楚：
 *   public/admin/        本地后台界面 —— 只在本机跑，**不上线**
 *   public/admin-cloud/  云端后台界面 —— 要部署上去，给手机用
 *
 * 所以这里只删 dist/admin/，绝不碰 dist/admin-cloud/。
 *
 * 另外补一个跳转页：dist/admin/index.html → /admin-cloud/
 *   （这样你记一个 /admin/ 的地址就够了，不用记带横杠的那个）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLOUD_DIR = 'admin-cloud';   // 云端后台的目录名（要发布）
const LOCAL_DIR = 'admin';         // 本地后台的目录名（不发布）

/** @type {import('astro').AstroIntegration} */
export const irinshoHideAdmin = () => ({
  name: 'irinsho-hide-admin',
  hooks: {
    'astro:build:done': ({ dir, logger }) => {
      // dist 输出目录（兼容 file:// URL 与普通路径）
      let outDir;
      if (dir && dir.pathname) {
        outDir = fileURLToPath(dir);
      } else {
        outDir = String(dir).replace(/^\/([A-Za-z]:)/, '$1');
      }

      const localAdmin = path.join(outDir, LOCAL_DIR);
      const cloudAdmin = path.join(outDir, CLOUD_DIR);

      // 1) 删掉本地后台界面
      try {
        if (fs.existsSync(localAdmin)) {
          fs.rmSync(localAdmin, { recursive: true, force: true });
          logger.info('已移除本地后台界面（admin/），它只在本机用');
        }
      } catch (err) {
        logger.warn('移除 dist/admin 失败（不影响站点）：' + (err && err.message));
      }

      // 2) 云端后台界面必须还在；不在就大声报出来
      if (!fs.existsSync(cloudAdmin)) {
        logger.warn(
          `⚠ 产物里没有 ${CLOUD_DIR}/ —— 云端后台会 404。` +
          '请确认 public/' + CLOUD_DIR + '/ 存在，并且没有被 .gitignore 忽略。'
        );
        return;
      }
      logger.info(`云端后台界面已就位：/${CLOUD_DIR}/`);

      // 3) 放一个跳转页，让 /admin/ 也能进后台
      try {
        fs.mkdirSync(localAdmin, { recursive: true });
        fs.writeFileSync(path.join(localAdmin, 'index.html'), `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="robots" content="noindex, nofollow">
  <meta http-equiv="refresh" content="0; url=/${CLOUD_DIR}/">
  <title>正在进入后台…</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;
      font:15px/1.6 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
      background:#0c0e1e;color:#a9aecb}
    a{color:#e0466f}
  </style>
</head>
<body>
  <p>正在进入后台… 如果没有自动跳转，<a href="/${CLOUD_DIR}/">点这里</a>。</p>
</body>
</html>
`, 'utf8');
        logger.info(`/admin/ 已设为跳转到 /${CLOUD_DIR}/`);
      } catch (err) {
        logger.warn('写跳转页失败（不影响 /' + CLOUD_DIR + '/ 访问）：' + (err && err.message));
      }
    }
  }
});
