/* =========================================================
 *  站点信息 —— 改这里就能改成你自己的站点
 *  这是一个 ES 模块，内容包在 export default { ... } 里
 *  改完保存，运行中的 npm run dev 会自动热更新
 * ======================================================= */
export default {

  /* ---------- 署名 ---------- */
  author: 'IRinsho',

  /* ---------- 品牌（左上角） ---------- */
  name: 'IRinsho',
  nameAccent: '',              // 想让品牌名的一部分显示成玫红色，就把那部分填进来（例如 'LAB'），不用就留空

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
  avatar: 'media/avatar.webp',

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
      { label: 'GITHUB', url: 'https://github.com/' },
      { label: 'BILIBILI', url: 'https://space.bilibili.com/' }
    ],
    friend: { label: 'FRIEND LINKS / OPEN ROUTE', text: '进入友链', url: '#' },

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
  footer: '© {year} IRinsho'
};
