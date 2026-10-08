/* =========================================================
 *  云端后台接口（EdgeOne Pages · Node 函数）
 *  ---------------------------------------------------------
 *  路由：文件放在 node-functions/api/admin/ 下，
 *        目录前缀不进 URL，所以本文件对应  /api/admin/...
 *
 *  平台要点（来自官方文档调研，见 docs/edgeone-pages-调研.md）：
 *    · 中国站目录名是 node-functions（国际站是 cloud-functions）
 *    · 静态资源优先于函数：/admin/ 由静态文件托管，不会走到这里
 *    · 请求体上限 6 MB；GitHub 单文件上限 1 MB（图片必须先压缩）
 *    · KV 只能在 Edge Functions 用，所以会话/密码存 Blob
 *
 *  所有业务逻辑在 ../\_lib/ 里，本文件只做「解析请求 → 调逻辑 → 返回 JSON」。
 * ======================================================= */

import { storeFromEnv } from '../../_lib/github.mjs';
import {
  BlobAuthStore, readAuth, setupPassword, verifyPassword,
  createSession, checkSession, destroySession, signToken,
  tooManyFailures, noteFailure, clearFailures,
  parseCookies, sessionCookie, clearCookie, COOKIE_NAME
} from '../../_lib/auth.mjs';

import {
  listNotes, readNote, saveNote, deleteNote, makeNoteFileName,
  patchConfig, readJsSource, writeJsSource, readArrayFile, readObjectFile,
  saveArrayEntry, deleteArrayEntry, setPhotoMeta, removePhotoMeta,
  readTheme, saveTheme, listPhotos, uploadPhoto,
  CONFIG_PATH, VIDEOS_PATH, LINKS_PATH, PHOTO_META_PATH, syntaxOk
} from '../../_lib/content.mjs';

/* 站点自己的 Markdown 渲染器，和网站上是同一份实现
   （src/lib/markdown.js 只是转发到 shared/markdown.js） */
import { renderMarkdown, buildLinkIndex } from '../../../shared/markdown.js';

/* ---------------- 响应助手 ---------------- */

const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });

const fail = (message, status = 400) => json({ error: message }, status);

async function readJSON(request, limit = 7 * 1024 * 1024) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > limit) throw new Error(`请求体 ${(len / 1024 / 1024).toFixed(1)} MB，超过平台 6 MB 限制`);
  const text = await request.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new Error('请求体不是合法 JSON'); }
}

/* ---------------- 运行环境 ---------------- */

let _blob = null;
async function getBlob() {
  if (!_blob) _blob = await BlobAuthStore.create('irinsho-admin');
  return _blob;
}

const ENV_OK = (env) => !!(env && env.GITHUB_TOKEN);

/* ---------------- 路由分发 ---------------- */

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 路径形如 /api/admin/notes → action = notes
  const action = url.pathname.replace(/^\/api\/admin\/?/, '').replace(/\/+$/, '') || 'session';
  const method = request.method.toUpperCase();

  try {
    /* ---- 不需要登录的接口 ---- */
    if (action === 'session' && method === 'GET') return await handleSession(request, env);
    if (action === 'setup' && method === 'POST') return await handleSetup(request, env);
    if (action === 'login' && method === 'POST') return await handleLogin(request, env, context);
    if (action === 'logout' && method === 'POST') return await handleLogout(request, env);

    /* ---- 以下都需要登录 ---- */
    const blob = await getBlob();
    const auth = await readAuth(blob);
    const token = parseCookies(request)[COOKIE_NAME];
    const sess = auth ? await checkSession(blob, auth.secret, token) : null;
    if (!sess) return fail('未登录', 401);

    if (!ENV_OK(env)) {
      return fail('后台还没配好：EdgeOne 环境变量里缺少 GITHUB_TOKEN', 503);
    }
    const store = storeFromEnv(env);

    switch (action) {
      case 'dashboard': return await handleDashboard(store);
      case 'notes': return await handleNotes(store, url, method);
      case 'note': return await handleNote(store, url, method, request);
      case 'preview': return await handlePreview(store, request);
      case 'create': return await handleCreate(store, request);
      case 'config': return await handleConfig(store, request, method);
      case 'theme': return await handleTheme(store, request, method);
      case 'photos': return await handlePhotos(store);
      case 'photo-upload': return await handlePhotoUpload(store, request);
      case 'photo-meta': return await handlePhotoMeta(store, request);
      case 'videos': return await handleVideos(store, request, method);
      case 'links': return await handleLinks(store, request, method);
      case 'history': return await handleHistory(store, url);
      case 'file-history': return await handleFileHistory(store, url);
      case 'restore': return await handleRestore(store, request);
      case 'health': return await handleHealth(store);
      default: return fail('没有这个接口：' + action, 404);
    }
  } catch (err) {
    const msg = String(err && err.message || err);
    return json({ error: msg }, err && err.status === 401 ? 401 : 400);
  }
}

/* ---------------- 会话 ---------------- */

async function handleSession(request, env) {
  const blob = await getBlob();
  const auth = await readAuth(blob);
  const token = parseCookies(request)[COOKIE_NAME];
  const sess = auth ? await checkSession(blob, auth.secret, token) : null;

  return json({
    configured: !!auth,
    authed: !!sess,
    storage: blob.persistent ? 'blob' : 'memory',
    storageWarning: blob.persistent ? '' : (
      '会话存储没连上 Blob，密码只保存在这个实例的内存里，重启后会丢失。' +
      (blob.fallbackReason ? '（原因：' + blob.fallbackReason + '）' : '')
    ),
    githubReady: ENV_OK(env),
    githubRepo: env && env.GITHUB_OWNER && env.GITHUB_REPO
      ? `${env.GITHUB_OWNER}/${env.GITHUB_REPO}@${env.GITHUB_BRANCH || 'main'}`
      : '',
    mode: 'cloud'
  });
}

async function handleSetup(request, env) {
  const blob = await getBlob();
  const body = await readJSON(request);
  const rec = await setupPassword(blob, body.password);
  const { token } = await createSession(blob, rec.secret, { ip: request.headers.get('x-forwarded-for') || '' });
  const secure = new URL(request.url).protocol === 'https:';
  return json({ ok: true, storage: blob.persistent ? 'blob' : 'memory' }, 200, {
    'Set-Cookie': sessionCookie(token, { secure })
  });
}

async function handleLogin(request, env, context) {
  const blob = await getBlob();
  const ip = (context && context.clientIp) || request.headers.get('x-forwarded-for') || 'x';
  if (tooManyFailures(ip)) return fail('失败次数太多，请 5 分钟后再试', 429);

  const body = await readJSON(request);
  const r = await verifyPassword(blob, body.password);
  if (!r.ok) { noteFailure(ip); return fail(r.reason || '密码不对', 401); }

  clearFailures(ip);
  const { token } = await createSession(blob, r.rec.secret, { ip });
  const secure = new URL(request.url).protocol === 'https:';
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token, { secure }) });
}

async function handleLogout(request, env) {
  const blob = await getBlob();
  const token = parseCookies(request)[COOKIE_NAME];
  if (token) await destroySession(blob, token);
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
}

/* ---------------- 仪表盘 ---------------- */

async function handleDashboard(store) {
  const notes = await listNotes(store);
  const photos = await listPhotos(store);

  const { value: videos } = await readArrayFile(store, VIDEOS_PATH).catch(() => ({ value: [] }));
  const { value: links } = await readArrayFile(store, LINKS_PATH).catch(() => ({ value: [] }));

  const albums = {};
  for (const p of photos) albums[p.album] = (albums[p.album] || 0) + 1;

  return json({
    counts: {
      notes: notes.length,
      drafts: notes.filter((n) => n.draft).length,
      photos: photos.length,
      videos: Array.isArray(videos) ? videos.length : 0,
      links: Array.isArray(links) ? links.length : 0
    },
    recent: notes.slice(0, 8).map((n) => ({
      rel: n.rel, title: n.title, date: n.date, category: n.category, draft: n.draft, chars: n.chars
    })),
    albums: Object.entries(albums).map(([name, count]) => ({ name, count }))
  });
}

/* ---------------- 笔记 ---------------- */

async function handleNotes(store) {
  return json({ notes: await listNotes(store) });
}

async function handleNote(store, url, method, request) {
  if (method === 'GET') {
    const rel = url.searchParams.get('rel');
    if (!rel) return fail('缺少 rel 参数');
    const note = await readNote(store, rel);
    return json({ note });
  }
  if (method === 'POST') {
    const body = await readJSON(request);
    if (!body.rel) return fail('缺少 rel');
    const original = await readNote(store, body.rel).catch(() => null);

    const target = body.renameTo && body.renameTo !== body.rel ? body.renameTo : body.rel;
    const saved = await saveNote(store, { rel: target, fields: body.fields || {}, body: body.body || '', original });
    if (target !== body.rel) await deleteNote(store, body.rel);

    return json({ ok: true, rel: saved.rel });
  }
  if (method === 'DELETE') {
    const body = await readJSON(request);
    if (!body.rel) return fail('缺少 rel');
    await deleteNote(store, body.rel);
    return json({ ok: true });
  }
  return fail('不支持的方法：' + method, 405);
}

/**
 * 实时预览：用和网站完全相同的渲染器渲染 Markdown。
 * 所以后台看到的就是网站上会显示的（双链、表格、公式、Dataview 都一样）。
 */
async function handlePreview(store, request) {
  const body = await readJSON(request);
  const md = String(body.markdown == null ? '' : body.markdown);
  if (md.length > 300 * 1024) return fail('正文太长了（超过 300 KB），预览先跳过');

  let notes = [];
  try { notes = await listNotes(store); } catch { /* 读不到就退化成没有双链索引 */ }
  const slim = notes.map((n) => ({
    id: n.id, title: n.title, date: n.date, category: n.category, tags: n.tags, file: n.rel
  }));

  const html = renderMarkdown(md, {
    notes: slim,
    linkIndex: buildLinkIndex(slim),
    base: '/notes/'
  });
  return json({ html });
}

async function handleCreate(store, request) {
  const body = await readJSON(request);
  const title = String(body.title || '').trim();
  if (!title) return fail('标题不能为空');

  const date = body.date || new Date().toISOString().slice(0, 10);
  const folder = String(body.folder || '').replace(/^\/+|\/+$/g, '');
  const fileName = makeNoteFileName(title, date, true);
  const rel = (folder ? folder + '/' : '') + fileName;

  // 已存在就不覆盖
  const existing = await store.read('blog/' + rel);
  if (existing) return fail('同名笔记已存在：' + rel, 409);

  const fields = { title, date, tags: [], draft: true };
  await saveNote(store, { rel, fields, body: `# ${title}\n\n在这里开始写……\n`, original: null });
  return json({ ok: true, rel });
}

/* ---------------- 站点配置 ---------------- */

async function handleConfig(store, request, method) {
  if (method === 'GET') {
    const { src } = await readJsSource(store, CONFIG_PATH);
    const theme = await readTheme(store);
    return json({ config: evalDefault(src), vars: theme.vars });
  }
  if (method === 'POST') {
    const body = await readJSON(request);
    const r = await patchConfig(store, body.changes || {}, body.targetKeys);
    return json({ ok: true, ...r });
  }
  return fail('不支持的方法：' + method, 405);
}

/* ---------------- 配色 ---------------- */

async function handleTheme(store, request, method) {
  if (method === 'GET') return json(await readTheme(store));
  if (method === 'POST') {
    const body = await readJSON(request);
    const r = await saveTheme(store, body.vars || {});
    return json({ ok: true, ...r });
  }
  return fail('不支持的方法：' + method, 405);
}

/* ---------------- 相册 ---------------- */

async function handlePhotos(store) {
  return json({ photos: await listPhotos(store) });
}

async function handlePhotoUpload(store, request) {
  const body = await readJSON(request);
  const r = await uploadPhoto(store, { name: body.name, album: body.album, base64: body.base64 });
  return json({ ok: true, ...r });
}

async function handlePhotoMeta(store, request) {
  const body = await readJSON(request);
  if (!body.rel) return fail('缺少 rel');
  if (body.remove) return json({ ok: true, ...(await removePhotoMeta(store, body.rel)) });
  return json({ ok: true, ...(await setPhotoMeta(store, body.rel, body.meta || {})) });
}

/* ---------------- 视频 / 友链 ---------------- */

async function handleVideos(store, request, method) {
  if (method === 'GET') {
    const { value } = await readArrayFile(store, VIDEOS_PATH);
    return json({ videos: value });
  }
  if (method === 'POST') {
    const body = await readJSON(request);
    const r = await saveArrayEntry(store, VIDEOS_PATH, {
      index: body.index, value: body.video, label: '后台更新视频'
    });
    return json({ ok: true, ...r });
  }
  if (method === 'DELETE') {
    const body = await readJSON(request);
    const r = await deleteArrayEntry(store, VIDEOS_PATH, body.index, '后台删除视频');
    return json({ ok: true, ...r });
  }
  return fail('不支持的方法：' + method, 405);
}

async function handleLinks(store, request, method) {
  if (method === 'GET') {
    const { value } = await readArrayFile(store, LINKS_PATH);
    return json({ links: value });
  }
  if (method === 'POST') {
    const body = await readJSON(request);
    const r = await saveArrayEntry(store, LINKS_PATH, {
      index: body.index, value: body.link, label: '后台更新友链'
    });
    return json({ ok: true, ...r });
  }
  if (method === 'DELETE') {
    const body = await readJSON(request);
    const r = await deleteArrayEntry(store, LINKS_PATH, body.index, '后台删除友链');
    return json({ ok: true, ...r });
  }
  return fail('不支持的方法：' + method, 405);
}

/* ---------------- 历史与恢复 ---------------- */

async function handleHistory(store, url) {
  const limit = Number(url.searchParams.get('limit') || 20);
  return json({ commits: await store.commits(limit) });
}

/**
 * 把「笔记的相对名」补成仓库里的完整路径。
 * ⚠ 只有「不带斜杠的裸文件名」才当成笔记补 blog/ 前缀。
 *   否则 `src/data/config.js` 会被拼成 `blog/src/data/config.js` —— 查了个不存在的路径。
 */
function toRepoPath(rel) {
  if (!rel) return '';
  if (rel.startsWith('blog/') || rel.startsWith('src/') || rel.startsWith('public/') || rel.startsWith('img/')) {
    return rel;
  }
  return (rel.includes('/') || !/\.md$/i.test(rel)) ? rel : 'blog/' + rel;
}

async function handleFileHistory(store, url) {
  const rel = url.searchParams.get('rel');
  if (!rel) return fail('缺少 rel');
  const repoPath = toRepoPath(rel);
  return json({ file: repoPath, commits: await store.fileHistory(repoPath) });
}

async function handleRestore(store, request) {
  const body = await readJSON(request);
  const { rel, sha, repoPath } = body;
  if (!sha) return fail('缺少 sha（要恢复到的那个版本）');

  const path = toRepoPath(repoPath || rel);
  if (!path) return fail('缺少文件路径');

  const old = await store.readAt(path, sha);
  if (old === null) return fail('那个版本里找不到这个文件');

  // 笔记走「最小 diff」不需要；直接原样写回
  if (/\.md$/i.test(path)) {
    await store.write(path, old, `后台恢复笔记到 ${String(sha).slice(0, 7)}：${path}`);
  } else {
    const check = syntaxOk(old);
    if (!check.ok) return fail('那个版本的内容语法不对，不敢写回：' + check.message);
    await store.write(path, old, `后台恢复到 ${String(sha).slice(0, 7)}：${path}`);
  }
  return json({ ok: true, restored: path, from: String(sha).slice(0, 7) });
}

/* ---------------- 内容体检 ---------------- */

async function handleHealth(store) {
  const all = await listNotes(store);
  const issues = [];
  const today = new Date().toISOString().slice(0, 10);

  const isInternal = (rel) => rel.split('/').some((s) => s.startsWith('_')) || /(^|\/)README\.md$/i.test(rel);
  const notes = all.filter((n) => !isInternal(n.rel));
  const skipped = all.length - notes.length;

  const attach = new Set();
  try {
    for (const f of await store.listDeep('blog/attachments')) {
      attach.add(f.name);
      attach.add(f.name.replace(/\.[^.]+$/, ''));
    }
  } catch { /* 没有附件目录也正常 */ }

  for (const n of notes) {
    if (n.date && n.date > today) {
      issues.push({ level: 'warn', kind: 'future-date', rel: n.rel, title: n.title, message: `日期 ${n.date} 在未来（今天 ${today}）` });
    }
    if (n.chars < 20) {
      issues.push({ level: 'info', kind: 'empty-body', rel: n.rel, title: n.title, message: `正文只有 ${n.chars} 个字，可能是空草稿` });
    }
    if (!n.category) {
      issues.push({ level: 'info', kind: 'no-category', rel: n.rel, title: n.title, message: '没有分类（会归到「未分类」）' });
    }

    let full;
    try { full = await readNote(store, n.rel); } catch { continue; }

    for (const m of full.body.matchAll(/!\[\[([^\]|]+)/g)) {
      const t = m[1].trim();
      if (!attach.has(t) && !attach.has(t.replace(/\.[^.]+$/, ''))) {
        issues.push({ level: 'warn', kind: 'missing-image', rel: n.rel, title: n.title, message: `插图 ![[${t}]] 在 blog/attachments/ 里找不到` });
      }
    }
  }

  // 同名笔记
  const byTitle = {};
  for (const n of notes) (byTitle[n.title] = byTitle[n.title] || []).push(n);
  for (const [title, list] of Object.entries(byTitle)) {
    if (list.length > 1 && title) {
      issues.push({ level: 'warn', kind: 'dup-title', title, message: `有 ${list.length} 篇同名：${list.map((n) => n.rel).join('、')}` });
    }
  }

  return json({
    ok: issues.filter((i) => i.level === 'warn').length === 0,
    issues,
    scanned: { notes: notes.length, skipped }
  });
}

/* ---------------- 兜底：读 config.js 的字面量 ---------------- */

/**
 * 求值 `export default <字面量>`。
 * 这些数据文件里只有字面量（对象/数组/字符串/数字/布尔），所以用 Function 跑一遍是安全的。
 */
function evalDefault(src) {
  const masked = String(src).replace(/export\s+default\s*/, 'module.exports = ');
  const sandbox = { exports: null };
  try {
    new Function('module', 'console', masked)(sandbox, console);
  } catch (e) {
    throw new Error('解析数据文件失败：' + String(e.message || e));
  }
  return sandbox.exports;
}
