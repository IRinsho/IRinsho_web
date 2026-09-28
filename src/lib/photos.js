/* 照片数据：把自动生成的 photos.generated.js 和手写的 photo-meta.js 合并 */

import raw from '../data/photos.generated.js';
import meta from '../data/photo-meta.js';

export const ALL = '全部';

function stripExt(p) {
  const name = String(p || '').split('/').pop();
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function byDateDesc(a, b) {
  return String(b.date || '').localeCompare(String(a.date || ''));
}

export const photos = raw.map((item) => {
  const m = meta[item.file] || {};
  return {
    src: item.src,
    file: item.file || '',
    title: m.title || item.title || stripExt(item.file || item.src),
    desc: m.desc || item.desc || '',
    album: m.album || item.album || '未分类',
    tags: m.tags || item.tags || [],
    date: m.date || item.date || ''
  };
}).sort(byDateDesc);

/** 相册分类列表（第一项是「全部」） */
export const albums = [ALL].concat(
  photos.reduce((acc, p) => {
    if (p.album && acc.indexOf(p.album) === -1) acc.push(p.album);
    return acc;
  }, [])
);
