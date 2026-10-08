/* =========================================================
 *  本地预览云端后台（用完即删）
 *  ---------------------------------------------------------
 *  起一个假 GitHub + 一个静态服务器，让浏览器能打开云端版的 /admin/
 *  用来在推上 EdgeOne 之前先看界面、点一遍功能。
 *
 *  跑法：node admin/_preview-cloud.mjs   然后开 http://127.0.0.1:4399/admin/
 * ======================================================= */

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startFakeGitHub } from '../node-functions/_lib/fake-github.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI_DIR = path.join(ROOT, 'node-functions', 'admin');
const PORT = 4399;

/* 假仓库：放一份和真实项目相近的内容 */
const FIXTURE = {
  'src/data/config.js': await fsp.readFile(path.join(ROOT, 'src/data/config.js'), 'utf8').catch(() => 'export default {};'),
  'src/data/videos.js': await fsp.readFile(path.join(ROOT, 'src/data/videos.js'), 'utf8').catch(() => 'export default [];'),
  'src/data/links.js': await fsp.readFile(path.join(ROOT, 'src/data/links.js'), 'utf8').catch(() => 'export default [];'),
  'src/data/photo-meta.js': await fsp.readFile(path.join(ROOT, 'src/data/photo-meta.js'), 'utf8').catch(() => 'export default {};'),
  'public/assets/css/style.css': await fsp.readFile(path.join(ROOT, 'public/assets/css/style.css'), 'utf8').catch(() => ':root { --rose: #e0466f; }')
};

// 把真实的笔记也放进去，界面才有东西看
const blogDir = path.join(ROOT, 'blog');
async function addNotes(dir, rel) {
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) await addNotes(path.join(dir, e.name), r);
    else if (/\.(md|jpg|png|webp)$/i.test(e.name)) {
      const buf = await fsp.readFile(path.join(dir, e.name));
      FIXTURE['blog/' + r] = buf;
    }
  }
}
await addNotes(blogDir, '').catch(() => {});

const gh = await startFakeGitHub(FIXTURE);
console.log('假 GitHub 已启动:', gh.baseUrl);
console.log('仓库里的文件数:', Object.keys(gh.files()).length);

const env = {
  GITHUB_TOKEN: 'fake-token',
  GITHUB_OWNER: 'IRinsho',
  GITHUB_REPO: 'IRinsho_web',
  GITHUB_BRANCH: 'main',
  GITHUB_API_BASE: gh.baseUrl
};

const { onRequest } = await import('../node-functions/api/admin/index.js');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg'
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  // ---- API：交给云端函数处理 ----
  if (url.pathname.startsWith('/api/admin')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);

    const request = new Request('http://127.0.0.1:' + PORT + req.url, {
      method: req.method,
      headers: req.headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : body
    });

    const response = await onRequest({ request, env, clientIp: '127.0.0.1' });
    const headers = {};
    for (const [k, v] of response.headers) headers[k] = v;
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }

  // ---- 图片：从假仓库里读 ----
  if (url.pathname.startsWith('/img/')) {
    const p = decodeURIComponent(url.pathname.slice(1));
    const buf = gh.raw(p);
    if (buf) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      res.end(buf);
      return;
    }
    res.writeHead(404); res.end('not found');
    return;
  }

  // ---- 界面静态文件 ----
  let rel = url.pathname.replace(/^\/admin\/?/, '') || 'index.html';
  const file = path.join(UI_DIR, rel);
  if (file.startsWith(UI_DIR) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain', 'Cache-Control': 'no-store' });
    res.end(await fsp.readFile(file));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  云端后台预览: http://127.0.0.1:' + PORT + '/admin/');
  console.log('  （用假 GitHub 当后端，随便改都不影响真仓库）');
  console.log('');
});

process.on('SIGINT', async () => { await gh.close(); process.exit(0); });
