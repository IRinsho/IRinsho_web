/* 笔记数据：读取 tools/build-blog.mjs 从 blog/ 生成的 notes.generated.js */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import raw from '../data/notes.generated.js';

export const ALL = '全部';

/**
 * 笔记列表：**置顶的排最前面**（frontmatter 里写 pinned: true），
 * 置顶之间、以及其余笔记，都保持原来的日期倒序。
 */
export const notes = raw
  .slice()
  .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

/** Blog 页顶部的分类筛选按钮（第一项是「全部」） */
export const categories = [ALL].concat(
  notes.reduce((acc, n) => {
    if (n.category && acc.indexOf(n.category) === -1) acc.push(n.category);
    return acc;
  }, [])
);

/** 按 id 找一篇 */
export function findNote(id) {
  return notes.find((n) => n.id === id);
}

/**
 * 封面图 → 页面实际该用的地址。
 *
 * 为什么需要这一步：
 *   blog/ 里贴进来的原图动辄几 MB（实测 p2.png 7.8MB、p4.jpg 4.7MB），
 *   但页面上只显示一张一两百 px 宽的卡片。首屏还在加载时，
 *   一张 7.8MB 的缩略图能把整页拖到十几秒。
 *
 * 做法：
 *   构建前已经生成好 media/notes/thumbs/<同名>.webp（宽 720，webp q80，
 *   实测 18MB → 394KB，省 97.8%）。这里把路径换成缩略图。
 *   找不到缩略图就**原样返回原图** —— 新加一篇笔记还没跑生成脚本时，
 *   结果是"加载慢"而不是"破图"，这个取舍是刻意的。
 *
 * ⚠ 只在构建期调用（本站是全静态预渲染，没有 SSR），所以可以用 fs。
 */
export function coverOf(cover) {
  const src = String(cover || '').trim();
  if (!src) return '';

  const m = src.match(/^media\/notes\/([^/]+)\.(png|jpe?g|webp)$/i);
  if (!m) return src;

  const thumb = `media/notes/thumbs/${m[1]}.webp`;
  try {
    if (existsSync(join(process.cwd(), 'public', thumb))) return thumb;
  } catch (e) { /* 读不到就用原图 */ }
  return src;
}
