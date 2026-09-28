/* =========================================================
 *  视频数据
 *  ---------------------------------------------------------
 *  两种播放方式，任选其一：
 *   1) 本地视频：把 mp4 放进 public/media/videos/，写 src: 'media/videos/xxx.mp4'
 *   2) 外链嵌入：写 embed: 'https://player.bilibili.com/player.html?bvid=...'
 *      （B 站 / YouTube 的 iframe 地址都可以）
 *
 *  字段：
 *    title / desc / category / tags / date
 *    src      本地视频路径（相对 public/）
 *    embed    外部播放器地址（有 embed 时优先用 embed）
 *    poster   封面图路径（相对 public/），建议 16:9
 *    duration 时长文字，例如 '12:30'（只是显示用）
 *
 *  ⚠ 路径一定用正斜杠 /，不要用 Windows 的反斜杠 \
 *    写成 'media\videos\a.webm' 浏览器会当成一个奇怪的文件名，
 *    结果就是「没有找到支持的视频格式和 MIME 类型」。
 *    （现在的 asset() 已经能自动纠正反斜杠，但正斜杠是标准写法）
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

  /* 想看效果可以再照着加一条，例如：
  {
    title: '学习录屏',
    desc: '一句话描述',
    category: '学习',
    tags: ['C语言'],
    date: '2025-06-20',
    src: 'media/videos/我的视频.mp4',
    poster: 'media/covers/cover-01.svg',
    duration: '12:30'
  },
  {
    title: 'B 站视频',
    embed: 'https://player.bilibili.com/player.html?bvid=BV1xx411c7mD'
  }
  */
];
