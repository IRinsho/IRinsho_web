/* =========================================================
 *  GitHub 存储层（云端后台的"硬盘"）
 *  ---------------------------------------------------------
 *  本地版用 fs 读写项目文件夹；云端版把这些操作换成 GitHub API。
 *
 *  为什么用 GitHub 当存储：
 *    · 每次保存 = 一次 commit → 天然有版本历史，比平台"只留 3 次部署"的回滚强
 *    · 平台限制：Node 函数请求体最多 6 MB；GitHub Contents API 单文件 1 MB
 *      所以文本内容随便写，图片要压到 1 MB 以内
 *    · 不需要任何数据库
 *
 *  只用 fetch，不引第三方依赖。
 * ======================================================= */

const DEFAULT_API = 'https://api.github.com';

export class GitHubStore {
  /**
   * @param {{token:string, owner:string, repo:string, branch?:string, baseUrl?:string}} cfg
   *   baseUrl 只为测试预留（指向本地假 GitHub），线上不传。
   */
  constructor(cfg) {
    this.token = cfg.token;
    this.owner = cfg.owner;
    this.repo = cfg.repo;
    this.branch = cfg.branch || 'main';
    this.api = cfg.baseUrl || DEFAULT_API;
    /** 本次请求内读过的文件 SHA 缓存，减少 API 调用 */
    this.shaCache = new Map();
  }

  get configured() {
    return !!(this.token && this.owner && this.repo);
  }

  async request(path, { method = 'GET', body } = {}) {
    const res = await fetch(this.api + path, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'irinsho-admin',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (res.status === 404) return null;
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = (data && data.message) || text || `HTTP ${res.status}`;
      const err = new Error(`GitHub API 出错（${res.status}）：${msg}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  /** 读文件，返回 { text, sha } 或 null */
  async read(relPath) {
    const data = await this.request(
      `/repos/${this.owner}/${this.repo}/contents/${encodeURI(relPath)}?ref=${this.branch}`
    );
    if (!data || data.type !== 'file') return null;
    this.shaCache.set(relPath, data.sha);

    // 小于 1 MB 的文件 GitHub 会直接给 base64 内容
    const content = data.content
      ? Buffer.from(data.content, 'base64').toString('utf8')
      : '';
    return { text: content, sha: data.sha, size: data.size };
  }

  /** 读文件为 Buffer（图片用） */
  async readBinary(relPath) {
    const data = await this.request(
      `/repos/${this.owner}/${this.repo}/contents/${encodeURI(relPath)}?ref=${this.branch}`
    );
    if (!data || data.type !== 'file') return null;
    this.shaCache.set(relPath, data.sha);
    return { buffer: Buffer.from(data.content || '', 'base64'), sha: data.sha, size: data.size };
  }

  /** 列出目录，返回 [{ name, path, type, size }]；目录不存在返回 [] */
  async list(relDir) {
    const path = relDir ? `/repos/${this.owner}/${this.repo}/contents/${encodeURI(relDir)}?ref=${this.branch}` : '';
    const data = await this.request(path || `/repos/${this.owner}/${this.repo}/contents?ref=${this.branch}`);
    if (!Array.isArray(data)) return [];
    return data.map((d) => ({ name: d.name, path: d.path, type: d.type, size: d.size, sha: d.sha }));
  }

  /** 递归列出某个目录下所有文件（跳过隐藏目录） */
  async listDeep(relDir) {
    const out = [];
    const walk = async (dir) => {
      const items = await this.list(dir);
      for (const it of items) {
        if (it.name.startsWith('.')) continue;
        if (it.type === 'dir') await walk(it.path);
        else if (it.type === 'file') out.push(it);
      }
    };
    await walk(relDir);
    return out;
  }

  /**
   * 写文件（不存在则新建，存在则更新）。
   * @param relPath 仓库里的路径
   * @param content string 或 Buffer
   * @param message commit 信息
   */
  async write(relPath, content, message) {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');

    // 超过 1 MB 不能用 Contents API 的 base64，要换 git blobs（见下方说明）
    if (buf.length > 1024 * 1024) {
      throw new Error(
        `文件超过 1 MB（${(buf.length / 1024 / 1024).toFixed(1)} MB），GitHub Contents API 不接受。` +
        '图片请先压缩到 1 MB 以内再上传。'
      );
    }

    // 先查 SHA（更新时必须带；我们每次都查，避免拿到过期缓存导致 409）
    let sha = null;
    const existing = await this.request(
      `/repos/${this.owner}/${this.repo}/contents/${encodeURI(relPath)}?ref=${this.branch}`
    );
    if (existing && existing.type === 'file') sha = existing.sha;

    const body = {
      message: message || `后台更新 ${relPath}`,
      content: buf.toString('base64'),
      branch: this.branch
    };
    if (sha) body.sha = sha;

    const res = await this.request(
      `/repos/${this.owner}/${this.repo}/contents/${encodeURI(relPath)}`,
      { method: 'PUT', body }
    );
    if (res && res.content) this.shaCache.set(relPath, res.content.sha);
    return res;
  }

  /** 删除文件 */
  async remove(relPath, message) {
    const existing = await this.request(
      `/repos/${this.owner}/${this.repo}/contents/${encodeURI(relPath)}?ref=${this.branch}`
    );
    if (!existing || existing.type !== 'file') return null;
    return this.request(`/repos/${this.owner}/${this.repo}/contents/${encodeURI(relPath)}`, {
      method: 'DELETE',
      body: { message: message || `后台删除 ${relPath}`, sha: existing.sha, branch: this.branch }
    });
  }

  /** 最近若干次提交（用来做"发布历史"） */
  async commits(limit = 20) {
    const data = await this.request(
      `/repos/${this.owner}/${this.repo}/commits?sha=${this.branch}&per_page=${limit}`
    );
    if (!Array.isArray(data)) return [];
    return data.map((c) => ({
      sha: c.sha,
      short: String(c.sha).slice(0, 7),
      message: (c.commit && c.commit.message) || '',
      date: (c.commit && c.commit.author && c.commit.author.date) || '',
      author: (c.commit && c.commit.author && c.commit.author.name) || ''
    }));
  }

  /** 某个文件的历史（用来恢复旧版本） */
  async fileHistory(relPath, limit = 20) {
    const data = await this.request(
      `/repos/${this.owner}/${this.repo}/commits?sha=${this.branch}&path=${encodeURI(relPath)}&per_page=${limit}`
    );
    if (!Array.isArray(data)) return [];
    return data.map((c) => ({
      sha: c.sha,
      short: String(c.sha).slice(0, 7),
      message: (c.commit && c.commit.message) || '',
      date: (c.commit && c.commit.author && c.commit.author.date) || ''
    }));
  }

  /** 取某个提交时该文件的内容（用于恢复旧版本） */
  async readAt(relPath, sha) {
    const data = await this.request(
      `/repos/${this.owner}/${this.repo}/contents/${encodeURI(relPath)}?ref=${sha}`
    );
    if (!data || data.type !== 'file') return null;
    return Buffer.from(data.content || '', 'base64').toString('utf8');
  }

  /** 一次提交里改多个文件（Git Trees API，省 API 调用） */
  async commitMany(files, message) {
    // 1) 当前分支的头
    const ref = await this.request(`/repos/${this.owner}/${this.repo}/git/ref/heads/${this.branch}`);
    if (!ref || !ref.object) throw new Error('读不到分支信息');
    const baseSha = ref.object.sha;

    const baseCommit = await this.request(`/repos/${this.owner}/${this.repo}/git/commits/${baseSha}`);
    const baseTree = baseCommit && baseCommit.tree && baseCommit.tree.sha;

    // 2) 为每个文件建 blob
    const tree = [];
    for (const f of files) {
      const blob = await this.request(`/repos/${this.owner}/${this.repo}/git/blobs`, {
        method: 'POST',
        body: {
          content: (Buffer.isBuffer(f.content) ? f.content : Buffer.from(String(f.content), 'utf8')).toString('base64'),
          encoding: 'base64'
        }
      });
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }

    // 3) 建 tree
    const newTree = await this.request(`/repos/${this.owner}/${this.repo}/git/trees`, {
      method: 'POST',
      body: { base_tree: baseTree, tree }
    });

    // 4) 建 commit
    const commit = await this.request(`/repos/${this.owner}/${this.repo}/git/commits`, {
      method: 'POST',
      body: { message: message || '后台批量更新', tree: newTree.sha, parents: [baseSha] }
    });

    // 5) 移动分支
    await this.request(`/repos/${this.owner}/${this.repo}/git/refs/heads/${this.branch}`, {
      method: 'PATCH',
      body: { sha: commit.sha }
    });

    return commit;
  }
}

/** 从环境变量构造（云端函数里用） */
export function storeFromEnv(env) {
  return new GitHubStore({
    token: env.GITHUB_TOKEN,
    owner: env.GITHUB_OWNER || 'IRinsho',
    repo: env.GITHUB_REPO || 'IRinsho_web',
    branch: env.GITHUB_BRANCH || 'main',
    // 测试时可用 GITHUB_API_BASE 指向本地假 GitHub；线上留空即官方 API
    baseUrl: env.GITHUB_API_BASE || undefined
  });
}
