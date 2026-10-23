import sharp from 'sharp';

const picks = [
  ['t-03.png', '1.25s  面板下沿进入'],
  ['t-04.png', '1.40s  紫场被下一屏顶走'],
  ['t-06.png', '1.70s  亮场 + 巨字 + 卡片'],
  ['t-10.png', '13.50s 整屏白圆角面板'],
  ['t-17.png', '16.00s 紫色面板下压'],
  ['t-19.png', '16.30s 紫色铺满、Live 卡升起']
];

const W = 460;
const H = 291;
const GAP = 10;
const COLS = 3;
const rows = Math.ceil(picks.length / COLS);
const sheetW = COLS * W + (COLS + 1) * GAP;
const sheetH = rows * (H + 26) + (rows + 1) * GAP;

const label = (text) =>
  Buffer.from(
    `<svg width="${W}" height="26" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${W}" height="26" fill="#0b0714"/>` +
      `<text x="8" y="17" font-family="monospace" font-size="13" fill="#dcc9ff">${text}</text>` +
    `</svg>`
  );

const comps = [];
for (let i = 0; i < picks.length; i++) {
  const [file, text] = picks[i];
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x = GAP + col * (W + GAP);
  const y = GAP + row * (H + 26 + GAP);
  const thumb = await sharp(`E:/IRinsho/shots/frames2/${file}`).resize(W, H, { fit: 'cover' }).png().toBuffer();
  comps.push({ input: thumb, left: x, top: y });
  comps.push({ input: label(text), left: x, top: y + H });
}

await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: '#0b0714' } })
  .composite(comps)
  .jpeg({ quality: 90 })
  .toFile('E:/IRinsho/shots/transitions-strip.jpg');

console.log('ok');
