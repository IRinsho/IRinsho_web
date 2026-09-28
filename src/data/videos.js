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
 *  注意：下面 3 条是「示例视频」，用的是网络上的公共测试视频，
 *  需要联网才能播放。换成你自己的文件后就可以完全离线使用。
 * ======================================================= */
export default [
  {
    title: '示例视频 · 动画短片',
    desc: '这是一条演示用的示例视频，把 src 换成你自己的 mp4 即可。',
    category: '示例',
    tags: ['demo'],
    date: '2025-06-01',
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    poster: 'media/covers/cover-01.svg',
    duration: '00:15'
  },
  {
    title: '示例视频 · 风景片段',
    desc: '点开卡片可以用弹窗播放，支持全屏和倍速。',
    category: '示例',
    tags: ['demo', '风景'],
    date: '2025-05-20',
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    poster: 'media/covers/cover-02.svg',
    duration: '00:15'
  },
  {
    title: '示例视频 · 学习录屏',
    desc: '录屏类视频可以放 B 站，用 embed 字段嵌入播放器。',
    category: '教程',
    tags: ['demo', '教程'],
    date: '2025-05-06',
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    poster: 'media/covers/cover-03.svg',
    duration: '00:60'
  }
];
