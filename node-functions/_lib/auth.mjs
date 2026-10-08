/* =========================================================
 *  密码与会话（Blob 存储版）
 *  ---------------------------------------------------------
 *  平台限制：KV 存储**只能在 Edge Functions 里用**，而这里是 Node 函数，
 *  所以持久化改用 Blob 存储（官方 SDK，Edge / Cloud 函数都支持）。
 *
 *  存什么：
 *    auth/password.json   { salt, hash, secret, createdAt }  密码哈希 + 会话签名密钥
 *    auth/session/<id>    { exp }                            未过期的会话
 *
 *  设计原则：**Blob 不可用时也不要把后台卡死**。
 *    SDK 没装上 / 没绑命名空间时，退化成"进程内存里存"，
 *    这次服务实例内能用，但重启后密码丢失 —— 会明确告诉你要去绑存储。
 * ======================================================= */

import crypto from 'node:crypto';

const PW_KEY = 'auth/password.json';
const SESSION_PREFIX = 'auth/session/';
const SESSION_DAYS = 30;

/* ---------------- 存储适配 ---------------- */

/**
 * Blob 存储包装。
 * 真机上用 @edgeone/pages-blob；拿不到就退化成内存（并记下原因，前端会提示）。
 */
export class BlobAuthStore {
  constructor({ namespace = 'irinsho-admin', store = null, fallbackReason = '' } = {}) {
    this.namespace = namespace;
    this.store = store;
    this.fallbackReason = fallbackReason;
    this.memory = new Map();     // 兜底
  }

  static async create(namespace = 'irinsho-admin') {
    try {
      const mod = await import('@edgeone/pages-blob');
      const getStore = mod.getStore || (mod.default && mod.default.getStore);
      if (typeof getStore !== 'function') {
        return new BlobAuthStore({ namespace, fallbackReason: 'SDK 里没有 getStore 导出' });
      }
      const store = getStore(namespace);
      return new BlobAuthStore({ namespace, store });
    } catch (e) {
      return new BlobAuthStore({ namespace, fallbackReason: String(e && e.message || e).slice(0, 200) });
    }
  }

  get persistent() { return !!this.store; }

  async getJSON(key) {
    try {
      if (this.store) {
        const v = await this.store.get(key, { type: 'json', consistency: 'strong' });
        return v || null;
      }
    } catch { /* 落到内存 */ }
    return this.memory.get(key) || null;
  }

  async setJSON(key, value) {
    this.memory.set(key, value);
    if (this.store) {
      try {
        await this.store.setJSON(key, value);
        return true;
      } catch (e) {
        this.fallbackReason = this.fallbackReason || ('写入失败：' + String(e && e.message || e).slice(0, 120));
        return false;
      }
    }
    return false;
  }

  async remove(key) {
    this.memory.delete(key);
    if (this.store) {
      try { await this.store.delete(key); } catch { /* 忽略 */ }
    }
  }
}

/* ---------------- 密码 ---------------- */

const scrypt = (password, salt) =>
  crypto.scryptSync(String(password), salt, 64).toString('hex');

export async function readAuth(blob) {
  return blob.getJSON(PW_KEY);
}

export async function setupPassword(blob, password) {
  if (!password || String(password).length < 6) throw new Error('密码至少 6 位');
  if (await readAuth(blob)) throw new Error('密码已经设置过了');

  const salt = crypto.randomBytes(16).toString('hex');
  const rec = {
    salt,
    hash: scrypt(password, salt),
    secret: crypto.randomBytes(32).toString('hex'),
    createdAt: new Date().toISOString()
  };
  await blob.setJSON(PW_KEY, rec);
  return rec;
}

export async function verifyPassword(blob, password) {
  const rec = await readAuth(blob);
  if (!rec) return { ok: false, reason: '还没设置密码' };
  const h = scrypt(password, rec.salt);
  const a = Buffer.from(h);
  const b = Buffer.from(rec.hash);
  if (a.length !== b.length) return { ok: false, reason: '密码不对' };
  return crypto.timingSafeEqual(a, b) ? { ok: true, rec } : { ok: false, reason: '密码不对' };
}

/* ---------------- 会话令牌 ---------------- */

const b64u = (buf) => Buffer.from(buf).toString('base64url');

export function signToken(secret, payload) {
  const body = b64u(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return body + '.' + mac;
}

export function verifyToken(secret, token) {
  if (!secret || !token) return null;
  const [body, mac] = String(token).split('.');
  if (!body || !mac) return null;
  const expect = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (mac.length !== expect.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

/** 登录成功后签发会话，并把 sid 记进 Blob（这样才能"退出登录"时作废） */
export async function createSession(blob, secret, extra = {}) {
  const sid = crypto.randomBytes(16).toString('hex');
  const exp = Date.now() + SESSION_DAYS * 86400 * 1000;
  await blob.setJSON(SESSION_PREFIX + sid, { exp, at: Date.now(), ...extra });
  return { token: signToken(secret, { sid, exp }), sid, exp };
}

/** 校验会话：签名要对，而且 sid 必须还在（退出后立刻失效） */
export async function checkSession(blob, secret, token) {
  const payload = verifyToken(secret, token);
  if (!payload || !payload.sid) return null;
  const rec = await blob.getJSON(SESSION_PREFIX + payload.sid);
  if (!rec) return null;
  if (rec.exp && Date.now() > rec.exp) {
    await blob.remove(SESSION_PREFIX + payload.sid);
    return null;
  }
  return payload;
}

export async function destroySession(blob, token) {
  const payload = verifyToken((await readAuth(blob) || {}).secret, token);
  if (payload && payload.sid) await blob.remove(SESSION_PREFIX + payload.sid);
}

/* ---------------- 登录失败限流（进程内，够用） ---------------- */

const failures = new Map();

export function tooManyFailures(ip) {
  const f = failures.get(ip);
  if (!f) return false;
  if (Date.now() - f.at > 5 * 60 * 1000) { failures.delete(ip); return false; }
  return f.count >= 8;
}

export function noteFailure(ip) {
  const f = failures.get(ip) || { count: 0, at: Date.now() };
  f.count += 1;
  f.at = Date.now();
  failures.set(ip, f);
}

export function clearFailures(ip) {
  failures.delete(ip);
}

/* ---------------- Cookie ---------------- */

export const COOKIE_NAME = 'irinsho_cloud';

export function parseCookies(request) {
  const header = request.headers.get('cookie') || '';
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(token, { secure = true } = {}) {
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',        // Strict 会让"从别的页面点进来"丢登录态
    `Max-Age=${SESSION_DAYS * 24 * 3600}`
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`;
}
