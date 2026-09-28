# IRinsho · 个人档案站

用 **Astro 5** 构建的静态个人站：相册、视频、学习笔记，外加一个个人档案页。

- 图片丢进 `img/`，自动压缩同步（转 WebP、丢 EXIF）
- 笔记用 **Obsidian** 写在 `blog/`，构建时变成 Blog 页面
- 每个板块一套「首屏舞台」开场画面（全屏主视觉 + 粒子 + 鼠标视差 + 滚动推近）
- 一套贯穿全站的动效：页面切换过渡、滚动浮现、自定义鼠标、导航滑动指示条
- 单独的友链页 `/links/`（数据在 `src/data/links.js`）
- `npm run build` 生成 `dist/` 文件夹，上传到腾讯云就能上线

---

## 目录

- [一、快速开始](#一快速开始)
- [二、日常写作](#二日常写作)
- [三、图片](#三图片)
- [四、笔记](#四笔记)
- [五、视频](#五视频)
- [六、首屏舞台与页面元素](#六首屏舞台与页面元素)
- [七、动效与交互](#七动效与交互)
- [八、支持的语法](#八支持的语法)
- [九、自动化与同步](#九自动化与同步)
- [十、部署到腾讯云](#十部署到腾讯云)
- [十一、换图速查](#十一换图速查)
- [十二、常见问题](#十二常见问题)
- [十三、换配色](#十三换配色)

---

## 一、快速开始

### 1. 装 Node.js

去 <https://nodejs.org/> 下载安装 **Node.js 22 或更高版本**（装 LTS 那个就行）。

装完打开命令行（PowerShell）输入：

```bash
node -v
```

能看到版本号才算装好。

> **为什么是 22**：抖音抓取要用浏览器调试协议，脚本里靠 Node 内置的 `WebSocket`
> 连上去（`tools/douyin-frames.mjs`），这个内置模块 **Node 22 才有**。
> 版本低一点网站照样能跑，只是抖音封面抓不了（其它的都不影响）。

### 2. 装依赖

在项目目录（就是有 `package.json` 的那个文件夹）里执行：

```bash
npm install
```

会下载 Astro 和 sharp（图片压缩用），需要联网，大约 1～3 分钟。**只需要做一次。**

### 3. 启动

```bash
npm run dev
```

它会先同步一次内容，然后启动服务器，浏览器打开 <http://localhost:4321>。

**没有 `.cmd` 双击脚本了**，所有操作都在命令行里用 `npm run ...`。

---

## 二、日常写作

启动 `npm run dev` 之后，日常就是「丢文件 → 刷新」：

| 你想做的 | 怎么做 |
| --- | --- |
| 加图片 | 把图片复制进 `img/`（子文件夹名 = 相册分类）→ 自动同步 → 浏览器 **Ctrl+F5** |
| 写笔记 | 在 Obsidian 里编辑 `blog/` 下的 `.md` → 自动同步 → Ctrl+F5 |
| 加抖音 / B站 / YouTube 视频 | 在 `src/data/videos.js` 里加一条 `douyin` / `embed` 链接 → 自动抓封面和信息 |
| 加本地视频 | 文件放进 `public/media/videos/`，在 `videos.js` 里写 `src` → 自动截封面 |
| 改站点信息、个人页 | 改 `src/data/config.js`，保存即热更新 |
| 加 / 改友链 | 改 `src/data/links.js`，保存即热更新 |
| 改首页首屏、终幕、接缝条 | 改 `src/pages/index.astro`（主视觉图见 [十一、换图速查](#十一换图速查)） |
| 改样式 | 改 `public/assets/css/style.css`，保存即热更新 |

> **为什么 `img/` 和 `blog/` 要「同步」一下**：这两个文件夹是原料，
> 页面读的是加工后的 `src/data/*.generated.js`。同步就是把原料加工一遍，几秒钟的事。
> `npm run dev` 会自动做，所以正常情况你不用管。

### 命令速查

| 命令 | 做什么 | 什么时候跑 |
| --- | --- | --- |
| `npm install` | 装依赖 | 只跑一次 |
| `npm run dev` | 同步一次 → 启动本地预览（带自动同步） | 每次开始写东西 |
| `npm run sync` | 图片 + 本地视频截帧 + 外链封面 + 笔记，全跑一遍 | 可选。自动同步不灵时手动补一刀 |
| `npm run sync:photos` | 只同步图片 | 可选 |
| `npm run sync:frames` | 只给本地视频截封面（需要 ffmpeg） | 可选 |
| `npm run sync:covers` | 只抓 B站 / YouTube / 抖音 的封面和信息 | 可选 |
| `npm run sync:blog` | 只重新构建笔记 | 可选 |
| `npm run cover` | 手动粘一张封面图给某条视频 | 自动抓不到时用 |
| `npm run build` | 同步 → 构建出 `dist/` | 要部署时 |
| `npm run preview` | 本地预览构建结果 | 可选 |

后四个 `sync:xxx` 平时不用手动跑，`npm run sync` 里已经按顺序带上了。

> **关于退出码**：`sync-frames` / `sync-covers` / `build-blog` 出错时**故意退出码 0**，
> 只打印一行提示就放行 —— 它们挂在 `npm run dev` / `npm run build` 的 `&&` 链里，
> 退出非 0 会让后面的 `astro` 不执行，网站就打不开了。
> 只有 `sync-photos` 在**个别图片处理失败**时会退出码 1（图片来源坏了才会遇到），
> 这时构建会停在图片同步这一步，修好那张图再跑一次即可。

---

## 三、图片

### 加图片

1. 把图片复制进 `img/`
2. 跑一次 `npm run sync`（或者在跑着 `npm run dev`，它自己会同步）
3. 浏览器 Ctrl+F5

**子文件夹名 = 相册分类**，根目录下的图归到「未分类」：

```
img/
├─ 旅行/海边.jpg      → 相册「旅行」
├─ 日常/书桌.jpg      → 相册「日常」
└─ 随手拍.jpg          → 相册「未分类」
```

从 `img/` 里删掉图片后再同步一次，`public/media/images/` 里对应的压缩图会自动清掉。

### 改标题 / 加描述 / 打标签

编辑 `src/data/photo-meta.js`（脚本不会碰这个文件）：

```js
export default {
  '旅行/海边.jpg': {              // 键 = 图片在 img/ 里的相对路径，用正斜杠
    title: '清晨的海边',
    desc: '六点起床换来的光线。',
    album: '日常',                // 不想按文件夹分类时，用这个字段单独指定
    tags: ['海', '日出'],
    date: '2025-06-18'
  }
};
```

`title` / `album` / `date` / `desc` / `tags` 都能覆盖，没写的字段自动用默认值
（标题取文件名，分类取子文件夹名，日期取文件修改时间）。

### 同步做了什么

| 项目 | 规则 |
| --- | --- |
| 压缩格式 | 转成 WebP |
| 尺寸 | 最长边 2000px，等比缩放，**不放大**小图 |
| 质量 | 82 |
| EXIF | **全部丢弃**，包括 GPS 定位 |
| 方向 | 按 EXIF 自动摆正 |
| 增量 | 只处理新增和改动过的图片（记录在 `.photo-sync.json`） |

> 没找到 sharp（比如 `npm install` 没成功）时不会报错：图片会**原样复制**过去，
> 网站照样能显示，只是不压缩。想补上就在项目目录跑一次 `npm install`。

---

## 四、笔记

### 第一次配置 Obsidian

1. 打开 Obsidian → 「打开其他仓库」→「打开文件夹作为仓库」
2. 选中 `blog` 文件夹

Obsidian 自己的配置存在 `blog/.obsidian/`，不会发布到网站上。
详细的写法也可以看 `blog/_怎么用.md`（Obsidian 里直接能看到）。

### 一篇笔记长什么样

`blog/技术开发/TCP 三次握手.md`：

```markdown
---
title: TCP 三次握手
date: 2026-09-28
tags: [网络, 面试]
summary: 一句话摘要，显示在卡片上。
draft: false
---

正文用 Markdown 写……
```

### 文件开头的设置项

两行 `---` 之间那段。**字段都可以不写**，不写就用默认值：

| 字段 | 作用 | 不写的话 |
| --- | --- | --- |
| `title` | 标题 | 用文件名（自动去掉 `.md` 和开头的日期） |
| `date` | 日期 | 先用文件名里的日期，再没有就用文件修改时间 |
| `category` | 分类 | 用所在的**子文件夹名**，根目录下的算「未分类」 |
| `tags` | 标签，`[a, b]` 或换行写 `- a` | 空 |
| `summary` | 摘要，显示在 Blog 卡片上 | 空 |
| `cover` | 封面图，写 `blog/` 里的图片文件名 | 自动生成一张带编号的底纹封面 |
| `pinned` | `true` → 列表排最前面 + 标题前加 📌 | 不置顶 |
| `draft` | `true` → **不发布** | 发布 |
| `slug` | 自定义网址里的 id | 由文件名生成 |

### 分类和搜索

- **子文件夹名 = 分类名**，Blog 页顶部的筛选按钮会自动跟着分类走，不用手动维护
- 页面上有个搜索框，能搜**标题 / 标签 / 摘要**
- 以 `_` 开头的文件和文件夹不发布（`_模板.md`、`_怎么用.md` 就是靠这个），
  `README.md` 也不发布，隐藏目录（`.obsidian`、`.trash`）自动跳过

### 笔记里的图片

放在 `blog/` 里任何位置都行，就像用 Obsidian 那样引用：

```markdown
![[图片名.png]]
```

构建时会自动复制到 `public/media/notes/` 并转成正常的图片标签。
**找不到的图片会跳过并打印一行提示**，不会让构建失败。

---

## 五、视频

视频列表在 `src/data/videos.js`。三种填法，任选一种：

```js
export default [
  // 1) 本地视频（文件放在 public/media/videos/）
  {
    title: 're0',
    category: '动漫',
    tags: ['动漫'],
    date: '2025-06-01',
    src: 'media/videos/re0.webm'      // 相对 public/ 的路径
  },

  // 2) 抖音：粘分享链接，或者只写那串数字 id
  { title: '随手拍的一段', douyin: 'https://www.douyin.com/video/7301234567890123456' },
  { title: '只写数字也行', douyin: '7301234567890123456' },

  // 3) B站 / YouTube：粘分享链接或播放器地址都能认
  { title: '学习录屏', embed: 'https://www.bilibili.com/video/BV1xx411c7mD' },
  { title: 'YouTube 视频', embed: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
];
```

> **路径一定写正斜杠 `/`**，不要写成 Windows 的反斜杠（`media\videos\a.mp4`）——
> 浏览器会当成一个古怪的文件名，结果就是「没有找到支持的视频格式和 MIME 类型」。
> 文件名里有空格、括号、中文没问题，页面会自动转义。

### 每条视频能填的字段

| 字段 | 作用 | 谁写 |
| --- | --- | --- |
| `title` `desc` `category` `tags` `date` `duration` | 标题、描述、分类、标签、日期、时长（`'03:24'` 这种文字，只用来显示） | 你；空着的话同步会补上抓到的值 |
| `src` | 本地视频，相对 `public/` 的路径 | 你 |
| `douyin` | 抖音链接 / 数字 id / 整段分享口令 | 你 |
| `embed` | B站 / YouTube 的分享链接或播放器地址 | 你 |
| `link` | 原站链接。填了它，播放器放不出来时会多一个「去原站看」的按钮 | 你 |
| `poster` | 封面图，相对 `public/`，建议 16:9 | 你；同步抓到封面且原来没填时会自动填上 |
| `coverUrl` | 外链封面图地址，同步时自动下载到本地 | 你（手动兜底用） |
| `ratio` | 画面比例，`'3:4'` / `'16:9'` / `'9:16'` 都行 | 你；B站会由接口自动写入 |
| `vertical` | 写 `true` 强制按竖屏显示 | 你（一般不用） |
| `frameAt` | 本地视频从第几秒截封面，默认 `1.5` | 你（截到的画面不好看时改） |
| `playInline` | 写 `false` → 弹窗里不给站内播放，只留「去抖音看」按钮 | 你 |
| `live` | 写 `true` → 卡片里直接嵌播放器（最不推荐，抖音播放器塞进卡片很难看） | 你 |
| `cover` | 写 `false` → 这条完全不用自动封面 | 你 |
| `stream` | 抖音视频流地址，**同步时自动写入、每次刷新**（签名会过期） | 同步脚本，别手改 |

### 抖音链接有两种，务必用对

| 链接长这样 | 能不能站内播放 |
| --- | --- |
| `https://www.douyin.com/video/7301234567890123456`（**一串 19 位数字**） | ✅ 可以，自动转成 `open.douyin.com/player/video?vid=...` |
| `https://www.douyin.com/video/jFlBIKzLFO8`（**字母数字混合**） | ❌ 老格式短码，不是数字视频 id，官方播放器不认 |
| `https://v.douyin.com/xxxxxxx/`（**短链**） | ❌ 里面没有 id，只能给「去抖音看」的按钮 |

**怎么拿到能播的那种**：抖音 App 里点视频右下角「分享」→「复制链接」，
粘到记事本里看 —— 如果是 `v.douyin.com` 短链，就用浏览器打开它，
地址栏跳转后的 `www.douyin.com/video/` 后面那串**纯数字**就是视频 id，
直接填 `douyin: '那串数字'` 最省事。

整段分享口令（含「复制打开抖音…」那些字）也可以直接粘，会自动抠出链接。

### 抓封面 / 时长 / 比例

| 平台 | 能不能自动拿到 | 怎么做到的 |
| --- | --- | --- |
| **本地视频** | ✅ 封面 + 时长 + 比例 + 日期 | `npm run sync:frames` 用 ffmpeg 截第 1.5 秒当封面，用 ffprobe 读时长和画面尺寸 |
| **B 站** | ✅ 封面 + 标题 + 日期 + 时长 + 比例 | 公开接口 `api.bilibili.com/x/web-interface/view?bvid=`，一次拿全 |
| **YouTube** | ✅ 封面（+ 标题 / 日期 / 时长） | 封面地址可推导：`img.youtube.com/vi/<id>/maxresdefault.jpg`（依次退到 sd/hq/mq） |
| **抖音** | ✅ 封面 + 时长 + 比例 + 日期 | 用**你本机的 Edge / Chrome** 无头渲染，再走调试协议**只截 `<video>` 那一块** |

```bash
npm run sync:covers     # 抓 B站 / YouTube / 抖音
npm run sync            # 四步一起跑（npm run dev / build 会自动执行）
```

关于抖音，说清楚为什么绕这么大一圈：

- **服务端直接抓不行**：视频页和分享页都是客户端渲染，抓下来的 HTML 里连图片域名都不出现，
  只有 App 骨架 + JS；详情接口 `douyin.com/aweme/v1/web/aweme/detail/` 返回
  **403 签名墙**（需要浏览器签名）；老接口已经废弃，返回空。
- **所以改用你本机的浏览器**：让 Edge / Chrome 无头跑一遍页面，把 JS 执行完，
  然后**只截视频画面那一块**（不是整页截图，所以不会带上抖音 logo、点赞数和灰底），
  顺手把时长、分辨率、发布日期读出来。不需要登录，也不用额外装依赖。
- **需要本机有 Edge 或 Chrome**，找不到就只能手动补封面（见下）。

封面优先级是 **你手填的 `poster`（文件确实存在）> 自动抓到的封面 / `coverUrl` > 自动生成的底图**。

> **没填封面也不会难看**：卡片会自动生成一张设计过的底图
> （色调由标题推导 + 竖排斜纹 + 标题文字 + 「▶ 点开播放」），不会是灰暗的空白。

### 抓不到时：手动补一张封面

```bash
npm run cover
```

它会问你两个问题：哪条视频（按标题里的一段字匹配，直接回车 = 第一条没封面的）、
封面图的地址。然后自动把图存到 `public/media/covers/` 并写进 `videos.js` 的 `poster`。

图片地址怎么拿（10 秒）：浏览器打开视频页 → **F12 → Network** → 找一张 `douyinpic.com`
之类的图 → 右键 **Copy image address** → 粘进去。
也可以直接给本机文件路径，例如 `C:\Users\123\Pictures\封面.jpg`。

不想交互、想一行搞定：

```bash
node tools/set-cover.mjs "封面图片地址" "视频标题里的一段字"
```

### 画面比例（自适应，不用死磕 16:9）

弹窗里那块播放区会**跟着视频真实比例走**，优先级：

| 优先级 | 来源 | 说明 |
| --- | --- | --- |
| 1 | 你手写的 `ratio` | `'3:4'` / `'16:9'` / `'9:16'` 都行，也能写 `'1504:720'` 这种真实像素比，最准 |
| 2 | 同步抓到的真实尺寸 | B站接口的 `dimension`、抖音「只截 `<video>` 那块」时读到的 `videoWidth/videoHeight` |
| 3 | **本地视频** | 播放器读完元数据后自动算 —— 真·自动，精确 |
| 4 | 网页默认 | 读不到时按**横屏 16:9** |

也就是说：本地视频什么都不用填；B站同步一次就自动写好；
抖音同步抓到的是**画面真实像素比**（例如 `576:576`、`1504:720`），多数情况也不用管。

还有两个字段配合它：

| 字段 | 作用 |
| --- | --- |
| `vertical: true` | 强制按竖屏（9:16）显示。**只认 `true`** —— 代码不再「按平台猜抖音是竖屏」，因为实测抖音里横屏视频也很多，猜错就会变成「竖长条里塞一条横画面」 |
| `ratio: '9:16'` | 比 `vertical` 更精确的写法：哪一条是竖屏就单独给哪条 |

比例一旦确定，弹窗会收窄成对应的形状（CSS 里的 `.modal-panel.narrow` / `.compact`），
不会出现 1040px 宽的弹窗里只放一小块画面。

> 卡片列表里的缩略图仍然是统一的 16:9（按 `object-fit: cover` 裁切）——
> 这是有意为之：网格里混着各种比例会显得很乱。只有弹窗按真实比例显示。

### 外链视频默认在页面内播放（点一下才加载）

打开弹窗先看到**封面 / 生成底图 + 玫红「▶ 播放」按钮**，点一下才把外站播放器装进来：

- 这样第一眼不会直接怼上抖音那块黑 + logo，也免得每次打开都去请求外站
- 播放器下面一直有「放不出来？去原站看 ↗」的备用出口
- 手机上是**居中卡片**（横屏视频不会占满整屏留一大片空黑）

如果同步抓到了抖音的视频流地址（`stream` 字段），页面会先用**自己原生的播放器**播它
（画面上完全没有抖音的界面）。但抖音 CDN 有防盗链，播不了时页面会**自动退回嵌入官方播放器**，
不会甩一串报错给你。想要界面完全干净、不要嵌入播放器，就设：

```js
{ title: '某条', douyin: '...', playInline: false }
```

### 移动端

手机上做了这些适配（都在 `public/assets/css/style.css` 的
`@media (max-width: 760px)` 和 `@media (max-width: 380px)` 里，想调直接改）：

- **视频弹窗近似全屏**：手机上点视频，弹窗铺满整屏（桌面端仍是居中浮层）
- **弹窗高度用 `100dvh`**：不会被地址栏的高度变化骗到导致内容被切
- **触屏点击区域变大**：导航菜单项、筛选按钮、关闭按钮、标签都加大
- **没有 hover 的补偿**：相册的说明文字和角标在手机上直接常显（触屏没有悬停）
- **搜索框独占一行**：手机上不再和分类挤在一行
- **iPhone 安全区**：底部留出小横条空间（`env(safe-area-inset-bottom)`）
- **小屏微调**：≤380px（iPhone SE 之类）标题、面板铭牌、生成底图字号都收小

- **导航折叠成 ☰ 菜单**：窄屏下顶栏导航收进下拉菜单（`Base.astro` 里的 `menuToggle`）
- **自定义鼠标不启用**：触屏没有指针，点 / 圈直接隐藏，光标保持系统样式

全站动效（页面切换、滚动浮现、自定义鼠标、导航指示条、首屏舞台、友链页背景）
都遵循系统的 `prefers-reduced-motion: reduce`，逐条开关见
[七、动效与交互](#七动效与交互)。

### 友链是怎么工作的（如实说明）

`/links/` 是一条**独立路线**（参考 Kisara 主题的 "keep the route open"），
不是站内其它页面的复用壳，所以它有自己的首屏和背景：

| 位置 | 改什么 |
| --- | --- |
| `src/data/links.js` | 友链数据（字段见下表），加一条 = 复制一块 `{ ... }` 改字段 |
| `src/pages/links.astro` 顶部 `const BG` | 全屏场景背景图，值是**相对 `public/` 的路径**（现在用的是 `media/images/home-finale.jpg`） |
| `src/pages/links.astro` 顶部 `const SLOTS` | 面板里显示几个「槽位」，默认 `4` |

页面构成为：左侧大字标题 + 两段说明，右侧一块**玻璃面板**（`backdrop-filter` 模糊），
面板里是 `♡` 中心 + 两圈斜环慢转的**轨道图形**，下面是**槽位列表**——
真实友链不足 `SLOTS` 条时，剩下的位置显示「等待被写下的名字 / 可以放博客、作品集或小站」。

#### `links.js` 的字段

| 字段 | 作用 | 必填 |
| --- | --- | --- |
| `name` | 站名 | 是 |
| `url` | 网址，**要带 `https://`** | 是（招募位可留空） |
| `desc` | 一句话介绍 | 否 |
| `avatar` | 头像 / 站点图标。可留空（留空会按站名生成一张配色底图），也可以填 `media/images/xxx.png`（本地图）或完整的 `https://` 图片地址 | 否 |
| `tags` | 标签数组，例如 `['个人博客', '动漫']` | 否 |
| `since` | 认识的时间，例如 `'2024-03'` | 否 |
| `featured` | 写 `true` → 排在前面并带星标 | 否 |
| `open` | 写 `true` → 这条**不是真友链**，而是「交换友链」的招募位（不显示成普通一行） | 否 |

排序规则：`featured` 优先，其余按数组顺序。

> 一句实话：`/links/` 现在的槽位列表只用到 **`name` / `desc` / `url`**，
> 加上 `open` 决定哪条是招募位。`avatar` / `tags` / `since` / `featured` 这几个字段
> `links.js` 里预留了（样式也在 `style.css` 的 `.link-card` 那一段留着），
> 但**当前页面不显示它们** —— 想用起来得自己往 `links.astro` 的列表里加。
> 想删掉这几行也不会报错。

### ME 页的友链入口填什么

ME 页（`/me/`）上那个「进入友链」的方块，网址由 `src/data/config.js` 里的
`me.friend.url` 决定：

| 你想让它指向 | `me.friend.url` 怎么写 | 效果 |
| --- | --- | --- |
| 本站友链页 | `'links/'` —— **相对路径，不要写开头的 `/`** | 走站内跳转（会被 `asset()` 加上 `base` 前缀，从 `/me/` 出发也能正确拼到 `/links/`） |
| 别处的页面 | `'https://example.com/links'` —— **完整网址** | 新窗口打开（`target="_blank"`） |
| 还没想好 | `''` 或 `'#'` | 视为**没填**：点击不会跳转，而是弹出提示「把 src/data/config.js 里 friend.url 换成你的友链地址」 |

`me.friend.label` / `me.friend.text` 是这块上面的小字和大字，一起在同一个对象里改。

---

## 六、首屏舞台与页面元素

### 首屏舞台（Gate）

`src/components/Gate.astro` 是各内页共用的开场画面，和首页那套是**同一份 CSS**
（`.gate / .gate-*` 都在 `style.css` 里）。**不用在页面里写标签**：
给 `<Base>` 传属性，它就会在内容前面自动渲染一块。

| `<Base>` 属性 | 对应 Gate 的 | 作用 | 不传的话 |
| --- | --- | --- | --- |
| `hero` | `title` | 大标题。**传了它才会渲染整块首屏舞台** | 不渲染，页面直接从内容开始（首页 / 友链页 / ME 页就是这种） |
| `heroKicker` | `eyebrow` | 标题上方那行小字（eyebrow） | `CHAPTER` |
| `heroSub` | `sub` | 副标题 | 不显示 |
| `heroImage` | `image` | 背景图，写**相对 `public/` 的路径** | `media/images/home-hero.jpg`（也就是首页那张主视觉） |

可复制的例子（`src/pages/photos.astro`，想给别的页面加就照抄这一行）：

```astro
<Base title="相册 · IRinsho" hero="相册" heroKicker="GALLERY / 02" heroSub="随手拍下来的光，攒成一面墙。">
```

**目前谁开了首屏舞台**（和代码一致）：

| 页面 | 首屏舞台 | 怎么来的 |
| --- | --- | --- |
| 首页 `/` | ✅ | 页面**自带的**一套 `.gate`（`src/pages/index.astro`），不走 `<Base>` 属性 |
| 相册 `/photos/` | ✅ | `<Base hero="相册" heroKicker="GALLERY / 02" heroSub="…">` |
| 视频 `/videos/` | ✅ | `<Base hero="视频" heroKicker="VIDEO / 03" heroSub="…">` |
| 笔记 `/notes/` | ✅ | `<Base hero="笔记" heroKicker="BLOG / 04" heroSub="…">` |
| 友链 `/links/` | ❌ | 自己有一整套 `.route` 首屏（不是 Gate） |
| ME `/me/` | ❌ | 纸质浅色个人页，不加首屏 |

> 首页那套 Gate 还多两个只属于它的东西：接缝条与终幕段（见下）。

### 首屏里都有什么

| 成分 | 说明 |
| --- | --- |
| 全屏背景 + 压暗层 | 两层 DOM：`.gate-hero`（主视觉）和 `.gate-veil`（压暗 + 渐变），底层是 `--hero` 那张图 |
| 漂浮粒子 | 10 个（内页 8 个）上浮的发光小点，**纯 CSS 关键帧**，零素材；每个的起点、漂移量、时长、延迟都由内联变量控制 |
| 鼠标视差 | 指针位置换算成 `--mx` / `--my`（-0.5 ~ 0.5）写到首屏上，背景乘 ±12px、文字反向 ±6px、粒子 ±26px → 有纵深 |
| 滚动推近 | 滚动进度换算成 `--gate-p`（0 ~ 1，滚过约一屏就到位）：主视觉缓慢推近（`scale` 到 +8%）并淡出，位移/缩放/淡出全在 CSS 里算 |
| 顶部滚动进度轨 | `.gate-rail`，2px 的玫红渐变条，跟的是**整页**滚动进度（`--rail`） |
| 标题圆形注魔 | 标题是渐变字（`background-clip: text`），浮现时用 `clip-path: circle()` 从左侧画开一圈 |
| 文字浮现 | 小字 / 标题 / 副标题按 order 依次淡入（`rise` 系列关键帧） |

> **设计原则：脚本挂了也不会白屏。**
> 默认状态就是「一张静态主视觉 + 完整文字」，只有脚本正常跑起来才去加 `.reveal` /
> `.is-ready` / `--gate-p` 这些标记。所以浏览器禁 JS、CDN 挂了、脚本报错，
> 你看到的是一张静图，而不是一片空白。改这套动效时请保持这个前提。

### 首页额外的三段东西

| 元素 | 类名 | 说明 |
| --- | --- | --- |
| 接缝条（首屏 → 面板区） | `.seam--gate` | 斜切色带，**纯 CSS**（`clip-path` + 伪元素），零素材 |
| 接缝条（面板区 → 页脚） | `.seam--footer` | 同上但换了一套角度，免得两条一模一样 |
| 终幕画面 | `.finale` | 单独一整段，图是 `media/images/home-finale.jpg`（`loading="lazy"`），带压暗层和 `FINALE / 终幕` 角标 |

> 终幕原来是「滚到首屏中段才揭晓」，结果那张图常常一直看不到，太别扭；
> 现在它是面板区之后、页脚之前的一段正式内容，**一定会被看到**。

---

## 七、动效与交互

全站动效一共这几套，都遵循系统的「减少动态效果」设置。想关掉哪一套，
看表格最后两列；代码位置也写在里面，方便你自己改。

| 动效 | 触发条件 | 实现方式 | 怎么开 / 关 | 位置 |
| --- | --- | --- | --- | --- |
| **页面切换过渡** | 点导航换页 | `ClientRouter`（Astro 内置的 View Transitions）+ `::view-transition-old/new(root)` 淡入淡出 | 自动全站生效。顶栏 / 页脚用 `view-transition-name` 固定，换页时**外壳不动、只有内容在换** | `src/layouts/Base.astro` 的 `<ClientRouter />`、`style.css` 的 `view-transition` 段 |
| **滚动浮现** | 元素滚进视野 | `IntersectionObserver`：脚本成功运行时才给 `<html>` 加 `.reveal`，元素滚到哪块哪块浮现（带 0~55ms 的错位延迟） | 自动。**脚本挂了 / 禁 JS → 全部内容默认可见**，不会白屏 | `Base.astro` 的 `startReveal()` |
| **自定义鼠标** | 移动指针 | 一个贴住指针的点 + 一个带阻尼跟随的圈（lerp 0.18），悬停在链接 / 卡片上时圈放大并显示 `OPEN` | **仅桌面**（`hover: hover and pointer: fine`）。只有元素建好后才加 `.has-cursor` 隐藏系统光标；脚本失败会**自动恢复系统光标** | `Base.astro` 的 `initCursor()` |
| **导航滑动指示条** | 鼠标划过顶栏 / 点导航 | 一条玫红指示条跟着光标滑动，点击时立刻归位 | 自动；脚本没跑就只是普通的悬停变色 | `Base.astro` 的 `startNavIndicator()` |
| **卡片 / 图片悬停** | 鼠标悬停 | 笔记卡片：封面 `scale` 放大 + 标题变玫红 + 标题下划线展开；相册 / 视频卡片：上浮 3px + 边框变玫红 + 播放键放大 | 纯 CSS，不用开关 | `style.css` 的 `.post` / `.photo-card` / `.video-card` 段 |
| **友链页进场编排** | 打开 `/links/` | 纯 CSS 动画，顺序：标题 → 正文 → 玻璃面板 → 轨道图形 → 列表逐行 → 底部 | 纯 CSS，**不依赖脚本**，一定会播完并停在可见状态 | `style.css` 的 `routeIn` / `routePanelIn` / `routeRowIn` / `routeOrbIn` |
| **友链页背景动效** | 打开 `/links/` | 背景图 Ken Burns 缓慢推近横移（46s 一个来回）+ 渐变层「呼吸」（13s）+ 两条大弧线 140s / 180s 反向旋转 | 纯 CSS 循环 | `style.css` 的 `routeKenBurns` / `routeGlow` / `routeArcSpin` |

换页之后脚本会重新初始化：`astro:page-load` 上挂着 `bootMotion()`，
把滚动浮现、鼠标圈、导航指示条**各重启一遍**（三个函数内部都有幂等保护）。
这一步是必须的 —— 否则换页后旧 DOM 被换掉、鼠标圈没了而 `.has-cursor` 还留着，
就会出现「一个光标都看不见」的状态。

### 系统开了「减少动态效果」会怎样

在系统设置里打开「减少动态效果」（Windows：辅助功能 → 视觉效果 → 动画效果），
`<html>` 就不会拿到 `js-motion` / `reveal`，`prefers-reduced-motion: reduce`
的媒体查询也会生效。具体关掉的是：

| 关掉的 | 结果 |
| --- | --- |
| 页面切换过渡动画 | 换页直接切，不淡入淡出 |
| 滚动浮现 | 所有内容一开始就全部可见（不隐藏、不位移、不模糊） |
| 自定义鼠标 | 完全不启用，用系统光标 |
| 导航滑动指示条 | 不出现 |
| 首屏舞台的推近 / 淡出 / 视差 / 粒子 / 圆形注魔 / 进度轨 | 全部停掉：静态显示主视觉，标题直接完整显示，进度轨隐藏（`.gate-rail { display: none }`） |
| 接缝条漂移、终幕悬停缩放 | 停掉 |
| 友链页背景 Ken Burns / 呼吸 / 弧线旋转 / 鼠标视差 | 停掉 |
| 卡片悬停 | 保留（只留边框变色，位移和放大去掉） |

---

## 八、支持的语法

笔记正文用 Markdown 写，由项目自带的渲染器处理（无第三方依赖）。

### 基础语法

标题、粗体 / 斜体 / 删除线、`==高亮==`、行内代码、代码块、有序 / 无序列表（可嵌套）、
任务清单（`- [x]` / `- [ ]`）、引用、表格（支持 `:--` 对齐）、链接、裸网址自动成链、
图片、分隔线。

### Obsidian 增强语法

| 语法 | 效果 | 实现方式 |
| --- | --- | --- |
| `$E=mc^2$` / `$$\int x\,dx$$` | 数学公式 | 构建时保留 TeX，页面上用 **KaTeX** 渲染（CDN，按需加载） |
| ` ```mermaid ` 代码块 | 流程图 / 时序图 / 甘特图等 | 页面上用 **Mermaid** 渲染（CDN，按需加载） |
| `[[笔记名]]` / `[[笔记名\|显示文字]]` | **站内笔记跳转** | 构建时查索引转成 `/notes/xxx/` 链接 |
| `![[图片.png]]` | 插图 | 转成普通图片标签（文件会复制到 `media/notes/`） |
| ` ```dataview ` 查询块 | 自动列出笔记 | **构建时求值**成静态 HTML（见下方支持的子集） |

> 数学和 Mermaid 都是**按需加载**的：正文里没有公式 / 图表时，
> 根本不会去请求那两个 CDN（判断依据是正文里有没有 `$…$` / ` ```mermaid `）。
> 它们只影响显示，加载失败也不影响正文阅读。

### 双向链接怎么用

```markdown
请看 [[如何输出字符串位数]]，里面提到了 [[实现倒序输出-for循环|倒序输出]]。
```

- 方括号里写**笔记标题**或**文件名（不含扩展名）**都行，大小写不敏感
- 用 `|` 可以自定义显示文字（`[[真名|显示名]]`）
- **找不到对应笔记时不会报错**：会显示成灰色带虚线的文字（鼠标悬停提示「站内找不到」），
  方便你在 Obsidian 里发现拼错的名字

### Dataview 支持的子集

只做常用写法，够日常用：

````markdown
```dataview
LIST FROM #C语言 SORT date DESC LIMIT 10
```
```dataview
TABLE title, date, category FROM "c语言学习"
```
```dataview
TASK FROM #todo
```
````

| 部分 | 支持什么 |
| --- | --- |
| 类型 | `LIST` / `TABLE 字段1, 字段2` / `TASK`（默认 `LIST`） |
| 筛选 | `FROM #标签`、`FROM "文件夹名或分类名"`；写成 `and` / `or` 也**一律按「任一命中」**处理 |
| 排序 | `SORT date DESC\|ASC`（不写方向默认升序 ASC；`file` 会自动当成笔记 id） |
| 限量 | `LIMIT 10` |
| TABLE 可用字段 | `title`、`date`、`category`、`tags`、`file`，以及 frontmatter 里你自己写的其它字段（按名字取） |

这是**构建时求值**的：查询在 `npm run sync:blog` 那一步就算成了静态 HTML 写进页面，
所以页面上不需要任何 Dataview 插件，也不会有客户端查询。

> Dataview 的**表达式**不支持：`WHERE contains(...)`、`choice()`、`join()`、`dateformat()`、
> `GROUP BY`、`FLATTEN`、内联 `= this.xxx` 之类都没有 ——
> 完整实现等于在构建时跑一个查询引擎。
> 需要复杂查询时用普通 Markdown 手写，或者拆成多个简单查询。

**仍然不支持**：DataviewJS、Canvas、Excalidraw、Obsidian 的 CSS snippet。

> 另外核对一遍：渲染器**不认** Obsidian 的注释语法 `%%像这样%%`，
> 也没有脚注、没有 callout（`> [!note]`）。写了这些会原样显示成普通文字，
> 不会报错，但也不会变成你想要的样子。

> 顺带说清两个「不报错」的行为：
> · `[[双链]]` 找不到对应笔记 → 显示成**灰色带虚线**的文字（悬停提示「站内找不到」），构建不会失败；
> · ` ```dataview ` 查不到任何笔记 → 显示一行「（没有匹配的笔记）」，同样不会失败。

---

## 九、自动化与同步

### `npm run dev` 的自动同步（`integrations/auto-sync.mjs`）

它在 `npm run dev` 启动时自动跑一次，然后**盯着 `img/` 和 `blog/`**：
你往里丢文件、改文件，它会防抖 600ms 后再同步一次（另外还有 5 秒轮询兜底，
防止某些系统不支持递归监听）。同步内容依次是：

1. `img/` → 压缩图片
2. 本地视频 → 截封面（没装 ffmpeg 会自己跳过）
3. 外链封面 + 标题 / 日期 / 时长（B站 / YouTube / 抖音，抖音一条要 10~20 秒）
4. `blog/` → 构建笔记

**它只在 `npm run dev` 时生效**。构建（`npm run build`）时由 `npm run sync` 负责，不会重复跑。

### 抓取失败不会一直重试

第一次失败后按 **20 秒 → 5 分钟 → 30 分钟 → 2 小时 → 12 小时** 的间隔退避
（记录在 `.cover-sync.json`），不会每次启动都去打抖音。
你改了链接（key 变了）会立刻重新尝试；想立刻重试就加上 `-- --force`：

```bash
npm run sync:covers -- --force
```

抓 B站 / YouTube 时想留一份原始页面来诊断（存到系统临时目录）：`npm run sync:covers -- --force --dump`。
也可以直接跑脚本：`node tools/sync-covers.mjs --force --dump`。

抖音就不用诊断了 —— 上面的结论已经是实测结果，抓不到就用 `npm run cover` 手动补一张。

### 部署 / CI 环境会自动跳过抓取

云端构建机没有浏览器、也没有图形环境，抓封面这一步跑不了。所以
`tools/sync-covers.mjs` 里的 `isDeployEnv()` 会判断，命中就直接跳过、**不报错**：

| 判据 | 说明 |
| --- | --- |
| `CI` / `VERCEL` / `NETLIFY` / `EDGEONE` / `GITHUB_ACTIONS` / `CF_PAGES` / `GITLAB_CI` / `BUILD_ID` | 这些环境变量有任意一个就跳过 |
| 系统不是 Windows | 一般就是容器 / 云端构建（你自己的开发机是 Windows） |
| `IRINSHO_NO_FETCH=1` | 手动强制跳过 |

跳过之后，页面直接用仓库里**已经抓好的封面**（`public/media/covers/`）
和 `src/data/covers.generated.js`。所以**这些文件要一起提交进 git**，别忽略掉。

想强制抓（需要本机装了 Edge / Chrome），PowerShell 里这样写：

```powershell
$env:IRINSHO_FETCH='1'; npm run build
```

（cmd 里写 `set IRINSHO_FETCH=1 && npm run build`；git bash / WSL 里写
`IRINSHO_FETCH=1 npm run build`。）

本地视频截帧也有一层同样的判断（`tools/sync-frames.mjs`）：同样认
`CI` / `EDGEONE` / `VERCEL` / `NETLIFY` / `GITHUB_ACTIONS` 和「非 Windows」，
但**多一个条件**——只有**同时找不到 ffmpeg** 时才跳过。
所以你自己的 Windows 机器上照常截帧，云端容器里没 ffmpeg 就自动用仓库里已截好的封面。

**这套「跳过」不会影响构建成功**：跳过就是跳过，退出码 0，构建继续往下走
（各 sync 脚本的退出码规则见[命令速查](#命令速查)）。

所以云端 `npm run build` 的实际行为是：**图片同步照跑**（不联网）、
**笔记构建照跑**（不联网）、本地视频截帧和封面抓取直接跳过。
第一次把你自己的内容部署上去，最好在本地先跑一次 `npm run sync` 再 `git push`，
这样图片、封面、笔记数据都是现成的（`public/media/` 和 `src/data/` 里的生成文件记得一起提交）。

### 缓存在哪

| 文件 | 存什么 | 要不要提交 |
| --- | --- | --- |
| `.photo-sync.json` | 图片同步记录（改没改过） | 不用，已在 `.gitignore` 里 |
| `.cover-sync.json` | 封面抓取记录 + 失败退避时间 | 不用，已在 `.gitignore` 里 |
| `.frame-sync.json` | 本地视频截帧记录 | 不用，已在 `.gitignore` 里 |
| `public/media/covers/`、`src/data/covers.generated.js` | 抓好的封面 | **要提交**，部署环境就靠它们 |

---

## 十、部署到腾讯云

### 第 1 步：改一下 `astro.config.mjs`

```js
export default defineConfig({
  site: 'https://你的域名.com',   // 打开这一行，改成你的实际地址
  // base: '/子目录/',            // 只有部署到子目录才需要
  ...
});
```

填了 `site`，分享卡片、站点地图这类绝对链接才正确。
填了 `base`，页面里所有资源链接会自动带上这个前缀（`src/lib/url.js` 负责）。

### 第 2 步：本地构建

```bash
npm run build
```

生成 `dist/` 文件夹，里面的内容就是整个网站。

#### `npm run build` 到底跑了什么

它的定义就是两件事（见 `package.json`）：**`npm run sync && astro build`**。
也就是先把内容加工一遍，再生成静态页面：

| 顺序 | 命令 | 做什么 | 部署环境（CI / 非 Windows） |
| --- | --- | --- | --- |
| 1 | `sync-photos` | `img/` → 压缩成 WebP | 照跑（不联网） |
| 2 | `sync-frames` | 本地视频截封面 + 读时长 / 比例 | **自动跳过**（没有 ffmpeg 时），用仓库里已截好的 |
| 3 | `sync-covers` | B站 / YouTube / 抖音 的封面与信息 | **自动跳过**，用 `covers.generated.js` 里已抓好的 |
| 4 | `build-blog` | `blog/` → 笔记数据与页面 | 照跑（不联网） |
| 5 | `astro build` | 渲染出 `dist/` | 照跑 |

抓取和截帧这两步在部署机上没意义（没浏览器、没图形环境、封面早就提交进仓库了），
所以 `isDeployEnv()` 会直接跳过，**不会报错、也不会拖慢构建**。
真的想在部署机上抓（本机装了 Edge / Chrome 才行），就设 `IRINSHO_FETCH=1` 强制，
见上一章「部署 / CI 环境会自动跳过抓取」。

顺手记住退出码这件事：`sync-frames` / `sync-covers` / `build-blog` **出错也退出码 0**，
只打印提示就放行，所以它们抓不到东西**不会拦住构建**；
只有 `sync-photos` 在个别图片处理失败时才退出码 1（这时 `astro build` 不会执行，修图重跑即可）。

### 第 3 步：上传，三选一

#### 方式 A：对象存储 COS + 静态网站（推荐，便宜）

1. 登录腾讯云 → 搜索「对象存储 COS」→ 创建一个存储桶
   - 地域选离你近的
   - 访问权限选 **公有读私有写**
2. 进入存储桶 → **基础配置 → 静态网站** → 开启
   - 索引文档填 `index.html`
   - 错误文档填 `index.html`（这样刷新子页面不会 404）
3. 把本地 `dist/` 文件夹里的**所有内容**上传到存储桶根目录
   （不是把 `dist` 这个文件夹本身传上去，而是传它里面的东西）
4. 「静态网站」页面能看到访问地址，形如
   `https://你的存储桶名.cos-website.ap-guangzhou.myqcloud.com`
5. 想用自己的域名：在同一页面绑定自定义域名，再去 CDN 或域名解析里加 CNAME

> 以后每次更新：本地 `npm run build`，然后重新上传 `dist/` 里的内容（同名覆盖）。

#### 方式 B：轻量应用服务器 + nginx

1. 买一台轻量应用服务器（最低配就够），系统选 Ubuntu 或 Debian
2. 装 nginx：

```bash
sudo apt update && sudo apt install -y nginx
```

3. 把本地 `dist/` 传到服务器（用宝塔面板、WinSCP 或 scp 都行），例如放到 `/var/www/irinsho`
4. 编辑 `/etc/nginx/sites-available/default`，把 `root` 指过去：

```nginx
server {
    listen 80 default_server;
    server_name _;

    root /var/www/irinsho;
    index index.html;

    # 目录形式的网址（/notes/xxx/）能正确找到 index.html
    location / {
        try_files $uri $uri/ $uri/index.html =404;
    }

    # 静态资源缓存
    location ~* \.(css|js|webp|jpg|png|svg|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

5. 重启：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

6. 浏览器访问服务器公网 IP 就能看到

> 配 HTTPS：用 `certbot`（`sudo apt install certbot python3-certbot-nginx` 然后
> `sudo certbot --nginx`），或者直接用腾讯云的 SSL 证书。

#### 方式 C：命令行自动化（可选）

不想每次手动传，可以用腾讯云的命令行工具：

```bash
pip install coscmd
coscmd config -a <SecretId> -b <存储桶名> -r <地域>
npm run build
coscmd upload -r dist/ /
```

`SecretId` / `SecretKey` 在腾讯云「访问管理 → API 密钥管理」里创建。

---

## 十一、换图速查

站里几张「大图」分散在四个地方，想换哪张就照下表改：

| 想换哪张图 | 改哪里 | 现在用的文件 |
| --- | --- | --- |
| 首页首屏主视觉 | `src/pages/index.astro` 里 `.gate` 的 `style` 变量 `--hero` | `media/images/home-hero.jpg` |
| 首页终幕画面 | `src/pages/index.astro` 的 `.finale` 段（`<img class="finale-art">`，`--finale` 也指向同一张） | `media/images/home-finale.jpg` |
| 各内页首屏背景 | 那个页面 `<Base>` 上的 `heroImage`（不传就用首页那张 `home-hero.jpg`） | 相册 / 视频 / 笔记**都没传**，所以用的都是 `home-hero.jpg` |
| 友链页全屏背景 | `src/pages/links.astro` 顶部的 `const BG` | `media/images/home-finale.jpg` |

写法就一种（**写字符串路径**，不要 `import`）：值是相对 `public/` 的路径，
图片自己放进 `public/media/images/`：

```astro
<Base hero="相册" heroImage="media/images/gallery-hero.jpg">
```

首页那两处是 `index.astro` 里 `.gate` 的 `style` 变量，同理：

```astro
<section class="gate" style={`--hero:url(${asset('media/images/home-hero.jpg')})`}>
```

### 最省事的做法：直接覆盖同名文件

如果你**只是想把画面换成自己的照片**，不想动任何代码，那最省事的做法是：

1. 把新图命名为完全一样的名字（`home-hero.jpg` / `home-finale.jpg`）
2. 覆盖 `public/media/images/` 里那两个同名文件
3. 刷新页面（跑着 `npm run dev` 的话 Ctrl+F5）

因为路径没变，代码一个字都不用改。
**注意**：覆盖 `home-finale.jpg` 会同时换掉**首页终幕**和**友链页背景**（两处都在用它），
只想换其中一个就按上表改成别的文件名。

> 这几张图建议 **jpg / webp**、横图（**1920×1080 或更大**）：都是铺满整屏当背景用的。
> 文件名里别用空格，全部用小写英文最稳。

---

## 十二、常见问题

**Q：`npm install` 报错 / 卡住不动？**
A：先确认能上网。公司网络有代理的话：
`npm config set proxy http://代理地址:端口`，或者考虑换国内镜像
`npm config set registry https://registry.npmmirror.com`。

**Q：`npm run dev` 起来了，但页面是空的？**
A：先确认跑过一次 `npm run sync`。`img/` 和 `blog/` 是原料，
Astro 读的是加工后的 `src/data/*.generated.js`。

**Q：改了内容但页面没变？**
A：改 `src/data/` 或 `src/pages/` 里的文件会热更新；
改 `img/` 或 `blog/` 里的文件由自动同步处理，同步完要按 **Ctrl+F5** 强制刷新
（普通刷新有时会吃到浏览器缓存）。

**Q：图片 / 视频显示不出来？**
A：打开页面按 **F12 → Console / Network**，看那条请求是不是 **404**：

- 404 → 路径或文件名写错了（检查 `config.js` / `videos.js` / `photo-meta.js` 里的值，
  注意大小写和后缀）
- 200 但还是出不来 → 换个格式（面板底图用 `<img>`，视频优先 mp4 / H.264 + AAC）

所有本地文件都在 `public/` 下，路径一律用正斜杠 `/`。

**Q：本地视频能播，抖音那条放不出来？**
A：外站播放器放不出来通常是对方的限制（需要登录、地区限制、防盗链）。
播放弹窗里都给了「去原站看」的出口。本地文件的弹窗会直接告诉你文件该放在哪，并给一个下载按钮。

**Q：上传到 COS 后，点进笔记详情页 404？**
A：静态网站设置里的**错误文档**要填 `index.html`，
否则直接访问 `/notes/xxx/` 这种深层地址会找不到。

**Q：图片是 iPhone 拍的 HEIC 能用吗？**
A：可以，同步时会自动转成 WebP。

**Q：笔记详情页的网址是一串中文，正常吗？**
A：正常。id 由文件名生成，中文会保留，浏览器会自动转成百分号编码。

**Q：原来的 `serve.mjs` / `index.html` / `.cmd` 启动脚本去哪了？**
A：都删掉了。这套是 Astro 项目：用 `npm run dev` 启动、`npm run build` 构建，
不再需要自己写的服务器、单页文件，也不需要双击 `启动网站.cmd`。

**Q：`npm run build` 报错 `The symbol "title" has already been declared`？**
A：是 `src/layouts/Base.astro` 里写了**两处** `Astro.props` 解构（只能有一处）。
文件里已经留了注释提醒，改完先 `npm run dev` 看页面正常，再 `npm run build`。

**Q：改完页面一点动画都没有 / 光标变成普通箭头？**
A：多半是系统开了「减少动态效果」，或者浏览器控制台里有脚本报错。
排查顺序：F12 → Console 看有没有红色的报错 → 系统设置里关掉「减少动态效果」→ 刷新。
具体哪套动效会被关，见 [七、动效与交互](#七动效与交互)。

---

## 十三、换配色

`public/assets/css/style.css` 最上面的 `:root` 里：

```css
--rose:      #e0466f;   /* 主强调色：玫红 */
--bg:        #12142a;   /* 暗色页面底色：深蓝 */
--paper-ink: #241a20;   /* 纸质页面文字色 */
```

改 `--rose` 系列就能整体换色调。改完保存，跑着 `npm run dev` 的话浏览器会自动热更新。

---

## 附：目录结构

```
├─ package.json            依赖和命令
├─ astro.config.mjs        ★ 部署前要改这里（域名 / 子目录）
├─ integrations/
│  └─ auto-sync.mjs        自动同步：启动时跑一次 + 文件变化时再跑
│
├─ img/                    ★ 你的图片放这里（子文件夹 = 相册分类）
├─ blog/                   ★ 你的笔记放这里（子文件夹 = 笔记分类）
│  ├─ _怎么用.md           使用说明（下划线开头 → 不发布）
│  ├─ _模板.md             新建笔记时复制这个
│  └─ attachments/         笔记里的图片放这里
│
├─ public/                 原样复制到网站根目录的静态文件
│  ├─ favicon.svg
│  ├─ assets/css/style.css 全部样式（配色变量在文件最上面）
│  └─ media/               头像、压缩后的图片、视频、封面、笔记插图
│
├─ src/
│  ├─ pages/               页面（一个文件 = 一个网址）
│  │  ├─ index.astro         /           首屏舞台 + 面板 + 友链入口 + 终幕
│  │  ├─ photos.astro        /photos/     传了 hero 属性 → 有首屏舞台
│  │  ├─ videos.astro        /videos/     传了 hero 属性 → 有首屏舞台
│  │  ├─ links.astro         /links/      友链页（首屏背景在文件顶部 const BG）
│  │  ├─ me.astro            /me/         纸质浅色个人页（友链入口读 config.me.friend.url）
│  │  └─ notes/
│  │     ├─ index.astro      /notes/      Blog 列表
│  │     └─ [id].astro       /notes/xxx/  单篇笔记（数学 / Mermaid 在这里按需加载）
│  ├─ components/
│  │  └─ Gate.astro        首屏舞台组件（内页通过 Base 的 hero 属性启用）
│  ├─ layouts/Base.astro   公共外壳（顶栏、页脚、页面过渡、滚动浮现、自定义鼠标、导航指示条）
│  ├─ lib/                 工具函数（图片合并、Markdown 渲染、日期、外链解析）
│  └─ data/                ★ 内容数据
│     ├─ config.js               ★ 站点名 / 首页 / 个人页（含友链入口）/ 页脚（手改）
│     ├─ videos.js               ★ 视频列表（手改）
│     ├─ links.js                ★ 友链数据（手改）
│     ├─ photo-meta.js           ★ 图片标题 / 描述 / 标签（手改）
│     ├─ photos.generated.js     ← 自动生成，别手改
│     ├─ covers.generated.js     ← 自动生成（视频封面），别手改
│     └─ notes.generated.js      ← 自动生成，别手改
│
└─ tools/
    ├─ sync-photos.mjs       图片同步引擎（压缩 / 清理 / 生成数据）
    ├─ sync-frames.mjs       本地视频截帧（ffmpeg）+ 读时长 / 比例
    ├─ sync-covers.mjs       封面 + 信息抓取（B站 / YouTube / 抖音）
    ├─ douyin-frames.mjs     抖音取画面：无头浏览器 + 调试协议精确截图（Node 22 的 WebSocket）
    ├─ set-cover.mjs         手动配一张封面（`npm run cover`）
    ├─ patch-videos.mjs      把抓到的信息安全写回 videos.js（保留注释）
    └─ build-blog.mjs        笔记构建引擎
```

`src/data/config.js` 是你唯一需要手改的「站点信息」文件，里面每一段都有中文注释：
站点名、首页抬头与底部的章节条、顶栏头像、个人页文案与社交链接、右侧竖排导航、页脚。

顶栏右上角那个圆圈头像是 `avatar` 字段，值是**相对 `public/` 的路径**：

```js
avatar: 'media/images/119178066_p0.webp',   // 也就是 public/media/images/119178066_p0.webp
```

想换成自己的头像，把图片放进 `public/media/`（建议正方形、200×200 以上、webp 或 jpg），
再把这一行改成对应的文件名。**路径写错的话右上角会显示一个玫红菱形占位。**

---

## 附：开发注意（改代码前先看这几条）

你自己（或者以后接手的人）改源码时，有几条是已经踩过的坑：

| 注意 | 后果 | 怎么办 |
| --- | --- | --- |
| `src/layouts/Base.astro` 里 `const { … } = Astro.props` 的解构**只能有一处** | 重复声明 `title` 会让构建直接失败：`The symbol "title" has already been declared` | 要加新属性（例如 `hero` 系列）就加进**原来那一处**，别在后面再写一遍解构 |
| 改完任何 `src/` 里的东西 | 只看 `dev` 不一定够，`build` 才是真正的检验（Astro 在构建期报的错和 dev 不完全一样） | 先 `npm run dev` 看页面正常，再 **`npm run build`** 跑一遍 |
| 动效相关的代码 | 脚本一抛错，后面的动效就全不执行（以前鼠标圈和滚动浮现写在同一个作用域里，前面出错后面就哑了） | 每套动效独立包在 `try/catch` 或独立函数里；保持「**脚本挂了只是没有动效，页面照常可读**」这个前提 |
| 抓封面 / 截帧的脚本 | 它们挂在 `npm run dev` / `build` 的 `&&` 链里 | 出错要 `process.exit(0)` 放行，只打印提示；见 [九、自动化与同步](#九自动化与同步) |
