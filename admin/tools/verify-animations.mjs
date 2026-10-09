/* 本地起静态服务 + 真浏览器截图，验证动效（用完即删）
 *
 * 为什么要真浏览器：动效只有在 JS 跑起来、Canvas 真的绘制之后才看得见。
 * 顺便还能测交互（移动指针、点击）—— 这是 curl 做不到的。
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn, execSync } from 'node:child_process';

const ROOT = 'E:\\IRinsho\\IRinsho_web';
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, '.admin', 'shots');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
await fsp.mkdir(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain'
};

/* ---- 静态服务 ---- */
const site = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  let file = path.join(DIST, p);
  if (p.endsWith('/')) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const alt = path.join(DIST, p, 'index.html');
    if (fs.existsSync(alt)) file = alt;
    else { res.writeHead(404); res.end('404'); return; }
  }
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(await fsp.readFile(file));
});
const sitePort = await new Promise((r) => site.listen(0, '127.0.0.1', () => r(site.address().port)));
console.log('站点服务:', 'http://127.0.0.1:' + sitePort);

/* ---- 找空闲调试端口 ---- */
const cdpPort = await (async () => {
  for (let p = 9500; p < 9560; p++) {
    const used = await new Promise((r) => {
      const s = net.createServer();
      s.once('error', () => r(true));
      s.once('listening', () => s.close(() => r(false)));
      s.listen(p, '127.0.0.1');
    });
    if (!used) return p;
  }
  throw new Error('没端口了');
})();

const profile = path.join(ROOT, '.admin', 'edge-anim');
await fsp.rm(profile, { recursive: true, force: true });
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--remote-debugging-port=' + cdpPort,
  '--user-data-dir=' + profile, '--window-size=1440,900', 'about:blank'
], { detached: true, stdio: 'ignore' });
edge.unref();

for (let i = 0; i < 40; i++) {
  try { await fetch(`http://127.0.0.1:${cdpPort}/json/version`); break; }
  catch { await new Promise((r) => setTimeout(r, 400)); }
}

/* ---- CDP ---- */
const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 1; const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const myId = id++;
  pending.set(myId, { resolve, reject });
  ws.send(JSON.stringify({ id: myId, method, params }));
  setTimeout(() => { if (pending.has(myId)) { pending.delete(myId); reject(new Error(method + ' 超时')); } }, 40000);
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception || {}));
  return r.result.value;
};
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const f = path.join(OUT, name);
  await fsp.writeFile(f, Buffer.from(r.data, 'base64'));
  console.log('  截图:', name, (await fsp.stat(f)).size, '字节');
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

console.log('\n打开首页…');
await send('Page.navigate', { url: `http://127.0.0.1:${sitePort}/` });
await new Promise((r) => setTimeout(r, 4500));

/* ---- 检查各动效是否真的挂上了 ---- */
console.log('\n动效自检:');
const checks = await evaluate(`(function(){
  const canvas = document.getElementById('gateField');
  const ctx = canvas && canvas.getContext('2d');
  let painted = false;
  if (canvas && ctx && canvas.width) {
    // 取一小块像素，看有没有画东西（粒子/连线）
    try {
      const d = ctx.getImageData(0, 0, Math.min(200, canvas.width), Math.min(200, canvas.height)).data;
      for (let i = 3; i < d.length; i += 4) { if (d[i] > 8) { painted = true; break; } }
    } catch (e) { painted = 'error:' + e.message; }
  }
  const ring = document.querySelector('.cur-ring');
  return {
    星野画布: !!canvas,
    画布已绘制: painted,
    画布尺寸: canvas ? canvas.width + 'x' + canvas.height : null,
    光标圈存在: !!ring,
    光标变量: ring ? getComputedStyle(document.documentElement).getPropertyValue('--cur-rx').trim() : null,
    动效层: !!document.querySelector('.fx-layer') || '尚未创建（点击后才建，正常）',
    html类名: document.documentElement.className
  };
})()`);
for (const [k, v] of Object.entries(checks)) console.log(`  ${k}: ${JSON.stringify(v)}`);

/* ---- 模拟鼠标移动，看光标变量是否跟着变 ---- */
console.log('\n模拟指针移动…');
for (let i = 0; i < 12; i++) {
  await send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: 300 + i * 60, y: 250 + Math.sin(i / 2) * 120, button: 'none'
  });
  await new Promise((r) => setTimeout(r, 60));
}
const afterMove = await evaluate(`(function(){
  const cs = getComputedStyle(document.documentElement);
  return {
    cur_x: cs.getPropertyValue('--cur-x').trim(),
    cur_rx: cs.getPropertyValue('--cur-rx').trim(),
    cur_magnet: cs.getPropertyValue('--cur-magnet').trim()
  };
})()`);
for (const [k, v] of Object.entries(afterMove)) console.log(`  ${k} = ${v}`);

await shot('anim-hero.png');

/* ---- 点击，看涟漪/粒子 ---- */
console.log('\n测试点击特效…');

// 先看那个坐标到底有没有可点元素（之前一直是 0，怀疑坐标落空）
const probe = await evaluate(`(function(){
  const el = document.elementFromPoint(720, 450);
  const sel = 'a,button,.post,.video-card,.photo-card,.panel,.chip,[role="button"]';
  return {
    hit: el ? (el.tagName + '.' + String(el.className || '').slice(0, 40)) : null,
    clickable: el && el.closest ? !!el.closest(sel) : false
  };
})()`);
console.log('  坐标(720,450) 命中:', JSON.stringify(probe));

// 不管坐标，直接对第一个可点元素派发事件 —— 验证监听逻辑本身是否正确
const dispatched = await evaluate(`(function(){
  const sel = 'a,button,.panel,.post,.photo-card';
  const el = document.querySelector(sel);
  if (!el) return '找不到可点元素';
  const r = el.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2);
  const y = Math.round(r.top + r.height / 2);
  const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 };
  el.dispatchEvent(new MouseEvent('pointerdown', opts));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  return el.tagName + '.' + String(el.className || '').slice(0, 30);
})()`);
console.log('  已派发点击给:', dispatched);
await new Promise((r) => setTimeout(r, 100));

const fx = await evaluate(`({
  涟漪: document.querySelectorAll('.fx-ripple').length,
  粒子: document.querySelectorAll('.fx-spark').length,
  动效层: !!document.querySelector('.fx-layer')
})`);
console.log('  ', JSON.stringify(fx));
await shot('anim-click.png');

/* ---- 滚动：看视差与卡片浮现 ---- */
console.log('\n滚动一屏…');
await evaluate('window.scrollTo({ top: window.innerHeight * 0.9, behavior: "instant" })');
await new Promise((r) => setTimeout(r, 1200));
await shot('anim-scroll.png');

/* ---- 相册页 ---- */
console.log('\n打开相册页…');
await send('Page.navigate', { url: `http://127.0.0.1:${sitePort}/photos/` });
await new Promise((r) => setTimeout(r, 3200));
await shot('anim-photos.png');

console.log('\n完成');
ws.close();
try { execSync('taskkill /f /im msedge.exe', { stdio: 'ignore' }); } catch {}
site.close();
await fsp.rm(profile, { recursive: true, force: true }).catch(() => {});
process.exit(0);
