/* =========================================================
 *  站点信息 —— 改这里就能改成你自己的站点
 *  这是一个 ES 模块，内容包在 export default { ... } 里
 *  改完保存，运行中的 npm run dev 会自动热更新
 * ======================================================= */
export default {

  /* ---------- 站点网址（SEO / 分享 / 站点地图） ---------- */
  // 填成你正式上线的域名，例如 'https://irinsho.example.com'。
  // 填了之后：canonical、Open Graph 分享卡片、sitemap.xml 的绝对地址才正确；
  // 不填网站也能正常打开，只是分享出去的链接和预览图可能是相对地址（微信 / QQ 抓不到图）。
  site: 'https://irinsho.top',

  /* ---------- 默认分享图（Open Graph / Twitter 卡片） ---------- */
  // 分享到微信 / QQ / Twitter 时显示的预览图。建议 1200×630 或 1920×1080 的横图。
  ogImage: 'media/images/home-hero.jpg',

  /* ---------- 署名 ---------- */
  author: 'IRinsho',

  /* ---------- 品牌（左上角） ---------- */
  name: 'IRinsho',
  nameAccent: 'I',             // 品牌名的一部分染玫红（现在染第一个字母 I）；想整体恢复单色就改成 ''

  /* ---------- 首页抬头 ---------- */
  homeTitle: 'IRinsho',
  homeMotto: '把想法写下来，把喜欢的留下来。',

  /* ---------- 首页底部的章节条 ---------- */
  chapters: [
    { no: '001', label: '站点档案', href: '/' },
    { no: '002', label: '相册库存', href: '/photos/' },
    { no: '003', label: '笔记残片', href: '/notes/' },
    { no: '004', label: '影像信号', href: '/videos/' }
  ],

  /* ---------- 头像 ---------- */
  // 顶栏右上角的圆形头像 + 首页 ME 那一格的底图
  // 原来写的是 media/avatar.webp，但 public/media/ 里没有这个文件，
  // 所以顶栏右上角一直是个空的圆圈。这里先指向一张确实存在的图。
  avatar: 'media/images/119178066_p0.webp',

  /* ---------- 个人页（ME） ---------- */
  me: {
    no: '00',
    label: 'PERSONAL SIGNAL / ME',
    photo: 'media/images/119178066_p1.webp',   // 个人页左侧大图
    decor: '留档',                              // 压在大图上的竖排大字
    decorSub: 'a personal archive',
    quote: '先把喜欢的东西留下来，\n它们自己会慢慢长成一份档案。',
    bio: '这里放我随手拍的图、剪的片子，还有一路学习留下的笔记。' +
         '不追热点，只做一个能长期用下去的地方。',
    links: [
      { label: 'GITHUB', url: 'https://github.com/IRinsho' },
      { label: 'BILIBILI', url: 'https://space.bilibili.com/' }
    ],
    // 友链入口。url 可以填两种：
    //   站内页 → 直接写相对路径，例如 'links/'（会跳到本站 /links/ 友链页）
    //   外部页 → 写完整地址，例如 'https://example.com/links'（新窗口打开）
    friend: { label: 'FRIEND LINKS / OPEN ROUTE', text: '进入友链', url: 'links/' },

    /* 右侧竖排导航：真实链接，view 用来判断哪一项高亮 */
    sidenav: [
      { label: 'HOME', href: '/', view: 'home' },
      { label: 'GALLERY', href: '/photos/', view: 'photos' },
      { label: 'VIDEO', href: '/videos/', view: 'videos' },
      { label: 'BLOG', href: '/notes/', view: 'notes' },
      { label: 'ME', href: '/me/', view: 'me' }
    ],

    footLeft: 'PERSONAL ARCHIVE',
    footRight: 'IMAGE / VIDEO / NOTES'
  },

  /* ---------- 页脚 ---------- */
  footer: '© 2026 IRinsho'
};
