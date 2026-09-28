/* 笔记数据：读取 tools/build-blog.mjs 从 blog/ 生成的 notes.generated.js */

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
