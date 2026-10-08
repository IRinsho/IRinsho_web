/* =========================================================
 *  后台接口测试（端到端）
 *  跑法：npm run admin:test:api
 *
 *  做法：把项目里需要的内容文件复制到一个**系统临时目录**，
 *       在那个沙盒里起一个后台实例（随机端口），
 *       把所有写入接口跑一遍。
 *  → 你真实的笔记 / 照片 / 配置一个字都不会被碰到。
 * ======================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL_ROOT = path.resolve(HERE, '..', '..');
const PASSWORD = 'irinsho-test-123';

/* 需要复制进沙盒的东西（够后台跑起来就行） */
const COPY = [
  'src/data/config.js',
  'src/data/videos.js',
  'src/data/links.js',
  'src/data/photo-meta.js',
  'src/lib/markdown.js',
  'shared/markdown.js',        // ⚠ src/lib/markdown.js 只是转发到这里，少了它预览就崩
  'public/assets/css/style.css',
  'public/admin/index.html',
  'public/admin/admin.css',
  'public/admin/admin.js'
];

let sandbox = null;
let base = '';
let cookie = '';
let server = null;

async function makeSandbox() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'irinsho-api-test-'));
  const missing = [];
  for (const rel of COPY) {
    const from = path.join(REAL_ROOT, rel);
    const to = path.join(root, rel);
    await fs.mkdir(path.dirname(to), { recursive: true });
    try {
      await fs.copyFile(from, to);
    } catch {
      missing.push(rel);       // 别静默跳过 —— 漏文件会让测试报出莫名其妙的错
    }
  }
  if (missing.length) {
    throw new Error('沙盒缺少这些文件，请补进 COPY 列表：' + missing.join('、'));
  }
  // 一篇笔记 + 一张图片
  await fs.mkdir(path.join(root, 'blog', 'c语言学习'), { recursive: true });
  await fs.writeFile(path.join(root, 'blog', '练习.md'), `---
tags:
  - C语言
title: 随笔练习
pinned: "true"
---

\`\`\`
int main() { return 0; }
\`\`\`
`, 'utf8');
  await fs.mkdir(path.join(root, 'img'), { recursive: true });
  await fs.writeFile(path.join(root, 'img', 'a.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  return root;
}

async function req(p, opts = {}) {
  const res = await fetch(base + p, {
    ...opts,
    headers: {
      ...(opts.body && !(opts.body instanceof Buffer) ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(opts.headers || {})
    }
  });
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

const read = (rel) => fs.readFile(path.join(sandbox, rel), 'utf8');
const write = (rel, t) => fs.writeFile(path.join(sandbox, rel), t, 'utf8');
const syntaxOk = (rel) => spawnSync(process.execPath, ['--check', path.join(sandbox, rel)]).status === 0;

/* ---------- 起沙盒实例 ---------- */
test('启动沙盒后台实例', async () => {
  sandbox = await makeSandbox();
  process.env.ADMIN_ROOT = sandbox;
  process.env.ADMIN_QUIET = '1';
  const mod = await import('../server/admin-server.mjs');
  const started = await mod.startServer({ port: 0, quiet: true });
  server = started.server;
  base = `http://127.0.0.1:${started.port}`;
  assert.ok(started.port > 0);

  const s = await req('/api/session');
  assert.equal(s.status, 200);
  assert.equal(s.data.configured, false, '沙盒里应该是全新状态');
  const setup = await req('/api/setup', { method: 'POST', body: JSON.stringify({ password: PASSWORD }) });
  assert.equal(setup.status, 200);
  assert.equal((await req('/api/session')).data.authed, true);
});

/* ---------- 读接口 ---------- */
test('读接口全部可用', async () => {
  for (const p of ['/api/dashboard', '/api/notes', '/api/photos', '/api/videos',
    '/api/links', '/api/config', '/api/theme', '/api/health', '/api/build/state']) {
    const r = await req(p);
    assert.equal(r.status, 200, p + ' 应该 200');
  }
});

test('未登录访问受保护接口会被拒', async () => {
  const saved = cookie;
  cookie = '';
  const r = await req('/api/notes');
  assert.equal(r.status, 401);
  cookie = saved;
});

/* ---------- 笔记 ---------- */
test('笔记：读 + 原样保存 + 保真', async () => {
  const rel = '练习.md';
  const orig = await read('blog/' + rel);
  const n = (await req('/api/note?rel=' + encodeURIComponent(rel))).data.note;
  assert.equal(n.fields.pinned, true, '带引号的 true 要认出来');

  const save = await req('/api/note/save', {
    method: 'POST',
    body: JSON.stringify({ rel, fields: n.fields, body: n.body })
  });
  assert.equal(save.status, 200);

  const after = await read('blog/' + rel);
  const norm = (t) => t.replace(/\r\n/g, '\n').replace(/^pinned: "true"$/m, 'pinned: true');
  assert.equal(norm(after), norm(orig), '只允许 pinned 规范化，其余不变');
  assert.match(after, /^pinned: true$/m);
});

test('笔记：新建 → 改名 → 删除', async () => {
  const c = await req('/api/note/create', {
    method: 'POST', body: JSON.stringify({ title: '__接口自测__', date: '2026-10-10', folder: '测试' })
  });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  const rel = c.data.rel;
  assert.ok(rel.startsWith('测试/'));

  const newRel = '测试/__接口自测改名__.md';
  const rn = await req('/api/note/save', {
    method: 'POST',
    body: JSON.stringify({ rel, renameTo: newRel, fields: { title: '__接口自测改名__', date: '2026-10-10', tags: [], draft: true }, body: '正文\n' })
  });
  assert.equal(rn.status, 200, JSON.stringify(rn.data));
  await assert.rejects(fs.stat(path.join(sandbox, 'blog', rel)), '旧文件应已删除');
  assert.ok(await fs.stat(path.join(sandbox, 'blog', newRel)));

  assert.equal((await req('/api/note/delete', { method: 'POST', body: JSON.stringify({ rel: newRel }) })).status, 200);
});

/* ---------- 站点配置 ---------- */
test('配置：改顶层字段（注释与排版要保住）', async () => {
  const orig = await read('src/data/config.js');
  const r = await req('/api/config/save', { method: 'POST', body: JSON.stringify({ changes: { author: '__自测作者__' } }) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.changed, ['author']);
  const after = await read('src/data/config.js');
  assert.match(after, /author: "__自测作者__"/);
  assert.ok(after.includes('export default'), '文件结构还在');
  assert.ok(syntaxOk('src/data/config.js'), '语法正确');
  await write('src/data/config.js', orig);
});

test('配置：改嵌套字段 me.*', async () => {
  const orig = await read('src/data/config.js');
  const r = await req('/api/config/save', {
    method: 'POST',
    body: JSON.stringify({ changes: { 'me.friend.url': 'https://example.com/x' }, targetKeys: ['me'] })
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  // 报出来的路径是「顶层键.子键」，便于界面上显示改了什么
  assert.deepEqual(r.data.changed, ['me.friend']);
  const after = await read('src/data/config.js');
  assert.match(after, /url: "https:\/\/example\.com\/x"/);
  assert.ok(syntaxOk('src/data/config.js'));
  await write('src/data/config.js', orig);
});

/* ---------- 配色 ---------- */
test('配色：只改指定的变量，非法值拒绝', async () => {
  const orig = await read('public/assets/css/style.css');
  const r = await req('/api/theme/save', { method: 'POST', body: JSON.stringify({ vars: { '--rose': '#123456' } }) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.changed, ['--rose']);
  const after = await read('public/assets/css/style.css');
  assert.match(after, /--rose:\s*#123456;/);
  assert.match(after, /--bg:\s*#12142a;/, '其它变量不该被动');

  const bad = await req('/api/theme/save', {
    method: 'POST',
    body: JSON.stringify({ vars: { '--rose': 'red; } body { background: url(x)' } })
  });
  assert.equal(bad.data.changed.length, 0, '非法值应该被忽略');

  await write('public/assets/css/style.css', orig);
});

/* ---------- 相册 ---------- */
test('相册：改元信息 + 挡住越界 key', async () => {
  const orig = await read('src/data/photo-meta.js');
  const r = await req('/api/photos/quick', {
    method: 'POST', body: JSON.stringify({ rel: 'a.jpg', patch: { title: '__自测标题__', tags: ['甲', '乙'] } })
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const after = await read('src/data/photo-meta.js');
  assert.match(after, /title: "__自测标题__"/);
  assert.ok(syntaxOk('src/data/photo-meta.js'));

  const evil = await req('/api/photos/quick', {
    method: 'POST', body: JSON.stringify({ rel: '../../evil.jpg', patch: { title: 'x' } })
  });
  assert.equal(evil.status, 400, '越界 key 必须被拒绝');
  assert.ok(!(await read('src/data/photo-meta.js')).includes('evil'));

  await write('src/data/photo-meta.js', orig);
});

test('相册：上传接口能收图并落盘', async () => {
  const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const r = await req('/api/photos/upload?name=__自测上传__.jpg&album=测试相册', {
    method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: buf
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.data.rel.startsWith('测试相册/'), 'rel 应该是 img/ 下的相对路径：' + r.data.rel);
  // rel 是相对 img/ 的，不要重复拼 img/
  assert.ok(await fs.stat(path.join(sandbox, 'img', r.data.rel)), '文件应该落盘了');

  // 上传后应该能在相册列表里看到，并且预览地址是对的
  const photos = (await req('/api/photos')).data.photos;
  const up = photos.find((p) => p.rel === r.data.rel);
  assert.ok(up, '列表里应该能看到刚上传的图');
  assert.ok(up.fileUrl.startsWith('/img-raw/测试相册/'), '预览地址不对：' + up.fileUrl);
  assert.ok(!up.fileUrl.includes('/img/img/'), '预览地址不该出现重复的 img 段');

  const bad = await req('/api/photos/upload?name=evil.exe', {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: buf
  });
  assert.equal(bad.status, 400, '非图片扩展名要拒绝');
});

/* ---------- 视频 ---------- */
test('视频：新增（追加到末尾）→ 修改 → 删除', async () => {
  const rel = 'src/data/videos.js';
  const orig = await read(rel);
  const before = (await req('/api/videos')).data.videos;

  const add = await req('/api/videos/save', {
    method: 'POST',
    body: JSON.stringify({ index: null, video: { title: '__自测视频__', date: '2026-10-10', douyin: '7301234567890123456' } })
  });
  assert.equal(add.status, 200, JSON.stringify(add.data));
  const now = (await req('/api/videos')).data.videos;
  assert.equal(now.length, before.length + 1, `数量 ${before.length} → ${now.length}`);
  assert.equal(now[now.length - 1].title, '__自测视频__', '应该追加在最后，而不是插到注释后面');
  assert.ok(syntaxOk(rel), '语法正确');

  const idx = now.length - 1;
  const edit = await req('/api/videos/save', {
    method: 'POST', body: JSON.stringify({ index: idx, video: { title: '__改过的视频__', date: '2026-10-10' } })
  });
  assert.equal(edit.status, 200, JSON.stringify(edit.data));
  assert.equal((await req('/api/videos')).data.videos[idx].title, '__改过的视频__');

  const del = await req('/api/videos/delete', { method: 'POST', body: JSON.stringify({ index: idx }) });
  assert.equal(del.status, 200, JSON.stringify(del.data));
  assert.equal((await req('/api/videos')).data.videos.length, before.length);

  await write(rel, orig);
  assert.equal(await read(rel), orig, '应该能还原');
});

/* ---------- 友链 ---------- */
test('友链：新增 → 修改 → 删除', async () => {
  const rel = 'src/data/links.js';
  const orig = await read(rel);
  const before = (await req('/api/links')).data.links;

  const add = await req('/api/links/save', {
    method: 'POST',
    body: JSON.stringify({ index: null, link: { name: '__自测友链__', url: 'https://example.com/', desc: '测试' } })
  });
  assert.equal(add.status, 200, JSON.stringify(add.data));
  const now = (await req('/api/links')).data.links;
  assert.equal(now.length, before.length + 1);
  assert.ok(syntaxOk(rel));

  const idx = now.length - 1;
  await req('/api/links/save', { method: 'POST', body: JSON.stringify({ index: idx, link: { name: '__自测友链__', url: 'https://example.com/', desc: '__改过__' } }) });
  assert.equal((await req('/api/links')).data.links[idx].desc, '__改过__');

  await req('/api/links/delete', { method: 'POST', body: JSON.stringify({ index: idx }) });
  assert.equal((await req('/api/links')).data.links.length, before.length);

  await write(rel, orig);
  assert.equal(await read(rel), orig);
});

/* ---------- 内容体检 ---------- */
test('体检：能报出问题，并且不把说明文件当内容', async () => {
  await write('blog/_说明.md', `---
title: 说明
---
![[图片名.png]] 与 [[另一篇笔记]]
`);
  const r = (await req('/api/health')).data;
  assert.ok(r.scanned.skipped >= 1, '下划线开头的说明文件应该被跳过');
  assert.ok(!r.issues.some((i) => String(i.rel || '').startsWith('_')), '说明文件不该产生问题');
});

/* ---------- 安全 ---------- */
test('安全：笔记路径越界被拒', async () => {
  const r = await req('/api/note/save', {
    method: 'POST', body: JSON.stringify({ rel: '../../evil.md', fields: { title: 'x' }, body: 'x' })
  });
  assert.equal(r.status, 400);
});

/* ---------- 构建接口（只验证接口形状，不真跑构建） ---------- */
test('构建：状态接口结构正确', async () => {
  const s = (await req('/api/build/state?since=0')).data;
  assert.equal(typeof s.running, 'boolean');
  assert.equal(s.running, false);
  assert.ok(Array.isArray(s.lines));
  assert.ok(Array.isArray(s.history));
});

/* ---------- 收尾 ---------- */
test('关闭沙盒实例', async () => {
  await new Promise((r) => server.close(r));
  if (sandbox) await fs.rm(sandbox, { recursive: true, force: true });
  delete process.env.ADMIN_ROOT;
  delete process.env.ADMIN_QUIET;
});
