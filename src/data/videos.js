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
 *    poster   封面图路径（相对 public/），建议 16:9
 *    link     原站链接；填了它，播放器放不出来时会显示「去原站看」
 *    duration 时长文字，例如 '12:30'（只是显示用）
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
    date: '',
    // ⚠ 这里的 jFlBIKzLFO8 是「字母数字短码」，不是抖音的数字视频 id，
    //    官方播放器不认它，多半播不出来。
    //    换成 www.douyin.com/video/ 后面那串纯数字（或直接填数字）就能播。
    douyin: 'https://www.douyin.com/video/7338819585061178662',
    poster: '',
    duration: ''
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
