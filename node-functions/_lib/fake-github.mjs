/* =========================================================
 *  假 GitHub 服务器（测试用）
 *  ---------------------------------------------------------
 *  实现云端后台真正用到的那几个接口：
 *    GET    /repos/:o/:r/contents/:path?ref=         读文件 / 列目录
 *    PUT    /repos/:o/:r/contents/:path              写文件
 *    DELETE /repos/:o/:r/contents/:path              删文件
 *    GET    /repos/:o/:r/commits                     提交历史
 *    GET    /repos/:o/:r/git/ref/heads/:branch       分支头
 *    GET    /repos/:o/:r/git/commits/:sha            提交详情
 *    POST   /repos/:o/:r/git/blobs                   建 blob
 *    POST   /repos/:o/:r/git/trees                   建 tree
 *    POST   /repos/:o/:r/git/commits                 建 commit
 *    PATCH  /repos/:o/:r/git/refs/heads/:branch      移动分支
 * ======================================================= */

import http from 'node:http';
import crypto from 'node:crypto';

export async function startFakeGitHub(files = {}) {
  /** path → { content: Buffer } */
  const store = new Map();
  const commits = [];
  const blobs = new Map();
  /** tree sha → [涉及的路径] */
  const trees = new Map();
  /** sha → Map(path → Buffer)：每个提交时的文件快照，用来测「恢复到旧版本」 */
  const snapshots = new Map();

  for (const [p, c] of Object.entries(files)) {
    store.set(p, Buffer.isBuffer(c) ? c : Buffer.from(String(c), 'utf8'));
  }

  const shaOf = (buf) => crypto.createHash('sha1')
    .update('blob ' + buf.length + '\0').update(buf).digest('hex');

  /** 记一次提交：存下当时的全量快照，这样 readAt(sha) 才能拿到真正的旧内容 */
  function addCommit(message, paths) {
    const sha = crypto.randomBytes(20).toString('hex');
    snapshots.set(sha, new Map([...store.entries()]));
    commits.unshift({
      sha,
      commit: {
        message,
        author: { name: 'test', date: new Date().toISOString() }
      },
      files: paths
    });
    return sha;
  }

  // 初始提交，让分支头有东西
  let headSha = addCommit('初始提交', [...store.keys()]);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(url.pathname);
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);

    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    const notFound = () => send(404, { message: 'Not Found' });

    // ---- contents ----
    let m = p.match(/^\/repos\/([^/]+)\/([^/]+)\/contents\/(.*)$/);
    if (m) {
      const path = m[3];
      if (req.method === 'GET') {
        const ref = url.searchParams.get('ref') || 'main';

        // ref 是一个提交 sha → 返回那个版本的内容（测「恢复旧版本」要用）
        // 不认识 sha 就 404 —— 和真 GitHub 行为一致，这样「版本号写错」也能被测出来
        if (ref !== 'main' && ref !== headSha && !snapshots.has(ref)) {
          return notFound();
        }
        if (snapshots.has(ref)) {
          const snap = snapshots.get(ref);
          const buf = snap.get(path);
          if (!buf) return notFound();
          return send(200, {
            type: 'file', name: path.split('/').pop(), path, size: buf.length,
            sha: shaOf(buf), content: buf.toString('base64'), encoding: 'base64'
          });
        }

        const buf = store.get(path);
        if (buf) {
          return send(200, {
            type: 'file', name: path.split('/').pop(), path, size: buf.length,
            sha: shaOf(buf), content: buf.toString('base64'), encoding: 'base64'
          });
        }
        // 当目录列
        const prefix = path.endsWith('/') ? path : path + '/';
        const items = [];
        const seen = new Set();
        for (const key of store.keys()) {
          if (!key.startsWith(prefix)) continue;
          const rest = key.slice(prefix.length);
          const seg = rest.split('/')[0];
          if (seen.has(seg)) continue;
          seen.add(seg);
          const isDir = rest.includes('/');
          items.push(isDir
            ? { type: 'dir', name: seg, path: prefix + seg }
            : { type: 'file', name: seg, path: prefix + seg, size: store.get(key).length, sha: shaOf(store.get(key)) });
        }
        if (items.length) return send(200, items);
        return notFound();
      }

      if (req.method === 'PUT') {
        const body = JSON.parse(raw.toString('utf8') || '{}');
        const buf = Buffer.from(body.content || '', 'base64');
        store.set(path, buf);
        const sha = addCommit(body.message || 'update ' + path, [path]);
        return send(200, {
          content: { sha: shaOf(buf), path },
          commit: { sha, message: body.message }
        });
      }

      if (req.method === 'DELETE') {
        const body = JSON.parse(raw.toString('utf8') || '{}');
        if (!store.has(path)) return notFound();
        store.delete(path);
        const sha = addCommit(body.message || 'delete ' + path, [path]);
        return send(200, { commit: { sha } });
      }
      return send(405, { message: 'Method Not Allowed' });
    }

    // ---- commits ----
    m = p.match(/^\/repos\/([^/]+)\/([^/]+)\/commits$/);
    if (m && req.method === 'GET') {
      const limit = Number(url.searchParams.get('per_page') || 20);
      const wantPath = url.searchParams.get('path');
      const list = wantPath ? commits.filter((c) => c.files && c.files.includes(wantPath)) : commits;
      return send(200, list.slice(0, limit).map((c) => ({ sha: c.sha, commit: c.commit })));
    }

    // ---- git data ----
    m = p.match(/^\/repos\/([^/]+)\/([^/]+)\/git\/ref\/heads\/(.+)$/);
    if (m && req.method === 'GET') {
      return send(200, { object: { sha: headSha }, ref: 'refs/heads/' + m[3] });
    }
    if (m && req.method === 'PATCH') {
      const body = JSON.parse(raw.toString('utf8') || '{}');
      headSha = body.sha;
      return send(200, { object: { sha: headSha } });
    }

    m = p.match(/^\/repos\/([^/]+)\/([^/]+)\/git\/commits\/(.+)$/);
    if (m && req.method === 'GET') {
      return send(200, { sha: m[3], tree: { sha: 'tree-' + m[3] } });
    }

    m = p.match(/^\/repos\/([^/]+)\/([^/]+)\/git\/blobs$/);
    if (m && req.method === 'POST') {
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const sha = crypto.randomBytes(20).toString('hex');
      blobs.set(sha, Buffer.from(body.content || '', 'base64'));
      return send(201, { sha });
    }

    m = p.match(/^\/repos\/([^/]+)\/([^/]+)\/git\/trees$/);
    if (m && req.method === 'POST') {
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const paths = [];
      for (const t of body.tree || []) {
        if (blobs.has(t.sha)) {
          store.set(t.path, blobs.get(t.sha));
          paths.push(t.path);
        }
      }
      const sha = 'tree-' + crypto.randomBytes(8).toString('hex');
      trees.set(sha, paths);          // 记住这棵树涉及哪些文件
      return send(201, { sha });
    }

    m = p.match(/^\/repos\/([^/]+)\/([^/]+)\/git\/commits$/);
    if (m && req.method === 'POST') {
      const body = JSON.parse(raw.toString('utf8') || '{}');
      // 这条路径（一次提交改多个文件）也要记下涉及哪些文件，
      // 否则按文件查历史会是空的 —— 恢复功能就测不到
      const touched = trees.get(body.tree) || [];
      const sha = addCommit(body.message || 'batch', touched);
      headSha = sha;
      return send(201, { sha, tree: body.tree });
    }

    return notFound();
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    server,
    /** 当前仓库里的文件（测试用来断言） */
    files: () => Object.fromEntries([...store.entries()].map(([k, v]) => [k, v.toString('utf8')])),
    raw: (path) => store.get(path),
    has: (path) => store.has(path),
    /** 往假仓库里塞/改一个文件（测试准备数据用，不产生提交记录） */
    set: (path, content) => {
      store.set(path, Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8'));
    },
    commits: () => commits,
    close: () => new Promise((r) => server.close(r))
  };
}
