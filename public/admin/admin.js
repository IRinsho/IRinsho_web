/* =========================================================
 *  林夕的小站 · 专属后台  逻辑
 *  ---------------------------------------------------------
 *  零依赖前端：不引入任何框架，直接操作 DOM。
 *  数据都走 /api/*；Markdown 预览由服务端用站点自己的渲染器算好，
 *  所以后台看到的排版 = 网站上的排版。
 * ======================================================= */

/* ---------------- 小工具 ---------------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const fmtSize = (n) => {
  if (!n) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
};

const fmtTime = (ms) => {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const today = () => new Date().toISOString().slice(0, 10);

let toastTimer = null;
function toast(msg, kind = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show ' + kind;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast ' + kind; }, 3200);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {},
    ...options,
    body: options.body instanceof FormData ? options.body
      : (options.body ? JSON.stringify(options.body) : undefined)
  });
  let data = null;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) {
    if (res.status === 401 && state.view !== 'gate') showGate('login');
    throw new Error(data.error || `请求失败（${res.status}）`);
  }
  return data;
}

function setSaveState(text, kind = '') {
  const el = $('#saveState');
  el.textContent = text || '';
  el.className = 'save-state ' + kind;
}

/* ---- 通用弹窗 ---- */
function openModal({ title, fields, submitText = '保存', onSubmit, wide = false }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog">
      <div class="modal-head">
        <h3>${esc(title)}</h3>
        <button class="icon-btn" data-close>✕</button>
      </div>
      <form class="modal-body" id="modalForm">
        ${fields.map((f) => {
          const id = 'mf_' + f.name;
          if (f.type === 'textarea') {
            return `<label class="field ${f.span ? 'span-2' : ''}">
              <span class="field-label">${esc(f.label)}</span>
              <textarea id="${id}" rows="${f.rows || 3}" placeholder="${esc(f.placeholder || '')}">${esc(f.value || '')}</textarea>
              ${f.hint ? `<span class="field-hint">${esc(f.hint)}</span>` : ''}
            </label>`;
          }
          if (f.type === 'checkbox') {
            return `<label class="toggle ${f.span ? 'span-2' : ''}" style="grid-column:1/-1">
              <input type="checkbox" id="${id}" ${f.value ? 'checked' : ''}><span>${esc(f.label)}</span>
            </label>`;
          }
          if (f.type === 'select') {
            return `<label class="field ${f.span ? 'span-2' : ''}">
              <span class="field-label">${esc(f.label)}</span>
              <select id="${id}">${(f.options || []).map((o) => `<option value="${esc(o)}" ${o === f.value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>
            </label>`;
          }
          return `<label class="field ${f.span ? 'span-2' : ''}">
            <span class="field-label">${esc(f.label)}</span>
            <input type="${f.type || 'text'}" id="${id}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}">
            ${f.hint ? `<span class="field-hint">${esc(f.hint)}</span>` : ''}
          </label>`;
        }).join('')}
        <div class="modal-foot">
          <button type="button" class="btn" data-close>取消</button>
          <button type="submit" class="btn btn-primary" id="modalSubmit">${esc(submitText)}</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => { const first = overlay.querySelector('input,textarea,select'); if (first) first.focus(); }, 60);

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close]')) close();
  });
  const onEsc = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } };
  document.addEventListener('keydown', onEsc);

  $('#modalForm', overlay).addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = {};
    for (const f of fields) {
      const el = $('#mf_' + f.name, overlay);
      values[f.name] = f.type === 'checkbox' ? el.checked : el.value;
    }
    const btn = $('#modalSubmit', overlay);
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = '正在保存…';
    try {
      await onSubmit(values);
      close();
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false;
      btn.textContent = old;
    }
  });

  return { close };
}

/* ---------------- 全局状态 ---------------- */

const state = {
  view: 'gate',
  session: null,
  notes: [],
  currentRel: null,
  currentNote: null,
  dirty: false,
  photos: [],
  videos: [],
  links: [],
  config: null,
  vars: null,
  buildTimer: null
};

/* ---------------- 登录 ---------------- */

async function boot() {
  try {
    const s = await api('/api/session');
    state.session = s;
    $('#footRoot').textContent = s.root || '';
    if (s.authed) await enterApp();
    else showGate(s.configured ? 'login' : 'setup');
  } catch (e) {
    document.body.innerHTML = `<div class="gate"><div class="gate-card">
      <h1 class="gate-title">连不上后台服务</h1>
      <p class="gate-sub">${esc(e.message)}</p>
      <p class="gate-note">请确认后台还在运行：在项目目录执行 <code>npm run admin</code>，
      或双击项目里的 <code>打开后台.cmd</code>。</p>
    </div></div>`;
  }
}

function showGate(mode) {
  state.view = 'gate';
  const configured = state.session ? state.session.configured : true;
  const isSetup = mode === 'setup' || !configured;

  $('#app').hidden = true;
  $('#gate').hidden = false;
  $('#gateSub').textContent = isSetup ? '第一次使用，先设一个只有你知道的密码。' : '输入密码进入后台。';
  $('#pwLabel').textContent = isSetup ? '设置密码' : '密码';
  $('#pwConfirmWrap').hidden = !isSetup;
  $('#gateSubmit').textContent = isSetup ? '设置并进入' : '登录';
  $('#gateError').hidden = true;
  $('#gateNote').innerHTML = isSetup
    ? '密码存在 <code>.admin/auth.json</code>（已在 .gitignore 里，不会进仓库）。<br>忘了密码就删掉那个文件，重新设置。'
    : '连续输错 8 次会锁 5 分钟。';
  setTimeout(() => $('#gatePassword').focus(), 60);
}

$('#gateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#gateError');
  const btn = $('#gateSubmit');
  const pw = $('#gatePassword').value;
  const pw2 = $('#gatePassword2').value;
  const isSetup = !$('#pwConfirmWrap').hidden;

  err.hidden = true;
  if (isSetup && pw !== pw2) { err.textContent = '两次输入的密码不一样'; err.hidden = false; return; }
  if (pw.length < 6) { err.textContent = '密码至少 6 位'; err.hidden = false; return; }

  btn.disabled = true;
  btn.textContent = isSetup ? '正在设置……' : '正在登录……';
  try {
    await api(isSetup ? '/api/setup' : '/api/login', { method: 'POST', body: { password: pw } });
    state.session = await api('/api/session');
    $('#gatePassword').value = '';
    $('#gatePassword2').value = '';
    await enterApp();
  } catch (e2) {
    err.textContent = e2.message;
    err.hidden = false;
    btn.disabled = false;
    btn.textContent = isSetup ? '设置并进入' : '登录';
  }
});

async function enterApp() {
  $('#gate').hidden = true;
  $('#app').hidden = false;
  if (!location.hash) location.hash = '#/dashboard';
  await route();
}

$('#btnLogout').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST', body: {} });
  state.session = { configured: true, authed: false };
  showGate('login');
});

/* ---------------- 路由 ---------------- */

const VIEW_TITLES = {
  dashboard: '仪表盘', notes: '笔记', photos: '相册', videos: '视频', links: '友链',
  config: '站点信息', theme: '配色外观', health: '内容体检', publish: '构建发布'
};

window.addEventListener('hashchange', route);

async function route() {
  if (!state.session || !state.session.authed) return;
  const view = (location.hash.replace(/^#\//, '') || 'dashboard').split('?')[0];
  state.view = view;
  $('#pageTitle').textContent = VIEW_TITLES[view] || '仪表盘';
  $$('.nav-item').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
  $('#sidebar').classList.remove('open');
  stopBuildPolling();

  const box = $('#view');
  box.innerHTML = '<div class="grid grid-stats"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';

  try {
    if (view === 'notes') await viewNotes(box);
    else if (view === 'photos') await viewPhotos(box);
    else if (view === 'videos') await viewVideos(box);
    else if (view === 'links') await viewLinks(box);
    else if (view === 'config') await viewConfig(box);
    else if (view === 'theme') await viewTheme(box);
    else if (view === 'health') await viewHealth(box);
    else if (view === 'publish') await viewPublish(box);
    else await viewDashboard(box);
  } catch (e) {
    box.innerHTML = `<div class="card"><div class="empty">
      <div class="big">⚠</div><h3>这一页没打开</h3><p>${esc(e.message)}</p>
      <button class="btn btn-small" onclick="location.reload()">重新载入</button>
    </div></div>`;
  }
}

$('#btnRefresh').addEventListener('click', () => route());
$('#btnMenu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

window.addEventListener('beforeunload', (e) => {
  if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
});

/* =========================================================
 *  仪表盘
 * ======================================================= */

async function viewDashboard(box) {
  const d = await api('/api/dashboard');
  const c = d.counts;

  const pill = $('#pillDrafts');
  if (c.drafts > 0) { pill.textContent = c.drafts; pill.hidden = false; } else { pill.hidden = true; }

  box.innerHTML = `
    <div class="grid grid-stats">
      ${statCard('笔记', c.notes, `${c.drafts} 篇是草稿`, c.drafts > 0 ? 'is-warn' : '')}
      ${statCard('照片', c.photos, `${d.albums.length} 个相册`)}
      ${statCard('视频', c.videos, '含本地上传与外链')}
      ${statCard('友链', c.links, '交换链接的小站')}
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-head"><h3 class="card-title">常用操作</h3></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary" id="qaNewNote">＋ 写一篇新笔记</button>
        <button class="btn" id="qaUpload">▣ 上传照片</button>
        <button class="btn" id="qaVideo">▶ 添加视频</button>
        <button class="btn" id="qaBuild">↑ 构建并发布</button>
      </div>
    </div>

    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-head">
          <h3 class="card-title">最近改动</h3>
          <a class="btn btn-ghost btn-small" href="#/notes">全部笔记 →</a>
        </div>
        ${d.recent.length ? `<div class="list">${d.recent.map((n) => `
          <a class="list-row" href="#/notes?rel=${encodeURIComponent(n.rel)}">
            <div class="grow">
              <div class="list-title">${esc(n.title)}</div>
              <div class="list-sub">
                <span>${esc(n.date || '无日期')}</span>
                <span>${esc(n.category || '未分类')}</span>
                <span>${n.chars} 字</span>
                <span>${fmtTime(n.mtime)}</span>
              </div>
            </div>
            ${n.draft ? '<span class="badge badge-draft">草稿</span>' : ''}
          </a>`).join('')}</div>`
      : `<div class="empty"><div class="big">✎</div><h3>还没有笔记</h3>
           <p>点上面的「写一篇新笔记」，或者把 .md 文件放进项目的 blog/ 文件夹。</p></div>`}
      </div>

      <div class="card">
        <div class="card-head"><h3 class="card-title">需要留意</h3></div>
        ${d.drafts.length ? `<div class="list">${d.drafts.map((n) => `
          <a class="list-row" href="#/notes?rel=${encodeURIComponent(n.rel)}">
            <span class="badge badge-draft">草稿</span>
            <div class="grow"><div class="list-title">${esc(n.title)}</div></div>
            <span class="photo-size">${n.chars} 字</span>
          </a>`).join('')}</div>`
      : `<div class="notice"><span>✓</span><div>没有未发布的草稿。</div></div>`}

        <div style="margin-top:16px">
          <div class="card-head"><h3 class="card-title">相册分布</h3></div>
          ${d.albums.length ? `<div class="list">${d.albums.map((a) => `
            <div class="list-row"><div class="grow"><div class="list-title">${esc(a.name)}</div></div>
            <span class="badge">${a.count} 张</span></div>`).join('')}</div>`
      : `<div class="notice info"><div>「img/」里还没有照片。上传的照片会自动压缩成 WebP 并丢掉 EXIF。</div></div>`}
        </div>
      </div>
    </div>
  `;

  $('#qaNewNote').addEventListener('click', () => createNote());
  $('#qaUpload').addEventListener('click', () => location.hash = '#/photos');
  $('#qaVideo').addEventListener('click', () => location.hash = '#/videos');
  $('#qaBuild').addEventListener('click', () => location.hash = '#/publish');
}

function statCard(label, value, foot, cls = '') {
  return `<div class="stat ${cls}">
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value">${value}</div>
    <div class="stat-foot">${esc(foot || '')}</div>
  </div>`;
}

/* =========================================================
 *  笔记
 * ======================================================= */

async function createNote(folder = '') {
  openModal({
    title: '写一篇新笔记',
    submitText: '创建并开始写',
    fields: [
      { name: 'title', label: '标题', placeholder: '例如：TCP 三次握手' },
      { name: 'date', label: '日期', type: 'date', value: today() },
      { name: 'folder', label: '分类（子文件夹名）', value: folder, placeholder: '留空 = 未分类', hint: '填了就会在 blog/ 下建同名文件夹' }
    ],
    onSubmit: async (v) => {
      if (!v.title.trim()) throw new Error('标题不能为空');
      const r = await api('/api/note/create', { method: 'POST', body: { title: v.title.trim(), date: v.date, folder: v.folder.trim() } });
      toast('已创建：' + r.rel, 'ok');
      location.hash = '#/notes?rel=' + encodeURIComponent(r.rel);
      await route();
    }
  });
}

async function viewNotes(box) {
  const { notes } = await api('/api/notes');
  state.notes = notes;

  const drafts = notes.filter((n) => n.draft).length;
  const pill = $('#pillDrafts');
  if (drafts) { pill.textContent = drafts; pill.hidden = false; } else { pill.hidden = true; }

  const cats = [...new Set(notes.map((n) => n.category).filter(Boolean))];

  box.innerHTML = `
    <div class="split">
      <div class="note-list">
        <div class="note-list-head">
          <button class="btn btn-primary btn-block" id="btnNewNote">＋ 新笔记</button>
          <input type="text" id="noteSearch" placeholder="搜标题 / 分类 / 标签…">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <select id="noteCat" style="flex:1;min-width:110px">
              <option value="">全部分类</option>
              ${cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
            </select>
            <label class="toggle" title="只看草稿">
              <input type="checkbox" id="noteDraftOnly"><span>草稿</span>
            </label>
          </div>
          <div class="list-sub" id="noteCount">${notes.length} 篇</div>
        </div>
        <div class="note-list-body" id="noteListBody"></div>
      </div>
      <div class="editor" id="editorBox">
        <div class="card"><div class="empty">
          <div class="big">✎</div>
          <h3>从左边选一篇开始</h3>
          <p>选中之后，右边会出现编辑器和实时预览。</p>
        </div></div>
      </div>
    </div>
  `;

  const renderList = () => {
    const q = ($('#noteSearch').value || '').trim().toLowerCase();
    const cat = $('#noteCat').value;
    const draftOnly = $('#noteDraftOnly').checked;
    const list = notes.filter((n) => {
      if (cat && n.category !== cat) return false;
      if (draftOnly && !n.draft) return false;
      if (!q) return true;
      return [n.title, n.category, (n.tags || []).join(' '), n.rel].join(' ').toLowerCase().includes(q);
    });
    $('#noteCount').textContent = `${list.length} / ${notes.length} 篇`;
    $('#noteListBody').innerHTML = list.length ? list.map(noteRow).join('')
      : `<div class="empty" style="padding:26px 10px"><p>没有匹配的笔记</p></div>`;
    $$('.note-item', $('#noteListBody')).forEach((el) => {
      el.addEventListener('click', () => openNote(el.dataset.rel));
    });
  };

  $('#btnNewNote').addEventListener('click', () => createNote());
  $('#noteSearch').addEventListener('input', renderList);
  $('#noteCat').addEventListener('change', renderList);
  $('#noteDraftOnly').addEventListener('change', renderList);
  renderList();

  const wanted = new URLSearchParams(location.hash.split('?')[1] || '').get('rel');
  if (wanted && notes.some((n) => n.rel === wanted)) await openNote(wanted);
}

function noteRow(n) {
  return `<div class="note-item ${n.rel === state.currentRel ? 'active' : ''}" data-rel="${esc(n.rel)}">
    <div class="note-item-title">
      ${n.draft ? '<span class="badge badge-draft">草稿</span>' : ''}
      ${n.pinned ? '<span class="badge badge-pin">置顶</span>' : ''}
      <span>${esc(n.title)}</span>
    </div>
    <div class="note-item-sub">
      <span>${esc(n.date || '无日期')}</span>
      <span>${esc(n.category || '未分类')}</span>
      <span>${n.chars} 字</span>
    </div>
  </div>`;
}

async function openNote(rel) {
  if (state.dirty && !confirm('当前笔记还没保存，确定切换吗？')) return;
  state.currentRel = rel;
  state.dirty = false;
  setSaveState('');

  $$('.note-item').forEach((el) => el.classList.toggle('active', el.dataset.rel === rel));

  const editorBox = $('#editorBox');
  editorBox.innerHTML = '<div class="card"><div class="skeleton" style="height:420px"></div></div>';

  const { note, html } = await api('/api/note?rel=' + encodeURIComponent(rel));
  state.currentNote = note;
  const f = note.fields;
  const catList = [...new Set(state.notes.map((n) => n.category).filter(Boolean))];

  editorBox.innerHTML = `
    <div class="card">
      <div class="editor-head">
        <span class="grow">blog/${esc(note.rel)}</span>
        <div class="editor-actions">
          <button class="btn btn-small" id="btnRename">改文件名</button>
          <button class="btn btn-danger btn-small" id="btnDeleteNote">删除</button>
          <button class="btn btn-small" id="btnReload">放弃改动</button>
          <button class="btn btn-primary btn-small" id="btnSave">保存（Ctrl/⌘ + S）</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="form-grid">
        <label class="field span-2">
          <span class="field-label">标题</span>
          <input type="text" id="fTitle" value="${esc(f.title)}">
        </label>
        <label class="field">
          <span class="field-label">日期</span>
          <input type="date" id="fDate" value="${esc(f.date)}">
        </label>
        <label class="field">
          <span class="field-label">分类（子文件夹名）</span>
          <input type="text" id="fCategory" value="${esc(f.category)}" list="catList" placeholder="留空 = 未分类">
          <datalist id="catList">${catList.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        </label>
        <label class="field span-2">
          <span class="field-label">标签（用逗号分隔）</span>
          <input type="text" id="fTags" value="${esc((f.tags || []).join(', '))}" placeholder="C语言, 练习">
        </label>
        <label class="field span-2">
          <span class="field-label">摘要（显示在卡片上）</span>
          <textarea id="fSummary" rows="2" placeholder="一句话概括这篇写了什么">${esc(f.summary)}</textarea>
        </label>
        <label class="field span-2">
          <span class="field-label">封面（写 blog/ 里的图片名，留空自动生成）</span>
          <input type="text" id="fCover" value="${esc(f.cover)}" placeholder="p1.png">
        </label>
        <div class="field span-2 toggles">
          <label class="toggle"><input type="checkbox" id="fPinned" ${f.pinned ? 'checked' : ''}><span>置顶（列表排最前）</span></label>
          <label class="toggle"><input type="checkbox" id="fDraft" ${f.draft ? 'checked' : ''}><span>草稿（不发布到网站）</span></label>
          <span class="field-hint" id="metaInfo">${note.chars} 字 · 改动于 ${fmtTime(note.mtime)}</span>
        </div>
      </div>
    </div>

    <div class="edit-panes">
      <div class="pane">
        <div class="pane-head">
          <span>Markdown 正文</span>
          <span class="spacer"></span>
          <span id="charCount">${note.body.length} 字符</span>
        </div>
        <textarea class="md-input" id="mdInput" spellcheck="false">${esc(note.body)}</textarea>
      </div>
      <div class="pane">
        <div class="pane-head">
          <span>实时预览</span>
          <span class="spacer"></span>
          <span>和线上完全一致</span>
        </div>
        <div class="md-preview" id="mdPreview">${html}</div>
      </div>
    </div>
  `;

  const mdInput = $('#mdInput');
  const preview = $('#mdPreview');

  const markDirty = () => { state.dirty = true; setSaveState('有未保存的改动', 'err'); };

  mdInput.addEventListener('input', () => {
    $('#charCount').textContent = mdInput.value.length + ' 字符';
    markDirty();
    schedulePreview();
  });
  ['fTitle', 'fDate', 'fCategory', 'fTags', 'fSummary', 'fCover'].forEach((id) => {
    $('#' + id).addEventListener('input', markDirty);
  });
  ['fPinned', 'fDraft'].forEach((id) => $('#' + id).addEventListener('change', markDirty));

  let previewTimer = null;
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      try {
        const { html: h } = await api('/api/preview', { method: 'POST', body: { markdown: mdInput.value } });
        const scroll = preview.scrollTop;
        preview.innerHTML = h;
        preview.scrollTop = scroll;
      } catch { /* 预览失败不打断写作 */ }
    }, 300);
  }

  mdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = mdInput.selectionStart, en = mdInput.selectionEnd;
      mdInput.value = mdInput.value.slice(0, s) + '  ' + mdInput.value.slice(en);
      mdInput.selectionStart = mdInput.selectionEnd = s + 2;
      markDirty();
    }
  });

  function collect() {
    return {
      title: $('#fTitle').value.trim(),
      date: $('#fDate').value,
      category: $('#fCategory').value.trim(),
      tags: $('#fTags').value.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      summary: $('#fSummary').value.trim(),
      cover: $('#fCover').value.trim(),
      pinned: $('#fPinned').checked,
      draft: $('#fDraft').checked
    };
  }

  async function save() {
    const btn = $('#btnSave');
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = '正在保存…';
    try {
      await api('/api/note/save', { method: 'POST', body: { rel: state.currentRel, fields: collect(), body: mdInput.value } });
      state.dirty = false;
      const st = $('#metaInfo');
      if (st) st.textContent = `${mdInput.value.replace(/\s/g, '').length} 字 · 刚刚保存`;
      setSaveState('已保存 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), 'ok');
      toast('已保存。旧版本备份在 .admin/backups/', 'ok');
      await refreshNoteList();
    } catch (e) {
      toast('保存失败：' + e.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = '保存（Ctrl/⌘ + S）';
    }
  }

  $('#btnSave').addEventListener('click', save);
  $('#btnReload').addEventListener('click', async () => {
    if (state.dirty && !confirm('放弃未保存的改动？')) return;
    state.dirty = false;
    await openNote(state.currentRel);
  });

  $('#btnRename').addEventListener('click', () => {
    const dir = note.rel.includes('/') ? note.rel.replace(/[^/]+$/, '') : '';
    openModal({
      title: '改文件名',
      submitText: '改名并保存',
      fields: [{
        name: 'name', label: '文件名（不用写 .md）', span: true,
        value: note.fileName.replace(/\.md$/i, ''),
        hint: '改文件名会改变网址（/notes/文件名/）。旧文件会自动备份。'
      }],
      onSubmit: async (v) => {
        const name = v.name.trim().replace(/\.md$/i, '');
        if (!name) throw new Error('文件名不能为空');
        const newRel = dir + name + '.md';
        if (newRel === note.rel) return;
        await api('/api/note/save', {
          method: 'POST',
          body: { rel: note.rel, renameTo: newRel, fields: collect(), body: mdInput.value }
        });
        state.dirty = false;
        toast('已改名为 ' + newRel, 'ok');
        state.currentRel = newRel;
        await route();
      }
    });
  });

  $('#btnDeleteNote').addEventListener('click', () => {
    if (!confirm(`确定删除「${note.fields.title}」吗？\n\n旧版本会备份到 .admin/backups/，可以从那里找回来。`)) return;
    api('/api/note/delete', { method: 'POST', body: { rel: note.rel } })
      .then(() => {
        toast('已删除（备份在 .admin/backups/）', 'ok');
        state.dirty = false;
        state.currentRel = null;
        location.hash = '#/notes';
        return route();
      })
      .catch((e) => toast('删除失败：' + e.message, 'err'));
  });

  document.onkeydown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (state.currentRel) save();
    }
  };
}

async function refreshNoteList() {
  const { notes } = await api('/api/notes');
  state.notes = notes;
  const drafts = notes.filter((n) => n.draft).length;
  const pill = $('#pillDrafts');
  if (drafts) { pill.textContent = drafts; pill.hidden = false; } else { pill.hidden = true; }

  const body = $('#noteListBody');
  if (!body) return;
  const q = (($('#noteSearch') || {}).value || '').trim().toLowerCase();
  const cat = ($('#noteCat') || {}).value || '';
  const draftOnly = ($('#noteDraftOnly') || {}).checked || false;
  const list = notes.filter((n) => {
    if (cat && n.category !== cat) return false;
    if (draftOnly && !n.draft) return false;
    if (!q) return true;
    return [n.title, n.category, (n.tags || []).join(' '), n.rel].join(' ').toLowerCase().includes(q);
  });
  const count = $('#noteCount');
  if (count) count.textContent = `${list.length} / ${notes.length} 篇`;
  body.innerHTML = list.map(noteRow).join('');
  $$('.note-item', body).forEach((el) => el.addEventListener('click', () => openNote(el.dataset.rel)));
}

/* =========================================================
 *  相册
 * ======================================================= */

async function viewPhotos(box) {
  const { photos } = await api('/api/photos');
  state.photos = photos;
  const albums = [...new Set(photos.map((p) => p.album))];

  box.innerHTML = `
    <div class="card" id="dropZone" style="margin-bottom:16px;border-style:dashed;cursor:pointer">
      <div class="empty" style="padding:26px 20px">
        <div class="big">▣</div>
        <h3>把图片拖到这里上传</h3>
        <p>也可以点这里选文件，手机上会直接打开相册。<br>
        上传后自动压缩成 WebP、丢掉 EXIF（含定位）、最长边缩到 2000px。</p>
        <input type="file" id="fileInput" accept="image/*" multiple hidden>
      </div>
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
      <span class="badge">共 ${photos.length} 张</span>
      ${albums.map((a) => `<span class="badge">${esc(a)} · ${photos.filter((p) => p.album === a).length}</span>`).join('')}
      <span class="spacer" style="margin-left:auto"></span>
      <button class="btn btn-small" id="btnSyncPhotos">同步图片（生成压缩图）</button>
    </div>

    <div class="grid grid-photos" id="photoGrid">
      ${photos.map(photoCard).join('') || `<div class="card"><div class="empty"><p>还没有照片，拖一张上来试试。</p></div></div>`}
    </div>
  `;

  /* --- 上传 --- */
  const zone = $('#dropZone');
  const input = $('#fileInput');
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => uploadFiles([...input.files]));
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.borderColor = 'var(--rose)'; });
  zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.style.borderColor = '';
    uploadFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')));
  });

  $$('.photo-card', box).forEach((card) => {
    card.addEventListener('click', () => editPhoto(card.dataset.rel));
  });

  $('#btnSyncPhotos').addEventListener('click', () => {
    toast('正在同步图片…', '');
    location.hash = '#/publish';
  });
}

function photoCard(p) {
  const title = (p.meta && p.meta.title) || p.name;
  return `<div class="photo-card" data-rel="${esc(p.rel)}" style="cursor:pointer">
    <div class="photo-thumb" style="background-image:url('${esc(p.fileUrl)}')"></div>
    <div class="photo-meta">
      <div class="photo-name" title="${esc(p.rel)}">${esc(title)}</div>
      <div class="photo-tags">
        <span class="badge">${esc(p.album)}</span>
        <span class="photo-size">${fmtSize(p.size)}</span>
      </div>
      ${p.meta && p.meta.tags && p.meta.tags.length
        ? `<div class="photo-tags">${p.meta.tags.map((t) => `<span class="badge badge-info">${esc(t)}</span>`).join('')}</div>`
        : ''}
      ${p.meta && p.meta.desc ? `<div class="photo-size">${esc(p.meta.desc)}</div>` : ''}
    </div>
  </div>`;
}

async function uploadFiles(files, album = '') {
  if (!files.length) return;
  setSaveState(`正在上传 0/${files.length}…`);
  let done = 0, failed = 0;
  for (const f of files) {
    try {
      const res = await fetch(`/api/photos/upload?name=${encodeURIComponent(f.name)}&album=${encodeURIComponent(album)}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': f.type || 'application/octet-stream' },
        body: f
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上传失败');
      done++;
    } catch (e) {
      failed++;
      toast(`${f.name} 上传失败：${e.message}`, 'err');
    }
    setSaveState(`正在上传 ${done + failed}/${files.length}…`);
  }
  setSaveState('');
  toast(failed ? `上传完成：成功 ${done} 张，失败 ${failed} 张` : `已上传 ${done} 张照片`, failed ? 'err' : 'ok');
  await route();
}

function editPhoto(rel) {
  const p = state.photos.find((x) => x.rel === rel);
  if (!p) return;
  const m = p.meta || {};
  openModal({
    title: '编辑这张照片',
    wide: true,
    fields: [
      { name: 'title', label: '标题', span: true, value: m.title || '', placeholder: p.name },
      { name: 'desc', label: '描述', type: 'textarea', span: true, rows: 2, value: m.desc || '' },
      { name: 'album', label: '相册分类', value: m.album || p.album, hint: '默认取所在文件夹名' },
      { name: 'date', label: '日期', type: 'date', value: m.date || '' },
      { name: 'tags', label: '标签（逗号分隔）', span: true, value: (m.tags || []).join(', ') }
    ],
    onSubmit: async (v) => {
      await api('/api/photos/quick', {
        method: 'POST',
        body: {
          rel,
          patch: {
            title: v.title.trim(),
            desc: v.desc.trim(),
            album: v.album.trim(),
            date: v.date,
            tags: v.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
          }
        }
      });
      toast('已保存（写回 src/data/photo-meta.js）', 'ok');
      await route();
    }
  });
}

/* =========================================================
 *  视频
 * ======================================================= */

const SOURCE_LABEL = { douyin: '抖音', embed: '外链嵌入', local: '本地视频', '': '未填链接' };

async function viewVideos(box) {
  const { videos } = await api('/api/videos');
  state.videos = videos;

  box.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-head">
        <h3 class="card-title">视频列表</h3>
        <span class="badge">${videos.length} 条</span>
        <button class="btn btn-primary btn-small" id="btnAddVideo">＋ 添加视频</button>
      </div>
      ${videos.length ? `<div class="list">${videos.map((v, i) => `
        <div class="list-row">
          <div style="width:76px;height:44px;flex:0 0 76px;border-radius:8px;background:#0b0d1c center/cover no-repeat;${v.posterUrl ? `background-image:url('${esc(v.posterUrl)}')` : ''}"></div>
          <div class="grow">
            <div class="list-title">${esc(v.title || '（无标题）')}</div>
            <div class="list-sub">
              <span class="badge">${esc(SOURCE_LABEL[v.source] || v.source)}</span>
              <span>${esc(v.category || '未分类')}</span>
              <span>${esc(v.date || '无日期')}</span>
              ${v.duration ? `<span>${esc(v.duration)}</span>` : ''}
              ${v.ratio ? `<span>${esc(v.ratio)}</span>` : ''}
            </div>
          </div>
          <button class="btn btn-small" data-edit="${i}">编辑</button>
          <button class="btn btn-danger btn-small" data-del="${i}">删除</button>
        </div>`).join('')}</div>`
      : `<div class="empty"><div class="big">▶</div><h3>还没有视频</h3>
           <p>点「添加视频」，粘一条抖音 / B站 / YouTube 链接就行。</p></div>`}
    </div>

    <div class="notice info"><div>
      抓封面需要联网，而且抖音那一条得靠你本机的浏览器 —— 云端抓不到。
      后台可以先粘链接，封面等你跑 <code>npm run sync:covers</code> 时补上。
    </div></div>
  `;

  $('#btnAddVideo').addEventListener('click', () => editVideo(null));
  $$('[data-edit]', box).forEach((b) => b.addEventListener('click', () => editVideo(Number(b.dataset.edit))));
  $$('[data-del]', box).forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.del);
    if (!confirm(`确定删除「${videos[i].title}」这条视频吗？`)) return;
    api('/api/videos/delete', { method: 'POST', body: { index: i } })
      .then(() => { toast('已删除', 'ok'); return route(); })
      .catch((e) => toast('删除失败：' + e.message, 'err'));
  }));
}

function editVideo(index) {
  const v = index === null ? {} : state.videos[index];
  const link = v.link || '';
  openModal({
    title: index === null ? '添加视频' : '编辑视频',
    submitText: index === null ? '添加' : '保存',
    wide: true,
    fields: [
      { name: 'title', label: '标题', span: true, value: v.title || '' },
      {
        name: 'link', label: '视频链接 / 本地路径', span: true, value: link,
        placeholder: 'https://www.douyin.com/video/7301234567890123456',
        hint: '抖音粘分享链接或纯数字 id；B站/YouTube 粘分享链接；本地视频写 media/videos/xxx.mp4'
      },
      { name: 'desc', label: '描述', type: 'textarea', span: true, rows: 2, value: v.desc || '' },
      { name: 'category', label: '分类', value: v.category || '' },
      { name: 'date', label: '日期', type: 'date', value: v.date || today() },
      { name: 'tags', label: '标签（逗号分隔）', span: true, value: (v.tags || []).join(', ') },
      { name: 'duration', label: '时长（显示用，例如 00:15）', value: v.duration || '' },
      { name: 'poster', label: '封面路径（可留空，等同步自动抓）', value: v.poster || '' }
    ],
    onSubmit: async (vals) => {
      const out = {
        title: vals.title.trim(),
        desc: vals.desc.trim(),
        category: vals.category.trim(),
        tags: vals.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        date: vals.date,
        duration: vals.duration.trim(),
        poster: vals.poster.trim()
      };
      const l = vals.link.trim();
      if (l) {
        const digits = l.match(/(\d{15,})/);
        if (/douyin\.com|v\.douyin/i.test(l) || /^\d{15,}$/.test(l)) {
          out.douyin = digits ? digits[1] : l;
        } else if (/^media\//i.test(l) || /\.(mp4|webm|mov|m4v)$/i.test(l)) {
          out.src = l;
        } else {
          out.embed = l;
        }
      }
      await api('/api/videos/save', { method: 'POST', body: { index: index === null ? null : index, video: out } });
      toast(index === null ? '已添加' : '已保存', 'ok');
      await route();
    }
  });
}

/* =========================================================
 *  友链
 * ======================================================= */

async function viewLinks(box) {
  const { links } = await api('/api/links');
  state.links = links;

  box.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-head">
        <h3 class="card-title">友链列表</h3>
        <span class="badge">${links.length} 条</span>
        <button class="btn btn-primary btn-small" id="btnAddLink">＋ 添加友链</button>
      </div>
    </div>
    ${links.length ? `<div class="grid grid-2">
      ${links.map((l, i) => `
        <div class="card">
          <div class="card-head">
            <h3 class="card-title">${esc(l.name || '（没写站名）')}</h3>
            ${l.featured ? '<span class="badge badge-pin">置顶</span>' : ''}
            ${l.open ? '<span class="badge badge-info">招募位</span>' : ''}
            <span class="spacer" style="margin-left:auto"></span>
            <button class="btn btn-small" data-edit="${i}">编辑</button>
            <button class="btn btn-danger btn-small" data-del="${i}">删除</button>
          </div>
          <div class="kv">
            <span class="k">网址</span>
            <span>${l.url ? `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.url)}</a>` : '<span class="field-hint">没填</span>'}</span>
            <span class="k">简介</span><span>${esc(l.desc || '—')}</span>
            <span class="k">标签</span><span>${(l.tags || []).map((t) => `<span class="badge">${esc(t)}</span>`).join(' ') || '—'}</span>
            <span class="k">认识时间</span><span>${esc(l.since || '—')}</span>
          </div>
        </div>`).join('')}
    </div>`
    : `<div class="card"><div class="empty"><div class="big">♡</div><h3>还没有友链</h3>
        <p>点「添加友链」写第一条。</p></div></div>`}
  `;

  $('#btnAddLink').addEventListener('click', () => editLink(null));
  $$('[data-edit]', box).forEach((b) => b.addEventListener('click', () => editLink(Number(b.dataset.edit))));
  $$('[data-del]', box).forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.del);
    if (!confirm(`确定删除「${links[i].name}」吗？`)) return;
    api('/api/links/delete', { method: 'POST', body: { index: i } })
      .then(() => { toast('已删除', 'ok'); return route(); })
      .catch((e) => toast('删除失败：' + e.message, 'err'));
  }));
}

function editLink(index) {
  const l = index === null ? {} : state.links[index];
  openModal({
    title: index === null ? '添加友链' : '编辑友链',
    submitText: index === null ? '添加' : '保存',
    fields: [
      { name: 'name', label: '站名', span: true, value: l.name || '' },
      { name: 'url', label: '网址（带 https://）', span: true, value: l.url || '', placeholder: 'https://example.com/' },
      { name: 'desc', label: '一句话介绍', type: 'textarea', span: true, rows: 2, value: l.desc || '' },
      { name: 'avatar', label: '头像（本地路径或完整网址，可留空）', span: true, value: l.avatar || '' },
      { name: 'tags', label: '标签（逗号分隔）', value: (l.tags || []).join(', ') },
      { name: 'since', label: '认识时间（例如 2026-03）', value: l.since || '' },
      { name: 'featured', label: '置顶这条（排在前面并带星标）', type: 'checkbox', value: !!l.featured },
      { name: 'open', label: '这是「交换友链」招募位（不是真友链）', type: 'checkbox', value: !!l.open }
    ],
    onSubmit: async (v) => {
      const out = {
        name: v.name.trim(),
        url: v.url.trim(),
        desc: v.desc.trim(),
        avatar: v.avatar.trim(),
        tags: v.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        since: v.since.trim(),
        featured: v.featured,
        open: v.open
      };
      if (!out.name) throw new Error('站名不能为空');
      await api('/api/links/save', { method: 'POST', body: { index: index === null ? null : index, link: out } });
      toast(index === null ? '已添加' : '已保存', 'ok');
      await route();
    }
  });
}

/* =========================================================
 *  站点信息
 * ======================================================= */

async function viewConfig(box) {
  const { config, vars } = await api('/api/config');
  state.config = config;
  state.vars = vars;

  const str = (v) => (v == null ? '' : String(v));
  const arr = (v) => (Array.isArray(v) ? v.join(', ') : '');

  const section = (title, rows) => `
    <div class="card">
      <div class="card-head"><h3 class="card-title">${esc(title)}</h3></div>
      <div class="form-grid">${rows.join('')}</div>
    </div>`;

  const text = (path, label, value, hint, span) => `
    <label class="field ${span ? 'span-2' : ''}">
      <span class="field-label">${esc(label)}</span>
      <input type="text" data-path="${esc(path)}" value="${esc(str(value))}">
      ${hint ? `<span class="field-hint">${esc(hint)}</span>` : ''}
    </label>`;

  const area = (path, label, value, hint) => `
    <label class="field span-2">
      <span class="field-label">${esc(label)}</span>
      <textarea data-path="${esc(path)}" rows="3">${esc(str(value))}</textarea>
      ${hint ? `<span class="field-hint">${esc(hint)}</span>` : ''}
    </label>`;

  const me = config.me || {};

  box.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="editor-head">
        <span class="grow">src/data/config.js</span>
        <div class="editor-actions">
          <button class="btn btn-small" id="btnReloadCfg">放弃改动</button>
          <button class="btn btn-primary btn-small" id="btnSaveCfg">保存</button>
        </div>
      </div>
    </div>

    ${section('站点', [
      text('site', '站点网址', config.site, '分享卡片、站点地图要用，例如 https://irinsho.top'),
      text('ogImage', '默认分享图', config.ogImage, '相对 public/ 的路径，建议 1920×1080 横图'),
      text('author', '作者署名', config.author),
      text('footer', '页脚文字', config.footer)
    ])}

    ${section('品牌与首页', [
      text('name', '品牌名（左上角）', config.name),
      text('nameAccent', '品牌名里染色的部分', config.nameAccent, '填品牌名里的一两个字母；想整体单色就留空'),
      text('homeTitle', '首页大标题', config.homeTitle),
      area('homeMotto', '首页一句话', config.homeMotto),
      text('avatar', '顶栏头像', config.avatar, '相对 public/ 的路径，路径写错会显示一个玫红菱形')
    ])}

    ${section('个人页（ME）', [
      text('me.label', '小标题', me.label),
      text('me.no', '编号', me.no),
      text('me.photo', '左侧大图', me.photo, '相对 public/ 的路径'),
      text('me.decor', '图上竖排大字', me.decor),
      text('me.decorSub', '竖排大字下面一行', me.decorSub),
      area('me.quote', '引言', me.quote, '想换行就写 \\n'),
      area('me.bio', '自我介绍', me.bio),
      text('me.friend.label', '友链入口小字', (me.friend || {}).label),
      text('me.friend.text', '友链入口大字', (me.friend || {}).text),
      text('me.friend.url', '友链入口网址', (me.friend || {}).url, '站内页写相对路径如 links/；外部写完整 https://'),
      text('me.footLeft', '页脚左', me.footLeft),
      text('me.footRight', '页脚右', me.footRight)
    ])}

    <div class="card">
      <div class="card-head"><h3 class="card-title">章节条 / 社交链接 / 竖排导航</h3></div>
      <div class="notice"><div>
        这三块是「对象数组」，用表单改容易出错，所以这里只显示当前内容。
        要改就直接编辑 <code>src/data/config.js</code>（后台不会覆盖它们）。
      </div></div>
      <div class="kv" style="margin-top:14px">
        <span class="k">首页章节条</span><span>${(config.chapters || []).map((c) => `${esc(c.no)} ${esc(c.label)} → ${esc(c.href)}`).join('　|　') || '—'}</span>
        <span class="k">社交链接</span><span>${(me.links || []).map((l) => `${esc(l.label)}: ${esc(l.url)}`).join('　|　') || '—'}</span>
        <span class="k">竖排导航</span><span>${(me.sidenav || []).map((l) => `${esc(l.label)} → ${esc(l.href)}`).join('　|　') || '—'}</span>
      </div>
    </div>
  `;

  const collect = () => {
    const changes = {};
    const targetKeys = new Set();
    $$('[data-path]', box).forEach((el) => {
      const p = el.dataset.path;
      const top = p.split('.')[0];
      const cur = p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), config);
      const next = el.value;
      if (String(cur == null ? '' : cur) === next) return;
      targetKeys.add(top);
      if (p.includes('.')) {
        // 嵌套字段：服务端需要知道只动这些顶层键
        changes[p] = next;
      } else if (Array.isArray(cur)) {
        changes[p] = next.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
      } else {
        changes[p] = next;
      }
    });
    return { changes, targetKeys: [...targetKeys] };
  };

  $('#btnSaveCfg').addEventListener('click', async () => {
    const { changes, targetKeys } = collect();
    if (!Object.keys(changes).length) { toast('没有改动'); return; }
    const btn = $('#btnSaveCfg');
    btn.disabled = true;
    btn.textContent = '正在保存…';
    try {
      const r = await api('/api/config/save', { method: 'POST', body: { changes, targetKeys } });
      toast(`已保存 ${r.changed.length} 项：${r.changed.join('、')}`, 'ok');
      setSaveState('已保存', 'ok');
      await route();
    } catch (e) {
      toast('保存失败：' + e.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = '保存';
    }
  });

  $('#btnReloadCfg').addEventListener('click', () => route());
  $$('[data-path]', box).forEach((el) => el.addEventListener('input', () => setSaveState('有未保存的改动', 'err')));
}

/* =========================================================
 *  配色外观
 * ======================================================= */

async function viewTheme(box) {
  const { vars } = await api('/api/theme');
  state.vars = vars;

  const MAIN = ['--rose', '--bg', '--paper-ink'];
  const isColor = (v) => /^#[0-9a-f]{3,8}$/i.test(String(v).trim());
  const entries = Object.entries(vars);

  const row = ([k, v]) => {
    const color = isColor(v);
    return `<div class="card" style="padding:13px 15px">
      <div style="display:flex;align-items:center;gap:12px">
        ${color
          ? `<input type="color" data-var="${esc(k)}" value="${esc(v)}" style="width:46px;height:46px;flex:0 0 46px;border:1px solid var(--line-strong);border-radius:11px;background:none;cursor:pointer;padding:2px">`
          : `<div style="width:46px;height:46px;flex:0 0 46px;border-radius:11px;border:1px solid var(--line-strong);background:repeating-conic-gradient(#333 0% 25%, #444 0% 50%) 50%/12px 12px"></div>`}
        <div style="min-width:0;flex:1">
          <div style="font-family:var(--mono);font-size:12.5px">${esc(k)}</div>
          <input type="text" data-text="${esc(k)}" value="${esc(v)}"
                 style="margin-top:4px;font-size:12px;padding:5px 8px">
        </div>
        ${MAIN.includes(k) ? '<span class="badge badge-pin">主色</span>' : ''}
      </div>
    </div>`;
  };

  box.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="editor-head">
        <span class="grow">public/assets/css/style.css 的 :root 变量</span>
        <div class="editor-actions">
          <button class="btn btn-small" id="btnResetTheme">放弃改动</button>
          <button class="btn btn-primary btn-small" id="btnSaveTheme">保存配色</button>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-head"><h3 class="card-title">预览</h3></div>
      <div id="themePreview" style="padding:18px;border-radius:12px;background:var(--bg);border:1px solid var(--line)">
        <div style="font-size:19px;font-weight:700">IRinsho</div>
        <div style="margin-top:6px;color:var(--rose);font-weight:600">这是主色调的示范文字</div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
          <span style="padding:5px 12px;border-radius:20px;background:var(--rose);color:#fff;font-size:12px">强调按钮</span>
          <span style="padding:5px 12px;border-radius:20px;border:1px solid var(--line-strong);font-size:12px">普通按钮</span>
          <span style="padding:5px 12px;border-radius:20px;background:var(--panel);font-size:12px">面板底色</span>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-head"><h3 class="card-title">主色</h3></div>
      <div class="grid grid-2">${MAIN.filter((k) => vars[k]).map((k) => row([k, vars[k]])).join('')}</div>
    </div>

    <div class="card">
      <div class="card-head"><h3 class="card-title">全部变量（${entries.length} 个）</h3></div>
      <div class="grid grid-2">${entries.filter(([k]) => !MAIN.includes(k)).map(row).join('')}</div>
    </div>
  `;

  const collect = () => {
    const out = {};
    $$('[data-text]', box).forEach((el) => {
      const k = el.dataset.text;
      const v = el.value.trim();
      if (vars[k] !== v) out[k] = v;
    });
    return out;
  };

  const preview = $('#themePreview');
  const syncPreview = () => {
    $$('[data-text]', box).forEach((el) => {
      const v = el.value.trim();
      if (/^#[0-9a-f]{3,8}$/i.test(v)) preview.style.setProperty(el.dataset.text, v);
      const picker = $(`[data-var="${el.dataset.text}"]`, box);
      if (picker && /^#[0-9a-f]{6}$/i.test(v)) picker.value = v;
    });
  };

  box.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.var) {
      const textEl = $(`[data-text="${t.dataset.var}"]`, box);
      if (textEl) textEl.value = t.value;
      preview.style.setProperty(t.dataset.var, t.value);
    }
    if (t.dataset.text) syncPreview();
    setSaveState('有未保存的改动', 'err');
  });

  $('#btnSaveTheme').addEventListener('click', async () => {
    const changed = collect();
    if (!Object.keys(changed).length) { toast('没有改动'); return; }
    const btn = $('#btnSaveTheme');
    btn.disabled = true;
    btn.textContent = '正在保存…';
    try {
      const r = await api('/api/theme/save', { method: 'POST', body: { vars: changed } });
      if (r.skipped) toast('没有实际改动');
      else toast(`已保存 ${r.changed.length} 个颜色变量`, 'ok');
      setSaveState('已保存', 'ok');
    } catch (e) {
      toast('保存失败：' + e.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = '保存配色';
    }
  });

  $('#btnResetTheme').addEventListener('click', () => route());
}

/* =========================================================
 *  内容体检
 * ======================================================= */

async function viewHealth(box) {
  const r = await api('/api/health');
  const LEVEL = { warn: ['badge-warn', '要处理'], info: ['badge-info', '可优化'] };

  box.innerHTML = `
    <div class="grid grid-stats">
      ${statCard('扫过的笔记', r.scanned.notes, r.scanned.skipped ? `另有 ${r.scanned.skipped} 个说明/模板已跳过` : 'blog/ 下全部 .md')}
      ${statCard('扫过的照片', r.scanned.photos, 'img/ 下全部图片')}
      ${statCard('要处理的问题', r.issues.filter((i) => i.level === 'warn').length, '断链 / 重复 / 异常日期', r.ok ? '' : 'is-warn')}
      ${statCard('可优化项', r.issues.filter((i) => i.level === 'info').length, '空正文 / 没分类')}
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-head">
        <h3 class="card-title">体检结果</h3>
        <span class="badge">${r.issues.length} 条</span>
      </div>
      ${r.issues.length ? `<div class="list">${r.issues.map((i) => `
        <div class="list-row">
          <span class="badge ${LEVEL[i.level][0]}">${LEVEL[i.level][1]}</span>
          <div class="grow">
            <div class="list-title">${esc(i.message)}</div>
            <div class="list-sub">
              ${i.title ? `<span>${esc(i.title)}</span>` : ''}
              ${i.rel ? `<span style="font-family:var(--mono)">${esc(i.rel)}</span>` : ''}
              <span>${esc(i.kind)}</span>
            </div>
          </div>
          ${i.rel ? `<a class="btn btn-ghost btn-small" href="#/notes?rel=${encodeURIComponent(i.rel)}">去改</a>` : ''}
        </div>`).join('')}</div>`
      : `<div class="empty"><div class="big">✓</div><h3>没发现问题</h3>
          <p>日期、正文、分类、双链都是正常的。</p></div>`}
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-head">
        <h3 class="card-title">图片能不能打开</h3>
        <span class="spacer"></span>
        <button class="btn btn-small" id="btnCheckImages">联网检查 ${r.externalImages || 0} 张外站图片</button>
      </div>
      <div id="imgCheckResult">
        <div class="notice"><div>
          这一页只看「本地有没有对应的图」，判断不了外站图片是否还活着
          （<b>猜是不准的</b>）。想确认就点右边按钮，它会真的去访问每一张图。
        </div></div>
      </div>
    </div>
  `;

  $('#btnCheckImages').addEventListener('click', async () => {
    const btn = $('#btnCheckImages');
    const out = $('#imgCheckResult');
    btn.disabled = true;
    btn.textContent = '正在检查…';
    out.innerHTML = '<div class="skeleton" style="height:70px"></div>';
    try {
      const res = await api('/api/health/images', { method: 'POST', body: {} });
      if (res.ok) {
        out.innerHTML = `<div class="notice"><span>✓</span><div>检查了 <b>${res.checked}</b> 张图，全部可以正常访问。</div></div>`;
      } else {
        out.innerHTML = `<div class="notice warn"><div><b>${res.broken.length}</b> 张图打不开（共检查 ${res.checked} 张）：</div></div>
          <div class="list" style="margin-top:10px">${res.broken.map((b) => `
            <div class="list-row">
              <span class="badge badge-warn">${esc(String(b.status))}</span>
              <div class="grow">
                <div class="list-title" style="font-family:var(--mono);font-size:12px;word-break:break-all">${esc(b.url)}</div>
                <div class="list-sub"><span>${esc(b.title || '')}</span></div>
              </div>
              <a class="btn btn-ghost btn-small" href="#/notes?rel=${encodeURIComponent(b.rel)}">去改</a>
            </div>`).join('')}</div>`;
      }
    } catch (e) {
      out.innerHTML = `<div class="notice warn"><div>检查失败：${esc(e.message)}</div></div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = '重新检查';
    }
  });
}

/* =========================================================
 *  构建发布
 * ======================================================= */

function stopBuildPolling() {
  if (state.buildTimer) { clearInterval(state.buildTimer); state.buildTimer = null; }
}

async function viewPublish(box) {
  box.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h3 class="card-title">构建与发布</h3>
        <span class="spacer"></span>
        <span id="buildStatus" class="badge">准备就绪</span>
      </div>
      <div class="notice info"><div>
        「构建」会在项目目录里跑一次 <code>npm run sync &amp;&amp; astro build</code>，
        把笔记、图片、封面全部重新生成到 <code>dist/</code>。<br>
        构建完把 <code>dist/</code> 里的内容传到腾讯云 COS 桶根目录（同名覆盖）就上线了。
      </div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
        <button class="btn btn-primary" id="btnBuild">开始构建（含同步）</button>
        <button class="btn" id="btnBuildFast">只构建（跳过同步，快）</button>
        <button class="btn" id="btnOpenDist" hidden>打开 dist 文件夹</button>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-head">
        <h3 class="card-title">构建日志</h3>
        <span class="spacer"></span>
        <span class="field-hint" id="buildMeta"></span>
      </div>
      <pre class="build-log" id="buildLog">（还没有构建记录，点上面的按钮开始）</pre>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-head"><h3 class="card-title">历史</h3></div>
      <div id="buildHistory"><div class="field-hint">暂无记录</div></div>
    </div>
  `;

  let since = 0;
  const logEl = $('#buildLog');
  const statusEl = $('#buildStatus');
  const metaEl = $('#buildMeta');
  const historyEl = $('#buildHistory');

  const render = (s) => {
    logEl.textContent = s.lines.length ? s.lines.map((l) => l.text).join('\n') : '（还没有构建记录）';
    logEl.scrollTop = logEl.scrollHeight;
    since = s.total;
    metaEl.textContent = s.command ? `${s.command}${s.running ? ' · 运行中' : ''}` : '';
    if (s.running) {
      statusEl.className = 'badge badge-info';
      statusEl.textContent = '构建中…';
    } else if (s.exitCode === 0) {
      statusEl.className = 'badge badge-ok';
      statusEl.textContent = '上次构建成功';
    } else if (s.exitCode !== null) {
      statusEl.className = 'badge badge-warn';
      statusEl.textContent = '上次构建失败（' + s.exitCode + '）';
    } else {
      statusEl.className = 'badge';
      statusEl.textContent = '准备就绪';
    }
    historyEl.innerHTML = s.history.length ? `<div class="list">${s.history.map((h) => `
      <div class="list-row">
        <span class="badge ${h.exitCode === 0 ? 'badge-ok' : 'badge-warn'}">${h.exitCode === 0 ? '成功' : '失败 ' + h.exitCode}</span>
        <div class="grow">
          <div class="list-title">${esc(h.command)}</div>
          <div class="list-sub"><span>${fmtTime(h.startedAt)}</span><span>用时 ${h.seconds} 秒</span></div>
        </div>
      </div>`).join('')}</div>` : '<div class="field-hint">暂无记录</div>';
  };

  const poll = async () => {
    try {
      const s = await api('/api/build/state?since=0');
      render(s);
      if (!s.running) {
        stopBuildPolling();
        $('#btnBuild').disabled = false;
        $('#btnBuildFast').disabled = false;
        $('#btnOpenDist').hidden = false;
      }
    } catch { stopBuildPolling(); }
  };

  const start = async (withSync) => {
    $('#btnBuild').disabled = true;
    $('#btnBuildFast').disabled = true;
    logEl.textContent = '正在启动…';
    since = 0;
    try {
      await api('/api/build/start', { method: 'POST', body: { withSync } });
      stopBuildPolling();
      state.buildTimer = setInterval(poll, 1200);
      await poll();
    } catch (e) {
      toast('启动失败：' + e.message, 'err');
      $('#btnBuild').disabled = false;
      $('#btnBuildFast').disabled = false;
    }
  };

  $('#btnBuild').addEventListener('click', () => start(true));
  $('#btnBuildFast').addEventListener('click', () => start(false));
  $('#btnOpenDist').addEventListener('click', () => {
    api('/api/open-dist', { method: 'POST', body: {} })
      .then((r) => toast(r.ok ? '已在资源管理器里打开 dist 文件夹' : (r.error || '打不开'), r.ok ? 'ok' : 'err'))
      .catch((e) => toast(e.message, 'err'));
  });

  await poll();
  const s = await api('/api/build/state?since=0');
  if (s.running) {
    state.buildTimer = setInterval(poll, 1200);
    $('#btnBuild').disabled = true;
    $('#btnBuildFast').disabled = true;
  }
}

/* ---------------- 启动 ---------------- */
boot();
