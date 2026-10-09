/* 全面验证：所有数据文件在云端都能正确读取与修改（用完即删） */
import fs from 'node:fs/promises';
import { startFakeGitHub } from '../node-functions/_lib/fake-github.mjs';

const read = (p) => fs.readFile(p, 'utf8').catch(() => null);

const FIXTURE = {
  'src/data/config.js': await read('src/data/config.js'),
  'src/data/videos.js': await read('src/data/videos.js'),
  'src/data/links.js': await read('src/data/links.js'),
  'src/data/photo-meta.js': await read('src/data/photo-meta.js'),
  'public/assets/css/style.css': await read('public/assets/css/style.css')
};

const gh = await startFakeGitHub(FIXTURE);

/* 把真实的笔记也放一份进假仓库，否则测不到笔记相关功能 */
const blogDir = 'blog';
for (const dirent of await fs.readdir(blogDir, { withFileTypes: true, recursive: true }).catch(() => [])) {
  if (!dirent.isFile()) continue;
  const full = dirent.parentPath ? `${dirent.parentPath}/${dirent.name}` : `${blogDir}/${dirent.name}`;
  if (!/\.(md|png|jpe?g|webp)$/i.test(dirent.name)) continue;
  if (dirent.name.startsWith('.')) continue;
  gh.set(full, await fs.readFile(full));
}
console.log('假仓库里的文件数:', Object.keys(gh.files()).length);

const env = {
  GITHUB_TOKEN: 't', GITHUB_OWNER: 'o', GITHUB_REPO: 'r',
  GITHUB_BRANCH: 'main', GITHUB_API_BASE: gh.baseUrl
};
const { onRequest } = await import('../node-functions/api/admin.js');

let cookie = '';
async function call(action, opts = {}) {
  const [name, query] = action.split('?');
  const url = 'https://x/api/admin?action=' + name + (query ? '&' + query : '');
  const res = await onRequest({
    request: new Request(url, {
      ...opts,
      headers: {
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {})
      }
    }),
    env
  });
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

await call('setup', { method: 'POST', body: JSON.stringify({ password: 'test-123456' }) });

let pass = 0, fail = 0;
const check = (ok, label, detail = '') => {
  if (ok) { pass++; console.log('  \x1b[32m✓\x1b[0m ' + label); }
  else { fail++; console.log('  \x1b[31m✗\x1b[0m ' + label + (detail ? '  → ' + detail : '')); }
};

console.log('\n--- 读数据文件（这几个都是 export default，最容易踩注释坑）---');
const cfg = await call('config');
check(cfg.status === 200 && cfg.data.config && cfg.data.config.site === 'https://irinsho.top',
  'config.js 能读', cfg.status + ' ' + JSON.stringify(cfg.data).slice(0, 120));
check(cfg.data.vars && Object.keys(cfg.data.vars).length > 20, '配色变量读到了 ' + Object.keys(cfg.data.vars || {}).length + ' 个');

const vids = await call('videos');
check(vids.status === 200 && Array.isArray(vids.data.videos) && vids.data.videos.length === 4,
  'videos.js 能读（4 条）', JSON.stringify(vids.data).slice(0, 120));

const links = await call('links');
check(links.status === 200 && Array.isArray(links.data.links) && links.data.links.length === 2,
  'links.js 能读（2 条）', JSON.stringify(links.data).slice(0, 120));

const photos = await call('photos');
check(photos.status === 200 && Array.isArray(photos.data.photos), '相册能读',
  JSON.stringify(photos.data).slice(0, 120));

const notes = await call('notes');
check(notes.status === 200 && notes.data.notes.length > 5, '笔记能读（' + (notes.data.notes || []).length + ' 篇）');

const dash = await call('dashboard');
check(dash.status === 200 && dash.data.counts.notes > 5,
  '仪表盘能读', JSON.stringify(dash.data.counts || {}));

console.log('\n--- 写数据文件 ---');
const w1 = await call('config', { method: 'POST', body: JSON.stringify({ changes: { author: '__自测作者__' } }) });
check(w1.status === 200 && w1.data.changed && w1.data.changed.includes('author'), '改 config.js 顶层字段',
  JSON.stringify(w1.data));
check((gh.files()['src/data/config.js'] || '').includes('__自测作者__'), '改动确实写进仓库了');

const w2 = await call('videos', {
  method: 'POST',
  body: JSON.stringify({ index: null, video: { title: '__自测视频__', date: '2026-10-09' } })
});
check(w2.status === 200, '新增视频', JSON.stringify(w2.data));
const v2 = await call('videos');
check(v2.data.videos.length === 5, '视频数变成 5', String(v2.data.videos.length));

const w3 = await call('links', {
  method: 'POST',
  body: JSON.stringify({ index: null, link: { name: '__自测友链__', url: 'https://example.com/' } })
});
check(w3.status === 200, '新增友链', JSON.stringify(w3.data));

const w4 = await call('theme', { method: 'POST', body: JSON.stringify({ vars: { '--rose': '#ff0000' } }) });
check(w4.status === 200 && (w4.data.changed || []).includes('--rose'), '改配色', JSON.stringify(w4.data));

console.log('\n--- 笔记读写 ---');
const first = notes.data.notes[0];
const one = await call('note?rel=' + encodeURIComponent(first.rel));
check(one.status === 200 && one.data.note && one.data.note.body !== undefined,
  '读单篇（含正文）', one.status + ' ' + JSON.stringify(one.data).slice(0, 100));

if (one.status === 200) {
  const save = await call('note', {
    method: 'POST',
    body: JSON.stringify({ rel: first.rel, fields: one.data.note.fields, body: one.data.note.body })
  });
  check(save.status === 200, '原样保存', JSON.stringify(save.data).slice(0, 150));
}

console.log('\n--- 预览与体检 ---');
const pv = await call('preview', { method: 'POST', body: JSON.stringify({ markdown: '# 标题\n\n**粗体**\n\n[[练习]]' }) });
check(pv.status === 200 && /<h1/.test(pv.data.html || ''), '预览渲染', (pv.data.html || '').slice(0, 60));

const hl = await call('health');
check(hl.status === 200 && hl.data.scanned, '内容体检', JSON.stringify(hl.data.scanned || {}));

console.log('\n' + (fail === 0
  ? `\x1b[32m全部通过（${pass} 项）\x1b[0m`
  : `\x1b[31m${fail} 项失败 / 共 ${pass + fail} 项\x1b[0m`));

await gh.close();
process.exit(fail === 0 ? 0 : 1);
