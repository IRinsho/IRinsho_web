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

它启动时会自动做两件事：

1. 扫描 `img/`，把新图片压缩同步到 `public/media/images/`
2. 扫描 `blog/`，把 Markdown 笔记构建成数据

写东西的时候：

| 你想做的 | 怎么做 |
| --- | --- |
| 加图片 | 把图片复制进 `img/`，然后运行 `npm run sync`，刷新浏览器 |
| 写笔记 | 在 Obsidian 里写 `blog/` 里的 `.md`，保存后运行 `npm run sync`，刷新浏览器 |
| 改站点信息 | 改 `src/data/config.js`，保存即热更新 |
| 改样式 | 改 `public/assets/css/style.css`，保存即热更新 |

> 为什么加完内容要跑一次 `npm run sync`？
> 因为 `img/` 和 `blog/` 是「原料」，Astro 读的是加工后的数据文件。
> 这条命令就是把原料加工一遍，几秒钟的事。

---

## 三、目录结构

```
├─ package.json            依赖和命令
├─ astro.config.mjs        ★ 部署前要改这里（域名 / 子目录）
├─ 启动网站.cmd            一键启动
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
│  ├─ lib/                 工具函数（图片合并、Markdown 渲染、日期）
│  └─ data/                ★ 内容数据
│     ├─ config.js          ★ 站点名 / 首页 / 个人页 / 页脚（手改）
│     ├─ videos.js          ★ 视频列表（手改）
│     ├─ photo-meta.js      ★ 图片标题/描述/标签（手改）
│     ├─ photos.generated.js  ← 自动生成，别手改
│     └─ notes.generated.js   ← 自动生成，别手改
│
└─ tools/
   ├─ sync-photos.mjs       图片同步引擎
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

B 站 / YouTube 的视频用 `embed` 代替 `src`：

```js
{ title: '学习录屏', embed: 'https://player.bilibili.com/player.html?bvid=BV1xx411c7mD' }
```

> 现在预置的 3 条是**网络示例视频**，需要联网才能播放，换成你自己的文件后可以完全离线。

---

## 七、个人档案页

全部内容在 `src/data/config.js` 的 `me` 字段里，包括标语、自我介绍、社交链接、
右侧竖排导航、底部大字。改完保存，浏览器会自动热更新。

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
