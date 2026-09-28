# IRinsho · 个人档案站

用 **Astro** 构建的静态个人站：图片、视频、学习笔记，外加一个个人档案页。

- 图片放进 `img/`，自动压缩同步（转 WebP、丢 EXIF）
- 笔记用 **Obsidian** 写，放进 `blog/`，构建时变成 Blog 页面
- `npm run build` 生成 `dist/` 文件夹，上传到腾讯云就能上线

---

## 一、第一次使用

需要先装 **Node.js 18 或更高版本**（[下载地址](https://nodejs.org/)）。装完在命令行里输入 `node -v` 能看到版本号就对了。

然后在项目目录里执行：

```bash
npm install
```

这一步会下载 Astro 和 sharp，需要联网，大约 1～3 分钟。**只需要做一次**。

之后双击 `启动网站.cmd` 就能启动（它会自动跳过已安装的依赖）。

---

## 二、日常怎么用

**双击 `启动网站.cmd`**，浏览器会自动打开 <http://localhost:4321>。

### 全自动同步（你基本不用管）

启动后会**自动**做这些事：

1. 扫描 `img/`，把新图片压缩同步到 `public/media/images/`
2. 扫描 `blog/`，把 Markdown 笔记构建成数据
3. 抓抖音视频的**封面 / 标题 / 日期 / 时长**（有 `douyin` 链接但还没抓到的才会联网）

而且**之后你往 `img/` 或 `blog/` 里丢文件、改文件，它会自动再同步一次**，
不需要手动敲任何命令。同步完浏览器里按 **Ctrl+F5** 刷新即可。

写东西的时候：

| 你想做的 | 怎么做 |
| --- | --- |
| 加图片 | 把图片复制进 `img/` → 自动同步 → Ctrl+F5 刷新 |
| 写笔记 | 在 Obsidian 里写 `blog/` 里的 `.md` → 自动同步 → Ctrl+F5 刷新 |
| 加抖音视频 | 在 `src/data/videos.js` 里填一行 `douyin: '链接'` → 自动抓封面和信息 |
| 改站点信息 | 改 `src/data/config.js`，保存即热更新 |
| 改样式 | 改 `public/assets/css/style.css`，保存即热更新 |

> 自动同步只在 `npm run dev`（也就是双击 `启动网站.cmd`）时生效。
> 部署构建时由 `npm run build` 里的同步负责。
> 想手动跑一次也行：`npm run sync`。

> 抓取失败的视频不会一直重试：**首次失败后按 2 分钟 → 10 分钟 → 30 分钟 →
> 2 小时 → 12 小时** 的间隔退避，不会每次启动都去打抖音。
> 你改了链接（key 变了）会立刻重新尝试。

---

## 三、目录结构

```
├─ package.json            依赖和命令
├─ astro.config.mjs        ★ 部署前要改这里（域名 / 子目录）
├─ 启动网站.cmd            一键启动（双击它就行）
├─ integrations/
│  └─ auto-sync.mjs        自动同步：启动时跑一次 + 文件变化时再跑
│
├─ img/                    ★ 你的图片放这里（子文件夹 = 相册分类）
├─ blog/                   ★ 你的笔记放这里（子文件夹 = 笔记分类）
│  ├─ _怎么用.md           使用说明（下划线开头 → 不发布）
│  ├─ _模板.md             新建笔记时复制这个
│  └─ attachments/         笔记里的图片放这里
│
├─ public/                 直接原样复制到网站根目录的静态文件
│  ├─ favicon.svg
│  ├─ assets/css/style.css 全部样式（配色变量在文件最上面）
│  └─ media/               头像、压缩后的图片、视频、封面
│
├─ src/
│  ├─ pages/               ★ 五个页面（一个文件 = 一个网址）
│  │  ├─ index.astro         /
│  │  ├─ photos.astro        /photos/
│  │  ├─ videos.astro        /videos/
│  │  ├─ me.astro            /me/
│  │  └─ notes/
│  │     ├─ index.astro      /notes/        Blog 列表
│  │     └─ [id].astro       /notes/xxx/    单篇笔记
│  ├─ layouts/Base.astro   公共外壳（顶栏、页脚）
│  ├─ lib/                 工具函数（图片合并、Markdown 渲染、日期、外链解析）
│  │  ├─ url.js            资源路径 → 网址（自动转义 + 补 base）
│  │  ├─ embeds.js         抖音 / B站 / YouTube 链接 → 播放器地址
│  │  └─ ...               其它小工具
│  └─ data/                ★ 内容数据
│     ├─ config.js          ★ 站点名 / 首页 / 个人页 / 页脚（手改）
│     ├─ videos.js          ★ 视频列表（手改）
│     ├─ photo-meta.js      ★ 图片标题/描述/标签（手改）
│     ├─ photos.generated.js    ← 自动生成，别手改
│     ├─ covers.generated.js    ← 自动生成（抖音封面），别手改
│     └─ notes.generated.js     ← 自动生成，别手改
│
└─ tools/
   ├─ sync-photos.mjs       图片同步引擎
   ├─ sync-covers.mjs       视频封面 / 标题 / 日期 / 时长抓取（抖音）
   ├─ patch-videos.mjs      把抓到的信息安全写回 videos.js（保留注释）
   └─ build-blog.mjs        笔记构建引擎
```

---

## 四、图片

### 加图片

1. 把图片复制进 `img/`
2. 运行 `npm run sync`
3. 刷新浏览器

**子文件夹名 = 相册分类**：

```
img/
├─ 旅行/海边.jpg      → 相册「旅行」
├─ 日常/书桌.jpg      → 相册「日常」
└─ 随手拍.jpg          → 相册「未分类」
```

### 改标题 / 加描述 / 打标签

编辑 `src/data/photo-meta.js`（这个文件不会被覆盖）：

```js
export default {
  '旅行/海边.jpg': {
    title: '清晨的海边',
    desc: '六点起床换来的光线。',
    album: '旅行',              // 不想用文件夹分类时，可以这样单独指定
    tags: ['海', '日出'],
    date: '2025-06-18'
  }
};
```

### 同步做了什么

| 项目 | 规则 |
| --- | --- |
| 压缩格式 | 转成 WebP |
| 尺寸 | 最长边 2000px，等比缩放，**不放大**小图 |
| 质量 | 82 |
| EXIF | **全部丢弃**，包括 GPS 定位 |
| 方向 | 按 EXIF 自动摆正 |
| 增量 | 只处理新增和改动过的图片 |

从 `img/` 删掉图片后运行 `npm run sync`，对应的压缩文件会自动清理。

---

## 五、笔记（Obsidian）

### 第一次配置

1. 打开 Obsidian → 「打开其他仓库」→「打开文件夹作为仓库」
2. 选中 `blog` 文件夹

详细写法见 `blog/_怎么用.md`（Obsidian 里直接能看到）。

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

| 字段 | 作用 | 不写的话 |
| --- | --- | --- |
| `title` | 标题 | 用文件名 |
| `date` | 日期 | 文件名里的日期，再没有就用文件修改时间 |
| `category` | 分类 | 所在的**子文件夹名** |
| `tags` | `[a, b]` 或换行 `- a` | 空 |
| `summary` | 摘要 | 空 |
| `cover` | 封面图文件名 | 自动生成底纹封面 |
| `draft` | `true` 就不发布 | 发布 |
| `slug` | 自定义网址 | 由文件名生成 |

### 图片

放进 `blog/attachments/`，笔记里用 `![[图片名.png]]` 引用。

### 支持与不支持

**支持**：标题、粗体斜体、删除线、`==高亮==`、代码块、列表、任务清单、引用、表格、
链接、图片、分隔线、`![[图片]]`、`[[双向链接]]`（降级为普通文字）、`%%注释%%`、`draft`

**暂不支持**：数学公式、Mermaid 图表、笔记之间的跳转链接、Dataview 插件语法

---

## 六、视频

把 mp4 放进 `public/media/videos/`，然后编辑 `src/data/videos.js`：

```js
{
  title: '我的视频',
  desc: '描述',
  category: '旅行',
  src: 'media/videos/我的视频.mp4',   // 相对 public/ 的路径
  poster: 'media/covers/封面.jpg',
  duration: '03:24',
  date: '2025-06-20'
}
```

B 站 / YouTube / 抖音的视频，直接粘分享链接就行，页面会自动换成播放器地址：

```js
// 抖音：网页链接、分享链接、或者只有那串数字，都可以
{ title: '随手拍的一段', douyin: 'https://www.douyin.com/video/7301234567890123456' }
{ title: '只有数字 id', douyin: '7301234567890123456' }

// B 站
{ title: '学习录屏', embed: 'https://www.bilibili.com/video/BV1xx411c7mD' }
{ title: 'B 站播放器地址也行', embed: 'https://player.bilibili.com/player.html?bvid=BV1xx411c7mD' }

// YouTube
{ title: 'YouTube 视频', embed: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
```

字段说明：

| 字段 | 作用 |
| --- | --- |
| `src` | 本地视频，相对 `public/` 的路径 |
| `douyin` | 抖音链接或数字 id（自动转 `open.douyin.com/player/video?vid=...`） |
| `embed` | 其它外站链接（B 站 / YouTube），粘分享链接即可 |
| `link` | 原站链接；填了它，播放器放不出来时会显示「去原站看」的按钮 |
| `poster` | 封面图，相对 `public/`，建议 16:9 |

> **抖音链接有两种，务必用对**：
>
> | 链接长这样 | 能不能站内播放 |
> | --- | --- |
> | `https://www.douyin.com/video/7301234567890123456`（**一串 19 位数字**） | ✅ 可以，自动转 `open.douyin.com/player/video?vid=...` |
> | `https://www.douyin.com/video/jFlBIKzLFO8`（**字母数字混合**） | ❌ 这种是老格式短码，不是数字视频 id，官方播放器不认 |
> | `https://v.douyin.com/xxxxxxx/`（**短链**） | ❌ 里面没有 id，只能给「去抖音看」的按钮 |
>
> **怎么拿到能播的那种**：抖音 App 里点视频右下角「分享」→「复制链接」，
> 粘到记事本里看 —— 如果得到的是 `v.douyin.com` 短链，就用浏览器打开它，
> 地址栏跳转后的 `www.douyin.com/video/` 后面那串**纯数字**就是视频 id，
> 直接填 `douyin: '那串数字'` 最省事。
>
> 整段分享口令（含「复制打开抖音…」那些字）也可以直接粘，会自动抠出链接。

### 封面 + 信息自动抓取（抖音）

**抖音视频不用自己找封面、也不用自己抄标题和时长。** 只要填了 `douyin` / `embed`，
运行同步时会自动去那一页抓：**封面、标题、发布日期、时长**。

```bash
npm run sync:covers      # 只抓封面和信息
npm run sync             # 图片 + 封面 + 笔记 一起跑（npm run dev / build 会自动执行）
```

它会做这几件事：

1. **跟跳转**（短链 → 真实地址），顺手把真实地址里的**数字视频 id** 找出来告诉你
2. **抓封面**：`og:image` → 页面 JSON 里的 `origin_cover`/`cover` → HTML 里的图片地址
3. 把封面**下载到 `public/media/covers/`**（文件名用视频 id），不怕链接签名过期
4. **读标题 / 日期 / 时长**：`og:title` / `<title>` / JSON 里的 `desc`、`create_time`、`duration`
5. **把缺的字段补回 `videos.js`** —— 你写过的值绝对不动，只填空的
6. 同时写一份 `src/data/covers.generated.js` 给页面兜底

跑完会打印改了什么，例如：

```
已把抓到的信息补进 src/data/videos.js（只填了空字段）：
  · 奇蛋物语  →  poster、title、date、duration
```

> **回填是「安全改写」**：只替换那几个字段的字符本身，注释、缩进、换行、
> 引号风格全部保留（不是把文件读成 JSON 再写回，那样注释会全丢）。
> 每条记录还会用视频链接做定位校验，对不上就跳过，不会改错行。

封面优先级（有抖音链接时优先用抓来的）：

1. **有 `douyin` / `embed` 链接 → 用抓来的真实封面**
2. 没抓到、或只有本地 `src` → 用你手填的 `poster`
3. 都没有 → 渐变底纹兜底

想让某条**完全保持手写**（不抓封面、不回填信息），在那条记录里加：

```js
{ title: '某某', douyin: '...', poster: 'media/covers/我自己的封面.jpg', cover: false }
```

> 抓的优先于手填，是因为抖音链接自带的封面就是那条视频的真实封面，比你随手塞一张图准。
> 不接受这个优先级就加 `cover: false` 显式关掉。

抓不到也不会报错中断（视频被删、抖音改版、断网都会跳过并打印原因），
只是那一条退回渐变封面。想重新抓一遍：删掉 `.cover-sync.json`，或者

```bash
node tools/sync-covers.mjs --force
```

### 抓不到怎么办（诊断）

如果日志里出现 `✗ 页面是 JS 空壳` 或 `✗ 页面里没找到 og:image`，
说明抖音这次的返回不符合预期。跑一次诊断模式：

```bash
node tools/sync-covers.mjs --force --dump
```

它会把**抖音返回的原始页面**存到系统临时目录并打印路径，同时打印
页面大小、视频 id、真实地址。把那个 `.html` 文件发出来，就能按真实结构改提取规则。

> 清空字段等自动填是可以的：`tools/patch-videos.mjs` 会识别
> `date: '',` / `poster: '',` 这种**空值**并填进去，而有值的字段一律不覆盖。

> **路径一定写正斜杠 `/`**，不要写成 Windows 的反斜杠（`media\videos\a.mp4`）。
> 后者浏览器会当成一个古怪的文件名，结果就是「没有找到支持的视频格式和 MIME 类型」。
> 文件名里有空格、括号、中文是没问题的，页面会自动转义。

> 现在预置的那条用的是你自己的 `re0.webm`（在 public/media/videos/ 里），离线也能播。

**播放不了怎么排查（按顺序）**：

1. 打开页面按 F12 → Network，点一下那条视频请求：
   - 404 → 路径或文件名写错了（注意大小写、后缀）
   - 200 但还是放不出来 → 编码格式浏览器不认（尽量用 mp4 / H.264 + AAC）
2. 外站播放器（抖音 / B 站 / YouTube）放不出来，通常是对方限制（需要登录、
   地区限制、防盗链）。播放弹窗里都给了「去原站看」的按钮
3. 本地文件的播放弹窗会直接显示「文件应该放在哪」和一个下载按钮，方便对照

---

## 七、个人档案页

全部内容在 `src/data/config.js` 的 `me` 字段里，包括标语、自我介绍、社交链接、
右侧竖排导航、底部大字。改完保存，浏览器会自动热更新。

### 头像

顶栏右上角那个圆圈用的是 `config.js` 里的 `avatar` 字段，值是**相对 `public/` 的路径**：

```js
avatar: 'media/images/119178066_p0.webp',   // 也就是 public/media/images/119178066_p0.webp
```

想换成自己的头像，把图片放进 `public/media/`（建议正方形、200×200 以上、webp 或 jpg），
再把这一行改成对应的文件名即可。**路径写错的话，右上角会显示一个玫红菱形占位。**

---

## 七点五、资源自检（图片 / 视频显示不出来时用）

图片显示不出来时，按这两步查最快：

1. 打开要看的页面，按 **F12 → Console / Network**
2. 看那条图片或视频请求是不是 **404**
   - 404 → 路径或文件名写错了（`config.js` / `videos.js` / `photos.generated.js` 里的值）
   - 200 但还是显示不出来 → 换个写法或格式（面板底图用 `<img>`，视频优先 mp4 / H.264）

所有本地文件都在 `public/` 下，路径一律用正斜杠 `/`。

---

## 八、部署到腾讯云

### 第 1 步：本地构建

```bash
npm run build
```

生成 `dist/` 文件夹，里面的内容就是整个网站。

**构建前建议改一下 `astro.config.mjs`**：

```js
export default defineConfig({
  site: 'https://你的域名.com',   // 打开这一行，改成你的实际地址
  // base: '/子目录/',            // 只有部署到子目录才需要
  ...
});
```

### 第 2 步：上传到腾讯云

两种常见方式，按需选一种。

---

#### 方式 A：对象存储 COS + 静态网站（推荐，便宜）

1. 登录腾讯云 → 搜索「对象存储 COS」→ 创建一个存储桶
   - 地域选离你近的
   - 访问权限选 **公有读私有写**
2. 进入存储桶 → **基础配置 → 静态网站** → 开启
   - 索引文档填 `index.html`
   - 错误文档填 `index.html`（这样刷新子页面不会 404）
3. 把本地 `dist/` 文件夹里的**所有内容**上传到存储桶根目录
   （不是把 `dist` 这个文件夹本身传上去，而是传它里面的东西）
4. 在「静态网站」页面能看到访问地址，形如
   `https://你的存储桶名.cos-website.ap-guangzhou.myqcloud.com`
5. 想用自己的域名：在同一页面绑定自定义域名，再去 CDN 或域名解析里加 CNAME

> 以后每次更新：本地 `npm run build`，然后重新上传 `dist/` 里的内容（同名覆盖）。

---

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

---

#### 方式 C：自动化（可选）

不想每次手动传，可以用腾讯云的命令行工具：

```bash
pip install coscmd
coscmd config -a <SecretId> -b <存储桶名> -r <地域>
npm run build
coscmd upload -r dist/ /
```

（`SecretId` / `SecretKey` 在腾讯云「访问管理 → API 密钥管理」里创建。）

---

## 九、换配色

`public/assets/css/style.css` 最上面的 `:root` 里：

```css
--rose:      #e0466f;   /* 主强调色：玫红 */
--bg:        #12142a;   /* 暗色页面底色：深蓝 */
--paper-ink: #241a20;   /* 纸质页面文字色 */
```

改 `--rose` 系列就能整体换色调。

---

## 十、常见问题

**Q：`npm install` 报错 / 卡住不动？**
A：先确认能上网。公司网络有代理的话：
`npm config set proxy http://代理地址:端口`，或者考虑换成国内镜像
`npm config set registry https://registry.npmmirror.com`。

**Q：`npm run dev` 起来了，但页面是空的？**
A：先确认跑过一次 `npm run sync`。`img/` 和 `blog/` 是原料，
Astro 读的是加工后的 `src/data/*.generated.js`。

**Q：改了内容但页面没变？**
A：改 `src/data/` 或 `src/pages/` 里的文件会热更新；
改 `img/` 或 `blog/` 里的文件需要先跑 `npm run sync`。

**Q：上传到 COS 后，点进笔记详情页 404？**
A：静态网站设置里的**错误文档**要填 `index.html`，
否则直接访问 `/notes/xxx/` 这种深层地址会找不到。

**Q：图片是 iPhone 拍的 HEIC 能用吗？**
A：可以，同步时会自动转成 WebP。

**Q：笔记详情页的网址是一串中文，正常吗？**
A：正常。id 由文件名生成，中文会保留，浏览器会自动转成百分号编码。

**Q：原来的 `serve.mjs` / `index.html` 去哪了？**
A：已经删掉了。这套是 Astro 项目，用 `npm run dev` 启动、
`npm run build` 构建，不再需要自己写的服务器和单页文件。
