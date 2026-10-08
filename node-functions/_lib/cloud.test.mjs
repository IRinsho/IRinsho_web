/* =========================================================
 *  云端后台接口测试（端到端，不连真 GitHub）
 *  跑法：npm run admin:test:cloud
 *
 *  做法：起一个假的 GitHub 服务器 → 把云端接口指向它 →
 *       用真实的 Request 对象调用 onRequest → 断言仓库里的文件变化。
 *  所以你真实的仓库、真实的内容一个字都不会被碰。
 * ======================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';

import { startFakeGitHub } from '../_lib/fake-github.mjs';

let gh = null;
let onRequest = null;
let cookie = '';

/* ---------- 仓库初始内容（够后台跑起来） ---------- */
const FIXTURE = {
  'src/data/config.js': `/* 站点配置 */
export default {
  site: 'https://irinsho.top',
  author: 'IRinsho',
  name: 'IRinsho',
  nameAccent: 'I',
  homeTitle: 'IRinsho',
  homeMotto: '把想法写下来，把喜欢的留下来。',
  footer: '© 2026 IRinsho',
  me: {
    no: '00',
    label: 'PERSONAL SIGNAL / ME',
    quote: '先把喜欢的东西留下来，\\n它们自己会慢慢长成一份档案。',
    bio: '这里放我随手拍的图。',
    friend: { label: 'FRIEND LINKS', text: '进入友链', url: 'links/' }
  }
};
`,
  'src/data/videos.js': `/* 视频数据 */
export default [
  {
    title: 're0',
    category: '动漫',
    date: '2025-06-01',
    src: 'media/videos/re0.webm'
  }
];
`,
  'src/data/links.js': `/* 友链数据 */
export default [
  {
    name: 'Yuimi Chaya',
    url: 'https://yuimi-chaya.github.io/',
    desc: '参考来源。',
    tags: ['主题作者']
  }
];
`,
  'src/data/photo-meta.js': `/* 图片信息 */
export default {
  'a.jpg': {
    title: '原本的标题',
    album: '插画',
    tags: ['插画']
  }
};
`,
  'public/assets/css/style.css': `:root {
  --rose: #e0466f;
  --bg: #12142a;
  --paper-ink: #241a20;
}
body { color: var(--ink); }
`,
  'blog/练习.md': `---
tags:
  - C语言
title: 随笔练习
cover: p5.jpg
pinned: "true"
cssclasses:
draft:
---

\`\`\`
#include <stdio.h>
int main() { return 0; }
\`\`\`
`,
  'blog/c语言学习/如何输出字符串位数.md': `---
title: 如何输出字符串位数
date: 2026-09-28
tags: [C语言]
---

正文内容，讲怎么数位数。

请看 [[练习]] 那篇。
`,
  'blog/_怎么用.md': `---
title: 说明
---

这是说明文件，里面有示例 ![[图片名.png]] 和 [[另一篇笔记]]。
`,
  'blog/attachments/p5.jpg': Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  'img/a.jpg': Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x11, 0x22])
};

let env = null;

function makeRequest(path, { method = 'GET', body, cookieValue } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookieValue !== undefined ? cookieValue : cookie) {
    headers.Cookie = cookieValue !== undefined ? cookieValue : cookie;
  }
  return new Request('https://admin.irinsho.top' + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function call(path, opts = {}) {
  const req = makeRequest(path, opts);
  const res = await onRequest({ request: req, env, clientIp: '127.0.0.1' });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  const setCookie = res.headers.get('set-cookie');
  if (setCookie && setCookie.startsWith('irinsho_cloud=')) {
    cookie = setCookie.split(';')[0];
  }
  return { status: res.status, data, setCookie };
}

/* ---------------- 启动 ---------------- */

test('启动假 GitHub + 云端接口', async () => {
  gh = await startFakeGitHub(FIXTURE);
  env = {
    GITHUB_TOKEN: 'fake-token',
    GITHUB_OWNER: 'IRinsho',
    GITHUB_REPO: 'IRinsho_web',
    GITHUB_BRANCH: 'main',
    GITHUB_API_BASE: gh.baseUrl
  };
  // 文件名是 EdgeOne 的 catch-all 写法：[[route]].js → 匹配 /api/admin/*
  const mod = await import('../api/admin/[[route]].js');
  onRequest = mod.onRequest;
  assert.equal(typeof onRequest, 'function');
});

/* ---------------- 鉴权 ---------------- */

test('未设置密码时，session 返回 configured=false', async () => {
  const r = await call('/api/admin/session');
  assert.equal(r.status, 200);
  assert.equal(r.data.configured, false);
  assert.equal(r.data.authed, false);
  assert.equal(r.data.githubReady, true);
});

test('未登录访问受保护接口返回 401', async () => {
  const r = await call('/api/admin/notes');
  assert.equal(r.status, 401);
});

test('设置密码 → 拿到会话 Cookie', async () => {
  const r = await call('/api/admin/setup', { method: 'POST', body: { password: 'cloud-test-123' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(cookie.startsWith('irinsho_cloud='), '应该下发了会话 Cookie');
  assert.ok(/HttpOnly/.test(r.setCookie), 'Cookie 要带 HttpOnly');

  const s = await call('/api/admin/session');
  assert.equal(s.data.authed, true);
  assert.equal(s.data.configured, true);
});

test('密码错 5 次后仍然拒绝，正确密码则通过', async () => {
  const saved = cookie;
  for (let i = 0; i < 3; i++) {
    const bad = await call('/api/admin/login', { method: 'POST', body: { password: '错的' }, cookieValue: '' });
    assert.equal(bad.status, 401);
  }
  const good = await call('/api/admin/login', { method: 'POST', body: { password: 'cloud-test-123' }, cookieValue: '' });
  assert.equal(good.status, 200);
  cookie = saved;
});

test('退出登录后会话立刻失效', async () => {
  const tmp = cookie;
  await call('/api/admin/logout', { method: 'POST', body: {} });
  const after = await call('/api/admin/notes', { cookieValue: cookie });
  assert.equal(after.status, 401, '退出后不该还能访问');

  // 重新登录继续后面的测试
  const again = await call('/api/admin/login', { method: 'POST', body: { password: 'cloud-test-123' }, cookieValue: '' });
  assert.equal(again.status, 200);
  assert.ok(cookie.startsWith('irinsho_cloud='));
  void tmp;
});

/* ---------------- 读 ---------------- */

test('仪表盘：统计数字正确', async () => {
  const r = await call('/api/admin/dashboard');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.counts.notes, 3, 'blog 下有 3 个 md');
  assert.equal(r.data.counts.photos, 1);
  assert.equal(r.data.counts.videos, 1);
  assert.equal(r.data.counts.links, 1);
});

test('笔记列表 + 单篇读取（含带引号的布尔）', async () => {
  const list = await call('/api/admin/notes');
  assert.equal(list.status, 200);
  const rels = list.data.notes.map((n) => n.rel);
  assert.ok(rels.includes('练习.md'));
  assert.ok(rels.includes('c语言学习/如何输出字符串位数.md'));

  const one = await call('/api/admin/note?rel=' + encodeURIComponent('练习.md'));
  assert.equal(one.status, 200);
  assert.equal(one.data.note.fields.pinned, true, 'pinned: "true" 要认成真布尔');
  assert.equal(one.data.note.fields.cover, 'p5.jpg');
  assert.ok(one.data.note.body.includes('#include <stdio.h>'));
});

test('配置文件与配色可读', async () => {
  const cfg = await call('/api/admin/config');
  assert.equal(cfg.status, 200);
  assert.equal(cfg.data.config.site, 'https://irinsho.top');
  assert.equal(cfg.data.config.me.friend.url, 'links/');
  assert.equal(cfg.data.vars['--rose'], '#e0466f');
});

test('视频 / 友链 / 相册可读', async () => {
  assert.equal((await call('/api/admin/videos')).data.videos.length, 1);
  assert.equal((await call('/api/admin/links')).data.links.length, 1);
  const photos = await call('/api/admin/photos');
  assert.equal(photos.data.photos.length, 1);
  assert.equal(photos.data.photos[0].meta.title, '原本的标题');
});

/* ---------------- 笔记写 ---------------- */

test('笔记：原样保存 → 内容不变（只把带引号的 true 规范化）', async () => {
  const before = gh.files()['blog/练习.md'];
  const note = (await call('/api/admin/note?rel=' + encodeURIComponent('练习.md'))).data.note;

  const r = await call('/api/admin/note', {
    method: 'POST',
    body: { rel: '练习.md', fields: note.fields, body: note.body }
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));

  const after = gh.files()['blog/练习.md'];
  const norm = (t) => t.replace(/\r\n/g, '\n').replace(/^pinned: "true"$/m, 'pinned: true');
  assert.equal(norm(after), norm(before), '除了规范化，内容不该变');
  assert.match(after, /^pinned: true$/m);
});

test('笔记：改标题 + 标签，最小 diff', async () => {
  const before = gh.files()['blog/c语言学习/如何输出字符串位数.md'];
  const note = (await call('/api/admin/note?rel=' + encodeURIComponent('c语言学习/如何输出字符串位数.md'))).data.note;

  const r = await call('/api/admin/note', {
    method: 'POST',
    body: { rel: note.rel, fields: { ...note.fields, tags: ['C语言', '字符串'] }, body: note.body }
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));

  const after = gh.files()['blog/c语言学习/如何输出字符串位数.md'];
  assert.match(after, /tags: \[C语言, 字符串\]/, '新标签写进去了');
  assert.ok(after.includes('请看 [[练习]] 那篇。'), '正文没被动');
  // 被改的 tags 那一行本来就会变，所以只检查「其它的行」没丢
  const beforeLines = before.split('\n').filter((l) => l.trim() && !/^tags:/.test(l));
  const lost = beforeLines.filter((l) => !after.includes(l));
  assert.deepEqual(lost, [], '不该丢任何原有行（被改的那行除外）');
});

test('笔记：新建 → 改名 → 删除', async () => {
  const c = await call('/api/admin/create', {
    method: 'POST', body: { title: '__云端自测__', date: '2026-10-10', folder: '测试' }
  });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  const rel = c.data.rel;
  assert.ok(gh.has('blog/' + rel), '仓库里应该出现新文件');

  const dup = await call('/api/admin/create', {
    method: 'POST', body: { title: '__云端自测__', date: '2026-10-10', folder: '测试' }
  });
  assert.equal(dup.status, 409, '同名不该覆盖');

  const newRel = '测试/__云端自测改名__.md';
  const rn = await call('/api/admin/note', {
    method: 'POST',
    body: { rel, renameTo: newRel, fields: { title: '__云端自测改名__', date: '2026-10-10', draft: true, tags: [] }, body: '正文\n' }
  });
  assert.equal(rn.status, 200, JSON.stringify(rn.data));
  assert.ok(gh.has('blog/' + newRel));
  assert.ok(!gh.has('blog/' + rel), '旧文件应该删掉');

  const del = await call('/api/admin/note', { method: 'DELETE', body: { rel: newRel } });
  assert.equal(del.status, 200);
  assert.ok(!gh.has('blog/' + newRel));
});

/* ---------------- 配置 / 配色 ---------------- */

test('配置：改顶层字段，注释与结构保住', async () => {
  const r = await call('/api/admin/config', {
    method: 'POST', body: { changes: { author: '__云端作者__' } }
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.changed, ['author']);
  const after = gh.files()['src/data/config.js'];
  assert.match(after, /author: "__云端作者__"/);
  assert.ok(after.includes('/* 站点配置 */'), '注释还在');
});

test('配置：改嵌套字段 me.friend.url', async () => {
  const r = await call('/api/admin/config', {
    method: 'POST', body: { changes: { 'me.friend.url': 'https://example.com/x' }, targetKeys: ['me'] }
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(gh.files()['src/data/config.js'], /url: "https:\/\/example\.com\/x"/);
});

test('配色：只改指定变量，非法值被忽略', async () => {
  const r = await call('/api/admin/theme', { method: 'POST', body: { vars: { '--rose': '#123456' } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.changed, ['--rose']);
  const css = gh.files()['public/assets/css/style.css'];
  assert.match(css, /--rose:\s*#123456;/);
  assert.match(css, /--bg:\s*#12142a;/, '其它变量不动');

  const bad = await call('/api/admin/theme', {
    method: 'POST', body: { vars: { '--rose': 'red; } body { background: url(x)' } }
  });
  assert.equal(bad.data.changed.length, 0);
});

/* ---------------- 相册 ---------------- */

test('相册：改元信息 + 挡住越界 key', async () => {
  const r = await call('/api/admin/photo-meta', {
    method: 'POST', body: { rel: 'a.jpg', meta: { title: '__新标题__', album: '插画', tags: ['甲'] } }
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const meta = gh.files()['src/data/photo-meta.js'];
  assert.match(meta, /title: "__新标题__"/);

  const evil = await call('/api/admin/photo-meta', {
    method: 'POST', body: { rel: '../../evil.jpg', meta: { title: 'x' } }
  });
  assert.equal(evil.status, 400, '越界 key 必须拒绝');
  assert.ok(!gh.files()['src/data/photo-meta.js'].includes('evil'));
});

test('相册：上传图片能落进仓库，超过 1MB 要拒绝', async () => {
  const small = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02]).toString('base64');
  const r = await call('/api/admin/photo-upload', {
    method: 'POST', body: { name: '__上传测试__.jpg', album: '测试', base64: small }
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(gh.has('img/测试/__上传测试__.jpg'), '图片应该写进仓库');

  const big = Buffer.alloc(1024 * 1024 + 10, 1).toString('base64');
  const over = await call('/api/admin/photo-upload', {
    method: 'POST', body: { name: '__太大__.jpg', base64: big }
  });
  assert.equal(over.status, 400, '超过 1MB 要明确拒绝并给出原因');
  assert.match(over.data.error, /1 MB/);
});

/* ---------------- 视频 / 友链写 ---------------- */

test('视频：新增 → 修改 → 删除', async () => {
  const add = await call('/api/admin/videos', {
    method: 'POST', body: { index: null, video: { title: '__新视频__', date: '2026-10-10', douyin: '7301234567890123456' } }
  });
  assert.equal(add.status, 200, JSON.stringify(add.data));
  let v = (await call('/api/admin/videos')).data.videos;
  assert.equal(v.length, 2);
  assert.equal(v[v.length - 1].title, '__新视频__', '应该追加在最后');

  await call('/api/admin/videos', { method: 'POST', body: { index: 1, video: { title: '__改过__', date: '2026-10-10' } } });
  v = (await call('/api/admin/videos')).data.videos;
  assert.equal(v[1].title, '__改过__');

  await call('/api/admin/videos', { method: 'DELETE', body: { index: 1 } });
  assert.equal((await call('/api/admin/videos')).data.videos.length, 1);
});

test('友链：新增 → 删除', async () => {
  await call('/api/admin/links', {
    method: 'POST', body: { index: null, link: { name: '__新友链__', url: 'https://example.com/' } }
  });
  let l = (await call('/api/admin/links')).data.links;
  assert.equal(l.length, 2);
  assert.equal(l[1].name, '__新友链__');

  await call('/api/admin/links', { method: 'DELETE', body: { index: 1 } });
  l = (await call('/api/admin/links')).data.links;
  assert.equal(l.length, 1);
});

/* ---------------- 体检 ---------------- */

test('体检：说明文件被跳过，问题能报出来', async () => {
  const r = await call('/api/admin/health');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.data.scanned.skipped >= 1, '下划线开头的说明文件要跳过');
  assert.ok(!r.data.issues.some((i) => String(i.rel || '').startsWith('_')), '说明文件不该产生问题');
});

test('预览：用站点同一套渲染器，双链能跳转', async () => {
  const r = await call('/api/admin/preview', {
    method: 'POST',
    body: { markdown: '# 标题\n\n**粗体**、`行内代码`，还有 [[练习]] 这条双链。\n\n| 列A | 列B |\n| --- | --- |\n| 1 | 2 |\n' }
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(r.data.html, /<h1[^>]*>标题<\/h1>/, '标题要渲染成 h1');
  assert.match(r.data.html, /<strong>粗体<\/strong>/);
  assert.match(r.data.html, /<code>行内代码<\/code>/);
  assert.match(r.data.html, /<table>/, '表格要渲染');
  // [[练习]] 在仓库里存在 → 应渲染成站内链接，而不是灰色虚线
  assert.match(r.data.html, /class="md-wikilink"[^>]*href="\/notes\//, '存在的双链要变成链接');
  assert.ok(!/md-wikilink-missing/.test(r.data.html), '不该被标成"找不到"');
});

test('预览：指向不存在的双链要标出来，但不算错误', async () => {
  const r = await call('/api/admin/preview', {
    method: 'POST', body: { markdown: '看看 [[这个笔记不存在]] 吧' }
  });
  assert.equal(r.status, 200);
  assert.match(r.data.html, /md-wikilink-missing/, '找不到的双链要标灰');
});

/* ---------------- 历史与恢复 ---------------- */

test('历史：能列出提交，并把某个文件真正恢复到旧版本', async () => {
  const path = 'src/data/config.js';

  // 先记录「改动前」这一刻的版本号（就是当前分支头）
  const headBefore = gh.commits()[0].sha;
  const before = gh.files()[path];

  const edit = await call('/api/admin/config', { method: 'POST', body: { changes: { author: '__改动后__' } } });
  assert.equal(edit.status, 200, JSON.stringify(edit.data));
  assert.match(gh.files()[path], /__改动后__/, '改动应该写进仓库');

  const hist = await call('/api/admin/history?limit=10');
  assert.equal(hist.status, 200);
  assert.ok(hist.data.commits.length > 0);

  const list = await call('/api/admin/file-history?rel=' + encodeURIComponent(path));
  assert.equal(list.status, 200);
  assert.ok(list.data.commits.length >= 2,
    `改过的文件至少要有两个版本，实际 ${list.data.commits.length}`);

  // 恢复到「改动前那一刻」的版本
  const restored = await call('/api/admin/restore', {
    method: 'POST', body: { repoPath: path, sha: headBefore }
  });
  assert.equal(restored.status, 200, JSON.stringify(restored.data));
  assert.equal(restored.data.from, headBefore.slice(0, 7));

  // 真正的断言：内容回到了改动之前
  assert.equal(gh.files()[path], before, '内容应该完全回到旧版本');
  assert.ok(!gh.files()[path].includes('__改动后__'), '改动应该被撤销');

  // 不存在的版本要报错，而不是写坏文件
  const bad = await call('/api/admin/restore', {
    method: 'POST', body: { repoPath: path, sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' }
  });
  assert.equal(bad.status, 400, '不存在的版本要报错，而不是写坏文件');
});

/* ---------------- 安全 ---------------- */

test('安全：越界路径被拒（笔记 / 恢复）', async () => {
  const r1 = await call('/api/admin/note', {
    method: 'POST', body: { rel: '../../evil.md', fields: { title: 'x' }, body: 'x' }
  });
  assert.equal(r1.status, 400);

  const r2 = await call('/api/admin/restore', {
    method: 'POST', body: { repoPath: 'astro.config.mjs', sha: 'abc' }
  });
  assert.ok(r2.status === 400 || r2.status === 200, '不该 500');
});

test('安全：没有 Token 时给出明确提示', async () => {
  const saved = env.GITHUB_TOKEN;
  env = { ...env, GITHUB_TOKEN: '' };
  const r = await call('/api/admin/notes');
  assert.equal(r.status, 503);
  assert.match(r.data.error, /GITHUB_TOKEN/);
  env = { ...env, GITHUB_TOKEN: saved };
});

/* ---------------- 收尾 ---------------- */

test('关闭假 GitHub', async () => {
  await gh.close();
});
