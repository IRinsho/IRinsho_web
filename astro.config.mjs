/* =========================================================
 *  Astro 配置
 *  ---------------------------------------------------------
 *  部署到腾讯云之后，建议把下面 site 改成你的实际域名。
 * ======================================================= */
import { defineConfig } from 'astro/config';
import { irinshoAutoSync } from './integrations/auto-sync.mjs';
import { irinshoHideAdmin } from './integrations/hide-admin.mjs';

export default defineConfig({
  // 你的网站地址（腾讯云 COS 的默认域名，或你自己的域名）
  // 填上之后，分享卡片、站点地图这类绝对链接才正确
  // 注意：src/data/config.js 里的 site 也要填成同一个
  site: 'https://irinsho.top',

  // 如果部署在子目录（例如 https://xxx.com/blog/），把 base 也一起打开
  // base: '/blog/',

  // 生成 /photos/index.html 这种目录结构，静态托管兼容性最好
  build: {
    format: 'directory'
  },

  /* 鼠标悬停链接就预取：
     SYNAPSE 的换页是整页跳转（绕开 View Transition），会把紫色面板盖在
     旧页上等新页下载。预取命中以后这一步基本是 0 延迟，
     那块面板不会再在慢网络下挂一两秒。 */
  prefetch: {
    // ⚠ 必须 true：false 时 Astro 只认带 data-astro-prefetch 的链接，
    // 顶栏那些 <a> 一个都不会预取（实测 hover 之后缓存里什么都没有）。
    prefetchAll: true,
    defaultStrategy: 'hover'
  },

  // 生成的静态文件目录，腾讯云部署就是把这个文件夹传上去
  outDir: './dist',

  // 开发服务器端口
  server: { port: 4321 },

  /* 自动同步：npm run dev 启动时自动同步图片 / 抖音封面 / 笔记，
     之后往 img/ 或 blog/ 丢文件也会自动再同步一次 */
  /* 构建完成后把 admin/ 从 dist/ 里删掉 —— 后台只在本机用，不随站点上线 */
  integrations: [irinshoAutoSync(), irinshoHideAdmin()]
});
