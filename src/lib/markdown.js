/* =========================================================
 *  极简 Markdown 渲染器（无依赖）
 *  在 Astro 构建时（Node 里）运行，把笔记正文渲染成 HTML
 *
 *  支持：标题 / 粗体 / 斜体 / 删除线 / 高亮 / 行内代码 / 代码块
 *        有序无序列表（可嵌套）/ 任务清单 / 引用 / 分隔线
 *        链接 / 图片 / 表格（支持 :-- 对齐）
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

/* ---------------- 行内语法 ---------------- */
function inline(text) {
  let s = escapeHtml(text);

  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return '\u0000CODE' + (codes.length - 1) + '\u0000';
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

  s = s.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => '<code>' + codes[+i] + '</code>');

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

function renderTable(head, align, rows) {
  let html = '<div class="md-table-wrap"><table><thead><tr>';
  head.forEach((c, i) => {
    html += '<th' + (align[i] ? ' style="text-align:' + align[i] + '"' : '') + '>' + inline(c) + '</th>';
  });
  html += '</tr></thead><tbody>';
  rows.forEach(row => {
    html += '<tr>';
    head.forEach((_, i) => {
      const cell = row[i] == null ? '' : row[i];
      html += '<td' + (align[i] ? ' style="text-align:' + align[i] + '"' : '') + '>' + inline(cell) + '</td>';
    });
    html += '</tr>';
  });
  return html + '</tbody></table></div>';
}

/* ---------------- 列表 ---------------- */
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

function buildList(items, i, baseIndent) {
  const ordered = items[i].ordered;
  let html = ordered ? '<ol>' : '<ul>';
  while (i < items.length && items[i].indent >= baseIndent) {
    const it = items[i];
    if (it.indent > baseIndent) break;
    i++;
    let sub = '';
    if (i < items.length && items[i].indent > baseIndent) {
      const res = buildList(items, i, items[i].indent);
      sub = res[0];
      i = res[1];
    }
    let text = it.text;
    let cls = '';
    const task = text.match(/^\[([ xX])\]\s+(.*)$/);
    if (task) {
      const checked = task[1].toLowerCase() === 'x';
      text = '<span class="md-task' + (checked ? ' done' : '') + '">' +
        (checked ? '☑' : '☐') + '</span> ' + inline(task[2]);
      cls = ' class="md-li-task"';
    } else {
      text = inline(text);
    }
    html += '<li' + cls + '>' + text + sub + '</li>';
  }
  return [html + (ordered ? '</ol>' : '</ul>'), i];
}

/* ---------------- 主渲染 ---------------- */
export function renderMarkdown(md) {
  if (!md) return '';
  const lines = String(md).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) { i++; continue; }

    // 代码块
    const fence = line.match(/^\s*```+\s*([\w+-]*)\s*$/);
    if (fence) {
      const lang = fence[1];
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```+\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push('<pre class="md-code"' + (lang ? ' data-lang="' + lang + '"' : '') +
        '><code>' + escapeHtml(buf.join('\n')) + '</code></pre>');
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const lv = h[1].length;
      const id = h[2].replace(/[^\w\u4e00-\u9fa5]+/g, '-').toLowerCase();
      out.push('<h' + lv + ' id="' + id + '">' + inline(h[2]) + '</h' + lv + '>');
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
      out.push('<blockquote>' + renderMarkdown(buf.join('\n')) + '</blockquote>');
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
      out.push(renderTable(head, align, rows));
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
      out.push(buildList(items, 0, items[0].indent)[0]);
      continue;
    }

    // 段落
    const para = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) &&
           !LIST_ITEM.test(lines[i]) && !/^\s*>/.test(lines[i]) &&
           !/^#{1,6}\s/.test(lines[i]) && !/^\s*```/.test(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    if (para.length) out.push('<p>' + inline(smartJoin(para)) + '</p>');
    else i++;
  }

  return out.join('\n');
}
