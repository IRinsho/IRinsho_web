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
    title: 're0',
    desc: 're0',
    category: '动漫 ',
    tags: ['动漫'],
    date: '2025-06-01',
    src: 'media\videos\漪潾宵的抖音 - 抖音.mp4',
    poster: 'media\covers\Screenshot_2026_0928_140932.png',
    duration: '00:26'
  },
 
];
