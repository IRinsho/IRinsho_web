/* =========================================================
 *  视频数据
 *  ---------------------------------------------------------
 *  三种填法，任选其一（有 douyin / embed 时优先用它们）：
 *
 *   1) 本地视频
 *        src:    'media/videos/xxx.mp4'
 *        把文件放进 public/media/videos/
 *
 *   2) 抖音（推荐直接粘链接，会自动转成播放器地址）
 *        douyin: 'https://www.douyin.com/video/7301234567890123456'
 *        也可以只写那串数字：douyin: '7301234567890123456'
 *        短链（v.douyin.com/xxxx）会自动识别成抖音，但播放器需要完整
 *        分享链接里的数字 id；短链的情况页面会给一个「去抖音看」的按钮。
 *
 *   3) 其它外链嵌入（B 站 / YouTube 的分享链接都可以直接粘）
 *        embed:  'https://www.bilibili.com/video/BV1xx411c7mD'
 *        也支持直接写播放器地址：
 *        embed:  'https://player.bilibili.com/player.html?bvid=BV1xx411c7mD'
 *
 *  其它字段：
 *    title / desc / category / tags / date
 *    poster     封面图路径（相对 public/），建议 16:9
 *    coverUrl   外链封面图地址（粘进来，同步时自动下载到本地）
 *    ratio      画面比例，例如 '3:4' / '16:9' / '9:16'
 *               · 本地视频不用填：播放器读完元数据会自动算
 *               · B站会由接口自动写入
 *               · 抖音跨域读不到，需要手填（比如横屏填 '16:9'，竖屏填 '9:16'）
 *    link       原站链接
 *    duration   时长文字，例如 '12:30'（只是显示用）
 *
 *  播放方式（**默认就在页面内播放**，点一下才加载播放器）：
 *    （都不写）        → 弹窗里先显示封面/生成底图 + 「▶ 播放」，点了在页面内播；
 *                        下面一直有「去抖音看 ↗」的备用出口
 *    playInline: false → 不给播放器，只给「去抖音观看」按钮
 *    live: true        → 卡片里直接嵌播放器（最不推荐，抖音播放器塞进卡片很难看）
 *
 *  ⚠ 路径一定用正斜杠 /，不要用 Windows 的反斜杠 \
 * ======================================================= */
export default [
  {
    title: 're0',
    desc: 're0',
    category: '动漫',
    tags: ['动漫'],
    date: '2025-06-01',
    src: 'media/videos/re0.webm',
    poster: 'media/covers/re0.svg',
    duration: '00:26'
  },
  {
    title: '奇蛋物语',
    desc: '奇蛋物语',
    category: '动漫',
    tags: ['动漫'],
    date: '2024-02-23',
    // ⚠ 这里的 jFlBIKzLFO8 是「字母数字短码」，不是抖音的数字视频 id，
    //    官方播放器不认它，多半播不出来。
    //    换成 www.douyin.com/video/ 后面那串纯数字（或直接填数字）就能播。
    douyin: 'https://www.douyin.com/video/7338819585061178662',
    poster: 'media/covers/douyin-7338819585061178662.jpg',
    duration: '00:12',
    ratio: '576:576',
    stream: 'https://v11-weba.douyinvod.com/3374f23734eeb4a8969418dcf4f3ed56/6aba764e/video/tos/cn/tos-cn-ve-0015c800/okFdgbA3nA2l8IeAKxDcL7Q32BDI9g4g5U9fmA/?a=6383&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=1724&bt=1724&cs=0&ds=3&ft=3.0nz3OOVYpVAWq9DUxLhdpEekt0E.s3-EDOm4~xKAoBBR4~fnZaaUy~vjTQ&mime_type=video_mp4&qs=0&rc=NWc6aWg7OmVlNmY7NGlmPEBpMzN3cWg6ZjVlcTMzNGkzM0BeYDA2YzQ2NTYxNTJhYy1eYSM1bGNjcjRnZ2BgLS1kLTBzcw%3D%3D&btag=c0000e00008000&cquery=100B_100H_100K_100o_100w&dy_q=1790594066&feature_id=f0150a16a324336cda5d6dd0b69ed299&l=202609281914260AD6A87D2F715D7558A5',
  },
  {
    title: '四月是你的谎言',
    desc: '四月是你的谎言',
    category: '动漫',
    tags: ['动漫'],
    date: '2023-11-12',
    // ⚠ 这里的 jFlBIKzLFO8 是「字母数字短码」，不是抖音的数字视频 id，
    //    官方播放器不认它，多半播不出来。
    //    换成 www.douyin.com/video/ 后面那串纯数字（或直接填数字）就能播。
    douyin: 'https://www.douyin.com/video/7300469476099640591',
    poster: 'media/covers/douyin-7300469476099640591.jpg',
    duration: '00:17',
    ratio: '1504:720',
    stream: 'https://v11-weba.douyinvod.com/609b13e6c09a5211969ce80ccc6ff4e2/6aba7658/video/tos/cn/tos-cn-ve-0015c800/oUnrgmbogxzHl8GAl3fBAsNgDUIAeQAg9aCK8d/?a=6383&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=1522&bt=1522&cs=0&ds=3&ft=3.0nz3OOVYpVAWq9DUxLhdpEeat0E.s3-EDOm4~xKAoBBR4~fnZaaUy~vjTQ&mime_type=video_mp4&qs=0&rc=aDc8PDxkOWY0aDlmZmU5N0BpM3M1cmk6ZmU6bzMzNGkzM0A0NC0yYmJiXi0xNS0yNjQ0YSNsbjBucjQwaDVgLS1kLWFzcw%3D%3D&btag=c0000e00010000&cquery=100z_100o_100w_100B_100x&dy_q=1790594072&feature_id=f0150a16a324336cda5d6dd0b69ed299&l=20260928191432F100A1334F599DC5D85C',
  },
  {
    title: '天气之子',
    desc: '天气之子',
    category: '动漫',
    tags: ['动漫'],
    date: '2026-01-20',
    douyin: 'https://www.douyin.com/video/7330654762230238498',
    poster: 'media/covers/douyin-7330654762230238498.jpg',
    duration: '00:16',
    ratio: '1280:720',
    stream: 'https://v26-web.douyinvod.com/d203fccbd15ac5cd787bfe62d36e9b66/6aba7b59/video/tos/cn/tos-cn-ve-0015c800/ocnoCDPgdIbu4efARNBblYq667IYB9g53lQ7AA/?a=6383&ch=26&cr=3&dr=0&lr=all&cd=0%7C0%7C0%7C3&cv=1&br=2049&bt=2049&cs=0&ds=3&ft=3.0nz3OOVYpVAWq9DUxLhdpEesy-E.s3-EDOm4~xKAoBBR4~fnZaaUy~vjTQ&mime_type=video_mp4&qs=0&rc=OWY5ZmQ8Zzc8ZjY5OmVlNkBpMztrZzo6Znh1cDMzNGkzM0BfXmJfNWM0Xy8xLjZfX2NfYSNqby5ycjQwYnFgLS1kLWFzcw%3D%3D&btag=c0000e00010000&cquery=100w_100B_100x_100z_100o&dy_q=1790595353&feature_id=f0150a16a324336cda5d6dd0b69ed299&l=20260928193552EEA51DB57204B1CE067E',
  },
  
  /* 抖音示例（把 douyin 换成你自己的分享链接即可）：
  {
    title: '随手拍的一段',
    desc: '手机拍的',
    category: '日常',
    tags: ['日常'],
    date: '2026-01-20',
    douyin: 'https://www.douyin.com/video/7301234567890123456',
    poster: 'media/covers/cover-01.svg',
    duration: '00:15'
  },

  其它平台示例：
  {
    title: 'B 站视频',
    embed: 'https://www.bilibili.com/video/BV1xx411c7mD'
  },
  {
    title: 'YouTube 视频',
    embed: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  }
  */
];
