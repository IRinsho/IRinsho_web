# 把视频文件放在这个文件夹里

支持的格式（浏览器兼容性从好到差）：

| 格式 | 扩展名 | 说明 |
| --- | --- | --- |
| MP4 (H.264 + AAC) | `.mp4` | **最推荐**，所有浏览器都支持 |
| WebM | `.webm` | Chrome / Firefox / Edge 支持好 |
| MOV (H.264) | `.mov` | Safari 支持好，Chrome 部分支持 |
| HEVC / H.265 | `.mp4` `.mov` | **不推荐**，很多浏览器放不出来 |

放好文件后，在 `data/videos.js` 里登记一条记录，例如：

```js
{
  title: '我的视频',
  desc: '一句话描述',
  category: '旅行',
  src: 'media/videos/我的视频.mp4',
  poster: 'media/covers/封面.jpg',
  duration: '03:24',
  date: '2025-06-20'
}
```

## 视频太大怎么办

- 文件太大会导致加载慢，建议单个视频控制在 **50MB 以内**
- 压缩推荐用 [HandBrake](https://handbrake.fr/)（免费开源），
  预设选 `Fast 1080p30` 就够了
- 更长的视频（比如课程录屏）建议上传到 B 站，然后用 `embed` 字段嵌入播放器
