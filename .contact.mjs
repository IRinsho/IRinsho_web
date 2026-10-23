import sharp from 'sharp';
import { readdirSync } from 'node:fs';

const dir = 'E:/IRinsho/shots/frames';
const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
const COLS = 4;
const ROWS = 3;
const W = 300;
const H = 190;
const GAP = 8;
const PER = COLS * ROWS;

const svgLabel = (text) =>
  Buffer.from(
    `<svg width="${W}" height="24" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${W}" height="24" fill="rgba(0,0,0,0.55)"/>` +
      `<text x="8" y="16" font-family="monospace" font-size="12" fill="#ffffff">${text}</text>` +
    `</svg>`
  );

for (let s = 0; s * PER < files.length; s++) {
  const batch = files.slice(s * PER, s * PER + PER);
  const sheetW = COLS * W + (COLS + 1) * GAP;
  const sheetH = ROWS * H + (ROWS + 1) * GAP;
  const composites = [];

  for (let i = 0; i < batch.length; i++) {
    const f = batch[i];
    const idx = parseInt(f.slice(2, 5), 10);
    const time = (idx * 0.5 + 0.05).toFixed(2) + 's';
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const thumb = await sharp(`${dir}/${f}`)
      .resize(W, H, { fit: 'cover' })
      .composite([{ input: svgLabel(time), top: 0, left: 0 }])
      .png()
      .toBuffer();
    composites.push({
      input: thumb,
      left: GAP + col * (W + GAP),
      top: GAP + row * (H + GAP)
    });
  }

  await sharp({
    create: { width: sheetW, height: sheetH, channels: 3, background: '#101014' }
  })
    .composite(composites)
    .jpeg({ quality: 86 })
    .toFile(`E:/IRinsho/shots/sheet-${s + 1}.jpg`);

  console.log('sheet', s + 1, batch.length);
}
