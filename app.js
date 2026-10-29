import { CONFIG } from './config.js';

const S = { token: null, user: null, meta: null, view: 'dashboard', property: '', days: 30 };
const $app = document.getElementById('app');

// ───────── Helper DOM (tanpa innerHTML → aman dari XSS) ─────────
const h = (tag, attrs, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of kids.flat()) { if (c == null || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(c)); }
  return el;
};
const rp = n => (n == null || n === '' ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n));
const dt = v => { if (!v) return '—'; const d = new Date(String(v).slice(0, 10) + 'T00:00:00'); return isNaN(d) ? v : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); };
const TONE = { Menang: 'ok', Completed: 'ok', Confirmed: 'ok', 'Checked-out': 'ok', 'Checked-in': 'ok', Kalah: 'bad', Cancelled: 'bad', 'No-show': 'bad', Tinggi: 'bad', 'Tidak Memenuhi Kualifikasi': 'neu',
  Negosiasi: 'warn', 'Penawaran Dikirim': 'warn', Waiting: 'warn', Tentative: 'warn', Sedang: 'warn', Baru: 'info', Open: 'info', Inquiry: 'info', 'In Progress': 'info', Dihubungi: 'info', Berkualifikasi: 'info' };
const badge = t => h('span', { class: 'badge t-' + (TONE[t] || 'neu') }, t);

function toast(msg, bad) {
  const t = h('div', { class: 'toast' + (bad ? ' bad' : '') }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), 4500);
}

// ───────── API ─────────
async function api(action, payload) {
  let res;
  try {
    res = await fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token: S.token, payload }) });
  } catch { const e = new Error('Tidak dapat menghubungi server. Periksa koneksi internet Anda.'); e.code = 'OFFLINE'; throw e; }
  const j = await res.json();
  if (!j.ok) {
    const e = new Error(j.message); e.code = j.code; e.requestId = j.requestId;
    if (j.code === 'UNAUTHENTICATED') { S.token = null; renderLogin('Sesi berakhir. Silakan masuk lagi.'); }
    throw e;
  }
  return j.data;
}

// ───────── Dialog ─────────
function ask({ title, message, field, ok = 'Lanjutkan', danger }) {
  return new Promise(resolve => {
    let done = false;
    const input = field ? h('input', { type: 'text', required: true, 'aria-label': field, placeholder: field }) : null;
    const dlg = h('dialog', { class: 'modal', 'aria-label': title },
      h('form', { onsubmit: e => { e.preventDefault(); done = true; resolve(input ? input.value.trim() : true); dlg.close(); } },
        h('h2', null, title), message && h('p', null, message), input,
        h('div', { class: 'fa' },
          h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Batal'),
          h('button', { class: 'btn ' + (danger ? 'danger' : 'primary') }, ok))));
    dlg.addEventListener('close', () => { if (!done) resolve(null); dlg.remove(); });
    document.body.append(dlg); dlg.showModal(); (input || dlg.querySelector('.primary,.danger')).focus();
  });
}

// ───────── State umum ─────────
const skeleton = () => h('div', { 'aria-busy': 'true', 'aria-label': 'Memuat' }, h('div', { class: 'skel' }), h('div', { class: 'skel' }), h('div', { class: 'skel' }));
const emptyState = (t, d, action) => h('div', { class: 'state' }, h('h3', null, t), h('p', null, d), action);
const errorState = (e, retry) => h('div', { class: 'state', role: 'alert' },
  h('h3', null, e.code === 'FORBIDDEN' ? 'Akses ditolak' : e.code === 'OFFLINE' ? 'Sedang offline' : 'Gagal memuat data'),
  h('p', null, e.message + (e.requestId ? ' (ID: ' + e.requestId + ')' : '')),
  e.code === 'FORBIDDEN' ? null : h('button', { class: 'btn', onclick: retry }, 'Coba lagi'));

// ───────── Login ─────────
function renderLogin(msg) {
  S.user = null;
  const holder = h('div', { id: 'gbtn' });
  const configured = CONFIG.API_URL && CONFIG.GOOGLE_CLIENT_ID;
  $app.replaceChildren(h('main', { class: 'login' }, h('div', { class: 'login-card' },
    h('h1', null, 'Hotel CRM'), h('p', null, 'Masuk dengan akun Google yang sudah didaftarkan admin.'),
    msg && h('div', { class: 'err', role: 'alert' }, msg),
    configured ? holder : h('div', { class: 'err', role: 'alert' }, 'Belum dikonfigurasi: isi API_URL dan GOOGLE_CLIENT_ID di web/config.js (lihat README).'))));
  if (!configured) return;
  const init = () => {
    if (!window.google?.accounts?.id) return setTimeout(init, 200);
    google.accounts.id.initialize({ client_id: CONFIG.GOOGLE_CLIENT_ID, auto_select: true, callback: r => start(r.credential) });
    google.accounts.id.renderButton(holder, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'id' });
  };
  init();
}

async function start(credential) {
  S.token = credential;
  try {
    const me = await api('me');
    S.user = me.user; S.meta = me.meta;
    S.view = location.hash.slice(1) || 'dashboard';
    renderShell();
  } catch (e) { if (e.code !== 'UNAUTHENTICATED') { S.token = null; renderLogin(e.message); } }
}

// ───────── Shell ─────────
const ROLE = { owner: 'Owner', general_manager: 'General Manager', sales_manager: 'Sales & Marketing', reservation_agent: 'Reservation Agent', front_office: 'Front Office', customer_service: 'Customer Service', finance: 'Finance', auditor: 'Auditor' };
const NAV = [
  ['dashboard', 'Dashboard', () => S.meta.canReport], ['inbox', 'Inbox', () => true, 'Fase 2'], ['guests', 'Tamu', () => S.meta.entities.guests],
  ['leads', 'Leads & Pipeline', () => S.meta.entities.leads], ['reservations', 'Reservasi', () => S.meta.entities.reservations], ['tasks', 'Tugas & Follow-up', () => S.meta.entities.tasks],
  ['campaigns', 'Kampanye', () => true, 'Fase 4'], ['tickets', 'Layanan Tamu', () => true, 'Fase 3'], ['reports', 'Laporan', () => true, 'Fase 4'], ['integrations', 'Integrasi', () => true], ['settings', 'Pengaturan', () => true, 'Fase 5']
];

function renderShell() {
  const nav = NAV.filter(n => n[2]());
  if (!nav.some(n => n[0] === S.view)) S.view = nav[0][0];
  const side = h('nav', { class: 'side', 'aria-label': 'Menu utama' }, h('div', { class: 'brand' }, 'Hotel CRM'),
    nav.map(n => h('button', { class: 'nav', 'aria-current': n[0] === S.view ? 'page' : null, onclick: () => go(n[0]) }, n[1], n[3] && h('small', null, 'Belum aktif · ' + n[3]))));
  const title = (nav.find(n => n[0] === S.view) || [])[1];
  const propSel = h('select', { 'aria-label': 'Properti', onchange: e => { S.property = e.target.value; renderView(); } },
    h('option', { value: '' }, 'Semua properti'), S.meta.properties.map(p => h('option', { value: p.id, selected: p.id === S.property }, p.name)));
  const top = h('header', { class: 'top' }, h('h1', null, title),
    h('div', { class: 'who' }, propSel, h('span', null, S.user.name + ' · ' + (ROLE[S.user.role] || S.user.role)),
      h('button', { class: 'btn sm', onclick: () => { google.accounts.id.disableAutoSelect(); S.token = null; renderLogin(); } }, 'Keluar')));
  $app.replaceChildren(h('div', { class: 'shell' }, side, h('div', { class: 'main' }, top, h('main', { class: 'content', id: 'view' }))));
  renderView();
}
function go(view, filters) { S.view = view; S.pending = filters; location.hash = view; renderShell(); }

function renderView() {
  const box = document.getElementById('view'); if (!box) return;
  const v = S.view, f = S.pending || {}; S.pending = null;
  const map = { dashboard: dashboardView, leads: leadsView, integrations: integrationsView };
  let el;
  if (map[v]) el = map[v]();
  else if (S.meta.entities[v]) el = listView(v, f);
  else el = plannedView(v);
  box.replaceChildren(el);
}

// ───────── Dashboard ─────────
function dashboardView() {
  const root = h('div'), body = h('div');
  const sel = h('select', { 'aria-label': 'Rentang tanggal', onchange: e => { S.days = +e.target.value; load(); } },
    [7, 30, 90].map(d => h('option', { value: d, selected: d === S.days }, d + ' hari terakhir')));
  root.append(h('div', { class: 'bar' }, sel), body);
  const bars = (o, title) => {
    const max = Math.max(1, ...Object.values(o));
    const keys = Object.keys(o);
    return h('div', { class: 'panel' }, h('h2', null, title), keys.length ? keys.map(k => h('div', { class: 'hb' }, h('span', null, k), h('i', { style: 'width:' + (o[k] / max * 100) + '%' }), h('b', null, o[k]))) : h('p', { class: 'state' }, 'Belum ada data.'));
  };
  async function load() {
    body.replaceChildren(skeleton());
    try {
      const d = await api('dashboard', { days: S.days, property_id: S.property });
      const fmt = m => m.format === 'currency' ? rp(m.value) : m.format === 'percent' ? m.value + '%' : m.value;
      body.replaceChildren(
        h('div', { class: 'grid' }, d.metrics.map(m => h('button', { class: 'metric', onclick: () => m.link && go(m.link.view, m.link.filters), title: 'Lihat daftar' },
          h('span', { class: 'l' }, m.label), h('span', { class: 'v' }, fmt(m)), h('span', { class: 'd' }, m.definition), h('span', { class: 'd' }, m.range + ' · ' + m.source)))),
        h('div', { class: 'cols' }, bars(d.by_stage, 'Lead per tahap'), bars(d.by_source, 'Sumber lead (rentang terpilih)')));
    } catch (e) { body.replaceChildren(errorState(e, load)); }
  }
  load(); return root;
}

// ───────── Daftar (tamu, reservasi, tugas) ─────────
function cell(f, rec) {
  const v = rec[f.name === 'guest_name' ? 'guest_name' : f.name];
  if (f.name === 'last_synced') return v ? dt(v) : h('span', { class: 'badge t-neu' }, 'Belum terhubung PMS');
  if (f.type === 'number' && /value/.test(f.name)) return rp(v);
  if (f.type === 'date') return dt(v);
  if (f.type === 'bool') return v ? badge('Setuju') : '—';
  if (f.type === 'select' || f.name === 'stage') return v ? badge(v) : '—';
  return v === '' || v == null ? '—' : String(v).replace(/^'/, '');
}
const colFields = (E, name) => E.columns.map(c => E.fields.find(f => f.name === c) || { name: c, label: { guest_name: 'Tamu', code: 'Kode', stage: 'Tahap', last_synced: 'Sinkron PMS terakhir' }[c] || c, type: c === 'stage' ? 'select' : 'string' });

function listView(name, initial) {
  const E = S.meta.entities[name], st = { q: '', page: 1, filters: { ...initial } };
  const body = h('div', { class: 'panel' });
  const search = h('input', { type: 'search', placeholder: 'Cari…', 'aria-label': 'Cari', oninput: debounce(e => { st.q = e.target.value; st.page = 1; load(); }) });
  const bar = h('div', { class: 'bar' }, search);
  E.filters.forEach(k => {
    const f = E.fields.find(x => x.name === k); if (!f?.options) return;
    bar.append(h('select', { 'aria-label': f.label, onchange: e => { st.filters[k] = e.target.value; st.page = 1; load(); } },
      h('option', { value: '' }, f.label + ': semua'), f.options.map(o => h('option', { value: o, selected: st.filters[k] === o }, o))));
  });
  if (name === 'tasks') {
    const chip = (label, key, val) => h('label', { class: 'chip' }, h('input', { type: 'checkbox', checked: !!st.filters[key], onchange: e => { st.filters[key] = e.target.checked ? val : ''; st.page = 1; load(); } }), label);
    bar.append(chip('Terlambat', 'overdue', true), chip('Tugas saya', 'owner_email', S.user.email));
  }
  bar.append(h('span', { class: 'spacer' }), E.canWrite && h('button', { class: 'btn primary', onclick: () => openForm(name, null, load) }, 'Tambah ' + E.label.toLowerCase()));
  const cols = colFields(E, name);
  async function load() {
    body.replaceChildren(skeleton());
    try {
      const r = await api('list', { entity: name, q: st.q, page: st.page, limit: 20, filters: st.filters, property_id: S.property });
      if (!r.items.length) return body.replaceChildren(emptyState('Belum ada data', st.q ? 'Tidak ada hasil untuk pencarian ini.' : 'Mulai dengan menambahkan data pertama.', E.canWrite && !st.q ? h('button', { class: 'btn primary', onclick: () => openForm(name, null, load) }, 'Tambah ' + E.label.toLowerCase()) : null));
      const rows = r.items.map(rec => { const open = () => openForm(name, rec, load); return h('tr', { tabindex: 0, onclick: open, onkeydown: e => e.key === 'Enter' && open() }, cols.map(f => h('td', null, cell(f, rec)))); });
      body.replaceChildren(h('div', { class: 'scroll' }, h('table', null, h('thead', null, h('tr', null, cols.map(f => h('th', null, f.label)))), h('tbody', null, rows))),
        h('div', { class: 'pager' }, h('span', null, r.total + ' data · halaman ' + r.page),
          h('span', null, h('button', { class: 'btn sm', disabled: r.page <= 1, onclick: () => { st.page--; load(); } }, 'Sebelumnya'), ' ', h('button', { class: 'btn sm', disabled: r.page * r.limit >= r.total, onclick: () => { st.page++; load(); } }, 'Berikutnya'))));
    } catch (e) { body.replaceChildren(errorState(e, load)); }
  }
  load(); return h('div', null, bar, body);
}
function debounce(fn, ms = 300) { let t; return e => { clearTimeout(t); t = setTimeout(() => fn(e), ms); }; }

// ───────── Form (drawer) ─────────
async function openForm(name, rec, onSaved) {
  const E = S.meta.entities[name], editing = !!rec, ro = !E.canWrite;
  let guests = [];
  if (E.fields.some(f => f.type === 'guest')) { try { guests = (await api('list', { entity: 'guests', limit: 100 })).items; } catch (e) { return toast(e.message, true); } }
  const inputs = {}, err = h('div', { class: 'err', role: 'alert', hidden: true });
  const make = f => {
    const v = rec ? rec[f.name] : undefined; let el;
    const opts = list => [!f.required && h('option', { value: '' }, '—'), list.map(([val, lbl]) => h('option', { value: val, selected: val === v }, lbl))];
    if (f.type === 'text') el = h('textarea', null, v ? String(v).replace(/^'/, '') : '');
    else if (f.type === 'bool') el = h('input', { type: 'checkbox', checked: !!v });
    else if (f.type === 'select') el = h('select', null, opts(f.options.map(o => [o, o])));
    else if (f.type === 'guest') el = h('select', null, opts(guests.map(g => [g.id, g.full_name + (g.phone_e164 ? ' · ' + g.phone_e164 : '')])));
    else if (f.type === 'property') el = h('select', null, opts(S.meta.properties.map(p => [p.id, p.name])));
    else el = h('input', { type: { number: 'number', date: 'date', email: 'email', phone: 'tel' }[f.type] || 'text', value: v == null ? '' : String(v).replace(/^'/, ''), min: f.type === 'number' ? 0 : null });
    if (ro) el.disabled = true; inputs[f.name] = el;
    return f.type === 'bool' ? h('label', { class: 'cb' }, el, f.label) : h('label', null, f.label + (f.required ? ' *' : ''), el);
  };
  const read = () => Object.fromEntries(E.fields.map(f => [f.name, f.type === 'bool' ? inputs[f.name].checked : inputs[f.name].value]));
  const dlg = h('dialog', { class: 'drawer', 'aria-label': editing ? 'Ubah' : 'Tambah' });
  const saveBtn = h('button', { class: 'btn primary' }, 'Simpan');
  async function save(force) {
    err.hidden = true; saveBtn.disabled = true;
    try {
      const data = read();
      if (editing) await api('update', { entity: name, id: rec.id, data, force });
      else await api('create', { entity: name, data, force });
      toast('Tersimpan'); dlg.close(); onSaved && onSaved();
    } catch (e) {
      if (e.code === 'DUPLICATE' && await ask({ title: 'Kemungkinan duplikat', message: e.message + ' Tetap simpan?', ok: 'Tetap simpan' })) return save(true);
      if (e.code !== 'DUPLICATE') { err.textContent = e.message; err.hidden = false; }
    } finally { saveBtn.disabled = false; }
  }
  const form = h('form', { class: 'form', novalidate: true, onsubmit: e => { e.preventDefault(); save(false); } }, err, E.fields.map(make),
    !ro && h('div', { class: 'fa' }, editing ? h('button', { type: 'button', class: 'btn danger', onclick: async () => { if (await ask({ title: 'Hapus data ini?', message: 'Data disembunyikan dari daftar dan tercatat di audit log.', ok: 'Hapus', danger: true })) { try { await api('remove', { entity: name, id: rec.id }); toast('Terhapus'); dlg.close(); onSaved && onSaved(); } catch (e) { toast(e.message, true); } } } }, 'Hapus') : h('span'), saveBtn));
  dlg.append(h('div', { class: 'dh' }, h('h2', null, (editing ? 'Ubah ' : 'Tambah ') + E.label.toLowerCase()), h('button', { class: 'btn sm', type: 'button', onclick: () => dlg.close() }, 'Tutup')), form);
  dlg.addEventListener('close', () => dlg.remove()); document.body.append(dlg); dlg.showModal();
}

// ───────── Pipeline (Kanban) ─────────
function leadsView() {
  const E = S.meta.entities.leads, root = h('div'), board = h('div');
  root.append(h('div', { class: 'bar' }, h('span', { class: 'chip' }, 'Seret kartu atau pakai menu "Pindah ke" untuk mengubah tahap.'), h('span', { class: 'spacer' }), E.canWrite && h('button', { class: 'btn primary', onclick: () => openForm('leads', null, load) }, 'Tambah lead')), board);
  async function move(lead, to) {
    if (to === lead.stage) return;
    try {
      if (to === 'Menang') { if (!await ask({ title: 'Konversi ke reservasi?', message: 'Reservasi CRM berstatus Tentative akan dibuat dari lead ini, memakai profil tamu yang sama.', ok: 'Buat reservasi' })) return; const r = await api('convertLead', { id: lead.id }); toast('Reservasi ' + r.code + ' dibuat'); }
      else if (to === 'Kalah') { const reason = await ask({ title: 'Tandai sebagai kalah', field: 'Alasan kalah', ok: 'Simpan' }); if (!reason) return; await api('moveLead', { id: lead.id, stage: to, lost_reason: reason }); }
      else await api('moveLead', { id: lead.id, stage: to });
    } catch (e) { toast(e.message, true); }
    load();
  }
  async function load() {
    board.replaceChildren(skeleton());
    try {
      const r = await api('list', { entity: 'leads', limit: 100, property_id: S.property });
      if (!r.items.length) return board.replaceChildren(emptyState('Belum ada lead', 'Tambahkan lead pertama untuk mulai memantau pipeline.'));
      board.replaceChildren(h('div', { class: 'kanban' }, S.meta.stages.map(stage => {
        const items = r.items.filter(l => l.stage === stage);
        const col = h('div', { class: 'col', ondragover: e => { e.preventDefault(); col.classList.add('over'); }, ondragleave: () => col.classList.remove('over'),
          ondrop: e => { e.preventDefault(); col.classList.remove('over'); const l = r.items.find(x => x.id === e.dataTransfer.getData('text/plain')); l && E.canWrite && move(l, stage); } },
          h('h3', null, h('span', null, stage), h('span', null, items.length)), h('div', { class: 'sum' }, rp(items.reduce((s, l) => s + (l.est_value || 0), 0))),
          items.map(l => h('div', { class: 'card p-' + l.priority, draggable: E.canWrite, ondragstart: e => e.dataTransfer.setData('text/plain', l.id) },
            h('b', { tabindex: 0, onclick: () => openForm('leads', l, load), onkeydown: e => e.key === 'Enter' && openForm('leads', l, load) }, l.guest_name),
            h('div', { class: 'm' }, l.source + (l.checkin ? ' · ' + dt(l.checkin) : '')), h('div', { class: 'm' }, rp(l.est_value) + (l.owner_email ? ' · ' + l.owner_email.split('@')[0] : '')),
            l.lost_reason && h('div', { class: 'm' }, 'Alasan: ' + l.lost_reason),
            E.canWrite && !S.meta.closed.includes(l.stage) && h('div', { class: 'acts' },
              h('select', { 'aria-label': 'Pindah ke tahap', onchange: e => move(l, e.target.value) }, h('option', { value: '' }, 'Pindah ke…'), S.meta.stages.filter(s => s !== stage && s !== 'Menang').map(s => h('option', { value: s }, s))),
              h('button', { class: 'btn sm', onclick: () => move(l, 'Menang') }, 'Konversi ke reservasi')))));
        return col;
      })));
    } catch (e) { board.replaceChildren(errorState(e, load)); }
  }
  load(); return root;
}

// ───────── Modul yang belum aktif & Integrasi ─────────
const PLANNED = {
  inbox: ['Inbox WhatsApp', 'Fase 2', 'Inbox tiga panel dan WhatsApp Cloud API belum dikonfigurasi. Butuh perantara webhook terpisah (lihat README, bagian Keterbatasan).'],
  campaigns: ['Kampanye', 'Fase 4', 'Segmentasi dan kampanye menunggu inbox, data persetujuan, dan integrasi WhatsApp resmi.'],
  tickets: ['Layanan Tamu', 'Fase 3', 'Tiket, SLA, dan eskalasi direncanakan pada fase 3.'],
  reports: ['Laporan & Analitik', 'Fase 4', 'Ringkasan dasar tersedia di Dashboard. Laporan lanjutan dan ekspor direncanakan pada fase 4.'],
  settings: ['Pengaturan', 'Fase 5', 'Saat ini pengguna, peran, dan properti dikelola langsung di sheet Users dan Properties.']
};
const plannedView = v => { const [t, ph, d] = PLANNED[v] || ['Modul', '', '']; return h('div', { class: 'panel' }, emptyState(t + ' — belum dikonfigurasi', d + ' (' + ph + ')')); };

function integrationsView() {
  const root = h('div', { class: 'panel' }, skeleton());
  api('health').then(r => {
    const row = (n, ok, d) => h('div', { class: 'int' }, h('div', null, h('b', null, n), h('p', null, d)), h('span', { class: 'badge t-' + (ok === true ? 'ok' : ok === false ? 'bad' : 'neu') }, ok === true ? 'Terhubung' : ok === false ? 'Bermasalah' : 'Belum dikonfigurasi'));
    root.replaceChildren(row('Google Sheets (database)', r.ok, r.ok ? 'Semua sheet yang dibutuhkan tersedia.' : 'Jalankan setup() di Apps Script: ' + Object.keys(r.sheets).filter(k => !r.sheets[k]).join(', ')),
      row('WhatsApp Cloud API', null, 'Belum dikonfigurasi. Direncanakan pada Fase 2.'), row('PMS / Channel Manager', null, 'Belum dikonfigurasi. Reservasi di aplikasi ini adalah data CRM, bukan inventori kamar.'));
  }).catch(e => root.replaceChildren(errorState(e, () => renderView())));
  return root;
}

renderLogin();
