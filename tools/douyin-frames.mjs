/* =========================================================
 *  抖音取画面（CDP 版）—— 唯一还没试过、也可能最靠谱的一条路
 *  ---------------------------------------------------------
 *  为什么前面都失败：
 *    HTML 里没有封面（客户端渲染）、详情接口 403（要浏览器签名）、
 *    命令行 --screenshot 只能整页截（带抖音 UI + 大片灰底）。
 *
 *  这里的做法：用 DevTools 协议（CDP）连上无头 Edge/Chrome，先让页面把 JS 跑完，
 *  然后 **只截 <video> 那一块**（Page.captureScreenshot + clip），
 *  顺便把 video 的时长 / 真实分辨率读出来。
 *
 *  为什么截图能绕开跨域限制：
 *    canvas 取帧会被判定 tainted（视频来自别的域），但
 *    Page.captureScreenshot 是浏览器合成层截图，不受同源策略限制。
 *
 *  一次调用能拿到三样东西：
 *    · 干净封面（只有画面，没有抖音 logo / 点赞数 / 灰底）
 *    · 真实时长（video.duration）
 *    · 精确比例（videoWidth / videoHeight）
 *
 *  全程 try/catch，失败只返回 { ok:false, reason }，不影响其它同步。
 * ======================================================= */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BROWSER_CANDIDATES = [
  process.env['PROGRAMFILES'] && `${process.env['PROGRAMFILES']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  process.env['PROGRAMFILES(X86)'] && `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  process.env['LOCALAPPDATA'] && `${process.env['LOCALAPPDATA']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  process.env['PROGRAMFILES'] && `${process.env['PROGRAMFILES']}\\Google\\Chrome\\Application\\chrome.exe`,
  process.env['PROGRAMFILES(X86)'] && `${process.env['PROGRAMFILES']}\\Google\\Chrome\\Application\\chrome.exe`,
  process.env['LOCALAPPDATA'] && `${process.env['LOCALAPPDATA']}\\Google\\Chrome\\Application\\chrome.exe`
].filter(Boolean);

export function findBrowser() {
  for (const p of BROWSER_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  return '';
}

/** 等调试端口起来，返回第一个 page target */
async function waitForTarget(port, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) return page;
      }
    } catch (e) { /* 还没起来 */ }
    await sleep(300);
  }
  return null;
}

/** 极简 CDP 客户端（用 Node 内置 WebSocket，Node 22+ 自带） */
function connect(wsUrl, onEvent) {
  const ws = new WebSocket(wsUrl);
  let seq = 0;
  const pending = new Map();

  const ready = new Promise((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = (e) => reject(new Error('WebSocket 连接失败'));
    setTimeout(() => reject(new Error('WebSocket 连接超时')), 15000);
  });

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(timer);
      if (msg.error) reject(new Error(msg.error.message || 'CDP 报错'));
      else resolve(msg.result);
      return;
    }
    // 事件（没有 id）：交给调用方处理
    if (msg.method && typeof onEvent === 'function') {
      try { onEvent(msg); } catch (e) { /* 忽略 */ }
    }
  };

  return {
    ready,
    send(method, params = {}, timeoutMs = 30000) {
      const id = ++seq;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (pending.has(id)) { pending.delete(id); reject(new Error(method + ' 超时')); }
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        try {
          ws.send(JSON.stringify({ id, method, params }));
        } catch (e) {
          clearTimeout(timer);
          pending.delete(id);
          reject(e);
        }
      });
    },
    close() { try { ws.close(); } catch (e) { /* 忽略 */ } }
  };
}

/** 这个地址像不像视频流？（mp4 / m3u8 / 抖音的 vod 域名） */
function looksLikeStream(u) {
  if (!u || !/^https?:/i.test(u)) return false;
  if (/\.(mp4|m4s|ts|webm|m3u8)(\?|$)/i.test(u)) return true;
  if (/(douyinvod|bytev|vod-|media\.|aweme.*video|play)/i.test(u) && /video|media|vod/i.test(u)) return true;
  return false;
}

/** 在页面里跑的探测脚本：读出 video 的位置 / 时长 / 分辨率 + 页面日期 + 是否被要求登录 */
const PROBE = `(() => {
  const txt = (document.body && document.body.innerText) || '';
  // 抖音对未登录/无头访问会弹登录框，识别出来好换页面重试
  const needLogin = /扫码登录|请登录|登录后|立即登录|验证码|安全验证/.test(txt);
  const v = document.querySelector('video');
  if (!v) return { ok: false, why: '页面上没有 video 元素', login: needLogin };
  const r = v.getBoundingClientRect();
  if (!r.width || !r.height) return { ok: false, why: 'video 尺寸为 0', login: needLogin };
  const m = txt.match(/20\\d{2}\\s*[-/年.]\\s*\\d{1,2}\\s*[-/月.]\\s*\\d{1,2}/);
  return {
    ok: true,
    login: needLogin,
    x: r.x, y: r.y, w: r.width, h: r.height,
    cw: v.videoWidth || 0,
    ch: v.videoHeight || 0,
    duration: (typeof v.duration === 'number' && isFinite(v.duration)) ? v.duration : 0,
    date: m ? m[0] : ''
  };
})()`;

/** '2024年2月23日' / '2024-02-23' → '2024-02-23' */
function normDate(s) {
  const m = String(s || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return '';
  const p = (x) => String(x).padStart(2, '0');
  return `${m[1]}-${p(m[2])}-${p(m[3])}`;
}

/** 秒 → 00:26 */
function fmtSec(sec) {
  const n = Math.round(Number(sec) || 0);
  if (n <= 0) return '';
  const p = (x) => String(x).padStart(2, '0');
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

/**
 * 抓取一条抖音视频的画面 + 时长 + 比例。
 * @param {string} numId     数字视频 id
 * @param {object} opts      { coverDir, port?, log? }
 * @returns {Promise<{ok:boolean, file?:string, bytes?:number, seconds?:number, duration?:string, ratio?:string, date?:string, reason?:string}>}
 */
export async function captureDouyinFrame(numId, opts = {}) {
  const log = opts.log || (() => {});
  const browser = findBrowser();
  if (!browser) return { ok: false, reason: '没找到 Edge / Chrome（装一个即可自动截画面）' };
  if (!opts.coverDir) return { ok: false, reason: '没有指定封面目录' };

  const port = opts.port || 9333 + Math.floor(Math.random() * 200);
  const profile = mkdtempSync(join(tmpdir(), 'irinsho-cdp-'));
  const url = `https://www.douyin.com/video/${numId}`;

  log(`      启动无头浏览器（${browser.split(/[\\/]/).pop()}）…`);
  const child = spawn(browser, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--window-size=1280,900',
    url
  ], { stdio: 'ignore' });

  let client = null;
  try {
    const target = await waitForTarget(port);
    if (!target) return { ok: false, reason: '浏览器调试端口没起来（可能被安全软件拦了）' };

    // 网络层捡到的视频流地址（mp4 / m3u8）
    const mediaUrls = [];

    client = connect(target.webSocketDebuggerUrl, (msg) => {
      // ★ 顺手把「视频流地址」捡出来：抖音网页播放器用 MSE 播，
      //   <video>.currentSrc 往往是 blob:（出了页面就没用），
      //   但它在网络层一定会去请求真正的 mp4/m3u8 —— 那个地址可以在别处播放。
      //   拿到之后页面就能用原生 <video> 播放（不下载视频，浏览器直接拉流）。
      if (msg.method === 'Network.responseReceived' || msg.method === 'Network.requestWillBeSent') {
        const p = msg.params || {};
        const url = (p.response && p.response.url) || (p.request && p.request.url) || '';
        const type = (p.type || '').toLowerCase();
        if (type === 'media' || looksLikeStream(url)) {
          if (!mediaUrls.includes(url)) mediaUrls.push(url);
        }
      }
    });
    await client.ready;
    await client.send('Runtime.enable').catch(() => {});
    await client.send('Page.enable').catch(() => {});
    await client.send('Network.enable').catch(() => {});

    // ⚠ 优先用「官方播放器页」：主视频页 www.douyin.com/video/...
    //   对未登录 / 无头访问会弹登录框，截出来就是「请登录」。
    //   播放器页是裸播放器，一般不需要登录。
    const pages = [
      { label: '播放器页', url: `https://open.douyin.com/player/video?vid=${numId}` },
      { label: '主视频页', url: `https://www.douyin.com/video/${numId}` }
    ];

    let lastReason = '没有可用的页面';

    for (const pg of pages) {
      log(`      打开${pg.label}…`);
      await client.send('Page.navigate', { url: pg.url }).catch(() => {});
      await sleep(2500);

      // 等 video 元素出现并且有尺寸（最多 ~20 秒）
      let info = null;
      for (let i = 0; i < 20; i++) {
        const res = await client.send('Runtime.evaluate', {
          expression: PROBE,
          returnByValue: true
        }).catch(() => null);
        const val = res && res.result && res.result.value;
        if (val && val.ok) { info = val; break; }
        if (val && val.login) { lastReason = `${pg.label}要求登录`; break; }
        await sleep(1000);
      }
      if (!info) {
        if (!lastReason.includes('登录')) lastReason = `${pg.label}上没找到可用的 video 元素`;
        log(`      ${pg.label} 不行：${lastReason}`);
        continue;
      }

      // 让首帧/封面稳定一下
      await sleep(1500);

      // 截图区域：按**视频真实比例**在 video 元素框里居中裁，
      // 这样不会把播放器的黑边一起截进来（横框里放方视频时尤其明显）
      let cw = info.w;
      let chh = info.h;
      if (info.cw && info.ch) {
        const target2 = info.cw / info.ch;
        const boxRatio = info.w / info.h;
        if (target2 > boxRatio) chh = info.w / target2;
        else cw = info.h * target2;
      }
      const clip = {
        x: Math.max(0, Math.round(info.x + (info.w - cw) / 2)),
        y: Math.max(0, Math.round(info.y + (info.h - chh) / 2)),
        width: Math.max(16, Math.round(cw)),
        height: Math.max(16, Math.round(chh)),
        scale: 1
      };

      const shoot = async () => {
        const s = await client.send('Page.captureScreenshot', {
          format: 'jpeg', quality: 88, clip, captureBeyondViewport: true
        });
        if (!s || !s.data) return null;
        const b = Buffer.from(s.data, 'base64');
        return b.length >= 3000 ? b : null;   // 太小 = 全黑/空白/登录框
      };

      let buf = await shoot();

      if (!buf) {
        log('      画面还没出来，触发播放后重试…');
        await client.send('Runtime.evaluate', {
          expression: "(()=>{const v=document.querySelector('video');if(v){v.muted=true;v.pause();v.currentTime=0.6;const p=v.play&&v.play();if(p&&p.catch)p.catch(()=>{});}return 1;})()",
          returnByValue: true
        }).catch(() => {});
        await sleep(3000);
        buf = await shoot();
      }
      if (!buf) {
        clip.x += 8; clip.y += 8;
        clip.width = Math.max(16, clip.width - 16);
        clip.height = Math.max(16, clip.height - 16);
        await sleep(1500);
        buf = await shoot();
      }

      if (!buf) {
        lastReason = `${pg.label}截到的画面是空的`;
        log(`      ${pg.label} 不行：画面是空的`);
        continue;
      }

      const dest = join(opts.coverDir, 'douyin-' + numId + '.jpg');
      writeFileSync(dest, buf);
      const ratio = info.cw && info.ch ? `${info.cw}:${info.ch}` : '';

      // 视频流地址：优先 mp4（浏览器原生 <video> 直接能播），其次 m3u8
      const streams = mediaUrls.filter((u) => /\.mp4(\?|$)/i.test(u));
      const stream = streams[0] || mediaUrls[0] || '';
      if (stream) log(`      拿到视频流地址（页面可用原生播放器播放）`);

      return {
        ok: true,
        file: 'media/covers/douyin-' + numId + '.jpg',
        bytes: buf.length,
        seconds: info.duration || 0,
        duration: fmtSec(info.duration),
        ratio,
        date: normDate(info.date),
        stream,
        clip,
        page: pg.label
      };
    }

    return { ok: false, reason: lastReason };
  } catch (e) {
    return { ok: false, reason: e && e.message ? e.message : String(e) };
  } finally {
    try { if (client) client.close(); } catch (e) { /* 忽略 */ }
    try { child.kill(); } catch (e) { /* 忽略 */ }
  }
}
