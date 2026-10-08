/* =========================================================
 *  .js 数据文件的安全修改
 *  ---------------------------------------------------------
 *  要改的文件：src/data/config.js / videos.js / links.js / photo-meta.js
 *
 *  难点：这些文件是你手写的，里面有注释、有空行、有排版。
 *  直接整体重写会把你写的东西全冲掉，所以这里用「外科手术」：
 *    · 先定位到每个键的值在原文里的**起止字符位置**
 *    · 只替换真正改动的那个值的文本
 *    · 其余部分（注释、空行、顺序）一个字都不动
 *
 *  另外每次改完都会用 node 做一次语法检查（见 withSyntaxCheck），
 *  语法不过就直接放弃写入，绝不把你的站点改坏。
 * ======================================================= */

import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { safeResolve, atomicWrite, backupFile } from './file-store.mjs';

/* ---------------- 扫描：跳过字符串与注释 ---------------- */

/**
 * 找配对括号。
 *
 * ⚠ 约定：`from` 必须是**已打开的那个括号本身**的下标（比如 `{` 的位置）。
 *   深度从 1 起算；返回配对闭合括号的下标。
 *   前两次出错都源于这里差一位，所以把约定写死并单独包成 scanBody()。
 */
function scan(src, { from = 0 } = {}) {
  let i = from + 1;             // from 指向开括号，从它后面开始扫
  const n = src.length;
  let depth = 1;

  while (i < n) {
    const ch = src[i];

    if (ch === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i++;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }

    if (ch === '{' || ch === '[') { depth++; i++; continue; }
    if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return i;
      i++;
      continue;
    }
    i++;
  }
  return n - 1;
}

/* ---------------- 找 export default 的主对象 ---------------- */

/**
 * 把注释和字符串换成「屏障」字符（默认 `\u0000`），长度与换行位置完全不变。
 *
 * 为什么用屏障而不是空格：
 *   调用方会拿遮罩文本去找「逗号 / 空白」的边界。
 *   如果注释被换成空格，`open: true   // 说明` 这段就变成了一串空白，
 *   边界扫描会一路跳过它，插入点就落到注释中间去了（踩过这个坑）。
 *   换成 \u0000 之后，扫描遇到注释就会停下来，位置自然停在注释前面。
 *
 * 另外：字符串的**首尾引号也一并遮掉**，否则 `'export default'` 这种东西
 * 会被误认为真代码。翻译/压缩过的长字符串也不会再干扰括号计数。
 */
function maskCommentsAndStrings(src) {
  const out = src.split('');
  const n = src.length;
  let i = 0;
  const BARRIER = '\u0000';

  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (src[k] !== '\n') out[k] = BARRIER;
  };

  while (i < n) {
    const ch = src[i];

    if (ch === '/' && src[i + 1] === '/') {
      const start = i;
      while (i < n && src[i] !== '\n') i++;
      blank(start, i);              // 换行本身保留，方便按行处理
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const start = i;
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i = Math.min(n, i + 2);
      blank(start, i);
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      const start = i;
      i++;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === quote) { i++; break; }
        i++;
      }
      blank(start, i);
      continue;
    }
    i++;
  }
  return out.join('');
}

function findDefaultObject(src) {
  const masked = maskCommentsAndStrings(src);
  const m = masked.match(/export\s+default\s*/);
  if (!m) throw new Error('找不到 export default');

  let i = m.index + m[0].length;
  while (i < src.length && /\s/.test(src[i])) i++;

  const open = src[i];
  if (open !== '{' && open !== '[') {
    // 罕见写法（先赋值给变量再导出）——退化成不可编辑，直接报错更安全
    throw new Error('这个文件的 export default 不是直接写的对象/数组，后台暂不支持修改');
  }
  const end = scanBody(src, i);
  return { openIndex: i, closeIndex: end, open, close: open === '{' ? '}' : ']' };
}

/**
 * 从「已打开的那个括号」的下标开始，找到与它配对的闭合括号。
 *
 * ⚠ 这里减 1 是因为 scan 的约定是「from 指向开括号」，
 *   内部会从 from + 1 开始扫。之前这里多加/少加了一次 1，
 *   导致扫描位置整体偏移两个字符，config.js 的头部注释里的 `{ ... }`
 *   被当成了真代码，整个文件的括号配对从第一步就错了。
 */
function scanBody(src, openIndex) {
  return scan(src, { from: openIndex });
}

/* 给别的模块复用（admin-server 里改 config 的嵌套字段要用） */
export { findDefaultObject, maskCommentsAndStrings };

/* ---------------- 找顶层键（只在深度 1 生效） ---------------- */

/**
 * 返回 [{ key, keyIndex, valueStart, valueEnd }]
 * 只处理「顶层」的键，嵌套里的不管。
 */
export function findTopLevelKeys(src, region) {
  const out = [];
  const start = region.openIndex + 1;
  const end = region.closeIndex;
  const isArray = region.open === '[';

  // 数组：先在「遮罩掉注释和字符串」的副本上数括号，找出每个元素的起点。
  // 这样就不用一边扫一边手工维护深度（那种写法已经错过两次了）。
  if (isArray) {
    const masked = maskCommentsAndStrings(src);
    let depth = 0;
    for (let k = start; k < end; k++) {
      const c = masked[k];
      if (c === '{') {
        if (depth === 0) out.push({ key: null, keyIndex: k, valueStart: k, valueEnd: 0 });
        depth++;
      } else if (c === '}') {
        depth--;
        if (depth === 0 && out.length) out[out.length - 1].valueEnd = k + 1;
      }
    }
    return out;
  }

  let i = start;
  let depth = 0;

  while (i < end) {
    const ch = src[i];

    // 注释
    if (ch === '/' && src[i + 1] === '/') { while (i < end && src[i] !== '\n') i++; continue; }
    if (ch === '/' && src[i + 1] === '*') {
      i += 2; while (i < end && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue;
    }
    // 字符串
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch; i++;
      while (i < end) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) { i++; break; } i++; }
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') { depth++; i++; continue; }
    if (ch === '}' || ch === ']' || ch === ')') { depth--; i++; continue; }

    if (depth === 0) {
      // 对象：形如  key: value   或   'key': value
      const keyMatch = src.slice(i, end).match(/^\s*(?:'([^']*)'|"([^"]*)"|([A-Za-z_$][\w$]*))\s*:/);
      if (keyMatch) {
        const key = keyMatch[1] ?? keyMatch[2] ?? keyMatch[3];
        const keyIndex = i + keyMatch[0].indexOf(keyMatch[0].trim());
        let v = i + keyMatch[0].length;
        while (v < end && /\s/.test(src[v])) v++;

        const c = src[v];
        let valueEnd;
        if (c === '{' || c === '[') {
          valueEnd = scan(src, { from: v }) + 1;
        } else if (c === '"' || c === "'" || c === '`') {
          let j = v + 1;
          while (j < end) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === c) { j++; break; } j++; }
          valueEnd = j;
        } else {
          // 裸值 / 多行表达式：读到这一行的逗号或换行为止
          let j = v;
          let d = 0;
          while (j < end) {
            const cj = src[j];
            if (cj === '"' || cj === "'" || cj === '`') {
              const q = cj; j++;
              while (j < end) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === q) { j++; break; } j++; }
              continue;
            }
            if (cj === '(' || cj === '[' || cj === '{') d++;
            if (cj === ')' || cj === ']' || cj === '}') d--;
            if (d === 0 && (cj === ',' || cj === '\n')) break;
            j++;
          }
          valueEnd = j;
          // 字符串拼接跨行的情况：把后面以 + 开头的续行也吃进来
          for (;;) {
            const rest = src.slice(valueEnd, end);
            const cont = rest.match(/^\s*\+\s*/);
            if (!cont) break;
            let k = valueEnd + cont[0].length;
            if (src[k] === '"' || src[k] === "'" || src[k] === '`') {
              const q = src[k]; k++;
              while (k < end) { if (src[k] === '\\') { k += 2; continue; } if (src[k] === q) { k++; break; } k++; }
              valueEnd = k;
            } else break;
          }
        }
        out.push({ key, keyIndex, valueStart: v, valueEnd });
        i = valueEnd;
        continue;
      }
    }
    i++;
  }
  return out;
}

/* ---------------- 读 / 写（统一换行，避免 CRLF 把边界搞偏） ---------------- */

/**
 * 读这些 .js 数据文件时统一换成 \n 再处理。
 * Windows 上文件常常是 CRLF，而生成器吐的是 \n，
 * 混在一起会让「按字符位置替换」算错位置。
 */
export async function readJsSource(abs) {
  const raw = await fsp.readFile(abs, 'utf8');
  const crlf = raw.includes('\r\n');
  return { src: raw.replace(/\r\n/g, '\n'), crlf };
}

/** 按原文件的换行风格写回 */
export function restoreEol(text, crlf) {
  return crlf ? text.replace(/\n/g, '\r\n') : text;
}

/* ---------------- 读取 ---------------- */

export async function loadJsModule(abs) {
  const url = 'file://' + abs.replace(/\\/g, '/') + '?t=' + Date.now() + Math.random();
  const mod = await import(url);
  return mod.default;
}

/* ---------------- 序列化 ---------------- */

/** 把值写成可读的 JS 源码（对象/数组会展开成多行） */
export function toJs(value, indent = 0) {
  const pad = '  '.repeat(indent);
  const padIn = '  '.repeat(indent + 1);

  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    const simple = value.every((v) => typeof v !== 'object' || v === null);
    if (simple) return '[' + value.map((v) => toJs(v, 0)).join(', ') + ']';
    return '[\n' + value.map((v) => padIn + toJs(v, indent + 1)).join(',\n') + '\n' + pad + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.length) return '{}';
    return '{\n' + keys.map((k) => {
      const key = /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
      return padIn + key + ': ' + toJs(value[k], indent + 1);
    }).join(',\n') + '\n' + pad + '}';
  }
  return 'null';
}

/* ---------------- 应用改动（核心） ---------------- */

/**
 * 算出改动后的源码。只替换真正变了的值。
 * @returns { text, changed: string[] }
 */
export function applyChanges(src, changes) {
  const region = findDefaultObject(src);
  const entries = findTopLevelKeys(src, region);
  const changedKeys = [];

  // 从后往前替换，避免前面的改动把后面的下标顶偏
  const jobs = [];
  for (const [key, value] of Object.entries(changes || {})) {
    const hit = entries.find((e) => e.key === key);
    if (!hit) continue;
    const before = src.slice(hit.valueStart, hit.valueEnd);
    const after = toJs(value, 1);

    // 类型守卫：原来的值是多行结构（对象/数组），新值不是 → 说明调用方搞错了，
    // 这种情况宁可不改，也不要把 config.js 改成一句没意义的东西
    const beforeIsBlock = /^[\[{]/.test(before.trim());
    const afterIsBlock = /^[\[{]/.test(after.trim());
    if (beforeIsBlock && !afterIsBlock) continue;
    if (!beforeIsBlock && afterIsBlock) continue;

    if (before.trim() === after.trim()) continue;
    jobs.push({ start: hit.valueStart, end: hit.valueEnd, after, key });
    changedKeys.push(key);
  }

  jobs.sort((a, b) => b.start - a.start);
  let text = src;
  for (const j of jobs) text = text.slice(0, j.start) + j.after + text.slice(j.end);

  return { text, changed: changedKeys };
}

/* ---------------- 语法检查 ---------------- */

/** 用 node 做一次语法检查：语法不过就不许落盘 */
export async function syntaxOk(filePath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--check', filePath], { windowsHide: true });
    let err = '';
    let out = '';
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', (e) => resolve({ ok: false, message: e.message }));
    child.on('close', (code) => {
      resolve({ ok: code === 0, message: code === 0 ? '' : (err || out).trim().slice(0, 800) });
    });
  });
}

/**
 * 安全写入一个 .js 数据文件：
 *   1. 生成新内容
 *   2. 写到临时文件，用 node --check 验证语法
 *   3. 语法不过 → 抛错，原文件不动
 *   4. 通过 → 备份原文件，再原子替换
 *
 * @param newText 已按 \n 规范化的文本；crlf=true 时写回 CRLF
 */
export async function writeJsFile(root, rel, newText, crlf = false) {
  const { abs, rel: relNorm } = safeResolve(root, rel);
  const text = restoreEol(newText, crlf);

  // 临时文件必须和被检查的内容一致（node --check 不看扩展名）
  const tmp = path.join(root, '.admin', `check-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  await fsp.mkdir(path.dirname(tmp), { recursive: true });
  await fsp.writeFile(tmp, text, 'utf8');

  const check = await syntaxOk(tmp);
  await fsp.rm(tmp, { force: true });
  if (!check.ok) {
    throw new Error('改完的代码语法有问题，已放弃写入（你的文件没有被改动）：\n' + check.message);
  }

  await backupFile(root, relNorm);
  await atomicWrite(abs, text);
  return { rel: relNorm, bytes: Buffer.byteLength(text) };
}

/** 读 + 改 + 校验 + 写，一条龙 */
export async function patchJsFile(root, rel, changes) {
  const { abs } = safeResolve(root, rel);
  const { src, crlf } = await readJsSource(abs);
  const { text, changed } = applyChanges(src, changes);
  if (!changed.length) return { rel, changed: [], skipped: true };
  await writeJsFile(root, rel, text, crlf);
  return { rel, changed, skipped: false };
}

/* ---------------- 数组类文件（videos.js / links.js） ---------------- */

/**
 * 整体替换数组里的一个元素，或追加 / 删除元素。
 * 这些文件里的元素是对象，逐个精确替换代价太高，
 * 所以：改元素 = 只换那一个元素的文本；增删 = 重建数组文本。
 * 注释会保留（因为只动元素本身）。
 */
export function replaceArrayElement(src, index, value) {
  const region = findDefaultObject(src);
  if (region.open !== '[') throw new Error('这个文件的 export default 不是数组');
  const entries = findTopLevelKeys(src, region);
  const hit = entries[index];
  if (!hit) throw new Error(`数组里没有第 ${index + 1} 个元素`);

  const before = src.slice(hit.valueStart, hit.valueEnd);
  const after = toJs(value, 1);
  if (before.trim() === after.trim()) return { text: src, changed: false };

  return {
    text: src.slice(0, hit.valueStart) + after + src.slice(hit.valueEnd),
    changed: true
  };
}

export function appendArrayElement(src, value) {
  const region = findDefaultObject(src);
  if (region.open !== '[') throw new Error('这个文件的 export default 不是数组');
  const entries = findTopLevelKeys(src, region);
  const indent = '  ';
  const block = toJs(value, 1);

  if (!entries.length) {
    return {
      text: src.slice(0, region.openIndex + 1) + '\n' + indent + block + '\n' + src.slice(region.closeIndex),
      changed: true
    };
  }

  const last = entries[entries.length - 1];
  const masked = maskCommentsAndStrings(src);

  // 从最后一个元素的末尾往后跳过空白，找到一个「落脚点」。
  // 这里只会跨过真正的空白：注释被遮罩成屏障字符，会立刻让循环停下，
  // 所以落脚点不可能落进行内注释里。
  let at = last.valueEnd;
  while (at < region.closeIndex && /\s/.test(masked[at])) at++;

  // 两种情形，一次说清：
  //   A. 落脚点是分隔逗号（`},`）—— 逗号已经存在，不能再补，插入点挪到逗号之后
  //   B. 落脚点是数组闭合括号（`}` 后面直接就是 `]`）—— 必须补一个逗号
  //
  // ⚠ 之前把「是否补逗号」和「插入点在哪」分开算，结果用了上一轮的判断值，
  //   在小数组上生成 `}\n\n  {`（缺逗号）或把元素插到 `]` 外面。这里合并处理。
  let insert;
  if (masked[at] === ',') {
    at++;
    insert = '\n\n' + indent + block + ',';
  } else {
    insert = ',\n\n' + indent + block;
  }

  return { text: src.slice(0, at) + insert + src.slice(at), changed: true };
}

export function removeArrayElement(src, index) {
  const region = findDefaultObject(src);
  if (region.open !== '[') throw new Error('这个文件的 export default 不是数组');
  const entries = findTopLevelKeys(src, region);
  const hit = entries[index];
  if (!hit) throw new Error(`数组里没有第 ${index + 1} 个元素`);

  const masked = maskCommentsAndStrings(src);
  const isLast = index === entries.length - 1;
  let start = hit.keyIndex;
  let end = hit.valueEnd;
  while (end < region.closeIndex && /\s/.test(masked[end])) end++;

  if (isLast) {
    // 最后一项：连它前面的逗号一起吃掉
    let i = start - 1;
    while (i > region.openIndex && /\s/.test(masked[i])) i--;
    if (masked[i] === ',') start = i;
  } else if (masked[end] === ',') {
    end++;
  }

  return { text: src.slice(0, start) + src.slice(end), changed: true };
}

/* ---------------- 对象映射类文件（photo-meta.js） ---------------- */

export function setObjectEntry(src, key, value) {
  const region = findDefaultObject(src);
  const entries = findTopLevelKeys(src, region);
  const hit = entries.find((e) => e.key === key);
  const block = toJs(value, 1);

  if (hit) {
    const before = src.slice(hit.valueStart, hit.valueEnd);
    if (before.trim() === block.trim()) return { text: src, changed: false };
    return { text: src.slice(0, hit.valueStart) + block + src.slice(hit.valueEnd), changed: true };
  }

  // 新增：插到最前面（更显眼，也不容易和结尾的注释打架）
  const keyText = /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
  const first = entries[0];

  if (first) {
    const snippet = '  ' + keyText + ': ' + block + ',\n\n';
    return { text: src.slice(0, first.keyIndex) + snippet + src.slice(first.keyIndex), changed: true };
  }
  // 空对象
  return {
    text: src.slice(0, region.openIndex + 1) + '\n  ' + keyText + ': ' + block + '\n' + src.slice(region.closeIndex),
    changed: true
  };
}

export function removeObjectEntry(src, key) {
  const region = findDefaultObject(src);
  const entries = findTopLevelKeys(src, region);
  const idx = entries.findIndex((e) => e.key === key);
  if (idx === -1) return { text: src, changed: false };

  const masked = maskCommentsAndStrings(src);
  const hit = entries[idx];
  const isLast = idx === entries.length - 1;
  let start = hit.keyIndex;
  let end = hit.valueEnd;
  while (end < region.closeIndex && /\s/.test(masked[end])) end++;

  if (isLast) {
    let i = start - 1;
    while (i > region.openIndex && /\s/.test(masked[i])) i--;
    if (masked[i] === ',') start = i;
  } else if (masked[end] === ',') {
    end++;
  }

  return { text: src.slice(0, start) + src.slice(end), changed: true };
}
