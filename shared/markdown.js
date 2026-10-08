/* =========================================================
 *  极简 Markdown 渲染器（无依赖）
 *  在 Astro 构建时（Node 里）运行，把笔记正文渲染成 HTML
 *
 *  支持：
 *    基础：标题 / 粗体 / 斜体 / 删除线 / 高亮 / 行内代码 / 代码块
 *          有序无序列表（可嵌套）/ 任务清单 / 引用 / 分隔线
 *          链接 / 图片 / 表格（支持 :-- 对齐）
 *    新增：
 *      · 数学公式   $行内$ 和 $$块级$$  → 交给页面上的 KaTeX 渲染
 *      · Mermaid    ```mermaid 代码块   → 交给页面上的 Mermaid 渲染
 *      · 双链跳转   [[笔记名]] / [[笔记名|显示文字]]  → 站内笔记链接
 *      · Dataview   ```dataview 查询块  → 构建时算出结果（支持常用子集）
 *
 *  用法：
 *    renderMarkdown(md, { notes })   // notes 是全部笔记（用于双链 + Dataview）
 * ========================================================= */

export function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 中日韩文字或全角标点
function isCJK(ch) {
  if (!ch) return false;
  const c = ch.charCodeAt(0);
  return (
    (c >= 0x2e80 && c <= 0x9fff) ||
    (c >= 0x3000 && c <= 0x303f) ||
    (c >= 0xff00 && c <= 0xffef) ||
    (c >= 0xf900 && c <= 0xfaff)
  );
}

// 段落内换行：中文之间不留空格，英文之间留空格
function smartJoin(lines) {
  let out = '';
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    if (i === 0) { out = cur; continue; }
    const prev = out.slice(-1);
    const next = cur.charAt(0);
    out += (isCJK(prev) || isCJK(next)) ? cur : ' ' + cur;
  }
  return out;
}

/* ---------------- 双链索引 ---------------- */
/**
 * 把笔记列表编成「名字 → 笔记」的索引，供 [[双链]] 使用。
 * 可用的名字：标题、id（文件名）、以及去掉扩展名的文件名。
 * 大小写不敏感，空格/下划线/连字符可以互换。
 */
function normalKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[-_]+/g, ' ');
}

export function buildLinkIndex(notes) {
  const index = {};
  for (const n of notes || []) {
    const keys = [n.title, n.id, n.file, String(n.id || '').replace(/-/g, ' ')];
    for (const k of keys) {
      const key = normalKey(k);
      if (key && !index[key]) index[key] = n;
    }
  }
  return index;
}

/* ---------------- Dataview（构建时求值） ----------------
 *  只实现常用子集，够日常用；复杂表达式请改用普通 Markdown。
 *    LIST  FROM #标签  SORT date DESC  LIMIT 10
 *    TABLE title, date, category  FROM "c语言学习"  SORT date DESC
 *    TASK  FROM #todo
 */
function dataview(src, ctx) {
  const notes = (ctx && ctx.notes) || [];
  const lines = String(src || '').replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return '<div class="md-dataview md-dataview-empty">（空的 dataview 查询）</div>';

  const head = lines[0];
  const isTable = /^TABLE\b/i.test(head);
  const isTask = /^TASK\b/i.test(head);
  const fields = isTable
    ? head.replace(/^TABLE\s*/i, '').split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const rest = lines.slice(1).join('  ');

  // FROM #标签 / FROM "文件夹"（支持 and / or 混写，这里按「任一命中」处理）
  const tags = [...rest.matchAll(/#([^\s#",]+)/g)].map((m) => m[1]);
  const folders = [...rest.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const sortMatch = rest.match(/SORT\s+([\w\u4e00-\u9fa5-]+)\s*(ASC|DESC)?/i);
  const limit = Number((rest.match(/LIMIT\s+(\d+)/i) || [])[1] || 0);

  let list = notes.filter((n) => {
    const tagOk = !tags.length || tags.some((t) => (n.tags || []).includes(t));
    const folderOk = !folders.length ||
      folders.some((f) => String(n.category || '').includes(f) || String(n.file || '').includes(f));
    return tagOk && folderOk;
  });

  if (sortMatch && sortMatch[1]) {
    const key = /^file$/i.test(sortMatch[1]) ? 'id' : sortMatch[1];
    const dir = /DESC/i.test(sortMatch[2] || '') ? -1 : 1;
    list = list.slice().sort((a, b) =>
      String(a[key] || '').localeCompare(String(b[key] || '')) * dir);
  }
  if (limit > 0) list = list.slice(0, limit);

  const href = (n) => (ctx && ctx.base ? ctx.base : '/notes/') + n.id + '/';

  if (!list.length) return '<div class="md-dataview md-dataview-empty">（没有匹配的笔记）</div>';

  if (isTable) {
    let html = '<div class="md-dataview"><div class="md-table-wrap"><table><thead><tr><th>笔记</th>';
    for (const f of fields) html += '<th>' + escapeHtml(f) + '</th>';
    html += '</tr></thead><tbody>';
    for (const n of list) {
      html += '<tr><td><a href="' + href(n) + '">' + escapeHtml(n.title || n.id) + '</a></td>';
      for (const f of fields) {
        let v = '';
        if (/^date$/i.test(f)) v = n.date || '';
        else if (/^category$/i.test(f)) v = n.category || '';
        else if (/^tags?$/i.test(f)) v = (n.tags || []).map((t) => '#' + t).join(' ');
        else if (/^title$/i.test(f)) v = n.title || '';
        else if (/^file$/i.test(f)) v = n.file || '';
        else v = n[f] == null ? '' : String(n[f]);
        html += '<td>' + (v ? inline(String(v), ctx) : '') + '</td>';
      }
      html += '</tr>';
    }
    return html + '</tbody></table></div></div>';
  }

  if (isTask) {
    let html = '<div class="md-dataview"><ul class="md-dataview-task">';
    for (const n of list) {
      html += '<li><span class="md-task">☐</span> <a href="' + href(n) + '">' +
        escapeHtml(n.title || n.id) + '</a></li>';
    }
    return html + '</ul></div>';
  }

  let html = '<div class="md-dataview"><ul>';
  for (const n of list) {
    html += '<li><a href="' + href(n) + '">' + escapeHtml(n.title || n.id) + '</a>' +
      (n.date ? ' <span class="md-dv-date">' + escapeHtml(n.date) + '</span>' : '') + '</li>';
  }
  return html + '</ul></div>';
}

/* ---------------- 行内语法 ---------------- */
function inline(text, ctx) {
  let s = escapeHtml(text);

  // 行内代码（先抽出来，避免里面的符号被当成语法）
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return '\u0000CODE' + (codes.length - 1) + '\u0000';
  });

  // 行内数学 $...$（同样先抽出来；用原始文本，最后交给 KaTeX）
  const maths = [];
  s = s.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
    maths.push(tex);
    return '\u0000MATH' + (maths.length - 1) + '\u0000';
  });

  // 图片 ![alt](src "title")
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
    (_, alt, src, title) =>
      '<img src="' + src + '" alt="' + alt + '"' +
      (title ? ' title="' + title + '"' : '') + ' loading="lazy">');

  // 链接 [text](href "title")
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
    (_, label, href, title) => {
      const external = /^https?:/i.test(href);
      return '<a href="' + href + '"' +
        (title ? ' title="' + title + '"' : '') +
        (external ? ' target="_blank" rel="noopener noreferrer"' : '') +
        '>' + label + '</a>';
    });

  // 裸链接
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g,
    (_, pre, url) => pre + '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>');

  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  s = s.replace(/==([^=]+)==/g, '<mark>$1</mark>');

  // 双链 [[笔记名]] / [[笔记名|显示文字]] / ![[附件]]
  s = s.replace(/(!?)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, bang, target, alias) => {
    const name = String(target).trim();
    const label = (alias || name).trim();
    // 附件（图片/文件）：直接当图片或链接处理
    if (/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(name)) {
      return '<img src="' + name + '" alt="' + label + '" loading="lazy">';
    }
    const index = (ctx && ctx.linkIndex) || null;
    const note = index ? index[normalKey(name)] : null;
    if (note) {
      const base = (ctx && ctx.base) || '/notes/';
      return '<a class="md-wikilink" href="' + base + note.id + '/">' + escapeHtml(label) + '</a>';
    }
    // 找不到：保留 [[名字]] 的样子，并标出来，方便你在 Obsidian 里补
    return '<span class="md-wikilink md-wikilink-missing" title="站内找不到这篇笔记：' +
      escapeHtml(name) + '">' + escapeHtml(label) + '</span>';
  });

  s = s.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => '<code>' + codes[+i] + '</code>');
  // 数学：保留 $...$ 形式，交给页面上的 KaTeX 自动渲染
  s = s.replace(/\u0000MATH(\d+)\u0000/g, (_, i) => '<span class="md-math">$' + maths[+i] + '$</span>');

  return s;
}

/* ---------------- 表格 ---------------- */
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitRow(line) {
  let s = line.trim();
  if (s.charAt(0) === '|') s = s.slice(1);
  if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
  return s.split('|').map(c => c.trim());
}

function alignOf(cell) {
  const l = cell.charAt(0) === ':';
  const r = cell.charAt(cell.length - 1) === ':';
  if (l && r) return 'center';
  if (r) return 'right';
  if (l) return 'left';
  return '';
}

function renderTable(head, align, rows, ctx) {
  let html = '<div class="md-table-wrap"><table><thead><tr>';
  head.forEach((c, i) => {
    html += '<th' + (align[i] ? ' style="text-align:' + align[i] + '"' : '') + '>' + inline(c, ctx) + '</th>';
  });
  html += '</tr></thead><tbody>';
  rows.forEach(row => {
    html += '<tr>';
    head.forEach((_, i) => {
      const cell = row[i] == null ? '' : row[i];
      html += '<td' + (align[i] ? ' style="text-align:' + align[i] + '"' : '') + '>' + inline(cell, ctx) + '</td>';
    });
    html += '</tr>';
  });
  return html + '</tbody></table></div>';
}

/* ---------------- 列表 ---------------- */
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

function buildList(items, i, baseIndent, ctx) {
  const ordered = items[i].ordered;
  let html = ordered ? '<ol>' : '<ul>';
  while (i < items.length && items[i].indent >= baseIndent) {
    const it = items[i];
    if (it.indent > baseIndent) break;
    i++;
    let sub = '';
    if (i < items.length && items[i].indent > baseIndent) {
      const res = buildList(items, i, items[i].indent, ctx);
      sub = res[0];
      i = res[1];
    }
    let text = it.text;
    let cls = '';
    const task = text.match(/^\[([ xX])\]\s+(.*)$/);
    if (task) {
      const checked = task[1].toLowerCase() === 'x';
      text = '<span class="md-task' + (checked ? ' done' : '') + '">' +
        (checked ? '☑' : '☐') + '</span> ' + inline(task[2], ctx);
      cls = ' class="md-li-task"';
    } else {
      text = inline(text, ctx);
    }
    html += '<li' + cls + '>' + text + sub + '</li>';
  }
  return [html + (ordered ? '</ol>' : '</ul>'), i];
}

/* ---------------- 主渲染 ---------------- */
export function renderMarkdown(md, options) {
  if (!md) return '';
  const opts = options || {};
  const ctx = {
    notes: opts.notes || [],
    linkIndex: opts.linkIndex || null,
    base: opts.base || '/notes/'
  };
  const lines = String(md).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) { i++; continue; }

    // 块级数学 $$ ... $$（也可写成单行 $$...$$）
    if (/^\s*\$\$/.test(line)) {
      const buf = [];
      const firstRest = line.replace(/^\s*\$\$/, '');
      if (/\$\$\s*$/.test(firstRest) && firstRest.trim()) {
        // 单行 $$...$$
        buf.push(firstRest.replace(/\$\$\s*$/, ''));
        i++;
      } else {
        if (firstRest.trim()) buf.push(firstRest);
        i++;
        while (i < lines.length && !/\$\$\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
        if (i < lines.length) { buf.push(lines[i].replace(/\$\$\s*$/, '')); i++; }
      }
      out.push('<div class="md-math-block">$$' + escapeHtml(buf.join('\n')) + '$$</div>');
      continue;
    }

    // 代码块 / Mermaid / Dataview
    const fence = line.match(/^\s*```+\s*([\w+-]*)\s*$/);
    if (fence) {
      const lang = fence[1];
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```+\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      const code = buf.join('\n');

      if (/^mermaid$/i.test(lang)) {
        // Mermaid：输出成 <div class="mermaid">，由页面上的 mermaid.run() 画图
        out.push('<div class="mermaid">' + escapeHtml(code) + '</div>');
        continue;
      }
      if (/^dataview$/i.test(lang)) {
        // Dataview：构建时就把结果算成静态 HTML
        out.push(dataview(code, ctx));
        continue;
      }

      out.push('<pre class="md-code"' + (lang ? ' data-lang="' + lang + '"' : '') +
        '><code>' + escapeHtml(code) + '</code></pre>');
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const lv = h[1].length;
      const id = h[2].replace(/[^\w\u4e00-\u9fa5]+/g, '-').toLowerCase();
      out.push('<h' + lv + ' id="' + id + '">' + inline(h[2], ctx) + '</h' + lv + '>');
      i++;
      continue;
    }

    // 分隔线
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) { out.push('<hr>'); i++; continue; }

    // 引用
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      out.push('<blockquote>' + renderMarkdown(buf.join('\n'), opts) + '</blockquote>');
      continue;
    }

    // 表格
    if (line.indexOf('|') !== -1 && i + 1 < lines.length &&
        TABLE_SEP.test(lines[i + 1]) && lines[i + 1].indexOf('-') !== -1) {
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]).map(alignOf);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].indexOf('|') !== -1 && !/^\s*$/.test(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      out.push(renderTable(head, align, rows, ctx));
      continue;
    }

    // 列表
    if (LIST_ITEM.test(line)) {
      const items = [];
      while (i < lines.length && LIST_ITEM.test(lines[i])) {
        const m = lines[i].match(LIST_ITEM);
        items.push({
          indent: m[1].replace(/ {4}/g, '  ').length,
          ordered: /\d/.test(m[2]),
          text: m[3]
        });
        i++;
        while (i < lines.length && /^\s+\S/.test(lines[i]) && !LIST_ITEM.test(lines[i])) {
          items[items.length - 1].text += ' ' + lines[i].trim();
          i++;
        }
      }
      out.push(buildList(items, 0, items[0].indent, ctx)[0]);
      continue;
    }

    // 段落
    const para = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) &&
           !LIST_ITEM.test(lines[i]) && !/^\s*>/.test(lines[i]) &&
           !/^#{1,6}\s/.test(lines[i]) && !/^\s*```/.test(lines[i]) &&
           !/^\s*\$\$/.test(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    if (para.length) out.push('<p>' + inline(smartJoin(para), ctx) + '</p>');
    else i++;
  }

  return out.join('\n');
}
