# 云端后台 · 部署说明

**目标**：手机上打开 `你的域名/admin/` 就能改笔记、传照片、调配色，
保存 = 一次 git 提交，EdgeOne 自动重新构建上线。**不用开电脑。**

这套东西已经写好并测过了（25 项接口测试全绿），但**只有你能完成最后 4 步配置**——
因为都涉及你的账号密钥。下面是照着做就行的清单。

---

## 一、它长什么样

```
手机/电脑浏览器
      │  https://irinsho.top/admin/
      ▼
┌──────────────────────────────────────────────┐
│  EdgeOne Pages（你的站点 + 后台）             │
│   /admin/          后台界面（静态文件）       │
│   /api/admin/*     Node 函数（云端接口）      │
└───────────┬──────────────────────────────────┘
            │  用你给的 Token 调 GitHub API
            ▼
┌──────────────────────────────────────────────┐
│  GitHub 仓库 IRinsho/IRinsho_web             │
│   每次保存 = 一次 commit → 完整版本历史       │
└───────────┬──────────────────────────────────┘
            │  自动触发
            ▼
       EdgeOne 重新构建 → 网站更新
```

**密码与会话**存在 EdgeOne 的 **Blob 存储**里（不是 KV —— 文档写明 KV 只能在 Edge Functions 用，
而我们的接口是 Node 函数）。

---

## 二、你需要做的 4 步

### 第 1 步：建一个 GitHub Token（约 3 分钟）

1. 浏览器打开 <https://github.com/settings/personal-access-tokens/new>
   （这是 **Fine-grained token**，比经典 Token 安全，可以只授权一个仓库）
2. 填写：
   - **Token name**：`irinsho-admin`
   - **Expiration**：建议 `No expiration`（否则到期后后台会突然失效）
   - **Repository access** → 选 **Only select repositories** → 勾选 `IRinsho_web`
   - **Permissions** → 展开 **Repository permissions**，只需要改两个：
     - **Contents** → `Read and write`（读写文件，必须）
     - **Metadata** → 会自动变成 `Read-only`（必须，不用管）
3. 点 **Generate token**，把那串 `github_pat_...` **复制下来**

> ⚠ 这串 Token 只显示一次。它等于你仓库的钥匙，**不要贴给任何人、不要写进代码**。
> 只填进 EdgeOne 的环境变量里。

### 第 2 步：在 EdgeOne 里配环境变量

EdgeOne 控制台 → 你的项目 `irinshoweb` → **项目设置 → 环境管理 → 环境变量**，
新增这 4 个（**生产**环境）：

| 变量名 | 值 | 说明 |
| --- | --- | --- |
| `GITHUB_TOKEN` | 第 1 步复制的那串 | **必填**，仓库钥匙 |
| `GITHUB_OWNER` | `IRinsho` | 你的 GitHub 用户名 |
| `GITHUB_REPO` | `IRinsho_web` | 仓库名 |
| `GITHUB_BRANCH` | `main` | 分支名 |

> 文档说明：**环境变量的改动只对新的部署生效**。所以填完要再触发一次部署（第 4 步会做）。

### 第 3 步：Blob 存储 —— 什么都不用做 ✅

EdgeOne 的 Blob 页面写着：**「通过 Blob SDK 首次调用即自动创建，无需手动配置」**，
而且控制台只读、写操作全走 SDK。后台代码里已经写死命名空间名 **`irinsho-admin`**，
第一次有人打开后台时平台会自动建出来。

**怎么确认**：部署后打开后台，顶部**没有**黄色警告就是成功。
如果一直有「会话存储没连上 Blob」这条警告，按顺序查：

1. `package.json` 里有 `"@edgeone/pages-blob": "^0.0.18"`，且 `package-lock.json` 已提交
2. 构建日志里搜 `pages-blob`，确认依赖装上了
3. 控制台 **存储 → Blob**，看有没有自动出现 `irinsho-admin` 命名空间

> 就算这条警告一直在，后台**依然能用**——只是密码存在内存里，重启后要重设一次。
> 内容读写完全不受影响。

### 第 4 步：推一次代码，触发部署

我这边已经把代码写好了，还没推上去。你说一声我就推，或者你自己在项目目录跑：

```powershell
git add -A
git commit -m "新增云端后台"
git push
```

推完去 EdgeOne 的**构建部署**页面看这次构建，等它变成"成功"。

---

## 三、部署完之后

### 第一次打开

访问 **`https://irinsho.top/admin/`**，会让你**设置密码**（至少 6 位）。
这个密码存进 Blob 存储，**明文不保存、也不会进 GitHub**。

> 忘了密码怎么办：去 EdgeOne 的 Blob 存储里删掉 `auth/password.json`，再打开就会让你重设。

### 然后你会发现

- **仪表盘**：笔记 / 照片 / 视频 / 友链数量，还显示内容存在哪个仓库
- **笔记**：手机上能直接写。保存按钮写的是「保存（提交）」——点一下就是一次 git 提交
- **相册**：手机上直接从相册选图。**图片会先在浏览器里压到 1 MB 以内**
  （GitHub 单文件限制是 1 MB，平台请求体限制 6 MB）
- **历史与恢复**：能看到整站提交历史；在某篇笔记的编辑器里点「历史」，
  可以把这个文件**恢复到任意旧版本**（当前内容会变成一次新提交，不会丢）

### 保存之后多久生效

保存 → 提交进 GitHub → EdgeOne 自动构建（约 1～3 分钟）→ 网站更新。
所以**改完刷新网站可能要等一两分钟**，这是正常的。

---

## 四、几个你该知道的限制

| 限制 | 说明 | 怎么绕 |
| --- | --- | --- |
| 图片单文件 **1 MB** | GitHub Contents API 的硬限制 | 后台已自动在浏览器里压到 1 MB 以内 |
| 请求体 **6 MB** | EdgeOne Node 函数限制 | 我们走的是压缩后的小图，远低于这个数 |
| 云端**抓不到抖音封面** | 需要本机浏览器 | 封面在电脑上跑 `npm run sync:covers` 补 |
| 没有"一键回滚整站" | 平台文档里没有这个功能，且只保留最近 3 次部署产物 | **内容都在 git 里**，按文件恢复更可靠 |
| 后台首页**不进搜索引擎** | `edgeone.json` 里给 `/admin/*` 配了 `noindex` | 想做更强的防护可以再加 IP 白名单 |

### 想更安全一点？

现在后台是"知道密码就能进"。如果你想再加一层，两条路：

1. **换个不好猜的路径**：把 `node-functions/admin/` 改名成 `node-functions/admin-x7k2/`，
   访问地址就变成 `/admin-x7k2/`（api 路径不用改）
2. **IP 白名单**：EdgeOne 有安全防护，可以只放行你自己的 IP

---

## 五、出问题怎么查

| 现象 | 多半是什么 | 怎么办 |
| --- | --- | --- |
| 打开 `/admin/` 是 404 | 构建时没把 `node-functions/admin/` 一起部署 | 确认 `edgeone.json` 的 `outputDirectory` 是 `./dist`，且这次构建成功 |
| 页面能开，但提示"连不上后台" | 函数没部署成功 / 路由不对 | 看构建日志；浏览器 F12 → Network 看 `/api/admin/session` 的状态码 |
| 提示 `GITHUB_TOKEN` 缺失 | 环境变量没配或没生效 | 环境变量只对新部署生效 → 重新触发一次部署 |
| 提示 GitHub API 401 | Token 过期 / 权限不够 | 重新生成 Token，确认 Contents 是 Read and write |
| 提示 GitHub API 404 | 仓库名或分支写错 | 核对 `GITHUB_OWNER` / `GITHUB_REPO` / `GITHUB_BRANCH` |
| 每次重启都要重设密码 | Blob 存储没绑定 | 做第二节第 3 步 |
| 保存成功但网站没变 | 构建还没跑完，或构建失败 | 去 EdgeOne 的构建部署页面看状态和日志 |

**本地怎么自测这套云端代码**（不碰真 GitHub）：

```powershell
npm run admin:test:cloud
```

它会起一个**假的 GitHub 服务器**，把整套云端接口跑一遍（25 项），
所以你真实的仓库和内容一个字都不会被碰。

---

## 六、代码在哪

```
node-functions/
├─ admin/                 后台界面（/admin/ 直接访问）
│  ├─ index.html
│  ├─ admin.css           和本地版同一套样式
│  └─ admin.js            云端版：所有请求打到 /api/admin/*
├─ api/admin/index.js     云端接口（/api/admin/*）
└─ _lib/
   ├─ github.mjs          GitHub 读写（Contents API + Trees API 批量提交）
   ├─ auth.mjs            密码哈希、会话签名、Blob 存储
   ├─ content.mjs         内容逻辑（复用本地版已测过的纯函数）
   ├─ fake-github.mjs     测试用的假 GitHub
   └─ cloud.test.mjs      25 项端到端测试
```

**为什么目录叫 `node-functions`**：国际站（`pages.edgeone.ai`）用 `cloud-functions`，
中国站（腾讯云）用 `node-functions`，两边文档各自自洽但结论相反。
你在腾讯云建的项目，所以用 `node-functions`。

更完整的平台信息见 [`docs/edgeone-pages-调研.md`](../docs/edgeone-pages-调研.md)。
