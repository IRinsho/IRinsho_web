/**
 * 把后台界面从构建产物里剔掉。
 *
 * 为什么需要：
 *   后台界面放在 public/admin/ 下（开发时由本地服务直接读这个目录），
 *   而 public/ 里的东西会被原样复制进 dist/。
 *   于是 dist/admin/ 会跟着一起上传，线上就多出一个登录页——
 *   虽然它连不上任何接口（接口只在本地服务里），但没必要让人看见。
 *
 * 做法：构建完成后删掉 dist/admin/，并打印一行说明。
 * 本地 `npm run admin` 完全不受影响（它读的是 public/admin/，不是 dist/）。
 */
import fs from 'node:fs';
import path from 'node:path';

/** @type {import('astro').AstroIntegration} */
export const irinshoHideAdmin = () => ({
  name: 'irinsho-hide-admin',
  hooks: {
    'astro:build:done': ({ dir, logger }) => {
      // dist 的输出目录（file:// URL 或路径都兼容）
      const outDir = dir && dir.pathname ? decodeURIComponent(dir.pathname) : String(dir);
      const target = path.join(outDir.replace(/^\/([A-Za-z]:)/, '$1'), 'admin');

      try {
        if (fs.existsSync(target)) {
          fs.rmSync(target, { recursive: true, force: true });
          logger.info('已从构建产物里移除 admin/（后台只在本机用，不随站点上线）');
        }
      } catch (err) {
        logger.warn('移除 dist/admin 失败（不影响站点）：' + (err && err.message));
      }
    }
  }
});
