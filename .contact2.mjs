import sharp from 'sharp';
import { readdirSync } from 'node:fs';

const dir = 'E:/IRinsho/shots/frames2';
const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
const TIMES = [
  0.80, 0.95, 1.10, 1.25, 1.40, 1.55, 1.70, 1.85,
  13.20, 13.35, 13.50, 13.65, 13.80, 13.95, 14.10,
  15.70, 15.85, 16.00, 16.15, 16.30, 16.45, 16.60, 16.75
];

const COLS = 4;
const W = 300;
const H = 190;
const GAP = 8;
const PER = 12;

const svgLabel = (text) =>
  Buffer.from(
    `<svg width="${W}" height="24" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${W}" height="24" fill="rgba(0,0,0,0.6)"/>` +
      `<text x="8" y="16" font-family="monospace" font-size="12" fill="#ffffff">${text}</text>` +
    `</svg>`
  );

for (let s = 0; s * PER < files.length; s++) {
  const batch = files.slice(s * PER, s * PER + PER);
  const rows = Math.ceil(batch.length / COLS);
  const sheetW = COLS * W + (COLS + 1) * GAP;
  const sheetH = rows * H + (rows + 1) * GAP;
  const composites = [];

  for (let i = 0; i < batch.length; i++) {
    const f = batch[i];
    const idx = parseInt(f.slice(2, 4), 10);
    const label = TIMES[idx].toFixed(2) + 's';
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const thumb = await sharp(`${dir}/${f}`)
      .resize(W, H, { fit: 'cover' })
      .composite([{ input: svgLabel(label), top: 0, left: 0 }])
      .png()
      .toBuffer();
    composites.push({ input: thumb, left: GAP + col * (W + GAP), top: GAP + row * (H + GAP) });
  }

  await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: '#101014' } })
    .composite(composites)
    .jpeg({ quality: 88 })
    .toFile(`E:/IRinsho/shots/trans-${s + 1}.jpg`);
  console.log('trans', s + 1, batch.length);
}
