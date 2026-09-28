/* =========================================================
 *  ⚠ 本文件由 tools/sync-covers.mjs 自动生成，手改会被覆盖！
 *
 *  作用：抖音视频的「封面 / 标题 / 日期 / 时长」。
 *        封面已下载到 public/media/covers/，不怕链接签名过期。
 *        页面在 videos.js 里对应字段为空时，用这里的值兜底。
 *
 *  想自己指定 → 直接在 src/data/videos.js 里填 poster / title / date / duration
 *              （你填的值永远优先，这里只做兜底）
 *  想重新抓   → 删除 .cover-sync.json，或运行 npm run sync:covers -- --force
 *
 *  生成时间：2026/9/28 18:02:39
 *  共 2 条
 * ======================================================= */
export default {
  "https://www.douyin.com/video/7338819585061178662": {
    poster:   "media/covers/douyin-7338819585061178662.png",
    title:    "奇蛋物语",
    date:     "2024-02-23",
    duration: "",
    ratio:    ""
  },
  "https://www.douyin.com/video/7300469476099640591": {
    poster:   "media/covers/douyin-7300469476099640591.png",
    title:    "四月是你的谎言",
    date:     "2023-11-12",
    duration: "",
    ratio:    ""
  },
};
