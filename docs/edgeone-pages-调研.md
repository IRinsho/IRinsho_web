# EdgeOne Pages / EdgeOne Makers 官方文档调研报告

> **调研方式**：全部内容来自官方文档页面（`pages.edgeone.ai`，另有中国站 `makers.edgeone.link` / `edgeone.cloud.tencent.com`）。
> 抓取技巧：在文档 URL 后加 `.md` 后缀可拿到干净 Markdown 全文（例如 `https://pages.edgeone.ai/zh/document/node-functions.md`）。下文所有来源 URL 给出的是**规范文档地址**（不带 `.md`）。
> **原则**：只写文档里明确写了的内容。文档没写的，明确标注"**文档里没找到**"。

---

## ⚠️ 先看这一条：国际站与中国站的目录名不一致

这是我这次调研发现的**最容易踩坑的点**，直接影响第 2 节的所有代码：

| 站点 | 文档域名 | Cloud Functions 源码目录 |
| --- | --- | --- |
| 国际站（Global） | `pages.edgeone.ai` | **`/cloud-functions`** |
| 中国站（China） | `makers.edgeone.link`、`edgeone.cloud.tencent.com` | **`/node-functions`** |

- 国际站原文（中/英一致）："Node.js 函数基于 `/cloud-functions` 目录结构生成访问路由"、"在项目的 ./cloud-functions/api 目录下新建 hello.js" —— 来源：[Node.js（国际站中文）](https://pages.edgeone.ai/zh/document/node-functions)、[Node.js（国际站英文）](https://pages.edgeone.ai/document/node-functions)
- 中国站原文："在项目的 ./node-functions/api 目录下新建 hello.js"、"Node Functions 基于 `/node-functions` 目录结构生成访问路由" —— 来源：[Node Functions（中国站）](https://edgeone.cloud.tencent.com/pages/document/184787642236784640)、[Node Functions（makers.edgeone.link）](https://makers.edgeone.link/document/node-functions)
- 国际站的 [Pages Functions 概览](https://pages.edgeone.ai/zh/document/pages-functions-overview) 也写 `./cloud-functions/api`，[EdgeOne CLI](https://pages.edgeone.ai/zh/document/edgeone-cli) 说 `init` 会生成 `edge-functions` 或 `cloud-functions` 文件夹——国际站内部是自洽的。

**结论**：目录名取决于你在哪个站建的站/项目。你在腾讯云中国站（console.cloud.tencent.com/edgeone）建项目，按中国站文档用 `node-functions`；在国际站用 `cloud-functions`。其余概念（路由规则、onRequest 签名、context 字段）两站基本一致。

---

## 1. 构建配置

### 1.1 构建命令 / 输出目录在哪里填

控制台路径：`Makers 项目 - 项目设置 - 构建部署配置`。也可以在**创建项目时**的"自定义构建"步骤一并填写。

三个可填项（[构建指南](https://pages.edgeone.ai/zh/document/build-guide)原文）：

- **根目录**："根目录是执行构建命令的路径，如果未设置，默认为存储库的根目录 `./`"
- **输出目录**："输出目录是存放构建产物（例如 HTML 文件和静态资源）的路径。该目录相对于根目录，默认为 `root ( / )`"
- **构建命令**："Makers 会根据所选框架自动设置构建命令，例如 `npm run build`。构建命令将在 Bash shell 中运行，您也可以添加与 Bash 兼容的语法。"
- 导入仓库时的提示原文："输入构建命令：输入您的构建命令。如果不确定，请检查 package.json 中的 scripts 部分的值。" —— [导入 Git 仓库](https://pages.edgeone.ai/zh/document/importing-a-git-repository)

### 1.2 框架（Astro）是自动识别的吗？——是

- "在创建项目时，使用预设模板的情况下，Makers 将采用模板的默认配置进行构建；而**对于导入的 GitHub 仓库，Makers 会自动识别所使用的框架，并应用最常见的构建配置**。" —— [构建指南](https://pages.edgeone.ai/zh/document/build-guide)
- 还有**框架预设**下拉："通过下拉菜单选择预设的框架，可以快速填充各个配置项。"（同上）
- Astro 在官方框架指南列表中有独立页面（全栈框架：Next.js / Nuxt / **Astro** / React Router / SvelteKit / TanStack Start / Vike）—— [llms.txt 文档索引](https://pages.edgeone.ai/llms.txt)

**Astro 专属要求**（[Astro 框架指南](https://pages.edgeone.ai/zh/document/framework-astro)）：

- 版本："目前 Makers 对 Astro 版本的支持为 4+，最低版本为 4，推荐使用 Astro 5。"
- 运行环境："Makers 平台的运行环境为 **Node.js 22+** 版本"
- 需要安装适配器 `@edgeone/astro`：

```bash
npm install @edgeone/astro
```

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import edgeoneAdapter from "@edgeone/astro";

export default defineConfig({
  adapter: edgeoneAdapter(),
});
```

- 适配器配置项：`outDir`（默认 `.edgeone`）、`includeFiles`、`excludeFiles`
- 纯静态导出：

```js
export default defineConfig({
  output: 'static'  // 启用静态导出
});
```

- SSR：`output: 'server'`；混合模式用页面级 `export const prerender = true`
- 支持情况：群岛架构 ✓、SSR ✓、SSG ✓、多框架 ✓、内容集合 ✓、API 路由 ✓、Actions 路由 ✓、中间件（支持 Astro 自带）、**Image 组件 暂不支持**、**平台 ISR 暂不支持**
- 适配器还支持 ISR 选项（`isr.routes` + `expiration`），文档有示例
- **文档没有明确写 Astro 项目导入时的默认"构建命令"和"输出目录"字面值**（没有 `npm run build` / `dist` 的显式对照表）。

### 1.3 `edgeone.json` 支持的字段名（完整列表）

来源：[edgeone.json 配置详解（中文）](https://pages.edgeone.ai/zh/document/edgeone-json) / [英文](https://pages.edgeone.ai/document/edgeone-json)

**顶层字段**：`name`、`buildCommand`、`installCommand`、`outputDirectory`、`nodeVersion`、`redirects`、`rewrites`、`headers`、`cloudFunctions`、`schedules`、`agents`

**`cloudFunctions` 子字段**：`nodejs.includeFiles`、`nodejs.externalNodeModules`、`nodejs.maxDuration`、`python.maxDuration`、`go.maxDuration`、`mainlandRegions`、`overseasRegions`

**`schedules[]` 子字段**：`name`、`cron`、`path`、`method`、`payload`、`timezone`

**`agents` 子字段**：`framework`、`dir`、`timeout`、`sandbox.timeout`

（另：[EdgeOne CLI](https://pages.edgeone.ai/zh/document/edgeone-cli) 提到 `devCommand` —— "该命令会优先读取 edgeone.json 中的 devCommand 参数来启动 dev 服务"。此字段未出现在 edgeone.json 文档正文的字段列表中。）

**官方完整示例（原样抄录）**：

```json
{
  "name": "example-app",
  "buildCommand": "next build",
  "installCommand": "npm install",
  "outputDirectory": "./build",
  "nodeVersion": "22.11.0",
  "redirects": [
    {
      "source": "/articles/:id",
      "destination": "/news-articles/:id",
      "statusCode": 301
    },
    {
      "source": "/old-path",
      "destination": "/new-path",
      "statusCode": 302
    }
  ],
  "rewrites": [
    {
      "source": "/assets/*",
      "destination": "/assets-new/:splat"
    }
  ],
  "headers": [
    {
      "source": "/*",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "Cache-Control",
          "value": "max-age=7200"
        }
      ]
    },
    {
      "source": "/assets/*",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "max-age=31536000"
        }
      ]
    }
  ],
  "cloudFunctions": {
    "mainlandRegions": ["ap-guangzhou"],
    "nodejs": {
      "externalNodeModules": [
        "svg-captcha"
      ], 
      "includeFiles": [
        "assets/**"
      ],
      "maxDuration": 60
    }
  }
}
```

各字段说明（原文要点）：

- `buildCommand`：覆盖控制台里的构建命令
- `installCommand`：覆盖安装命令，"此配置项可自定义构建过程使用的包管理器"
- `outputDirectory`：覆盖输出目录
- `nodeVersion`：见 1.5
- `redirects`：最大 100 条，source/destination 各不超过 500 字符；支持 `$host` → `$wwwhost`（**仅对自定义域名生效**）
- `rewrites`：最大 100 条，source/destination 各不超过 500 字符，源路径必须以 `/` 开头；`/*` → `/index.html` 会被**特殊识别为 SPA fallback**（"请求优先匹配项目中的其他路由（包括静态资源和函数），仅在未命中任何其他路由时返回 `/index.html`"）
- `headers`：最大 30 条；key 限 1-100 字符（数字、字母、`-`）；value 限 1-1000 字符（**不支持中文**）
- `cloudFunctions.maxDuration`：见第 2 节
- `schedules`：cron 最小精度一分钟、**最小间隔为一天**，不支持 6 段秒级
- `agents`：见字段表

`cloudFunctions` 相关示例（原样）：

```json
{
  "cloudFunctions": {
    "nodejs": {
      "includeFiles": [
        "assets/**",
        "assets2/**/*.json", // glob 模式
        "public/font-example.ttf", // 精确匹配
        "assets/**",           // 包含 assets 目录下所有文件
        "!assets/**/*.tmp",    // 但排除所有 .tmp 文件
        "assets/images/**/*.{png,jpg,jpeg,gif,webp}" // 图片资源
      ]
    }
  }
}
```

```js
import { readFileSync } from 'fs';
export function onRequest() {
  const image = readFileSync('../../assets/your-file.png');
  return new Response(image);
}
```

```json
{
  "cloudFunctions": {
    "nodejs": {
      "externalNodeModules": [
        "svg-captcha"
      ]
    }
  }
}
```

### 1.4 构建时能否设置环境变量？——能

来源：[构建指南](https://pages.edgeone.ai/zh/document/build-guide)

- "Makers 支持使用环境变量来构建您的项目。每个环境变量可设置变量名、变量值、备注，以及生效范围。"
- 位置：`项目设置 - 环境管理`（生产 / 预览两套环境，"各自拥有独立的关联分支、域名和环境变量"）
- 批量导入："可以将 .env 文件中的所有环境变量粘贴至变量名的输入框内，Makers 会自动识别。"
- 限制："变量名的长度限制为 255 个字节，变量值的长度限制为 1000 个字节。"（[限制与配额](https://pages.edgeone.ai/zh/document/limits-and-quotas)一致）
- **重要**："您对环境变量的任何更改将不会影响之前的部署，这些变量仅适用于新的部署。"
- CLI 管理（[EdgeOne CLI](https://pages.edgeone.ai/zh/document/edgeone-cli)）：`edgeone makers env ls` / `env pull` / `env set KEY value` / `env rm KEY`
- SDK 管理（[SDK 环境变量](https://pages.edgeone.ai/zh/document/sdk-environment-variable)）：`makers.projects.listEnvs / setEnvs / deleteEnvs`。注意原文："环境变量作用于整个项目，不按生产环境与预览环境拆分。`deployments.deploy` 不接受环境变量。"

### 1.5 构建用的 Node 版本能指定吗？——能

- 控制台：`项目设置 - Node.js 版本`（[构建指南](https://pages.edgeone.ai/zh/document/build-guide)）
- 配置文件：`edgeone.json` 的 `nodeVersion` 字段

```json
{
    "nodeVersion": "22.11.0"
}
```

**预装版本清单（两处不一致，都列出来）**：

- [构建指南](https://pages.edgeone.ai/zh/document/build-guide)："Makers 预装了 **14.21.3、16.20.2、18.20.4、20.18.0、22.11.0、22.17.1、22.21.1、24.5.0、24.11.0、24.18.0** 几个 Node 版本"
- [edgeone.json](https://pages.edgeone.ai/zh/document/edgeone-json)："建议使用系统预装的 **14.21.3、16.20.2、18.20.4、20.18.0、22.11.0** 几个版本，若填写其他版本号，可能导致部署失败"

另外："预装的 Node 版本里提供 pnpm、yarn、bun 等包管理器，**若项目根目录里有 .nvmrc 会自动下载并切换至指定版本**，但不包含相应的包管理器。"

### 1.6 包管理器 / 安装命令

| 包管理器 | Lock 文件 | 安装命令 | 支持版本 |
| --- | --- | --- | --- |
| Yarn | yarn.lock | yarn install | 1 |
| npm | package-lock.json | npm install | 8、9、10 |
| pnpm | pnpm-lock.yaml | pnpm install | 6、7、8、9、10、11 |

"Makers 在构建时会自动检测安装命令，从 package.json 安装依赖项。默认为 `npm install`。" —— [构建指南](https://pages.edgeone.ai/zh/document/build-guide)

### 1.7 构建配额

| 项 | 免费版 |
| --- | --- |
| 构建次数 | 500 次/月 |
| 并发构建数 | 1 |
| 单次构建超时 | 20 分钟 |
| 算力规格 | 4 核 6 GB |

—— [限制与配额](https://pages.edgeone.ai/zh/document/limits-and-quotas)

### 1.8 构建输出配置（给框架作者看的规范）

[构建输出配置](https://pages.edgeone.ai/zh/document/building-output-configuration)：核心文件是 `.edgeone/cloud-functions/ssr-node/config.json`，版本字段 `"version": 3`。输出位置：

| Builder 类型 | 输出位置 |
| --- | --- |
| 静态资源 | `assets/` |
| Node.js SSR 函数 | `cloud-functions/ssr-node/` |
| Node.js API 函数 | `cloud-functions/api-node/` |
| Go API 函数 | `cloud-functions/api-go/` |
| Python API 函数 | `cloud-functions/api-python/` |
| Edge 函数 | `edge-functions/` |

`routes` 里的 `Source` 字段：`src`、`dest`、`headers`、`methods`、`continue`、`status`、`has`、`missing`；另有 `{ "handle": "filesystem" }` 分界标记（"EdgeOne 仅支持 `handle: "filesystem"`"）。
⚠️ **注意**：该页面的 json 代码块在抓取时被工具转义损坏（正则里的 `$`、`)` 被替换成占位符），如需照抄请直接打开原页面。

---

## 2. Cloud Functions（Node.js）

主来源：[Node.js（国际站）](https://pages.edgeone.ai/zh/document/node-functions)、[Cloud Functions 概览](https://pages.edgeone.ai/zh/document/cloud-functions)、[限制与配额](https://pages.edgeone.ai/zh/document/limits-and-quotas)、[Pages Functions 概览](https://pages.edgeone.ai/zh/document/pages-functions-overview)

### 2.1 文件放在哪个目录

见开头警告。国际站 `/cloud-functions`，中国站 `/node-functions`。

原文（国际站）："Node.js 函数基于 `/cloud-functions` 目录结构生成访问路由。您可在项目仓库 /cloud-functions 目录下创建任意层级的子目录"

### 2.2 导出签名

两种都支持：

**（a）默认导出 `onRequest`**

```js
// ./cloud-functions/api/hello.js
export default function onRequest(context) {
  return new Response('Hello from Node.js!');
}
```

**（b）具名导出按方法分发**（Handler 方法表，原样）：

| Handlers 方法 | 描述 |
| --- | --- |
| `onRequest`(context: EventContext): Response \| Promise<Response> | 匹配 HTTP Methods (`GET`,`POST`,`PATCH`,`PUT`,`DELETE`,`HEAD`,`OPTIONS`) |
| `onRequestGet`(context: EventContext): Response \| Promise<Response> | 匹配 HTTP Methods (`GET`) |
| `onRequestPost`(context: EventContext): Response \| Promise<Response> | 匹配 HTTP Methods (`POST`) |
| `onRequestPatch`(context: EventContext): Response \| Promise<Response> | 匹配 HTTP Methods (`PATCH`) |
| `onRequestPut`(context: EventContext): Response \| Promise<Response> | 匹配 HTTP Methods (`PUT`) |
| `onRequestDelete`(context: EventContext): Response \| Promise<Response> | 匹配 HTTP Methods (`DELETE`) |
| `onRequestHead`(context: EventContext): Response \| Promise<Response> | 匹配 HTTP Methods (`HEAD`) |
| `onRequestOptions`(context: EventContext): Response \| Promise<Response> | 匹配 HTTP Methods (`OPTIONS`) |

`export async function onRequest(context)` 这种写法在 KV 文档和 Blob 文档的示例里也出现过（见第 3、4 节），所以 async 是允许的。

**入口文件识别规则**（原文）："并非所有 `.js` / `.ts` 文件都会被注册为路由。只有导出了 Function Handlers 方法（如 `onRequest`、`onRequestGet` 等）或导出了框架实例（如 Express `app`）的文件才会生成路由。不包含入口标识的 `.js` / `.ts` 文件将被视为辅助模块，会被复制到构建产物中供其他入口文件引用，但不会注册为独立路由。"

**多方法示例（原样）**：

```js
// ./cloud-functions/api/users/index.js
export function onRequestGet(context) {
  return new Response(JSON.stringify({ users: [] }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export function onRequestPost(context) {
  return context.request.json().then(data => {
    return new Response(JSON.stringify({ message: 'Created', data }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

export function onRequestDelete(context) {
  return new Response(null, { status: 204 });
}
```

**查询参数示例（原样）**：

```js
// ./cloud-functions/api/search.js
export function onRequestGet(context) {
  const url = new URL(context.request.url);
  const name = url.searchParams.get('name') || 'Guest';

  return new Response(JSON.stringify({ hello: name }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

**Express/Koa（原样）**：

```js
// ./cloud-functions/express/[[default]].js
import express from "express";
const app = express();

// 添加日志中间件
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.get("/", (req, res) => {
  res.json({ message: "Hello from Express on Node.js!" });
});

app.get("/users/:id", (req, res) => {
  const { id } = req.params;
  res.json({ userId: id, message: `Fetched user ${id}` });
});

// 导出 express 实例
export default app;
```

要点："所有路由服务都收拢在**一个函数文件**内，且文件名必须是 `[[ ]]` 的格式，如 `[[default]].js`"、"无需额外启动 HTTP Server 与设置端口监听"、"必须导出框架实例否则构建器不会将其识别为函数 `export default app;`"

### 2.3 `context` 对象里有哪些字段

**⚠️ 这里文档本身有矛盾，务必注意。**

**Cloud Functions / Node.js 文档的 EventContext 属性列表（原样抄录）**：

- `uuid`：EO-LOG-UUID 代表了 EO 请求的唯一标识符
- `params`：动态路由 `/cloud-functions/api/users/[id].js` 参数值
- `env`：Makers 环境变量
- `clientIp`：客户端 IP 地址
- `server`：
  - `region`: 部署地的区域编码
  - `requestId`: 请求 ID，用于日志跟踪
- `geo`：客户端地理位置信息

**但同一页的所有示例都在用 `context.request` 或解构 `{ request }`**（例如 `return context.request.json().then(...)`、`export const onRequestGet = async ({ request }) => {...}`）。
👉 **`request` 没有出现在 Cloud Functions 的 EventContext 属性列表里，但被示例大量使用**；`waitUntil` 在 Cloud Functions 文档中**完全没提**。

**对比：Edge Functions 的 EventContext 列表是（[Edge Functions](https://pages.edgeone.ai/zh/document/edge-functions)）**：

- `request`：客户端请求对象 Request
- `params`：动态路由参数值
- `env`：Makers 环境变量
- `waitUntil`：`(task: Promise<any>): void;` 用于通知边缘函数等待 Promise 完成，可延长事件处理的生命周期

**结论**：你问的 `request / env / params / waitUntil` 四个字段，**只有 Edge Functions 文档四个都明确列了**；Cloud Functions 文档明确列了 `env`、`params`，`request` 只在示例里出现，`waitUntil` **文档里没找到**。

**动态路由参数（原样）**：

```js
// ./cloud-functions/api/users/[id].js
export function onRequestGet(context) {
  return new Response(`User id is ${context.params.id}`);
}
```

**Response 对象**："函数必须返回一个 Response 对象，来响应客户端的 HTTP 请求，包含 headers，status，body 等属性。"

### 2.4 路由规则

**目录 → 路由映射表（原样）**：

```
...
cloud-functions
├── index.js
├── hello-makers.js
├── helloworld.js
├── api
    ├── users
      ├── list.js
      ├── geo.js
      ├── [id].js
    ├── visit
      ├── index.js
    ├── [[default]].js
...
```

| 文件路径 | 路由 |
| --- | --- |
| /cloud-functions/index.js | example.com/ |
| /cloud-functions/hello-makers.js | example.com/hello-makers |
| /cloud-functions/helloworld.js | example.com/helloworld |
| /cloud-functions/api/users/list.js | example.com/api/users/list |
| /cloud-functions/api/users/geo.js | example.com/api/users/geo |
| /cloud-functions/api/users/[id].js | example.com/api/users/1024 |
| /cloud-functions/api/visit/index.js | example.com/api/visit |
| /cloud-functions/api/[[default]].js | example.com/api/books/list、example.com/api/books/1024、example.com/api/... |

**所以 `node-functions/api/foo.js`（或 `cloud-functions/api/foo.js`）对应 `example.com/api/foo`** —— 目录前缀不进 URL。

**动态路由：支持。** `[id].js` 单级动态路由：

| 文件路径 | 路由 | 匹配 |
| --- | --- | --- |
| /cloud-functions/api/users/[id].js | example.com/api/users/1024 | 是 |
|  | example.com/api/users/vip/1024 | 否 |
|  | example.com/api/vip/1024 | 否 |
| /cloud-functions/api/[[default]].js | example.com/api/books/list | 是 |
|  | example.com/api/1024 | 是 |
|  | example.com/v2/vip/1024 | 否 |

**Catch-all：支持，写法是 `[[param]]`（双中括号，不是 Next.js 的 `[...param]` 三省略号）** —— "多级动态路由（Catch-all）：`[[param]]` 匹配一个或多个路径段（如 `/api/[[default]]`）"

**路由匹配优先级（从高到低）**：

1. 静态路由：精确匹配的路径优先（如 `/api/users/list`）
2. 单级动态路由：`[param]` 匹配单个路径段
3. 多级动态路由（Catch-all）：`[[param]]` 匹配一个或多个路径段

"同级别路由中，路径越长（越具体）优先级越高。"

**其他规则**：

- "如果 Node.js 路由跟静态资源路由冲突，客户端请求将优先被路由到静态资源。"
- "路由大小写敏感，/helloworld 将被路由到 /cloud-functions/helloworld.js，不能被路由到 /cloud-functions/HelloWorld.js"

### 2.5 环境变量怎么读 / 在哪里配置

**在哪里配置**：`项目设置 - 环境管理 - 环境变量`（生产 / 预览分开），见 1.4。

**怎么读**：文档里出现的两种写法，都有出处：

- **`context.env.X`**（Edge Functions / 中间件场景，文档明确）：
  - KV 示例：`export async function onRequest({ request, params, env }) { ... }` —— [KV](https://pages.edgeone.ai/zh/document/kv-storage)
  - 中间件实例：`const { request, next, env } = context;` 然后 `await verifyJwt(token, env.JWT_SECRET);` —— [Agent 应用鉴权](https://pages.edgeone.ai/zh/document/agents-authentication)
  - EventContext 属性表里的 `env：Makers 环境变量`
- **`process.env.X`**（Node.js 代码示例里出现）：
  - `apiKey: process.env.MAKERS_MODELS_KEY` —— [Makers Models 集成](https://pages.edgeone.ai/zh/document/makers-models-integration)

👉 **文档没有专门说明"Node 函数里到底该用 `context.env.X` 还是 `process.env.X`"，两种写法都在官方示例中出现过。** 这点建议实测确认（也可见文末"不确定"一节）。

### 2.6 运行时限制

**Cloud Functions 通用限制（[Cloud Functions 概览](https://pages.edgeone.ai/zh/document/cloud-functions)原表）**：

| 内容 | 限制 | 说明 |
| --- | --- | --- |
| 代码包大小 | 128 MB | 单个函数代码包大小（含依赖）最多支持 128 MB |
| 请求/响应 body 大小 | 6 MB | 客户端请求/响应携带 body 最多支持 6 MB |
| 最大执行时长 | 120s | 单个请求从开始到响应的最大允许时间（Maximum Duration），默认 30s |
| Node.js 版本 | v20.x | 默认 Node.js 运行时版本 |
| Python 版本 | 3.10 | - |
| Go 版本 | 1.26 | - |

**超时配置**（[edgeone.json](https://pages.edgeone.ai/zh/document/edgeone-json)）："Cloud Functions 的最大单次运行时长限制，可配置范围为 **10 - 120 秒**，不配置时默认 **30 秒**，不同运行时需单独设置。"

```json
{ 
  "cloudFunctions": {
    "nodejs": {
      "maxDuration": 60
    },
    "python": {
      "maxDuration": 60
    },
    "go": {
      "maxDuration": 60
    }
  }
}
```

**内存上限**：**文档里没找到** Cloud Functions 的内存规格数字（只有免费版"总内存时长 50 万 GB-s/月"和 Agents/Sandbox 的 GB-s 配额）。构建机是 4 核 6 GB，但那是构建不是函数运行时。

**Edge Functions 限制（对比用，[Edge Functions](https://pages.edgeone.ai/zh/document/edge-functions)）**：

| 内容 | 限制 | 说明 |
| --- | --- | --- |
| 代码包大小 | 5 MB | - |
| 请求 body 大小 | 1 MB | - |
| CPU 时间 | 200 ms | 函数单次执行分配的 CPU 时间片，不包含 I/O 等待时间 |
| 开发语言 | JavaScript | 目前仅支持 JavaScript，ES2023+ |

**是否支持 Node 全部内置模块（特别是 node:crypto）**：

- **`node:crypto` 有官方示例**（原样，[Node.js](https://pages.edgeone.ai/zh/document/node-functions)）：

```js
// ./cloud-functions/api/nodeinfo.js
import * as os from 'node:os'
import { randomUUID, createHash } from 'node:crypto'

export const onRequestGet = async ({ request }) => {
  const info = {
    nodeVersion: process.version,
    pid: process.pid,
    platform: os.platform(),
    url: request.url,
  }

  return new Response(JSON.stringify(info), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
  })
}
```

  即 `node:os`、`node:crypto`（`randomUUID`、`createHash`）、`process` 都被官方示例使用。
- **"是否支持 Node 全部内置模块"这句结论，文档里没找到明确表述。** 没有一份"支持/不支持的内置模块清单"。

### 2.7 能否用 npm 依赖（如 `@octokit/rest`）

**能。** 原文依据：

- "**丰富的 Node.js 生态：**可以直接使用 npm 中的各类第三方库和工具，轻松集成数据库、AI、支付等服务，满足复杂业务需求。"
- "Node.js 运行时支持 JavaScript 和 TypeScript 开发，**可直接使用 npm 生态中的海量模块**"
- [Cloud Functions 概览](https://pages.edgeone.ai/zh/document/cloud-functions)："您可以直接访问**完整的 npm 生态**，利用成熟的 Node.js 工具链构建应用。"
- 构建输出目录结构里含 `node_modules/`：`cloud-functions/api-node/{node_modules, index.mjs, config.json}` —— [构建输出配置](https://pages.edgeone.ai/zh/document/building-output-configuration)

**依赖是提交 lock 文件还是平台自动装？——平台自动装。**

- "Makers 在构建时会自动检测安装命令，从 package.json 安装依赖项。默认为 `npm install`。"
- 包管理器由 **lock 文件**决定（yarn.lock → yarn install；package-lock.json → npm install；pnpm-lock.yaml → pnpm install），版本支持见 1.6 表格
- 含原生模块或静态文件的依赖要额外声明 `externalNodeModules`：

```json
{
  "cloudFunctions": {
    "nodejs": {
      "externalNodeModules": [
        "svg-captcha"
      ]
    }
  }
}
```

- 函数运行时要直接读的文件（模板、字体、二进制等）要声明 `includeFiles`，且**只能用相对路径读取**："目前仅支持在函数代码中使用相对路径引入文件"

### 2.8 本地调试

```bash
npm install -g edgeone
edgeone makers dev
```

"执行命令默认会在本地 8088 端口起一个服务，Makers 函数的服务和 Makers 项目的服务都运行在同一个端口上，无需额外代理。" —— [EdgeOne CLI](https://pages.edgeone.ai/zh/document/edgeone-cli)

---

## 3. KV 存储

主来源：[KV](https://pages.edgeone.ai/zh/document/kv-storage)、[存储概览](https://pages.edgeone.ai/zh/document/storage-overview)、[Pages KV 集成](https://pages.edgeone.ai/zh/document/pages-kv-integration)、[限制与配额](https://pages.edgeone.ai/zh/document/limits-and-quotas)

### 🚨 3.0 最重要的一条：KV **当前仅支持在 Edge Functions 中使用**

原文（[KV 文档](https://pages.edgeone.ai/zh/document/kv-storage) 注意事项）："**当前仅支持在 Edge Functions 中使用。**"

[存储概览](https://pages.edgeone.ai/zh/document/storage-overview) 的对比表也写着：

| 特性 | KV 存储 | Blob 存储 |
| --- | --- | --- |
| 运行环境 | **仅 Edge Functions** | **Edge Functions / Cloud Functions** |

**所以你原本的设想"在 Node 函数里用 `env.KV.get()`"——按官方文档，KV 在 Cloud/Node Functions 里不支持。** 要在 Node 函数里存数据，文档指向的是 Blob（见第 4 节），或者用外部数据库（官方示例用 Neon Postgres）。

### 3.1 控制台创建命名空间 + 绑定项目

**开通账户**：控制台 → "存储 - KV" 页面 → 单击**立即申请**（[Pages KV 集成](https://pages.edgeone.ai/zh/document/pages-kv-integration) 里流程是：头部导航栏点 `KV Storage` → `Apply now` → 填写申请理由 → 提交申请 → 等待审批）

**创建命名空间**：开通 KV 账户后，在"KV 存储"页面 → 单击**创建命名空间** → 输入名称 → 创建

**添加记录**（可选，控制台也能直接建 key）：命名空间详情 → **新建记录**

**绑定命名空间**（两种入口，[KV 文档](https://pages.edgeone.ai/zh/document/kv-storage)原文）：

- **KV 存储中绑定**：命名空间详情页 → **关联项目** 选项卡 → **绑定项目**
- **项目中绑定**：项目详情 → **KV 存储** 菜单 → **绑定命名空间**

**变量名（Variable Name）**：绑定时要填，就是代码里用的名字。原文："变量名是绑定项目跟命名空间时定义的**运行时环境变量名称**。在使用命名空间数据之前，需要先将命名空间跟 Makers 项目进行绑定。命名空间跟项目的绑定关系为**多对多**，在绑定时通过不同的运行时环境变量名称来区分使用。"

### 3.2 在函数里怎么读写 —— 准确的 API 写法

**⚠️ 注意：文档里的调用写法是直接用绑定时的变量名（下面示例中为 `my_kv`），不是 `env.my_kv`，也不是 `context.env.my_kv`。**

原文（[KV 文档](https://pages.edgeone.ai/zh/document/kv-storage)）："**说明：**以下示例的 my_kv 是您绑定项目跟命名空间时的变量名。"

#### put

```
put(key: string,value: string | ArrayBuffer | ArrayBufferView | ReadableStream): Promise<void>;
```

- `key`：需要创建或更新的键，**长度小于等于 512 B，仅支持数字、字母及下划线**
- `value`：需要写入的数据，**数据长度小于等于 25 MB**
- 返回值：返回一个 `Promise`，需要 `await` 该 `Promise` 以验证写入是否成功

```js
await my_kv.put(key, value);
```

#### get

```
get(key:string, object?:{type:string}): Promise<value:string|object|ArrayBuffer|ReadableStream>
```

- `type`：用于指定返回的 value 类型，默认为 text
  - `text`：`String`，将 value 转成 string 的形式返回
  - `json`：`Object`，用户将 json 反序列化为 object 形式返回
  - `arrayBuffer`：`ArrayBuffer`，用户将二进制的 value 转换为 ArrayBuffer 返回
  - `stream`：`ReadableStream`，通常用于 value 较大的场景
- 返回值：返回一个 `Promise`，需要 `await` 该 `Promise` 以获取 value。**如果 key 不存在或 value 为空时，则返回 null**

```js
let value = await my_kv.get(key);
let value = await my_kv.get(key, "json");
let value = await my_kv.get(key, {type: "json"});
```

#### delete

```
delete(key: string): Promise<void>;
```

```js
await my_kv.delete(key);
```

#### list

```
list({prefix?: string, limit?: number, cursor?: string}): Promise<ListResult>;
```

- `prefix`：用于过滤指定前缀的键。默认为空时，按照字典序排序返回
- `limit`：返回的 key 的最大数量，用于分页。**默认值为 256，上限为 256**
- `cursor`：游标，从指定键开始遍历，用于分页。默认为空

返回值结构（原样）：

```
class ListResult {
    complete: Boolean;
    cursor: String;
    keys: Array<ListKey>;
}

class ListKey {
    key: String;
}
```

- `complete`：标记 list 操作是否完成，true 完成，false 未完成
- `cursor`：游标，为下一页的第一个 key，当 list 遍历完成时为 null
- `keys`：描述每个 key 的 object 数组

```js
// 通过 list 获取部分数据
let result = await kv.list({ "prefix": "a", "limit": 10, "cursor": "abc" });

// 通过 list 遍历所有数据
let result;
let cursor;
do {
    result = await kv.list(options);
    cursor = result.cursor;
} while (result && !result.complete);
```

#### 官方完整示例（原样）

```js
export async function onRequest({ request, params, env }) {
    // 获取变量名为 my_kv 的命名空间 key
    let count = await my_kv.get("count");
    count = Number(count) + 1;
    
    // 重新写入 visitCount 键值
    await my_kv.put("count", String(count));

    return new Response("ok", {});
}
```

[Pages KV 集成](https://pages.edgeone.ai/zh/document/pages-kv-integration) 的示例（原样）：

```js
// 获取变量
const visitCount = await my_kv.get('visitCount');
let visitCountInt = Number(visitCount);
visitCountInt += 1;

//修改变量
await  my_kv.put('visitCount', visitCountInt.toString());

const res = JSON.stringify({
  visitCount: visitCountInt,
});
```

👉 注意上面这个示例的函数签名解构了 `env`，但正文里却直接用了裸的 `my_kv`。**文档没说清 `env` 与绑定变量名之间的关系**，这点建议实测（文末"不确定"一节也提了）。

### 3.3 值的类型限制 / 大小上限

- **写入类型**：`string | ArrayBuffer | ArrayBufferView | ReadableStream`
- **读取类型**：`text` / `json` / `arrayBuffer` / `stream`
- **key 上限**：512 B，仅数字、字母、下划线
- **value 上限（两处说法冲突，都列出）**：
  - [KV 文档](https://pages.edgeone.ai/zh/document/kv-storage)："数据长度小于等于 **25 MB**"
  - [限制与配额](https://pages.edgeone.ai/zh/document/limits-and-quotas) KV 表："单值大小 **1 MB**"
  - [存储概览](https://pages.edgeone.ai/zh/document/storage-overview) 对比表："单值上限 **25 MB**"
- **没有 TTL / expiration 参数** —— `put` 签名里没有过期时间参数，文档全文也没提到 KV 的 TTL。**文档里没找到**。
- **一致性**："多边缘节点部署的键值持久化存储，遵循最终一致性（边缘节点缓存最长 60s）"。写入只更新发起请求的节点缓存，其他节点最长 60 秒内可能读到旧值；"如果业务需要全局立即一致，请使用 Blob 存储的强一致模式。"

### 3.4 免费额度

- **KV 存储空间：1 GB**（[限制与配额](https://pages.edgeone.ai/zh/document/limits-and-quotas) 与 [KV 文档](https://pages.edgeone.ai/zh/document/kv-storage) 一致："免费版套餐下单账户存储容量为 1GB"）
- **命名空间数量：一个账户可以创建 10 个命名空间**
- **读写次数 / 请求数配额**：**文档里没找到**（限制与配额页面的 KV 表格只有"存储空间 1 GB"和"单值大小 1 MB"两行）
- **超额计费方式**：**文档里没找到**（免费版说明提到"额度不足可提交工单申请提额"）

---

## 4. Blob 存储

主来源：[Blob](https://pages.edgeone.ai/zh/document/blob-storage)、[存储概览](https://pages.edgeone.ai/zh/document/storage-overview)、[限制与配额](https://pages.edgeone.ai/zh/document/limits-and-quotas)

### 4.1 用途

"EdgeOne Makers Blob 是面向 Makers Functions 的分布式对象存储，适合存储图片、文档、用户上传文件等非结构化数据。默认提供最终一致的快速读取，写入后短暂时间内可读到最新值；如需立即读到最新值，可在单次读取时切换为强一致模式。"

**⚠️ 重要警告原文**："Blob 面向 Makers Functions 的运行时数据需要（如读写、查询、加工），**不建议作为公网图床或 CDN 使用**。"

**运行环境**："Edge Functions / Cloud Functions" —— 即**可以在 Cloud/Node Functions 里用**（与 KV 不同）。

一致性两种模式：

| 模式 | 读取行为 | 适用场景 |
| --- | --- | --- |
| **最终一致**（默认） | 走边缘缓存，速度最快；新写入的数据需要短暂时间（通常秒级）才能在所有节点上读到 | 内容展示、缓存读取、容忍短暂不一致的业务 |
| **强一致** | 跳过缓存直读主存储，保证读到最新值；读取耗时略高 | 计数器、状态机、必须立即读到最新写入值的业务 |

### 4.2 在函数里的 API 写法

**安装**：`npm install @edgeone/pages-blob`
（⚠️ [存储概览](https://pages.edgeone.ai/zh/document/storage-overview) 里写的是 `import { getStore } from "@tencent/pages-blob";`，包名与 Blob 文档不一致，以 Blob 文档的 `@edgeone/pages-blob` 为准更可信。）

**快速开始（原样）**：

```js
import { getStore } from "@edgeone/pages-blob";

export async function onRequest({ request }) {
  const store = getStore("my-store");

  // 写入
  await store.set("hello.txt", "Hello, EdgeOne Makers!");

  const content = await store.get("hello.txt");

  return new Response(content);
}
```

"首次调用 `getStore("my-store")` 时，平台会**自动为当前项目创建名为 `my-store` 的命名空间**，后续调用直接使用已有的命名空间。"
**控制台**："Blob 在控制台中仅支持**只读浏览**（查看命名空间列表、浏览对象目录结构）。命名空间的创建和所有数据操作均通过 SDK 完成。"

**API 总览**：`getStore`、`listStores`、`store.set`、`store.setJSON`、`store.get`、`store.getWithHeaders`、`store.delete`、`store.list`、`store.createUploadUrl`

#### getStore(name | options)

```js
const store = getStore("my-store");

// 也可使用对象形式，便于同时指定默认一致性
const store = getStore({ name: "my-store", consistency: "strong" });
```

在 Makers Functions 之外访问：

```js
const store = getStore({
  name: "my-store",
  projectId: "pages-urtsvuwmfvli",
  token: "your-api-token",
});
```

参数：`name`（必填）、`projectId`（外部访问必填）、`token`（外部访问必填）、`consistency`（`"eventual" | "strong"`，默认 `"eventual"`）

#### store.set(key, value, options?)

```js
await store.set("photos/cat.jpg", imageBuffer);
await store.set("notes/todo.txt", "Buy milk");

// 防覆盖：仅在 Key 不存在时写入
await store.set("init.json", data, { onlyIfNew: true });
```

- `value` 类型：`string | ArrayBuffer | Blob | ReadableStream`
- `options.onlyIfNew`：`boolean`，设为 `true` 时仅在 Key 不存在时写入
- 返回值：`Promise<void>`

#### store.setJSON(key, value, options?)

```js
await store.setJSON("user/preferences", { theme: "dark", lang: "zh-CN" });
```

#### store.get(key, options?)

```js
const text = await store.get("hello.txt");
const json = await store.get("config.json", { type: "json" });
const buffer = await store.get("image.png", { type: "arrayBuffer" });
const blob = await store.get("video.mp4", { type: "blob" });
const stream = await store.get("large-file.zip", { type: "stream" });

// 强一致性读取
const fresh = await store.get("counter", { consistency: "strong" });
```

- `options.type`：`"text" | "json" | "arrayBuffer" | "blob" | "stream"`，默认 `"text"`
- 返回值：`Promise<string | object | ArrayBuffer | Blob | ReadableStream | null>`，**Key 不存在时返回 `null`**

#### store.getWithHeaders(key, options?)

```js
const result = await store.getWithHeaders("document.pdf");
// result.body — 对象内容
// result.headers — 完整响应头（content-type, etag, cache-control 等）
```

返回值：`Promise<{ body: string; headers: Record<string, string>; } | null>`

#### store.delete(key)

```js
await store.delete("photos/cat.jpg");
```

"Key 不存在时不报错"，返回 `Promise<void>`

#### store.list(options?)

```js
// 列出所有对象
const { blobs } = await store.list();

// 按前缀过滤
const { blobs } = await store.list({ prefix: "photos/" });

// 按目录分组（只返回当前层级的文件和子目录）
const { blobs, directories } = await store.list({
  prefix: "photos/",
  directories: true,
});

// 强一致性
const { blobs } = await store.list({ consistency: "strong" });

// 手动分页
const page1 = await store.list({ paginate: false });
const page2 = await store.list({ paginate: false, cursor: page1.cursor });
```

参数：`prefix`、`directories`、`paginate`、`cursor`、`consistency`。默认**自动聚合所有分页**。
返回值：

```
{
  blobs: Array<{ key: string; etag: string }>;
  directories?: string[];  // 仅 directories: true 时返回
  cursor?: string;         // 仅 paginate: false 时返回
}
```

#### store.createUploadUrl(key, options?)

```js
const store = getStore("user-uploads");

const { url, key, expiresAt } = await store.createUploadUrl("files/photo.jpg");
```

- `options.expireSeconds`：URL 有效期（秒），**默认 3600**
- `options.contentType`：若提供，客户端 PUT 时必须携带相同的 Content-Type 头，否则 403
- 返回值：`{ url: string; key: string; expiresAt: number; }`
- 注意："生成的 URL 绑定 `PUT` 方法、指定的 Key、有效期窗口，以及 `Content-Type`（若设置）。任何不匹配的请求（其他方法、其他 Key、超出有效期、Content-Type 不一致）均返回 `403`。"

#### listStores(options?)

```js
import { listStores } from "@edgeone/pages-blob";

// 在 Pages Functions 中
const { stores } = await listStores();

// 外部访问
const { stores } = await listStores({
  projectId: "pages-urtsvuwmfvli",
  token: "your-api-token",
});
```

返回值：`{ stores: Array<{ name: string }>; }`

**客户端直传示例（原样）**：

```js
// 函数端：签发一次性上传 URL
import { getStore } from "@edgeone/pages-blob";

export async function onRequest({ request }) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { name, contentType } = await request.json();
  const store = getStore("user-uploads");

  const { url, key, expiresAt } = await store.createUploadUrl(
    `uploads/${Date.now()}-${name}`,
    {
      expireSeconds: 3600,
      contentType: contentType || "application/octet-stream",
    }
  );

  return new Response(JSON.stringify({ url, key, expiresAt }), {
    headers: { "Content-Type": "application/json" },
  });
}
```

```js
// 浏览器端：取到 URL 后直接 PUT，无需 SDK
async function uploadFile(file) {
  // 1. 向函数申请上传 URL
  const { url, key } = await fetch("/api/get-upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, contentType: file.type }),
  }).then((r) => r.json());

  // 2. 直接上传到 Blob
  await fetch(url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });

  return key;
}
```

### 4.3 免费额度与限制

- **存储空间（免费版）：1 GB** —— [限制与配额](https://pages.edgeone.ai/zh/document/limits-and-quotas)、[Blob 文档](https://pages.edgeone.ai/zh/document/blob-storage)（"免费版套餐下单账户存储容量为 1GB"）
- **单值大小：25 MB** —— [限制与配额](https://pages.edgeone.ai/zh/document/limits-and-quotas) Blob 表 + [存储概览](https://pages.edgeone.ai/zh/document/storage-overview)（"单值上限 25 MB"）
- **单次上传 / 请求体限制**：**文档里没找到**专门针对 Blob 的上传大小限制（可参考 Cloud Functions 请求/响应 body 6 MB 的通用限制）
- **SDK 语言支持**："当前提供 Node.js SDK（`@edgeone/pages-blob`），其他运行时的 SDK 正在开发中。"
- **命名空间数量上限**：**文档里没找到**（KV 有 10 个的上限，Blob 没说）

---

## 5. 静态托管与路由

### 5.1 函数 vs 静态文件的优先级 —— **静态资源优先**

原文（[Node.js](https://pages.edgeone.ai/zh/document/node-functions)）："**如果 Node.js 路由跟静态资源路由冲突，客户端请求将优先被路由到静态资源。**"

原文（[Edge Functions](https://pages.edgeone.ai/zh/document/edge-functions)）："如果 Edge Functions 路由跟静态资源路由冲突，客户端请求将优先被路由到静态资源。"

另外 SPA fallback 规则也遵循同一原则："请求优先匹配项目中的其他路由（包括静态资源和函数），仅在未命中任何其他路由时返回 `/index.html`" —— [edgeone.json](https://pages.edgeone.ai/zh/document/edgeone-json)

构建输出规范里也有 `{ "handle": "filesystem" }` 作为"**静态文件查找的分界标记**"，filesystem 之前的路由用于重定向/设置响应头，之后用于 API 路由/SSR/函数调用 —— [构建输出配置](https://pages.edgeone.ai/zh/document/building-output-configuration)

### 5.2 自定义 404 怎么配

来源：[自定义 404 页面](https://pages.edgeone.ai/zh/document/custom-404-page)

**通用规则（SSG / 静态输出）**："只需确保构建输出目录中有 `404.html` 文件，M 部署时将自动识别此文件，并在请求未匹配到任何路径时将其作为 404 页面返回。"

**SPA 注意**："单页应用**不能**在输出目录根路径下放置 404.html，会影响客户端的路由配置。" —— 用客户端路由兜底（React: `path="*"`；Vue: `path: '/:pathMatch(.*)*'`）

**各框架位置（原样）**：

- Hugo：在 `./layouts/` 或主题目录下的 `./themes/your-theme/layouts/` 创建 404.html
- Gatsby：在 `./src/pages/` 创建 404.js 或 404.tsx
- Next.js（Pages Router）：在 `pages` 目录下创建 `404.js` 或 `404.tsx`
- Next.js（App Router）：在 `app` 目录下（或任何路由段中）创建 `not-found.js` 或 `not-found.tsx`
- Nuxt.js：在 `app/` 目录里创建 `error.vue`
- **Astro：在 `src/pages/` 目录下创建 `404.astro`** —— "Astro 会在构建时自动识别并使用它。当服务器收到一个无法匹配任何页面的请求时，会渲染并返回 `404.astro` 页面的内容，并附带 404 状态码。"
- React Router (v7+)：在根路由文件 (app/root.tsx) 中导出 `ErrorBoundary` 组件
- SvelteKit：在 `src/routes/` 下创建 `+error.svelte`

**是否支持函数形式的 404**：**文档里没找到**（文档只讲静态文件/框架约定）。

### 5.3 响应头（自定义 headers）怎么配

**在 `edgeone.json` 的 `headers` 字段里配。** 不支持 `_headers` 文件——[从 Cloudflare Pages 迁移](https://pages.edgeone.ai/zh/document/migrating-from-cloudflare-pages-to-edgeone-pages) 明确说 `_headers` / `_redirects` 文件要迁移到 `edgeone.json`。

```json
{
    "headers": [
      {
        "source": "/*",
        "headers": [
          {
            "key": "X-Frame-Options",
            "value": "DENY"
          },
          {
            "key": "Cache-Control",
            "value": "max-age=7200"
          }
        ]
      }
    ]
}
```

限制："header 最大数量限制为 30 个"；"每个 header 的 key 限制为 1 - 100 个字符，允许使用数字、字母及特殊符号 '-'"；"每个 header 的 value 限制为 1 - 1000 个字符，**不支持中文**"

**URL 路径匹配规则**（`redirects`/`rewrites`/`headers` 通用）：

| 类型 | `source`示例 | 说明 |
| --- | --- | --- |
| 精确路径 | `/api/hello` | 仅匹配指定路径。 |
| 占位符 | `/articles/:id` | 匹配单级路径参数，可通过`:id`在`destination`中引用。 |
| 通配符 | `/assets/*` | `*`匹配任意内容，可通过`:splat`在`destination`中引用。 |
| 带后缀的通配符 | `/assets/*.png` | 匹配指定目录下的 PNG 路径，可通过`:splat`引用通配部分。 |

"'*' 为 URL 路径通配符，不是文件系统 Glob；`source` 中最多包含一个 `*`。"

### 5.4 重定向怎么配

也在 `edgeone.json` 的 `redirects` 字段（示例见 1.3）。格式：`{ "source", "destination", "statusCode" }`。

- 301 / 302 都支持
- destination 可以是站内路径或**外部绝对 URL**
- 支持 `$host` → `$wwwhost`（非 www 重定向到 www，**仅对自定义域名生效**）
- 限制：最多 100 条，source/destination 各不超过 500 字符

**如果想用函数做重定向**：Build Output API 的 `Source` 路由用 `headers.Location` + `status` 组合（[构建输出配置](https://pages.edgeone.ai/zh/document/building-output-configuration)）；或者用**中间件** `redirect(url, status)`（默认状态码 307）。

### 5.5 静态站点上挂一个 `/admin` 页面

**文档里没有专门讲"如何在静态站点上挂 /admin"的章节。** 但文档里可用于实现这一目标、且被明确写出的机制有：

1. **放一个函数文件**：`cloud-functions/admin/index.js`（国际站）或 `node-functions/admin/index.js`（中国站）→ 路由为 `example.com/admin`（依据 §2.4 的路由映射表：`/cloud-functions/api/visit/index.js` → `example.com/api/visit`）
2. **重写规则**：`rewrites` 把某个路径指到别的路径

```json
{
  "rewrites": [
    {
      "source": "/assets/*",
      "destination": "/assets-new/:splat"
    }
  ]
}
```

3. **直接作为静态输出的一部分**：构建产物里包含 `admin/index.html`，访问 `/admin` 即可（静态资源优先于函数）
4. **中间件按路径分流**：`middleware.js` 的 `config.matcher` 可以只匹配特定路径

```js
// middleware.js
export function middleware(context) {
    // 中间件逻辑
    return context.next();
}

// 配置路由匹配规则
export const config = {
  matcher: [
    '/:path*', // 匹配所有路由
  ],
};
```

```js
export const config = {
  matcher: '/about',
};
```

```js
export const config = {
  matcher: ['/api/:path*', '/about/:path*'],
};
```

⚠️ 中间件文档里"正则表达式匹配"那一段的代码块在抓取时被工具损坏了（原页面里应有 `/api/.*` 之类的正则示例），如需照抄请直接打开 [中间件文档](https://pages.edgeone.ai/zh/document/middleware)。

**一个可参考的官方真实案例**：[Agent 应用鉴权](https://pages.edgeone.ai/zh/document/agents-authentication) 展示了用 `middleware.js` 保护 `/chat`、`/agents/*` 等路径 + `cloud-functions/auth/*` 做登录的完整结构——这基本就是你 `/admin` 场景要的东西。

### 5.6 缓存

来源：[缓存配置](https://pages.edgeone.ai/zh/document/configuring-cache)

- 带哈希的文件（如 main.a1b2c3.js）：`max-age=31536000`（一年）
- 不带哈希的文件（如 index.html）：`max-age=0`
- 边缘缓存："这些资源在首次请求后会在 EdgeOne 节点上缓存，缓存时间最长为三个月。同时，**每次创建新部署后，边缘缓存会自动失效**"

---

## 6. 部署与回滚

### 6.1 构建部署页面能看到历史部署吗？——能

来源：[管理部署](https://pages.edgeone.ai/zh/document/manage-deploys)

- "在部署列表中，您可以浏览您曾经创建过的**任何部署**，并通过唯一的 URL 预览它，也可以查看每个部署的**构建日志及产物**。"
- 每个部署有唯一访问链接
- **构建日志**："记录了每次构建过程中的详细信息，包括常规的构建输出、成功消息、警告和失败的特别信息"
- **构建物料/构建产物**："列出了构建生成的所有文件。您可以在此列表中查看每个文件的名称和大小，还可以点击具体文件以查看其详细内容"

### 6.2 能不能一键回滚？——**文档里没有"回滚"这个功能**

文档里出现的是**「重新部署」**，不是 rollback：

- "在项目列表中单击**重新部署**，以重新构建最新的部署配置。" —— [触发部署](https://pages.edgeone.ai/zh/document/create-deploys)
- "在部署记录中选择特定的部署记录进行重新部署。"（同上）
- "您可以通过**「重新部署」**功能，以该部署的配置**重新创建一个部署**，从而恢复失效部署的访问。" —— [管理部署](https://pages.edgeone.ai/zh/document/manage-deploys)

**部署失效机制（重要）**："当成功状态的部署记录超过三条时，系统会自动清理最早的部署记录对应的构建产物。"而 [部署概览](https://pages.edgeone.ai/zh/document/deployment-overview) 补充："Makers 会按照时间顺序保留前三条部署的构建产物，并将其他成功状态的部署记录标记为**已失效**。同时，**失效的部署将返回 401 状态代码**。"

👉 **所以：文档里没有描述"一键回滚/回退到某个历史版本"的按钮**；能做的动作是"以某次部署的配置重新创建一个部署"。**是否有真正的 rollback 功能，文档里没找到。**

### 6.3 每次 `git push` 都会自动部署吗？

三处说法**有张力**，都列出：

- [导入 Git 仓库](https://pages.edgeone.ai/zh/document/importing-a-git-repository)："当新的提交推送到部署分支时，EdgeOne 将自动拉取并部署最新的提交。"
- [部署概览](https://pages.edgeone.ai/zh/document/deployment-overview)："将代码推送至连接的 Git 存储库的开发分支。**每次推送都会自动触发一次部署。**"
- [触发部署](https://pages.edgeone.ai/zh/document/create-deploys)："将 Makers 项目与 Git 仓库关联后，系统会自动监听推送事件并触发部署。**目前默认只有主分支的提交才会自动触发部署。**"
- [构建指南](https://pages.edgeone.ai/zh/document/build-guide) 环境管理中有一个 **"自动部署"开关**："开启后，每次符合条件的代码提交合并都会新建一个部署。"生产环境关联生产分支（如 main），预览环境关联所有未分配到其他环境的 Git 分支。

👉 综合看：**默认生产分支（main）的 push 会自动部署；其它分支进预览环境**。开发分支是否每次 push 都触发，取决于该环境的"自动部署"开关和"符合条件的代码提交"的定义——**"符合条件"具体指什么，文档里没找到明确定义**。

### 6.4 能不能手动触发？——能，四种方式

1. **控制台**：项目列表单击**重新部署**；或在部署记录中选择特定记录重新部署
2. **部署钩子（Deploy Hook）**：`项目设置 - 部署钩子 → 新建部署钩子`（输入名称、选择分支）→ 得到一个唯一 URL → 用 **HTTP POST** 调用即可触发对应分支的部署。
   原文警告："部署钩子与您的项目唯一关联，**无需额外认证**。请务必妥善保护这些 URL，避免泄露。"
3. **CLI**：`edgeone makers deploy`（见 6.5）
4. **SDK**：`makers.deployments.deploy({ projectId, artifact })` —— [创建部署](https://pages.edgeone.ai/zh/document/sdk-creating-a-deployment)

```js
import { Makers } from "@edgeone/makers-sdk";

const makers = new Makers({
  token: process.env.MAKERS_API_TOKEN,
  region: "china",
});
// ...
const deployment = await makers.deployments.deploy({
  projectId,
  artifact: { files: { "index.html": "<h1>Hello</h1>" } },
});
```

### 6.5 能不能只部署不构建？——**可以**

CLI 文档原文：

- "执行 deploy 时，CLI **会自动构建**并部署至 Makers，无需指定文件夹；**若手动构建，则需将 Makers Functions 相关文件夹及 package.json 放入输出目录（如 dist），再执行 `edgeone makers deploy ./dist`**"
- 参数：`<directoryOrZip>`（需要部署的文件夹或 ZIP 包路径）、`-n, --name`、`-e, --env`（production 或 preview，默认 production）、`--anonymous`、`--site`（china 或 global）
- CLI 也可以把"构建完的产物以文件夹或 Zip 包的形式上传至 Makers 平台"（概述原文）

```bash
# 生产环境部署
edgeone makers deploy

# 预览环境部署
edgeone makers deploy -e preview

# CI/CD：跳过 Git，直接部署产物
edgeone makers deploy [<directoryOrZip>] -n <projectName> -t <token> [-e <env>]
```

**SDK 路线也是"只部署不构建"**：`artifact` 可为 `files`、`directory` 或 `archive`，直接给文件内容即可，无需构建。

**注意（CLI）**："如果需 link 已存在的项目，必须为**直接上传类型**。"还有："在控制台开通 Makers 服务，创建新的 Makers 项目，并将其克隆到本地"是前置条件。

`edgeone makers deploy` 若不带 `<directoryOrZip>` 时会自动构建；带路径时按你给的产物部署。

---

## 7. 域名与 HTTPS

### 7.1 自定义域名怎么绑

来源：[自定义域名](https://pages.edgeone.ai/zh/document/custom-domain)

**步骤（原文）**：

1. 进入控制台：进入项目详情，切换到"**域名管理**"页面
2. 添加域名：单击**添加自定义域名**
3. 输入域名："在弹窗输入您的**根域名（例如：example.com）或子域名（例如：www.example.com）**"
4. 验证归属权：根据弹窗中的指引，在域名所在注册商添加解析记录
5. 添加 CNAME：在域名所在注册商配置 CNAME 记录

**备案要求（原文）**："当项目加速区域为'中国大陆可用区'或'全球可用区（含中国大陆）'时添加的域名需先在工信部完成备案。"

**CNAME 目标值格式**（[配置 DNS 的 CNAME 记录](https://pages.edgeone.ai/zh/document/how-to-configure-a-dns-cname-record)）：形如 `a4285573.xxx.example.com.dns.edgeone.site.`，"注意只能填写域名，不能包含 IP 地址"。文档以 GoDaddy 为例，Name 填子域名（如 `www`，或 `@` 表示主域名），Type 选 CNAME。

**CNAME 生效检测**："平台将自动检测当前 CNAME 状态是否已生效，如果在域名管理列表的状态一栏显示当前 CNAME 已生效，则当前域名已正确配置并开启加速。"

**关联环境**："EdgeOne Makers 支持将自定义域名关联至特定的项目环境（生产或预览）……**无论关联何种环境，自定义域名将始终自动指向该环境下最新的成功部署**……在域名的'编辑'界面，您可以随时更改域名所关联的环境。"
注意："请确保所选关联环境下已存在有效的部署记录。若域名关联的环境下所有部署均被删除，访问该域名时将返回 404。"

**HTTP/2 注意**："当前自定义域名需已配置 SSL 证书。"

**域名数量配额**：自定义域名 **200 个**（免费版）—— [限制与配额](https://pages.edgeone.ai/zh/document/limits-and-quotas)。**单项目**上限与站点级上限的区分，文档里没细说。

### 7.2 免费证书怎么申请

来源：[申请免费证书](https://pages.edgeone.ai/zh/document/apply-for-free-certificate)

- "EdgeOne 提供可**自动申请、自动续签、自动部署**的免费证书"
- **颁发机构**："免费证书由 TrustAsia 和 Let's Encrypt 机构颁发，不支持下载且不提供 SLA 保障"
- **有效期**："证书有效期为 **90 天**，到期前 **15 天**平台将自动为您申请续期，无需您手动更新。"
- **三种验证方式**：自动验证 / DNS 委派验证 / 文件验证
  - **自动验证**："自动验证可以在域名 CNAME 生效后，自动完成免费证书申请及部署……请确保在一小时内为当前域名配置 CNAME 指向 EdgeOne 并且避免使用分线路/分区域解析，才可以完成 CA 校验。"注意："使用自动验证申请免费证书，在免费证书申请完成前，该域名的 HTTPS 访问暂时不可用。"
  - **DNS 委派验证**："适用于用户希望在加速生效前完成免费证书申请，**或者希望申请泛域名证书**"
  - **文件验证**："需要在当前域名下的指定路径下，创建指定的文件和文件中所包含的验证值，并且保障该文件是可以被访问到的"
- **泛域名**：只支持 DNS 委派验证（原文错误提示："当前站点仅支持通过 DNS 委派验证的方式申请泛域名证书，请重新选择免费证书验证方式。"）
- **操作步骤**：域名管理 → 选择域名的 HTTPS 列点**配置** → 边缘 HTTPS 证书卡片点**配置** → 配置方式选**申请免费证书** → 选验证方式 → 保存

**HTTPS 是否自动开启？（文档自相矛盾，都列出）**

- [HTTPS 配置概览](https://pages.edgeone.ai/zh/document/configuring-an-https-certificate)："**Makers 不会自动为您的域名分配 HTTPS 证书**，但鉴于安全性，可信度，搜索排名等因素我们强烈建议您完善 HTTPS 配置。"
- [常见问题](https://pages.edgeone.ai/zh/document/faqs)：第 3 题 "如何设置自定义域名？……**设置成功后平台会自动为您提供 SSL 证书。**"
- [自定义域名](https://pages.edgeone.ai/zh/document/custom-domain)："当前自定义域名需已配置 SSL 证书。"

👉 **建议按"需要手动去域名管理里申请免费证书"来准备**（以更详细、更专门的 HTTPS 文档为准）。

**其他 HTTPS 选项**（[HTTPS 配置概览](https://pages.edgeone.ai/zh/document/configuring-an-https-certificate)）：强制 HTTPS 访问（301/302）、启用 HSTS（加 `Strict-Transport-Security` 头）、OCSP 装订。
**SSL 托管证书**：可上传自有证书，"最多支持同时部署一本 RSA、ECC、SM2 证书到 EdgeOne 节点中"（[使用 SSL 托管证书](https://pages.edgeone.ai/zh/document/using-managed-ssl-certificate)）

### 7.3 后台地址能不能是子域名（如 admin.xxx.top）？

**能。** 文档明确写了可以输入子域名：

> "输入域名：在弹窗输入您的根域名（例如：example.com）**或子域名（例如：www.example.com）**。" —— [自定义域名](https://pages.edgeone.ai/zh/document/custom-domain)

另外配额是**自定义域名 200 个**，且"灵活性：支持配置多个自定义域名，便于管理不同市场或用途"——所以给 `admin.xxx.top` 单独绑一个域名是有文档依据的。

配套建议（文档提到的、与"后台子域名"直接相关的能力）：

- 用**中间件** `matcher` 只保护 `/admin/*` 路径，或按 host 分流（[中间件](https://pages.edgeone.ai/zh/document/middleware) 的使用场景明确列了"访问控制：基于请求信息进行 Token 鉴权校验、IP/地域限制、Referer 防盗链等访问拦截"，以及"灰度发布与 A/B 测试：按用户标识、Cookie、地域、UA 等特征将请求分流"）
- 中间件 context 里有 `clientIp` 和 `geo`（含 `countryCodeAlpha2`、`cityName`、`asn` 等），可以做地域/ASN 白名单
- 用 `edgeone.json` 的 `redirects` 做 `$host` → `$wwwhost` 这类域名级跳转（**仅对自定义域名生效**）

**"admin 子域名必须与主站同一个项目/同一个站点"**——文档里没找到这类限制说明。

---

## 8. 私有仓库

**⚠️ 结论：文档里没找到明确说明 EdgeOne Pages/Makers 是否支持导入私有 GitHub 仓库，也没找到授权方式（GitHub App / OAuth / Deploy Key / 访问令牌）的具体描述。**

我查过并逐字确认的、最接近的原文（[导入 Git 仓库](https://pages.edgeone.ai/zh/document/importing-a-git-repository)）：

- "**Makers 目前支持 GitHub，GitLab，Bitbucket，Gitee，CNB 等 Git 提供商的接入**"
- "绑定 GitHub：在控制台页面，单击 **Github** 以连接您的仓库。"
- "授权 GitHub：**授予 EdgeOne 访问您仓库的权限。**"（配图：GitHub 授权页截图）
- "选择仓库：**选择您要部署的仓库或授权所有仓库。**"（配图：仓库列表勾选页截图）

英文版同一段："Authorize GitHub: Grant EdgeOne permission to access your repository." / "Select warehouse: Select the warehouse you want to deploy or authorize all."

这里的关键词是 "**Grant EdgeOne permission to access your repository**" 和 "**选择您要部署的仓库或授权所有仓库**"——**这套流程（OAuth/GitHub App 授权 + 按仓库勾选权限）在 GitHub 上通常正是用来同时覆盖公有和私有仓库的**，但**文档没有一句话说"支持私有仓库"**，也没写用的是 GitHub App 还是 OAuth App，更没提 Deploy Key 或 Personal Access Token。

唯一另一处沾边的原文（[快速开始（中国站旧文档）](https://edgeone.cloud.tencent.com/pages/document/162936669376004096)）：用模板创建仓库时会"**设置新模板仓库的类型**，然后点击'创建'"——但这说的是**由模板新建仓库**时选类型，不是导入已有私有仓库。

**建议**：这一点不要照文档猜，直接在控制台绑定 GitHub 时看授权页面（会显示是哪个 GitHub App 以及权限范围），或对 `admin.xxx.top` 这个用途先用公有仓库跑通再验证私有。

---

## 9. 不确定 / 文档没写的点（汇总）

按问题编号列，这些是我**明确没在文档里找到**，或**文档自相矛盾**的地方：

### 文档自相矛盾（务必实测）
1. **Cloud Functions 的源码目录名**：国际站 `cloud-functions` vs 中国站 `node-functions`（最影响落地的一条，见开头）
2. **KV 单值上限**：KV 文档/存储概览说 **25 MB**，限制与配额说 **1 MB**
3. **Blob SDK 包名**：Blob 文档 `@edgeone/pages-blob` vs 存储概览 `@tencent/pages-blob`
4. **HTTPS 是否自动分配**：HTTPS 概览说"不会自动分配"，FAQ 说"自动为您提供 SSL 证书"
5. **构建预装 Node 版本清单**：构建指南 10 个版本（含 24.x）vs edgeone.json 文档 5 个版本
6. **push 是否总触发部署**：部署概览说"每次推送都会自动触发"，触发部署说"目前默认只有主分支"
7. **Cloud Functions 的 EventContext 是否含 `request`**：属性列表里没有，但所有示例都在用

### 文档里没找到
8. **Cloud Functions 的内存规格**（只有免费版总内存时长 50 万 GB-s/月；构建机 4C6G 不是运行时规格）
9. **Node 函数里 `waitUntil`** —— Cloud Functions 文档完全没提（只有 Edge Functions 有）
10. **"是否支持 Node 全部内置模块"** 的明确结论／清单（只有 `node:os`、`node:crypto`、`process` 的示例可作证据）
11. **Node 函数里环境变量到底该用 `context.env.X` 还是 `process.env.X`** —— 两种写法都在官方示例里出现过，没有对比说明
12. **KV 绑定变量名与 `env` 的关系** —— KV 示例用裸的 `my_kv`，同时又解构了 `env`，没有解释
13. **KV 的 TTL / 过期时间参数** —— `put` 签名里没有
14. **KV 的读写次数配额与超额计费** —— 限制与配额 KV 表只有存储空间和单值大小两行
15. **Blob 命名空间数量上限**、**Blob 单次上传大小上限**
16. **Blob 是否支持在 Edge Functions 之外的运行时** —— 存储概览说"Edge Functions / Cloud Functions"，但 Blob 文档标题写"面向 Makers Functions"、SDK 只有 Node.js 版，两者对"Edge Functions 是否支持"表述不完全一致
17. **一键回滚功能** —— 文档只描述「重新部署」，没有"回滚/回退到历史版本"的按钮或 API
18. **"自动部署"开关里"符合条件的代码提交"具体定义**
19. **Astro 项目导入时默认的构建命令与输出目录字面值**（没有 Astro 的 `npm run build` / `dist` 对照表）
20. **函数形式的 404 页面**是否支持
21. **私有仓库支持情况与授权方式**（GitHub App / OAuth / Deploy Key / PAT）—— 见第 8 节
22. **`/admin` 这类子路径页面的专门文档** —— 没有专章，只能组合使用函数路由 + rewrites + 静态输出 + 中间件
23. **admin 子域名是否必须与主站同一项目** —— 没有限制说明
24. **edgeone.json 的 `devCommand` 字段** 只在 CLI 文档里被提到，没进 edgeone.json 字段列表

### 抓取时被工具损坏、需要看原页面的代码块
25. [中间件](https://pages.edgeone.ai/zh/document/middleware) 的"正则表达式匹配"示例
26. [构建输出配置](https://pages.edgeone.ai/zh/document/building-output-configuration) 的全部 json 示例（正则里的 `$`、`)` 被占位符替换）

---

## 10. 我实际抓取过的 URL 清单

**成功（HTTP 200）**：

- https://pages.edgeone.ai/llms.txt （文档索引，很有用）
- https://pages.edgeone.ai/zh/document/importing-a-git-repository · https://pages.edgeone.ai/document/importing-a-git-repository
- https://pages.edgeone.ai/zh/document/edgeone-json · https://pages.edgeone.ai/document/edgeone-json
- https://pages.edgeone.ai/zh/document/build-guide
- https://pages.edgeone.ai/zh/document/building-output-configuration
- https://pages.edgeone.ai/zh/document/framework-astro
- https://pages.edgeone.ai/zh/document/node-functions · https://pages.edgeone.ai/document/node-functions
- https://pages.edgeone.ai/zh/document/cloud-functions
- https://pages.edgeone.ai/zh/document/pages-functions-overview
- https://pages.edgeone.ai/zh/document/edge-functions
- https://pages.edgeone.ai/zh/document/limits-and-quotas
- https://pages.edgeone.ai/zh/document/kv-storage
- https://pages.edgeone.ai/zh/document/blob-storage
- https://pages.edgeone.ai/zh/document/storage-overview
- https://pages.edgeone.ai/zh/document/pages-kv-integration
- https://pages.edgeone.ai/zh/document/custom-404-page
- https://pages.edgeone.ai/zh/document/middleware
- https://pages.edgeone.ai/zh/document/configuring-cache
- https://pages.edgeone.ai/zh/document/deployment-overview
- https://pages.edgeone.ai/zh/document/create-deploys
- https://pages.edgeone.ai/zh/document/manage-deploys
- https://pages.edgeone.ai/zh/document/custom-domain
- https://pages.edgeone.ai/zh/document/domain-overview
- https://pages.edgeone.ai/zh/document/apply-for-free-certificate
- https://pages.edgeone.ai/zh/document/configuring-an-https-certificate
- https://pages.edgeone.ai/zh/document/using-managed-ssl-certificate
- https://pages.edgeone.ai/zh/document/how-to-configure-a-dns-cname-record
- https://pages.edgeone.ai/zh/document/faqs · https://pages.edgeone.ai/document/faqs
- https://pages.edgeone.ai/zh/document/project-management
- https://pages.edgeone.ai/zh/document/edgeone-cli
- https://pages.edgeone.ai/zh/document/sdk-environment-variable
- https://pages.edgeone.ai/zh/document/sdk-creating-a-deployment
- https://pages.edgeone.ai/zh/document/agents-authentication
- https://pages.edgeone.ai/zh/document/makers-models-integration
- https://pages.edgeone.ai/zh/document/migrating-from-vercel-to-edgeone-pages
- https://pages.edgeone.ai/zh/document/migrating-from-cloudflare-pages-to-edgeone-pages
- https://edgeone.cloud.tencent.com/pages/document/184787642236784640 （中国站 Node Functions）
- https://edgeone.cloud.tencent.com/pages/document/162936669376004096 （中国站 快速开始）
- https://makers.edgeone.link/document/node-functions （中国站镜像）
- https://cloud.tencent.com/document/product/1552/127369 （中国站 导入 Git 仓库）

**失败 / 无法获取**：

- https://pages.edgeone.ai/zh/document （404）
- https://pages.edgeone.ai/llms-full.txt （404，不存在全文版）
- 多次出现 `unsupported content type "unknown"` 的瞬时错误（pages-functions-overview、custom-404-page、custom-domain、faqs 等首次抓取失败后重试成功）

**方法说明**：`pages.edgeone.ai` 的文档页正文被巨大的侧边栏导航挤到截断位置，直接抓会拿不到正文。**在 URL 后加 `.md` 可以拿到完整干净的 Markdown 全文**，本报告绝大部分内容是通过这种方式获取的。
