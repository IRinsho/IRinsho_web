/* =========================================================
 *  林夕的小站 · 云端后台界面
 *  ---------------------------------------------------------
 *  和本地版是同一套界面，区别只有一处：所有请求打到 /api/admin/*，
 *  数据由 EdgeOne 的 Node 函数读写你的 GitHub 仓库。
 *
 *  所以你在手机上打开 admin.你的域名 就能改内容，保存 = 一次 git 提交，
 *  平台会自动重新构建上线。
 * ======================================================= */

const API_BASE = '/api/admin';   // 单一入口，动作走 ?action=

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

const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
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
  toastTimer = setTimeout(() => { el.className = 'toast ' + kind; }, 3600);
}

async function api(path, options = {}) {
  /* 把动作拼成查询参数：'/note?rel=x' → '/api/admin?action=note&rel=x'
     这样就只有一个确定的接口地址，不用依赖平台的路径路由规则
     （EdgeOne 的 index.js 会被剥掉、catch-all 写法也要看版本）。 */
  const [action, query] = String(path).replace(/^\/+/, '').split('?');
  const params = new URLSearchParams(query || '');
  params.set('action', action || 'session');

  const res = await fetch(API_BASE + '?' + params.toString(), {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : {},
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
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

/** 通用弹窗 */
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
            return `<label class="toggle" style="grid-column:1/-1">
              <input type="checkbox" id="${id}" ${f.value ? 'checked' : ''}><span>${esc(f.label)}</span>
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
  setTimeout(() => { const f = overlay.querySelector('input,textarea'); if (f) f.focus(); }, 60);

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
  });

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

/* ---------------- 状态 ---------------- */

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
  vars: null
};

/* ---------------- 登录 ---------------- */

async function boot() {
  try {
    const s = await api('/session');
    state.session = s;
    $('#footRoot').textContent = s.githubRepo || '未绑定仓库';
    if (s.storageWarning) toast(s.storageWarning, 'err');

    if (s.authed) await enterApp();
    else showGate(s.configured ? 'login' : 'setup');
  } catch (e) {
    document.body.innerHTML = `<div class="gate"><div class="gate-card">
      <h1 class="gate-title">连不上后台</h1>
      <p class="gate-sub">${esc(e.message)}</p>
      <p class="gate-note">请确认 EdgeOne 环境变量里已经配好 <code>GITHUB_TOKEN</code>，
      并且函数已经部署成功。</p>
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
    ? '密码会做哈希后存进 EdgeOne 的 Blob 存储，明文不会保存、也不会进 GitHub。<br>忘了密码：去 EdgeOne 的存储里删掉 <code>auth/password.json</code>，再重新设置。'
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
    await api(isSetup ? '/setup' : '/login', { method: 'POST', body: { password: pw } });
    state.session = await api('/session');
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
  await api('/logout', { method: 'POST', body: {} });
  state.session = { configured: true, authed: false };
  showGate('login');
});

/* ---------------- 路由 ---------------- */

const VIEW_TITLES = {
  dashboard: '仪表盘', notes: '笔记', photos: '相册', videos: '视频', links: '友链',
  config: '站点信息', theme: '配色外观', history: '历史与恢复'
};

window.addEventListener('hashchange', route);

async function route() {
  if (!state.session || !state.session.authed) return;
  const view = (location.hash.replace(/^#\//, '') || 'dashboard').split('?')[0];
  state.view = view;
  $('#pageTitle').textContent = VIEW_TITLES[view] || '仪表盘';
  $$('.nav-item').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
  $('#sidebar').classList.remove('open');

  const box = $('#view');
  box.innerHTML = '<div class="grid grid-stats"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';

  try {
    if (view === 'notes') await viewNotes(box);
    else if (view === 'photos') await viewPhotos(box);
    else if (view === 'videos') await viewVideos(box);
    else if (view === 'links') await viewLinks(box);
    else if (view === 'config') await viewConfig(box);
    else if (view === 'theme') await viewTheme(box);
    else if (view === 'history') await viewHistory(box);
    else await viewDashboard(box);
  } catch (e) {
    box.innerHTML = `<div class="card"><div class="empty">
      <div class="big">⚠</div><h3>这一页没打开</h3><p>${esc(e.message)}</p>
      <button class="btn btn-small" onclick="route()">重试</button>
    </div></div>`;
  }
}

$('#btnRefresh').addEventListener('click', () => route());
$('#btnMenu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
window.addEventListener('beforeunload', (e) => {
  if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
});

/* ---------------- 仪表盘 ---------------- */

function statCard(label, value, foot, cls = '') {
  return `<div class="stat ${cls}">
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value">${value}</div>
    <div class="stat-foot">${esc(foot || '')}</div>
  </div>`;
}

async function viewDashboard(box) {
  const d = await api('/dashboard');
  const c = d.counts;
  const s = state.session || {};

  box.innerHTML = `
    <div class="grid grid-stats">
      ${statCard('笔记', c.notes, `${c.drafts} 篇是草稿`)}
      ${statCard('照片', c.photos, `${d.albums.length} 个相册`)}
      ${statCard('视频', c.videos, '含本地上传与外链')}
      ${statCard('友链', c.links, '交换链接的小站')}
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-head"><h3 class="card-title">云端后台</h3></div>
      <div class="notice info"><div>
        内容保存在 GitHub 仓库 <b>${esc(s.githubRepo || '—')}</b>。
        <b>每次保存 = 一次 git 提交</b>，所以你随时能在「历史与恢复」里找回旧版本；
        提交后平台会自动重新构建，一两分钟后网站就更新了。
      </div></div>
      ${s.storage === 'memory' ? `<div class="notice warn" style="margin-top:12px"><div>
        ⚠ 会话存储没连上 Blob，密码只在当前实例的内存里。请去 EdgeOne 控制台
        「存储 → Blob」创建命名空间并绑定到本项目。
      </div></div>` : ''}
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
              </div>
            </div>
            ${n.draft ? '<span class="badge badge-draft">草稿</span>' : ''}
          </a>`).join('')}</div>`
      : `<div class="empty"><div class="big">✎</div><h3>还没有笔记</h3><p>去「笔记」新建一篇。</p></div>`}
      </div>

      <div class="card">
        <div class="card-head"><h3 class="card-title">相册分布</h3></div>
        ${d.albums.length ? `<div class="list">${d.albums.map((a) => `
          <div class="list-row"><div class="grow"><div class="list-title">${esc(a.name)}</div></div>
          <span class="badge">${a.count} 张</span></div>`).join('')}</div>`
      : `<div class="notice"><div>还没有照片。</div></div>`}
      </div>
    </div>
  `;
}

/* ---------------- 笔记 ---------------- */

async function createNote(folder = '') {
  openModal({
    title: '写一篇新笔记',
    submitText: '创建并开始写',
    fields: [
      { name: 'title', label: '标题', placeholder: '例如：TCP 三次握手' },
      { name: 'date', label: '日期', type: 'date', value: today() },
      { name: 'folder', label: '分类（子文件夹名）', value: folder, placeholder: '留空 = 未分类' }
    ],
    onSubmit: async (v) => {
      if (!v.title.trim()) throw new Error('标题不能为空');
      const r = await api('/create', { method: 'POST', body: { title: v.title.trim(), date: v.date, folder: v.folder.trim() } });
      toast('已创建：' + r.rel, 'ok');
      location.hash = '#/notes?rel=' + encodeURIComponent(r.rel);
      await route();
    }
  });
}

async function viewNotes(box) {
  const { notes } = await api('/notes');
  state.notes = notes;
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
            <label class="toggle"><input type="checkbox" id="noteDraftOnly"><span>草稿</span></label>
          </div>
          <div class="list-sub" id="noteCount">${notes.length} 篇</div>
        </div>
        <div class="note-list-body" id="noteListBody"></div>
      </div>
      <div class="editor" id="editorBox">
        <div class="card"><div class="empty">
          <div class="big">✎</div><h3>从左边选一篇开始</h3>
          <p>选中之后右边会出现编辑器。手机上可以直接在这儿写。</p>
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

  const { note } = await api('/note?rel=' + encodeURIComponent(rel));
  state.currentNote = note;
  const f = note.fields;
  const catList = [...new Set(state.notes.map((n) => n.category).filter(Boolean))];

  editorBox.innerHTML = `
    <div class="card">
      <div class="editor-head">
        <span class="grow">blog/${esc(note.rel)}</span>
        <div class="editor-actions">
          <button class="btn btn-small" id="btnHistory">历史</button>
          <button class="btn btn-danger btn-small" id="btnDeleteNote">删除</button>
          <button class="btn btn-primary btn-small" id="btnSave">保存（提交）</button>
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
          <input type="text" id="fTags" value="${esc((f.tags || []).join(', '))}">
        </label>
        <label class="field span-2">
          <span class="field-label">摘要（显示在卡片上）</span>
          <textarea id="fSummary" rows="2">${esc(f.summary)}</textarea>
        </label>
        <label class="field span-2">
          <span class="field-label">封面（写 blog/ 里的图片名，留空自动生成）</span>
          <input type="text" id="fCover" value="${esc(f.cover)}">
        </label>
        <div class="field span-2 toggles">
          <label class="toggle"><input type="checkbox" id="fPinned" ${f.pinned ? 'checked' : ''}><span>置顶</span></label>
          <label class="toggle"><input type="checkbox" id="fDraft" ${f.draft ? 'checked' : ''}><span>草稿（不发布）</span></label>
          <span class="field-hint">${note.chars} 字</span>
        </div>
      </div>
    </div>

    <div class="edit-panes">
      <div class="pane">
        <div class="pane-head"><span>Markdown 正文</span><span class="spacer"></span><span id="charCount">${note.body.length} 字符</span></div>
        <textarea class="md-input" id="mdInput" spellcheck="false">${esc(note.body)}</textarea>
      </div>
      <div class="pane">
        <div class="pane-head"><span>实时预览</span><span class="spacer"></span><span>和线上完全一致</span></div>
        <div class="md-preview" id="mdPreview"></div>
      </div>
    </div>
  `;

  const mdInput = $('#mdInput');
  const previewEl = $('#mdPreview');
  const markDirty = () => { state.dirty = true; setSaveState('有未保存的改动', 'err'); };

  let previewTimer = null;
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      try {
        const { html } = await api('/preview', { method: 'POST', body: { markdown: mdInput.value } });
        const scroll = previewEl.scrollTop;
        previewEl.innerHTML = html;
        previewEl.scrollTop = scroll;
      } catch { /* 预览失败不打断写作 */ }
    }, 400);
  }

  mdInput.addEventListener('input', () => {
    $('#charCount').textContent = mdInput.value.length + ' 字符';
    markDirty();
    schedulePreview();
  });
  ['fTitle', 'fDate', 'fCategory', 'fTags', 'fSummary', 'fCover'].forEach((id) =>
    $('#' + id).addEventListener('input', markDirty));
  ['fPinned', 'fDraft'].forEach((id) => $('#' + id).addEventListener('change', markDirty));
  schedulePreview();

  mdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = mdInput.selectionStart, en = mdInput.selectionEnd;
      mdInput.value = mdInput.value.slice(0, s) + '  ' + mdInput.value.slice(en);
      mdInput.selectionStart = mdInput.selectionEnd = s + 2;
      markDirty();
    }
  });

  const collect = () => ({
    title: $('#fTitle').value.trim(),
    date: $('#fDate').value,
    category: $('#fCategory').value.trim(),
    tags: $('#fTags').value.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    summary: $('#fSummary').value.trim(),
    cover: $('#fCover').value.trim(),
    pinned: $('#fPinned').checked,
    draft: $('#fDraft').checked
  });

  async function save() {
    const btn = $('#btnSave');
    btn.disabled = true;
    btn.textContent = '正在提交…';
    try {
      await api('/note', { method: 'POST', body: { rel: state.currentRel, fields: collect(), body: mdInput.value } });
      state.dirty = false;
      setSaveState('已提交 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), 'ok');
      toast('已提交到 GitHub，平台会自动重新构建', 'ok');
    } catch (e) {
      toast('保存失败：' + e.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = '保存（提交）';
    }
  }

  $('#btnSave').addEventListener('click', save);
  $('#btnHistory').addEventListener('click', () => {
    location.hash = '#/history?rel=' + encodeURIComponent(note.rel);
  });
  $('#btnDeleteNote').addEventListener('click', () => {
    if (!confirm(`确定删除「${note.fields.title}」吗？\n\n旧版本还在 git 历史里，可以从「历史与恢复」找回来。`)) return;
    api('/note', { method: 'DELETE', body: { rel: note.rel } })
      .then(() => {
        toast('已删除（可从 git 历史恢复）', 'ok');
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

/* ---------------- 相册 ---------------- */

async function viewPhotos(box) {
  const { photos } = await api('/photos');
  state.photos = photos;
  const albums = [...new Set(photos.map((p) => p.album))];

  box.innerHTML = `
    <div class="card" id="dropZone" style="margin-bottom:16px;border-style:dashed;cursor:pointer">
      <div class="empty" style="padding:24px 20px">
        <div class="big">▣</div>
        <h3>点这里选图，或把图片拖进来</h3>
        <p>手机上会直接打开相册。<br>
        <b>图片会先在浏览器里压到 1 MB 以内</b>（GitHub 单文件限制），再提交进仓库。</p>
        <input type="file" id="fileInput" accept="image/*" multiple hidden>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="form-grid">
        <label class="field">
          <span class="field-label">上传到哪个相册（文件夹名）</span>
          <input type="text" id="albumInput" placeholder="留空 = 根目录（未分类）" list="albumList">
          <datalist id="albumList">${albums.filter((a) => a !== '未分类').map((a) => `<option value="${esc(a)}">`).join('')}</datalist>
        </label>
      </div>
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      <span class="badge">共 ${photos.length} 张</span>
      ${albums.map((a) => `<span class="badge">${esc(a)} · ${photos.filter((p) => p.album === a).length}</span>`).join('')}
    </div>

    <div class="grid grid-photos" id="photoGrid">
      ${photos.map(photoCard).join('') || `<div class="card"><div class="empty"><p>还没有照片。</p></div></div>`}
    </div>
  `;

  const zone = $('#dropZone');
  const input = $('#fileInput');
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => uploadFiles([...input.files], $('#albumInput').value));
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.borderColor = 'var(--rose)'; });
  zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.style.borderColor = '';
    uploadFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')), $('#albumInput').value);
  });
  $$('.photo-card', box).forEach((c) => c.addEventListener('click', () => editPhoto(c.dataset.rel)));
}

function photoCard(p) {
  const title = (p.meta && p.meta.title) || p.name;
  /* 图片地址由云端核对过，指向站点上真实存在的文件。
     万一还没同步（站点上只有原图），显示一句提示，而不是一片空白。 */
  const thumbStyle = p.url
    ? `background-image:url('${esc(p.url)}')`
    : 'background:var(--bg-input)';
  const placeholder = p.url
    ? ''
    : '<span style="font-size:12px;color:var(--ink-faint);text-align:center;padding:10px;line-height:1.6">还没同步<br>在电脑上跑一次<br>npm run sync</span>';
  return `<div class="photo-card" data-rel="${esc(p.rel)}" style="cursor:pointer">
    <div class="photo-thumb" style="${thumbStyle}">${placeholder}</div>
    <div class="photo-meta">
      <div class="photo-name" title="${esc(p.rel)}">${esc(title)}</div>
      <div class="photo-tags">
        <span class="badge">${esc(p.album)}</span>
        <span class="photo-size">${fmtSize(p.size)}</span>
        ${p.needsSync ? '<span class="badge badge-warn">待同步</span>' : ''}
      </div>
      ${p.meta && p.meta.tags ? `<div class="photo-tags">${p.meta.tags.map((t) => `<span class="badge badge-info">${esc(t)}</span>`).join('')}</div>` : ''}
    </div>
  </div>`;
}

/**
 * 在浏览器里把图压到 1 MB 以内。
 * GitHub Contents API 单文件上限 1 MB；站点也用不着更大的图。
 */
async function compressImage(file, maxEdge = 2000, maxBytes = 900 * 1024) {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);

  let quality = 0.85;
  let blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', quality));
  while (blob && blob.size > maxBytes && quality > 0.4) {
    quality -= 0.1;
    blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', quality));
  }
  // 还是太大就再缩一半尺寸
  if (blob && blob.size > maxBytes) {
    canvas.width = Math.round(width / 2);
    canvas.height = Math.round(height / 2);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.8));
  }
  return { blob, width: canvas.width, height: canvas.height };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

async function uploadFiles(files, album) {
  if (!files.length) return;
  let done = 0, failed = 0;
  for (const f of files) {
    setSaveState(`正在处理 ${done + failed + 1}/${files.length}…`);
    try {
      const { blob } = await compressImage(f);
      if (!blob) throw new Error('压缩失败');
      if (blob.size > 1024 * 1024) {
        throw new Error(`压到 ${(blob.size / 1024 / 1024).toFixed(2)} MB 还是超过 1 MB，请先裁剪`);
      }
      const base64 = await blobToBase64(blob);
      const name = f.name.replace(/\.[^.]+$/, '') + '.webp';
      await api('/photo-upload', { method: 'POST', body: { name, album: album || '', base64 } });
      done++;
    } catch (e) {
      failed++;
      toast(`${f.name} 失败：${e.message}`, 'err');
    }
  }
  setSaveState('');
  toast(failed ? `完成：成功 ${done}，失败 ${failed}` : `已上传 ${done} 张（已提交到 GitHub）`, failed ? 'err' : 'ok');
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
      { name: 'album', label: '相册分类', value: m.album || p.album },
      { name: 'date', label: '日期', type: 'date', value: m.date || '' },
      { name: 'tags', label: '标签（逗号分隔）', span: true, value: (m.tags || []).join(', ') }
    ],
    onSubmit: async (v) => {
      await api('/photo-meta', {
        method: 'POST',
        body: {
          rel,
          meta: {
            title: v.title.trim(),
            desc: v.desc.trim(),
            album: v.album.trim(),
            date: v.date,
            tags: v.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
          }
        }
      });
      toast('已提交', 'ok');
      await route();
    }
  });
}

/* ---------------- 视频 ---------------- */

const SOURCE_LABEL = { douyin: '抖音', embed: '外链嵌入', local: '本地视频', '': '未填链接' };

function sourceOf(v) {
  if (v.douyin) return 'douyin';
  if (v.embed) return 'embed';
  if (v.src) return 'local';
  return '';
}

async function viewVideos(box) {
  const { videos } = await api('/videos');
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
          <div class="grow">
            <div class="list-title">${esc(v.title || '（无标题）')}</div>
            <div class="list-sub">
              <span class="badge">${esc(SOURCE_LABEL[sourceOf(v)])}</span>
              <span>${esc(v.category || '未分类')}</span>
              <span>${esc(v.date || '无日期')}</span>
            </div>
          </div>
          <button class="btn btn-small" data-edit="${i}">编辑</button>
          <button class="btn btn-danger btn-small" data-del="${i}">删除</button>
        </div>`).join('')}</div>`
      : `<div class="empty"><div class="big">▶</div><h3>还没有视频</h3><p>点「添加视频」，粘一条抖音 / B站 / YouTube 链接。</p></div>`}
    </div>
    <div class="notice info"><div>
      抓封面要联网，而且抖音那一条得靠你本机的浏览器 —— 云端抓不到。
      后台先把链接和标题存下来，封面等你跑 <code>npm run sync:covers</code> 时补上。
    </div></div>
  `;

  $('#btnAddVideo').addEventListener('click', () => editVideo(null));
  $$('[data-edit]', box).forEach((b) => b.addEventListener('click', () => editVideo(Number(b.dataset.edit))));
  $$('[data-del]', box).forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.del);
    if (!confirm(`确定删除「${videos[i].title}」吗？`)) return;
    api('/videos', { method: 'DELETE', body: { index: i } })
      .then(() => { toast('已删除', 'ok'); return route(); })
      .catch((e) => toast('删除失败：' + e.message, 'err'));
  }));
}

function editVideo(index) {
  const v = index === null ? {} : state.videos[index];
  const link = v.douyin || v.embed || v.src || '';
  openModal({
    title: index === null ? '添加视频' : '编辑视频',
    wide: true,
    fields: [
      { name: 'title', label: '标题', span: true, value: v.title || '' },
      { name: 'link', label: '视频链接 / 本地路径', span: true, value: link, placeholder: 'https://www.douyin.com/video/7301234567890123456' },
      { name: 'desc', label: '描述', type: 'textarea', span: true, rows: 2, value: v.desc || '' },
      { name: 'category', label: '分类', value: v.category || '' },
      { name: 'date', label: '日期', type: 'date', value: v.date || today() },
      { name: 'tags', label: '标签（逗号分隔）', span: true, value: (v.tags || []).join(', ') }
    ],
    onSubmit: async (vals) => {
      const out = {
        title: vals.title.trim(),
        desc: vals.desc.trim(),
        category: vals.category.trim(),
        tags: vals.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        date: vals.date
      };
      const l = vals.link.trim();
      if (l) {
        const digits = l.match(/(\d{15,})/);
        if (/douyin\.com|v\.douyin/i.test(l) || /^\d{15,}$/.test(l)) out.douyin = digits ? digits[1] : l;
        else if (/^media\//i.test(l) || /\.(mp4|webm|mov|m4v)$/i.test(l)) out.src = l;
        else out.embed = l;
      }
      await api('/videos', { method: 'POST', body: { index: index === null ? null : index, video: out } });
      toast('已提交', 'ok');
      await route();
    }
  });
}

/* ---------------- 友链 ---------------- */

async function viewLinks(box) {
  const { links } = await api('/links');
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
            <span>${l.url ? `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.url)}</a>` : '—'}</span>
            <span class="k">简介</span><span>${esc(l.desc || '—')}</span>
            <span class="k">标签</span><span>${(l.tags || []).map((t) => `<span class="badge">${esc(t)}</span>`).join(' ') || '—'}</span>
          </div>
        </div>`).join('')}
    </div>`
    : `<div class="card"><div class="empty"><div class="big">♡</div><h3>还没有友链</h3></div></div>`}
  `;

  $('#btnAddLink').addEventListener('click', () => editLink(null));
  $$('[data-edit]', box).forEach((b) => b.addEventListener('click', () => editLink(Number(b.dataset.edit))));
  $$('[data-del]', box).forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.del);
    if (!confirm(`确定删除「${links[i].name}」吗？`)) return;
    api('/links', { method: 'DELETE', body: { index: i } })
      .then(() => { toast('已删除', 'ok'); return route(); })
      .catch((e) => toast('删除失败：' + e.message, 'err'));
  }));
}

function editLink(index) {
  const l = index === null ? {} : state.links[index];
  openModal({
    title: index === null ? '添加友链' : '编辑友链',
    fields: [
      { name: 'name', label: '站名', span: true, value: l.name || '' },
      { name: 'url', label: '网址（带 https://）', span: true, value: l.url || '' },
      { name: 'desc', label: '一句话介绍', type: 'textarea', span: true, rows: 2, value: l.desc || '' },
      { name: 'avatar', label: '头像路径（可留空）', value: l.avatar || '' },
      { name: 'since', label: '认识时间（如 2026-03）', value: l.since || '' },
      { name: 'tags', label: '标签（逗号分隔）', span: true, value: (l.tags || []).join(', ') },
      { name: 'featured', label: '置顶这条', type: 'checkbox', value: !!l.featured },
      { name: 'open', label: '这是「交换友链」招募位', type: 'checkbox', value: !!l.open }
    ],
    onSubmit: async (v) => {
      if (!v.name.trim()) throw new Error('站名不能为空');
      await api('/links', {
        method: 'POST',
        body: {
          index: index === null ? null : index,
          link: {
            name: v.name.trim(), url: v.url.trim(), desc: v.desc.trim(), avatar: v.avatar.trim(),
            since: v.since.trim(),
            tags: v.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
            featured: v.featured, open: v.open
          }
        }
      });
      toast('已提交', 'ok');
      await route();
    }
  });
}

/* ---------------- 站点信息 ---------------- */

async function viewConfig(box) {
  const { config, vars } = await api('/config');
  state.config = config;
  state.vars = vars;

  const str = (v) => (v == null ? '' : String(v));
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
          <button class="btn btn-primary btn-small" id="btnSaveCfg">保存（提交）</button>
        </div>
      </div>
    </div>

    ${section('站点', [
      text('site', '站点网址', config.site, '分享卡片、站点地图要用'),
      text('ogImage', '默认分享图', config.ogImage),
      text('author', '作者署名', config.author),
      text('footer', '页脚文字', config.footer)
    ])}

    ${section('品牌与首页', [
      text('name', '品牌名（左上角）', config.name),
      text('nameAccent', '品牌名里染色的部分', config.nameAccent, '想整体单色就留空'),
      text('homeTitle', '首页大标题', config.homeTitle),
      area('homeMotto', '首页一句话', config.homeMotto),
      text('avatar', '顶栏头像', config.avatar)
    ])}

    ${section('个人页（ME）', [
      text('me.label', '小标题', me.label),
      text('me.no', '编号', me.no),
      text('me.photo', '左侧大图', me.photo),
      text('me.decor', '图上竖排大字', me.decor),
      text('me.decorSub', '竖排大字下面一行', me.decorSub),
      area('me.quote', '引言', me.quote, '想换行写 \\n'),
      area('me.bio', '自我介绍', me.bio),
      text('me.friend.label', '友链入口小字', (me.friend || {}).label),
      text('me.friend.text', '友链入口大字', (me.friend || {}).text),
      text('me.friend.url', '友链入口网址', (me.friend || {}).url, '站内写相对路径如 links/'),
      text('me.footLeft', '页脚左', me.footLeft),
      text('me.footRight', '页脚右', me.footRight)
    ])}
  `;

  const collect = () => {
    const changes = {};
    const targetKeys = new Set();
    $$('[data-path]', box).forEach((el) => {
      const p = el.dataset.path;
      const cur = p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), config);
      if (String(cur == null ? '' : cur) === el.value) return;
      targetKeys.add(p.split('.')[0]);
      changes[p] = el.value;
    });
    return { changes, targetKeys: [...targetKeys] };
  };

  $('#btnSaveCfg').addEventListener('click', async () => {
    const { changes, targetKeys } = collect();
    if (!Object.keys(changes).length) { toast('没有改动'); return; }
    const btn = $('#btnSaveCfg');
    btn.disabled = true;
    btn.textContent = '正在提交…';
    try {
      const r = await api('/config', { method: 'POST', body: { changes, targetKeys } });
      toast(`已提交 ${r.changed.length} 项：${r.changed.join('、')}`, 'ok');
      await route();
    } catch (e) {
      toast('保存失败：' + e.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = '保存（提交）';
    }
  });
  $('#btnReloadCfg').addEventListener('click', () => route());
  $$('[data-path]', box).forEach((el) => el.addEventListener('input', () => setSaveState('有未保存的改动', 'err')));
}

/* ---------------- 配色 ---------------- */

async function viewTheme(box) {
  const { vars } = await api('/theme');
  state.vars = vars;

  const MAIN = ['--rose', '--bg', '--paper-ink'];
  const isColor = (v) => /^#[0-9a-f]{3,8}$/i.test(String(v).trim());
  const entries = Object.entries(vars);

  const row = ([k, v]) => `
    <div class="card" style="padding:13px 15px">
      <div style="display:flex;align-items:center;gap:12px">
        ${isColor(v)
          ? `<input type="color" data-var="${esc(k)}" value="${esc(v)}" style="width:44px;height:44px;flex:0 0 44px;border:1px solid var(--line-strong);border-radius:11px;background:none;cursor:pointer;padding:2px">`
          : `<div style="width:44px;height:44px;flex:0 0 44px;border-radius:11px;border:1px solid var(--line-strong);background:#23263f"></div>`}
        <div style="min-width:0;flex:1">
          <div style="font-family:var(--mono);font-size:12.5px">${esc(k)}</div>
          <input type="text" data-text="${esc(k)}" value="${esc(v)}" style="margin-top:4px;font-size:12px;padding:5px 8px">
        </div>
        ${MAIN.includes(k) ? '<span class="badge badge-pin">主色</span>' : ''}
      </div>
    </div>`;

  box.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="editor-head">
        <span class="grow">public/assets/css/style.css 的 :root 变量</span>
        <div class="editor-actions">
          <button class="btn btn-small" id="btnResetTheme">放弃改动</button>
          <button class="btn btn-primary btn-small" id="btnSaveTheme">保存（提交）</button>
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

  const preview = $('#themePreview');
  box.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.var) {
      const textEl = $(`[data-text="${t.dataset.var}"]`, box);
      if (textEl) textEl.value = t.value;
      preview.style.setProperty(t.dataset.var, t.value);
    }
    if (t.dataset.text) {
      const v = t.value.trim();
      if (/^#[0-9a-f]{3,8}$/i.test(v)) preview.style.setProperty(t.dataset.text, v);
      const picker = $(`[data-var="${t.dataset.text}"]`, box);
      if (picker && /^#[0-9a-f]{6}$/i.test(v)) picker.value = v;
    }
    setSaveState('有未保存的改动', 'err');
  });

  $('#btnSaveTheme').addEventListener('click', async () => {
    const changed = {};
    $$('[data-text]', box).forEach((el) => {
      const k = el.dataset.text, v = el.value.trim();
      if (vars[k] !== v) changed[k] = v;
    });
    if (!Object.keys(changed).length) { toast('没有改动'); return; }
    const btn = $('#btnSaveTheme');
    btn.disabled = true;
    btn.textContent = '正在提交…';
    try {
      const r = await api('/theme', { method: 'POST', body: { vars: changed } });
      toast(r.skipped ? '没有实际改动' : `已提交 ${r.changed.length} 个颜色变量`, 'ok');
      setSaveState('已提交', 'ok');
    } catch (e) {
      toast('保存失败：' + e.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = '保存（提交）';
    }
  });
  $('#btnResetTheme').addEventListener('click', () => route());
}

/* ---------------- 历史与恢复 ---------------- */

async function viewHistory(box) {
  const rel = new URLSearchParams(location.hash.split('?')[1] || '').get('rel');
  const [commits, fileHist] = await Promise.all([
    api('/history?limit=30'),
    rel ? api('/file-history?rel=' + encodeURIComponent(rel)) : Promise.resolve(null)
  ]);

  box.innerHTML = `
    ${rel && fileHist ? `
      <div class="card" style="margin-bottom:16px">
        <div class="card-head">
          <h3 class="card-title">${esc(rel)} 的版本历史</h3>
          <a class="btn btn-ghost btn-small" href="#/history">看整站历史 →</a>
        </div>
        ${fileHist.commits.length ? `<div class="list">${fileHist.commits.map((c, i) => `
          <div class="list-row">
            <span class="badge ${i === 0 ? 'badge-ok' : ''}">${esc(c.short)}</span>
            <div class="grow">
              <div class="list-title">${esc(c.message)}</div>
              <div class="list-sub"><span>${fmtTime(c.date)}</span></div>
            </div>
            ${i === 0 ? '<span class="field-hint">当前版本</span>'
              : `<button class="btn btn-small" data-restore="${esc(c.sha)}">恢复这一版</button>`}
          </div>`).join('')}</div>`
      : '<div class="field-hint">这个文件还没有历史记录</div>'}
      </div>` : ''}

    <div class="card">
      <div class="card-head">
        <h3 class="card-title">整站提交历史</h3>
        <span class="badge">最近 ${commits.commits.length} 次</span>
      </div>
      ${commits.commits.length ? `<div class="list">${commits.commits.map((c) => `
        <div class="list-row">
          <span class="badge" style="font-family:var(--mono)">${esc(c.short)}</span>
          <div class="grow">
            <div class="list-title">${esc(c.message)}</div>
            <div class="list-sub"><span>${fmtTime(c.date)}</span><span>${esc(c.author || '')}</span></div>
          </div>
        </div>`).join('')}</div>`
      : '<div class="field-hint">还没有提交</div>'}
    </div>

    <div class="notice info" style="margin-top:16px"><div>
      <b>怎么看某个文件的旧版本？</b>在「笔记」里打开一篇，点右上角「历史」。
      平台本身没有"一键回滚整站"，但内容都在 git 里，任何一次改动都能按文件恢复回来。
    </div></div>
  `;

  $$('[data-restore]', box).forEach((b) => b.addEventListener('click', async () => {
    const sha = b.dataset.restore;
    if (!confirm(`确定把「${rel}」恢复到 ${sha.slice(0, 7)} 这一版吗？\n\n当前内容会成为一次新提交（不会丢）。`)) return;
    b.disabled = true;
    b.textContent = '正在恢复…';
    try {
      const r = await api('/restore', { method: 'POST', body: { rel, sha } });
      toast(`已恢复到 ${r.from}`, 'ok');
      await route();
    } catch (e) {
      toast('恢复失败：' + e.message, 'err');
      b.disabled = false;
      b.textContent = '恢复这一版';
    }
  }));
}

/* ---------------- 启动 ---------------- */
boot();
