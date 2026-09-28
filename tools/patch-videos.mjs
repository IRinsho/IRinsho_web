/* =========================================================
 *  videos.js 安全改写器
 *  ---------------------------------------------------------
 *  被 tools/sync-covers.mjs 调用：把从抖音页面抓到的
 *  「标题 / 日期 / 时长 / 封面」补进 src/data/videos.js。
 *
 *  ★ 只填空的，绝不覆盖 —— 你自己写过的值一律不动。
 *  ★ 只改这几个字段的字符本身，注释、换行、缩进、引号风格都保留。
 *
 *  为什么用「文本手术」而不是读成 JSON 再写回：
 *    videos.js 里有大量注释，JSON.parse → 重写会把注释全丢掉。
 * ======================================================= */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 跳过大括号里的字符串字面量，保证引号里的花括号不影响配对判断 */
function skipString(text, i) {
  const quote = text[i];
  let j = i + 1;
  while (j < text.length) {
    if (text[j] === '\\') { j += 2; continue; }
    if (text[j] === quote) return j + 1;
    j++;
  }
  return j;
}

/**
 * 找出「数组里第 index 个对象」的整体范围。
 * 返回 { start, end, block }，end 是闭括号的位置。
 */
function objectAt(text, arrayStart, index) {
  let depth = 0;
  let count = -1;
  let start = -1;
  let inObj = false;

  for (let i = arrayStart; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(text, i) - 1; continue; }
    if (c === '/' && text[i + 1] === '/') { i = text.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && text[i + 1] === '*') { i = text.indexOf('*/', i) + 1; continue; }

    if (c === '{') {
      depth++;
      if (!inObj) {
        count++;
        inObj = true;
        if (count === index) start = i;
      }
    } else if (c === '}') {
      depth--;
      if (inObj && depth === 0) {
        inObj = false;
        if (count === index) return { start, end: i, block: text.slice(start, i + 1) };
      }
    }
  }
  return null;
}

/** 拿到 export default [ ... ] 里左括号的位置 */
function arrayStart(text) {
  const m = text.match(/export\s+default\s*\[/);
  return m ? text.indexOf('[', m.index) : -1;
}

/** 某个对象块里是否含有这段文字（用来定位是哪一条记录） */
function blockHas(block, needle) {
  if (!needle) return false;
  return block.indexOf(String(needle)) !== -1;
}

/** 把字符串字面量转义成单引号形式（保留行内注释） */
function quoteValue(value) {
  return "'" + String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

/**
 * 在一条记录里设置某个字段。
 * @param {object} [opts]
 * @param {boolean} [opts.overwrite] true = 允许覆盖已有的非空值
 *        （只用于「已知坏了的值」，例如 poster 指向一个已经被删掉的文件）
 * @returns {{ block: string, changed: boolean }}
 */
function setField(block, field, value, opts = {}) {
  const valText = quoteValue(value);
  const re = new RegExp('(^|\\n)([ \\t]*)' + field + '\\s*:\\s*([\'"])([^\'"\\n]*)\\3([^\\n]*)');

  const m = block.match(re);
  if (m) {
    const start = m.index + m[1].length;
    const mid = m[3];
    const end = block.indexOf(mid, start + field.length);
    if (end < 0) return { block, changed: false };

    const closeQuote = block.indexOf(mid, end + 1);
    const current = block.slice(end + 1, closeQuote);

    // 已经有值了 → 默认不覆盖（这是「只填空字段」的保证）。
    // 但如果调用方明确说这个值是坏的（overwrite），就允许替换。
    if (current.trim() !== '' && !opts.overwrite) return { block, changed: false };

    const replaced = block.slice(0, start) + block.slice(start, end + 1) + value + block.slice(closeQuote);
    return { block: replaced, changed: true };
  }

  // 没有该字段 → 插到这一条记录的最后一行之前
  const lines = block.split('\n');
  let insertAt = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*\}\s*,?\s*$/.test(lines[i])) { insertAt = i; break; }
  }
  if (insertAt < 0) return { block, changed: false };

  // ★ 关键：插入之前必须保证「上一行有逗号」。
  //   之前漏了这一步，结果往 duration: ''（没有尾逗号）后面插 ratio 就变成
  //       duration: ''
  //       ratio: '576:576',
  //   → JavaScript 直接语法错误，整个 videos.js 读不出来（踩过）。
  let prev = insertAt - 1;
  while (prev >= 0 && (lines[prev].trim() === '' || lines[prev].trim().startsWith('//'))) {
    prev--;
  }
  if (prev >= 0) {
    const line = lines[prev];
    const code = line.replace(/\s+$/, '');
    // 仅当这行是「正常的属性行」且没有尾逗号时才补
    if (code && !/,$/.test(code) && !/[{\[(]$/.test(code) && !/\}\s*,?$/.test(code)) {
      lines[prev] = code + ',';
    }
  }

  const indentMatch = block.match(/\n([ \t]+)\S/);
  const indent = indentMatch ? indentMatch[1] : '    ';
  lines.splice(insertAt, 0, `${indent}${field}: ${valText},`);
  return { block: lines.join('\n'), changed: true };
}

/**
 * 把 meta 补进 videos.js。
 *
 * @param {object} options
 * @param {string} options.root       项目根目录
 * @param {Array}  options.entries    要处理的记录：
 *        [{ index, match: [候选定位文本], fields: { title, date, duration, poster } }]
 * @param {boolean} options.dryRun    只算不写
 * @returns {{ changed: Array, file: string }}
 */
export function patchVideos(options = {}) {
  const root = options.root || ROOT;
  const file = join(root, 'src', 'data', 'videos.js');
  const result = { changed: [], file, ok: false };
  if (!existsSync(file)) return result;

  let text = readFileSync(file, 'utf8');
  const arrStart = arrayStart(text);
  if (arrStart < 0) return result;

  const changed = [];

  for (const entry of options.entries || []) {
    const pos = objectAt(text, arrStart, entry.index);
    if (!pos) continue;

    // 定位校验：找到的那一条必须包含我们期望的文本，否则不动它
    const matches = (entry.match || []).filter(Boolean);
    if (matches.length && !matches.some((m) => blockHas(pos.block, m))) continue;

    let block = pos.block;
    const applied = [];

    for (const [field, value] of Object.entries(entry.fields || {})) {
      if (!value) continue;
      const overwrite = Array.isArray(entry.overwrite) && entry.overwrite.indexOf(field) !== -1;
      const r = setField(block, field, value, { overwrite });
      if (r && r.changed) {
        block = r.block;
        applied.push(field);
      }
    }

    if (applied.length) {
      text = text.slice(0, pos.start) + block + text.slice(pos.end + 1);
      changed.push({ index: entry.index, fields: applied, title: entry.title || '' });
    }
  }

  result.changed = changed;
  if (changed.length && !options.dryRun) writeFileSync(file, text, 'utf8');
  result.ok = true;
  return result;
}
