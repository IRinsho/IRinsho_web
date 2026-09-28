/* =========================================================
 *  友链数据（Friend Links）
 *  ---------------------------------------------------------
 *  加一条友链 = 复制一个 { ... } 块，改里面的字段即可。
 *
 *  字段说明：
 *    name    站名（必填）
 *    url     网址（必填，要带 https://）
 *    desc    一句话介绍
 *    avatar  头像 / 站点图标（可留空，留空会生成一张配色底图）
 *            可以填：'media/images/xxx.png'（放 public 里的本地图）
 *                    或完整的 https:// 图片地址
 *    tags    标签数组，例如 ['个人博客', '动漫']
 *    since   认识的时间，例如 '2024-03'
 *    featured  true 会排在前面并带一个星标
 *
 *  排序：featured 优先，其余按数组顺序。
 * ======================================================= */
export default [
  {
    name: 'Yuimi Chaya',
    url: 'https://yuimi-chaya.github.io/',
    desc: '本站视觉与动效的参考来源，Kisara 主题作者。',
    avatar: '',
    tags: ['主题作者', '动画'],
    since: '2026-09',
    featured: true
  },

  /* 下面是两条示例，删掉换成你真正的友链就行
  {
    name: '朋友的小站',
    url: 'https://example.com/',
    desc: '一句话介绍这个小站在写什么。',
    avatar: 'media/images/friend1.png',
    tags: ['个人博客'],
    since: '2026-01'
  },
  */

  {
    name: '交换友链',
    url: '',
    desc: '想和我交换友链的话，按下面「我的信息」把本站加进你的友链页，然后来 ME 页面留言就好。',
    avatar: '',
    tags: ['开放'],
    since: '',
    open: true          // open: true 表示这不是一条真友链，而是"招募位"
  }
];
