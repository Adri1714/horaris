/* Horaris — gestió d'horaris, hores extra i sou. Tot es guarda al dispositiu. */
'use strict';

/* ================= Utilitats ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const num = (v, d = 0) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : d; };

const MONTHS = ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre'];
const MONTHS_DE = ['de gener', 'de febrer', 'de març', "d'abril", 'de maig', 'de juny', 'de juliol', "d'agost", 'de setembre', "d'octubre", 'de novembre', 'de desembre'];
const WEEKDAYS = ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte'];
const WD_SHORT = ['Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds', 'Dg'];
const COLORS = ['#2E4A3B', '#3E5A7A', '#A9512B', '#B8892A', '#6B4E71', '#4F6F6A', '#8A3B3B', '#5C5A52'];

const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayKey = () => ymd(new Date());
const toMin = (t) => { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const nowHHMM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function spanMin(start, end, breakMin = 0) {
  if (!start || !end) return 0;
  let d = toMin(end) - toMin(start);
  if (d <= 0) d += 1440; // torn que passa de mitjanit
  return Math.max(0, d - (num(breakMin) || 0));
}
function fmtHM(min, { sign = false } = {}) {
  const neg = min < 0; const a = Math.round(Math.abs(min));
  const h = Math.floor(a / 60), m = a % 60;
  const s = m ? `${h} h ${pad(m)}` : `${h} h`;
  return (neg ? '−' : sign ? '+' : '') + s;
}
const fmtHours = (min) => (Math.round(min / 6) / 10).toLocaleString('ca-ES') + ' h';
function fmtMoney(v) {
  const c = state.settings.currency || '€';
  return v.toLocaleString('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + c;
}
const fmtDateLong = (d) => `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_DE[d.getMonth()]}`;
const fmtDateShort = (d) => `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}.`;
const weekdayMon = (d) => (d.getDay() + 6) % 7;

/* ================= Estat ================= */
const STORE = 'horaris.v1';
function defaults() {
  return {
    shifts: [
      { id: uid(), name: 'Matí', short: 'M', start: '07:00', end: '15:00', breakMin: 0, color: '#B8892A' },
      { id: uid(), name: 'Tarda', short: 'T', start: '15:00', end: '23:00', breakMin: 0, color: '#A9512B' },
      { id: uid(), name: 'Nit', short: 'N', start: '23:00', end: '07:00', breakMin: 0, color: '#3E5A7A' },
      { id: uid(), name: 'Partit', short: 'P', start: '09:00', end: '18:00', breakMin: 60, color: '#2E4A3B' },
    ],
    days: {},      // 'YYYY-MM-DD' -> { type: 'shift'|'custom'|'off'|'vac'|'comp', shiftId, start, end, breakMin, note }
    extras: [],    // { id, date, start, end, minutes, mode: 'bank'|'paid', note }
    used: [],      // hores gaudides parcials: { id, date, minutes, note }
    active: null,  // { start: ISO, mode }
    salary: {
      mode: 'hourly', hourly: 12, monthly: 1500, extraRate: 15,
      ss: 6.48, irpf: 12, payments: 14, prorate: false, extraPayAmount: 1500,
      paidLeave: true, bonuses: [],
    },
    settings: { hoursPerDay: 8, currency: '€', defaultExtraMode: 'bank', theme: 'auto' },
  };
}
function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return defaults();
    const d = defaults(), s = JSON.parse(raw);
    return { ...d, ...s, salary: { ...d.salary, ...s.salary }, settings: { ...d.settings, ...s.settings } };
  } catch { return defaults(); }
}
let state = load();
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); }
  catch { toast("No s'ha pogut desar al dispositiu"); }
}

const ui = { tab: 'avui', calMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1), salMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1), brush: null, anim: true };

/* ================= Càlculs ================= */
const shiftById = (id) => state.shifts.find((s) => s.id === id);
const shiftMin = (s) => spanMin(s.start, s.end, s.breakMin);
function dayMin(key) {
  const d = state.days[key];
  if (!d) return 0;
  if (d.type === 'shift') { const s = shiftById(d.shiftId); return s ? shiftMin(s) : 0; }
  if (d.type === 'custom') return spanMin(d.start, d.end, d.breakMin);
  return 0;
}
function dayLabel(key) {
  const d = state.days[key];
  if (!d) return null;
  if (d.type === 'shift') { const s = shiftById(d.shiftId); return s ? { name: s.name, short: s.short, color: s.color, time: `${s.start} – ${s.end}` } : null; }
  if (d.type === 'custom') return { name: 'Horari propi', short: d.start?.slice(0, 2) || '·', color: '#5C5A52', time: `${d.start} – ${d.end}` };
  if (d.type === 'off') return { name: 'Lliure', short: 'L', cls: 'off' };
  if (d.type === 'vac') return { name: 'Vacances', short: 'V', cls: 'vac' };
  if (d.type === 'comp') return { name: 'Dia compensat', short: 'C', cls: 'comp' };
  return null;
}
const dayLen = () => Math.max(1, num(state.settings.hoursPerDay, 8)) * 60;

function bank() {
  const earned = state.extras.filter((e) => e.mode === 'bank').reduce((a, e) => a + e.minutes, 0);
  const usedPartial = state.used.reduce((a, u) => a + u.minutes, 0);
  const compDays = Object.values(state.days).filter((d) => d.type === 'comp').length;
  const used = usedPartial + compDays * dayLen();
  return { earned, used, balance: earned - used, compDays };
}
function fmtBankDays(min) {
  const dl = dayLen(); const neg = min < 0; const a = Math.abs(min);
  const days = Math.floor(a / dl), rest = a - days * dl;
  const parts = [];
  if (days) parts.push(`${days} ${days === 1 ? 'dia' : 'dies'}`);
  if (rest || !days) parts.push(fmtHM(rest));
  return (neg ? '−' : '') + parts.join(' i ');
}

function monthKeys(y, m) {
  const n = new Date(y, m + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${y}-${pad(m + 1)}-${pad(i + 1)}`);
}
function monthSummary(y, m) {
  const keys = monthKeys(y, m);
  const prefix = `${y}-${pad(m + 1)}`;
  let workMin = 0, workDays = 0, leaveDays = 0;
  for (const k of keys) {
    const d = state.days[k];
    if (!d) continue;
    const mins = dayMin(k);
    if (mins > 0) { workMin += mins; workDays++; }
    if (d.type === 'vac' || d.type === 'comp') leaveDays++;
  }
  const ex = state.extras.filter((e) => e.date.startsWith(prefix));
  const extraPaid = ex.filter((e) => e.mode === 'paid').reduce((a, e) => a + e.minutes, 0);
  const extraBank = ex.filter((e) => e.mode === 'bank').reduce((a, e) => a + e.minutes, 0);
  return { workMin, workDays, leaveDays, extraPaid, extraBank };
}
function payroll(y, m) {
  const S = state.salary; const sum = monthSummary(y, m);
  const lines = [];
  let gross = 0;
  if (S.mode === 'hourly') {
    const h = sum.workMin / 60;
    const base = h * num(S.hourly);
    lines.push({ label: 'Hores ordinàries', detail: `${fmtHours(sum.workMin)} × ${fmtMoney(num(S.hourly))}`, value: base });
    gross += base;
    if (S.paidLeave && sum.leaveDays) {
      const lv = sum.leaveDays * (dayLen() / 60) * num(S.hourly);
      lines.push({ label: 'Vacances i dies compensats', detail: `${sum.leaveDays} ${sum.leaveDays === 1 ? "dia" : "dies"} × ${num(state.settings.hoursPerDay)} h`, value: lv });
      gross += lv;
    }
  } else {
    lines.push({ label: 'Sou base', detail: 'Mensual fix', value: num(S.monthly) });
    gross += num(S.monthly);
  }
  if (sum.extraPaid) {
    const v = sum.extraPaid / 60 * num(S.extraRate);
    lines.push({ label: 'Hores extra pagades', detail: `${fmtHours(sum.extraPaid)} × ${fmtMoney(num(S.extraRate))}`, value: v });
    gross += v;
  }
  const extraPays = Math.max(0, num(S.payments, 12) - 12);
  if (extraPays) {
    if (S.prorate) {
      const v = num(S.extraPayAmount) * extraPays / 12;
      lines.push({ label: 'Pagues extra prorratejades', detail: `${extraPays} pagues / 12`, value: v });
      gross += v;
    } else if (m === 5 || m === 11) {
      const v = num(S.extraPayAmount) * (extraPays / 2);
      lines.push({ label: 'Paga extra', detail: m === 5 ? 'Estiu' : 'Nadal', value: v });
      gross += v;
    }
  }
  for (const b of S.bonuses || []) {
    if (!num(b.amount)) continue;
    lines.push({ label: b.name || 'Plus', detail: 'Fix mensual', value: num(b.amount) });
    gross += num(b.amount);
  }
  const ss = gross * num(S.ss) / 100;
  const irpf = gross * num(S.irpf) / 100;
  return { lines, gross, ss, irpf, net: gross - ss - irpf, sum };
}

/* ================= Interfície general ================= */
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}
function openSheet(title, html, mount) {
  $('#sheet-title').textContent = title;
  const body = $('#sheet-body'); body.innerHTML = html; body.scrollTop = 0;
  const root = $('#sheet-root'); root.classList.add('open'); root.setAttribute('aria-hidden', 'false');
  mount && mount(body);
}
function closeSheet() {
  const root = $('#sheet-root'); root.classList.remove('open'); root.setAttribute('aria-hidden', 'true');
}
$$('[data-close]').forEach((el) => el.addEventListener('click', closeSheet));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

function setTab(tab) {
  ui.tab = tab; ui.anim = true;
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  render();
  window.scrollTo({ top: 0 });
}
$$('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

function applyTheme() {
  const t = state.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

function commit(msg) { save(); render(); if (msg) toast(msg); }

/* ================= Vista: Avui ================= */
function viewAvui() {
  const now = new Date(); const key = ymd(now);
  const lab = dayLabel(key);
  const b = bank();
  const p = payroll(now.getFullYear(), now.getMonth());
  const a = state.active;

  const upcoming = [];
  for (let i = 1; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    upcoming.push({ d, k: ymd(d), lab: dayLabel(ymd(d)) });
  }

  return `
  <div class="${ui.anim ? 'fade-in' : ''}">
    <div class="eyebrow">${esc(fmtDateLong(now))}</div>
    <h1 class="title">${greeting()}</h1>

    <div class="card">
      <div class="card-row">
        <div>
          <div class="eyebrow">Avui</div>
          ${lab ? `
            <div class="shift-pill" style="margin-top:6px;font-size:19px;font-family:var(--serif)">
              ${lab.color ? `<span class="dot" style="background:${lab.color}"></span>` : ''}${esc(lab.name)}
            </div>
            ${lab.time ? `<div class="muted num" style="margin-top:2px">${lab.time} · ${fmtHM(dayMin(key))}</div>` : ''}
          ` : `<div style="margin-top:6px;font-family:var(--serif);font-size:19px">Sense torn assignat</div>`}
        </div>
        <button class="btn sm" data-act="edit-day" data-key="${key}">${lab ? 'Canviar' : 'Assignar'}</button>
      </div>
    </div>

    <div class="card timer-card ${a ? 'running' : ''}">
      <div class="eyebrow">${a ? '<span class="pulse"></span>Fent hores extra' : 'Hores extra'}</div>
      ${a ? `
        <div class="timer" id="timer">${elapsed(a.start)}</div>
        <div class="muted" style="font-size:13.5px">Des de les ${new Date(a.start).toTimeString().slice(0, 5)} · ${a.mode === 'paid' ? 'es pagaran' : 'van al banc'}</div>
        <div class="btn-row">
          <button class="btn extra" data-act="stop-extra">Aturar i desar</button>
          <button class="btn ghost" data-act="cancel-extra" style="flex:0 0 auto">Descartar</button>
        </div>
      ` : `
        <p class="muted" style="margin:6px 0 0;font-size:14px">Marca quan comences a fer hores de més. En aturar-ho es desaran ${state.settings.defaultExtraMode === 'paid' ? 'com a hores pagades' : 'al banc com a temps que et deu l’empresa'}.</p>
        <div class="btn-row">
          <button class="btn extra" data-act="start-extra">
            <svg viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5z"/></svg>Començar
          </button>
          <button class="btn" data-act="add-extra">Afegir a mà</button>
        </div>
      `}
    </div>

    <div class="grid-2">
      <button class="card stat" data-go="banc" style="text-align:left">
        <div class="eyebrow">L'empresa et deu</div>
        <div class="value">${fmtBankDays(b.balance)}</div>
        <div class="sub num">${fmtHours(b.balance)} al banc</div>
      </button>
      <button class="card stat" data-go="sou" style="text-align:left;margin-top:0">
        <div class="eyebrow">Net ${MONTHS[now.getMonth()]}</div>
        <div class="value">${fmtMoney(p.net)}</div>
        <div class="sub num">${fmtHours(p.sum.workMin)} treballades</div>
      </button>
    </div>

    <h3 class="section">Propers dies</h3>
    <div class="list">
      ${upcoming.map(({ d, k, lab }) => `
        <button class="list-item" data-act="edit-day" data-key="${k}">
          <div style="width:38px;text-align:center">
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">${WD_SHORT[weekdayMon(d)]}</div>
            <div class="num" style="font-family:var(--serif);font-size:20px;line-height:1.1">${d.getDate()}</div>
          </div>
          <div class="main">
            <div class="t">${lab ? `${lab.color ? `<span class="dot" style="background:${lab.color};margin-right:7px"></span>` : ''}${esc(lab.name)}` : '<span class="muted">—</span>'}</div>
            ${lab?.time ? `<div class="s num">${lab.time}</div>` : ''}
          </div>
          <svg viewBox="0 0 24 24" style="color:var(--muted);width:18px"><path d="m9 6 6 6-6 6"/></svg>
        </button>`).join('')}
    </div>
  </div>`;
}
function greeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Bona <em>nit</em>';
  if (h < 13) return 'Bon <em>dia</em>';
  if (h < 20) return 'Bona <em>tarda</em>';
  return 'Bon <em>vespre</em>';
}
function elapsed(iso) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}
setInterval(() => { const t = $('#timer'); if (t && state.active) t.textContent = elapsed(state.active.start); }, 1000);

/* ================= Vista: Calendari ================= */
function viewCalendari() {
  const y = ui.calMonth.getFullYear(), m = ui.calMonth.getMonth();
  const first = new Date(y, m, 1);
  const lead = weekdayMon(first);
  const n = new Date(y, m + 1, 0).getDate();
  const tk = todayKey();
  const extraDays = new Set(state.extras.map((e) => e.date));
  const sum = monthSummary(y, m);

  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<div class="cal-day out"></div>';
  for (let d = 1; d <= n; d++) {
    const k = `${y}-${pad(m + 1)}-${pad(d)}`;
    const lab = dayLabel(k);
    const wd = weekdayMon(new Date(y, m, d));
    cells += `
      <button class="cal-day ${k === tk ? 'today' : ''} ${wd > 4 ? 'weekend' : ''}" data-day="${k}" aria-label="${d} ${MONTHS_DE[m]}${lab ? ', ' + esc(lab.name) : ''}">
        <span class="n">${d}</span>
        ${lab ? `<span class="chip ${lab.cls || ''}" ${lab.color ? `style="background:${lab.color}"` : ''}>${esc(lab.short)}</span>` : ''}
        ${extraDays.has(k) ? '<span class="xdot"></span>' : ''}
      </button>`;
  }

  const brushes = [
    { id: null, label: 'Editar dia' },
    ...state.shifts.map((s) => ({ id: 's:' + s.id, label: s.name, color: s.color })),
    { id: 'off', label: 'Lliure' },
    { id: 'vac', label: 'Vacances' },
    { id: 'comp', label: 'Compensat' },
    { id: 'clear', label: 'Esborrar' },
  ];

  return `
  <div class="${ui.anim ? 'fade-in' : ''}">
    <div class="month-nav">
      <button class="icon-btn" data-act="cal-prev" aria-label="Mes anterior"><svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg></button>
      <h1 class="title" style="text-transform:capitalize">${MONTHS[m]} <span>${y}</span></h1>
      <button class="icon-btn" data-act="cal-next" aria-label="Mes següent"><svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button>
    </div>

    <div class="brushes" role="toolbar" aria-label="Pinzell">
      ${brushes.map((b) => `
        <button class="brush ${ui.brush === b.id ? 'on' : ''}" data-brush="${b.id ?? ''}">
          ${b.color ? `<span class="dot" style="background:${b.color}"></span>` : ''}${esc(b.label)}
        </button>`).join('')}
    </div>

    <div class="cal">
      <div class="cal-head">${WD_SHORT.map((w) => `<div>${w}</div>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
    </div>
    <p class="hint">${ui.brush ? 'Toca els dies per aplicar-hi el pinzell seleccionat.' : 'Toca un dia per veure’l i editar-lo, o tria un torn a dalt per omplir dies ràpidament.'}</p>

    <div class="grid-2">
      <div class="card stat"><div class="eyebrow">Hores del mes</div><div class="value">${fmtHours(sum.workMin)}</div><div class="sub">${sum.workDays} dies de feina</div></div>
      <div class="card stat" style="margin-top:0"><div class="eyebrow">Hores extra</div><div class="value">${fmtHours(sum.extraBank + sum.extraPaid)}</div><div class="sub">${fmtHours(sum.extraBank)} al banc</div></div>
    </div>
    <div class="btn-row"><button class="btn ghost sm" data-act="copy-week" style="flex:0 0 auto">Repetir una setmana…</button></div>
  </div>`;
}

function paintDay(key) {
  const b = ui.brush;
  if (b === 'clear') delete state.days[key];
  else if (b.startsWith('s:')) state.days[key] = { type: 'shift', shiftId: b.slice(2), note: state.days[key]?.note || '' };
  else state.days[key] = { type: b, note: state.days[key]?.note || '' };
  save(); render();
}

function sheetDay(key) {
  const d = parseYmd(key);
  const cur = state.days[key] || { type: null };
  let sel = cur.type === 'shift' ? 's:' + cur.shiftId : cur.type;
  const customs = { start: cur.start || '09:00', end: cur.end || '17:00', breakMin: cur.breakMin ?? 0 };
  const dayExtras = state.extras.filter((e) => e.date === key);

  const opts = [
    ...state.shifts.map((s) => ({ id: 's:' + s.id, t: s.name, s: `${s.start} – ${s.end}`, color: s.color })),
    { id: 'custom', t: 'Horari propi', s: 'Hores diferents' },
    { id: 'off', t: 'Lliure', s: 'Dia de descans' },
    { id: 'vac', t: 'Vacances', s: 'Dia de vacances' },
    { id: 'comp', t: 'Dia compensat', s: `Resta ${num(state.settings.hoursPerDay)} h del banc` },
  ];

  openSheet(fmtDateLong(d).replace(/^./, (c) => c.toUpperCase()), `
    <div class="sub-h" style="margin-top:4px">Què fas aquest dia?</div>
    <div class="options" id="day-opts">
      ${opts.map((o) => `
        <button class="opt ${sel === o.id ? 'on' : ''}" data-opt="${o.id}">
          ${o.color ? `<span class="dot" style="background:${o.color}"></span>` : ''}
          <div><div class="t">${esc(o.t)}</div><div class="s">${esc(o.s)}</div></div>
        </button>`).join('')}
    </div>

    <div id="custom-box" style="display:${sel === 'custom' ? 'block' : 'none'};margin-top:14px">
      <div class="row-3">
        <label class="field"><span>Entrada</span><input class="input" type="time" id="c-start" value="${customs.start}"></label>
        <label class="field"><span>Sortida</span><input class="input" type="time" id="c-end" value="${customs.end}"></label>
        <label class="field"><span>Pausa (min)</span><input class="input" type="number" inputmode="numeric" min="0" id="c-break" value="${customs.breakMin}"></label>
      </div>
    </div>

    <label class="field" style="margin-top:14px"><span>Nota</span><textarea class="input" id="d-note" placeholder="Opcional">${esc(cur.note || '')}</textarea></label>

    <div class="sub-h">Hores extra d'aquest dia</div>
    ${dayExtras.length ? `<div class="list">${dayExtras.map(extraItem).join('')}</div>` : '<p class="muted" style="margin:0;font-size:14px">Cap.</p>'}
    <button class="btn sm" style="margin-top:10px" data-act="add-extra" data-key="${key}">+ Afegir hores extra</button>

    <div class="btn-row" style="margin-top:22px">
      ${state.days[key] ? '<button class="btn danger" id="d-clear" style="flex:0 0 auto">Buidar</button>' : ''}
      <button class="btn primary" id="d-save">Desar</button>
    </div>
  `, (body) => {
    $$('#day-opts .opt', body).forEach((b) => b.addEventListener('click', () => {
      sel = b.dataset.opt;
      $$('#day-opts .opt', body).forEach((x) => x.classList.toggle('on', x === b));
      $('#custom-box', body).style.display = sel === 'custom' ? 'block' : 'none';
    }));
    $('#d-save', body).addEventListener('click', () => {
      const note = $('#d-note', body).value.trim();
      if (!sel) { if (note) state.days[key] = { type: 'note', note }; closeSheet(); return commit(); }
      if (sel.startsWith('s:')) state.days[key] = { type: 'shift', shiftId: sel.slice(2), note };
      else if (sel === 'custom') state.days[key] = { type: 'custom', start: $('#c-start', body).value, end: $('#c-end', body).value, breakMin: num($('#c-break', body).value), note };
      else state.days[key] = { type: sel, note };
      closeSheet(); commit('Dia desat');
    });
    $('#d-clear', body)?.addEventListener('click', () => { delete state.days[key]; closeSheet(); commit('Dia buidat'); });
  });
}

function sheetCopyWeek() {
  const mon = new Date(); mon.setDate(mon.getDate() - weekdayMon(mon));
  openSheet('Repetir una setmana', `
    <p class="muted" style="margin-top:0;font-size:14px">Copia els torns d'una setmana (de dilluns a diumenge) a les setmanes següents. Útil si fas un horari rotatiu fix.</p>
    <label class="field"><span>Setmana d'origen (qualsevol dia)</span><input class="input" type="date" id="w-src" value="${ymd(mon)}"></label>
    <label class="field"><span>Quantes setmanes repetir</span><input class="input" type="number" inputmode="numeric" min="1" max="52" id="w-n" value="4"></label>
    <label class="field"><span>Cada quantes setmanes es repeteix el patró</span>
      <select class="input" id="w-cycle"><option value="1">Cada setmana</option><option value="2">Cada 2 setmanes</option><option value="3">Cada 3 setmanes</option><option value="4">Cada 4 setmanes</option></select>
    </label>
    <p class="hint" style="margin-top:-6px">Si el patró és de 2 o més setmanes, es copiaran totes les setmanes del cicle a partir de l'origen.</p>
    <div class="btn-row"><button class="btn primary" id="w-go">Aplicar</button></div>
  `, (body) => {
    $('#w-go', body).addEventListener('click', () => {
      const src = parseYmd($('#w-src', body).value || ymd(mon));
      src.setDate(src.getDate() - weekdayMon(src));
      const cycle = Math.max(1, num($('#w-cycle', body).value, 1));
      const times = Math.min(104, Math.max(1, num($('#w-n', body).value, 1)));
      const pattern = [];
      for (let i = 0; i < cycle * 7; i++) {
        const d = new Date(src); d.setDate(d.getDate() + i);
        pattern.push(state.days[ymd(d)] ? { ...state.days[ymd(d)] } : null);
      }
      let changed = 0;
      for (let w = 0; w < times * cycle; w++) {
        for (let i = 0; i < 7; i++) {
          const offset = cycle * 7 + w * 7 + i;
          const d = new Date(src); d.setDate(d.getDate() + offset);
          const p = pattern[(w * 7 + i) % (cycle * 7)];
          if (p && p.type !== 'comp') { state.days[ymd(d)] = { ...p, note: '' }; changed++; }
        }
      }
      closeSheet(); commit(`${changed} dies omplerts`);
    });
  });
}

/* ================= Hores extra ================= */
function extraItem(e) {
  const d = parseYmd(e.date);
  return `
  <button class="list-item" data-act="edit-extra" data-id="${e.id}">
    <div class="main">
      <div class="t">${fmtDateShort(d)} ${e.start ? `<span class="muted num" style="font-weight:400">· ${e.start}–${e.end}</span>` : ''}</div>
      <div class="s">${e.note ? esc(e.note) : 'Hores extra'}</div>
    </div>
    <span class="badge ${e.mode}">${e.mode === 'paid' ? 'Pagada' : 'Banc'}</span>
    <span class="end plus">${fmtHM(e.minutes, { sign: true })}</span>
  </button>`;
}

function sheetExtra(id, dateKey) {
  const e = id ? state.extras.find((x) => x.id === id) : null;
  const v = e || { date: dateKey || todayKey(), start: '', end: '', minutes: 60, mode: state.settings.defaultExtraMode, note: '' };
  let mode = v.mode;
  let how = v.start ? 'range' : 'qty';
  openSheet(e ? 'Editar hores extra' : 'Afegir hores extra', `
    <label class="field"><span>Dia</span><input class="input" type="date" id="x-date" value="${v.date}"></label>
    <div class="seg" id="x-how" style="margin-bottom:14px">
      <button data-v="range" class="${how === 'range' ? 'on' : ''}">De … a …</button>
      <button data-v="qty" class="${how === 'qty' ? 'on' : ''}">Quantitat</button>
    </div>
    <div id="x-range" class="row" style="display:${how === 'range' ? 'grid' : 'none'}">
      <label class="field"><span>Inici</span><input class="input" type="time" id="x-start" value="${v.start || '15:00'}"></label>
      <label class="field"><span>Final</span><input class="input" type="time" id="x-end" value="${v.end || '17:00'}"></label>
    </div>
    <div id="x-qty" class="row" style="display:${how === 'qty' ? 'grid' : 'none'}">
      <label class="field"><span>Hores</span><input class="input" type="number" inputmode="numeric" min="0" id="x-h" value="${Math.floor(v.minutes / 60)}"></label>
      <label class="field"><span>Minuts</span><input class="input" type="number" inputmode="numeric" min="0" max="59" step="5" id="x-m" value="${v.minutes % 60}"></label>
    </div>
    <div class="field"><span>Com es compensen</span>
      <div class="seg" id="x-mode">
        <button data-v="bank" class="${mode === 'bank' ? 'on' : ''}">Al banc (dies)</button>
        <button data-v="paid" class="${mode === 'paid' ? 'on' : ''}">Pagades</button>
      </div>
    </div>
    <label class="field"><span>Nota</span><input class="input" id="x-note" value="${esc(v.note)}" placeholder="Opcional"></label>
    <div class="btn-row">
      ${e ? '<button class="btn danger" id="x-del" style="flex:0 0 auto">Eliminar</button>' : ''}
      <button class="btn primary" id="x-save">Desar</button>
    </div>
  `, (body) => {
    segBind($('#x-how', body), (val) => { how = val; $('#x-range', body).style.display = val === 'range' ? 'grid' : 'none'; $('#x-qty', body).style.display = val === 'qty' ? 'grid' : 'none'; });
    segBind($('#x-mode', body), (val) => { mode = val; });
    $('#x-save', body).addEventListener('click', () => {
      const rec = { id: e?.id || uid(), date: $('#x-date', body).value || todayKey(), mode, note: $('#x-note', body).value.trim() };
      if (how === 'range') { rec.start = $('#x-start', body).value; rec.end = $('#x-end', body).value; rec.minutes = spanMin(rec.start, rec.end); }
      else { rec.start = ''; rec.end = ''; rec.minutes = Math.round(num($('#x-h', body).value) * 60 + num($('#x-m', body).value)); }
      if (rec.minutes <= 0) return toast('Indica una durada');
      if (e) Object.assign(e, rec); else state.extras.push(rec);
      closeSheet(); commit('Hores extra desades');
    });
    $('#x-del', body)?.addEventListener('click', () => {
      if (!confirm('Eliminar aquest registre?')) return;
      state.extras = state.extras.filter((x) => x.id !== e.id); closeSheet(); commit('Eliminat');
    });
  });
}
function segBind(seg, cb) {
  $$('button', seg).forEach((b) => b.addEventListener('click', () => {
    $$('button', seg).forEach((x) => x.classList.toggle('on', x === b)); cb(b.dataset.v);
  }));
}

function startExtra() {
  state.active = { start: new Date().toISOString(), mode: state.settings.defaultExtraMode };
  commit('Comptador iniciat');
}
function stopExtra() {
  const a = state.active; if (!a) return;
  const s = new Date(a.start), e = new Date();
  const minutes = Math.round((e - s) / 60000);
  state.active = null;
  if (minutes < 1) return commit('Menys d’un minut: no s’ha desat');
  state.extras.push({
    id: uid(), date: ymd(s), mode: a.mode || 'bank', note: '',
    start: `${pad(s.getHours())}:${pad(s.getMinutes())}`, end: `${pad(e.getHours())}:${pad(e.getMinutes())}`, minutes,
  });
  commit(`Desat: ${fmtHM(minutes)}`);
}

/* ================= Vista: Banc ================= */
function viewBanc() {
  const b = bank();
  const moves = [
    ...state.extras.map((e) => ({ date: e.date, kind: 'extra', e })),
    ...state.used.map((u) => ({ date: u.date, kind: 'used', u })),
    ...Object.entries(state.days).filter(([, d]) => d.type === 'comp').map(([k]) => ({ date: k, kind: 'comp' })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return `
  <div class="${ui.anim ? 'fade-in' : ''}">
    <div class="eyebrow">Banc de temps</div>
    <h1 class="title">L'empresa <em>et deu</em></h1>

    <div class="card">
      <div class="big-num">${fmtBankDays(b.balance)}</div>
      <div class="muted num" style="margin-top:6px">${fmtHM(b.balance)} en total · jornada de ${num(state.settings.hoursPerDay)} h</div>
      <hr class="rule">
      <div class="card-row num" style="font-size:14px">
        <span class="muted">Acumulat</span><span>${fmtHM(b.earned)}</span>
      </div>
      <div class="card-row num" style="font-size:14px;margin-top:6px">
        <span class="muted">Gaudit${b.compDays ? ` (${b.compDays} ${b.compDays === 1 ? 'dia compensat' : 'dies compensats'})` : ''}</span><span>${fmtHM(-b.used)}</span>
      </div>
      <div class="btn-row">
        <button class="btn primary" data-act="add-extra">Afegir extra</button>
        <button class="btn" data-act="add-used">Restar hores</button>
      </div>
    </div>

    <h3 class="section">Moviments <small>${moves.length}</small></h3>
    ${moves.length ? `<div class="list">${moves.map((mv) => {
      if (mv.kind === 'extra') return extraItem(mv.e);
      const d = parseYmd(mv.date);
      if (mv.kind === 'used') return `
        <button class="list-item" data-act="edit-used" data-id="${mv.u.id}">
          <div class="main"><div class="t">${fmtDateShort(d)}</div><div class="s">${mv.u.note ? esc(mv.u.note) : 'Hores gaudides'}</div></div>
          <span class="end minus">${fmtHM(-mv.u.minutes)}</span>
        </button>`;
      return `
        <button class="list-item" data-act="edit-day" data-key="${mv.date}">
          <div class="main"><div class="t">${fmtDateShort(d)}</div><div class="s">Dia compensat</div></div>
          <span class="end minus">${fmtHM(-dayLen())}</span>
        </button>`;
    }).join('')}</div>` : '<div class="list"><div class="empty">Encara no hi ha moviments.<br>Marca les hores extra des d’<b>Avui</b>.</div></div>'}
  </div>`;
}

function sheetUsed(id) {
  const u = id ? state.used.find((x) => x.id === id) : null;
  const v = u || { date: todayKey(), minutes: 120, note: '' };
  openSheet(u ? 'Editar hores gaudides' : 'Hores gaudides', `
    <p class="muted" style="margin-top:0;font-size:14px">Temps que has recuperat del banc sense ser un dia sencer (per exemple, sortir abans). Per a dies sencers, marca el dia com a <b>Dia compensat</b> al calendari.</p>
    <label class="field"><span>Dia</span><input class="input" type="date" id="u-date" value="${v.date}"></label>
    <div class="row">
      <label class="field"><span>Hores</span><input class="input" type="number" inputmode="numeric" min="0" id="u-h" value="${Math.floor(v.minutes / 60)}"></label>
      <label class="field"><span>Minuts</span><input class="input" type="number" inputmode="numeric" min="0" max="59" step="5" id="u-m" value="${v.minutes % 60}"></label>
    </div>
    <label class="field"><span>Nota</span><input class="input" id="u-note" value="${esc(v.note)}" placeholder="Opcional"></label>
    <div class="btn-row">
      ${u ? '<button class="btn danger" id="u-del" style="flex:0 0 auto">Eliminar</button>' : ''}
      <button class="btn primary" id="u-save">Desar</button>
    </div>
  `, (body) => {
    $('#u-save', body).addEventListener('click', () => {
      const minutes = Math.round(num($('#u-h', body).value) * 60 + num($('#u-m', body).value));
      if (minutes <= 0) return toast('Indica una durada');
      const rec = { id: u?.id || uid(), date: $('#u-date', body).value || todayKey(), minutes, note: $('#u-note', body).value.trim() };
      if (u) Object.assign(u, rec); else state.used.push(rec);
      closeSheet(); commit('Desat');
    });
    $('#u-del', body)?.addEventListener('click', () => {
      if (!confirm('Eliminar aquest registre?')) return;
      state.used = state.used.filter((x) => x.id !== u.id); closeSheet(); commit('Eliminat');
    });
  });
}

/* ================= Vista: Sou ================= */
function viewSou() {
  const y = ui.salMonth.getFullYear(), m = ui.salMonth.getMonth();
  const p = payroll(y, m);
  const S = state.salary;
  return `
  <div class="${ui.anim ? 'fade-in' : ''}">
    <div class="month-nav">
      <button class="icon-btn" data-act="sal-prev" aria-label="Mes anterior"><svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg></button>
      <h1 class="title" style="text-transform:capitalize">${MONTHS[m]} <span>${y}</span></h1>
      <button class="icon-btn" data-act="sal-next" aria-label="Mes següent"><svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button>
    </div>

    <div class="card">
      <div class="eyebrow">Sou net estimat</div>
      <div class="big-num" style="margin-top:6px">${fmtMoney(p.net)}</div>
      <div class="muted num" style="margin-top:6px;font-size:14px">${fmtMoney(p.gross)} brut · ${S.mode === 'hourly' ? `${fmtMoney(num(S.hourly))}/h` : 'sou fix'}</div>
    </div>

    <h3 class="section">Detall</h3>
    <div class="card">
      <table class="ledger">
        ${p.lines.map((l) => `<tr><td>${esc(l.label)}<span class="d">${esc(l.detail)}</span></td><td>${fmtMoney(l.value)}</td></tr>`).join('')}
        <tr class="total"><td>Total brut</td><td>${fmtMoney(p.gross)}</td></tr>
        <tr class="neg"><td>Seguretat Social<span class="d">${num(S.ss).toLocaleString('ca-ES')} %</span></td><td>−${fmtMoney(p.ss)}</td></tr>
        <tr class="neg"><td>IRPF<span class="d">${num(S.irpf).toLocaleString('ca-ES')} %</span></td><td>−${fmtMoney(p.irpf)}</td></tr>
        <tr class="total"><td>Net</td><td>${fmtMoney(p.net)}</td></tr>
      </table>
    </div>

    <div class="grid-2">
      <div class="card stat"><div class="eyebrow">Treballat</div><div class="value">${fmtHours(p.sum.workMin)}</div><div class="sub">${p.sum.workDays} dies</div></div>
      <div class="card stat" style="margin-top:0"><div class="eyebrow">Extra al banc</div><div class="value">${fmtHours(p.sum.extraBank)}</div><div class="sub">no es paguen</div></div>
    </div>

    <div class="btn-row"><button class="btn primary" data-act="edit-salary">Configurar el sou</button></div>
    <p class="hint">És una estimació. Les retencions reals poden variar segons la nòmina.</p>
  </div>`;
}

function sheetSalary() {
  const S = JSON.parse(JSON.stringify(state.salary));
  const c = esc(state.settings.currency || '€');
  const bonusRow = (b, i) => `
    <div class="bonus-row" data-i="${i}">
      <input class="input b-name" value="${esc(b.name)}" placeholder="Nom (p. ex. Nocturnitat)">
      <div class="input-suffix"><input class="input b-amt" type="number" inputmode="decimal" step="0.01" value="${b.amount}"><em>${c}</em></div>
      <button class="icon-btn b-del" aria-label="Treure"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    </div>`;
  openSheet('Configurar el sou', `
    <div class="field"><span>Com cobres</span>
      <div class="seg" id="s-mode">
        <button data-v="hourly" class="${S.mode === 'hourly' ? 'on' : ''}">Per hores</button>
        <button data-v="monthly" class="${S.mode === 'monthly' ? 'on' : ''}">Sou fix mensual</button>
      </div>
    </div>
    <div id="s-hourly" style="display:${S.mode === 'hourly' ? 'block' : 'none'}">
      <label class="field"><span>Preu de l'hora (brut)</span><div class="input-suffix"><input class="input" type="number" inputmode="decimal" step="0.01" id="s-h" value="${S.hourly}"><em>${c}</em></div></label>
      <label class="switch-row"><span class="l">Pagar vacances i dies compensats<small>Compten com a jornada de ${num(state.settings.hoursPerDay)} h</small></span><span class="switch"><input type="checkbox" id="s-leave" ${S.paidLeave ? 'checked' : ''}><i></i></span></label>
    </div>
    <div id="s-monthly" style="display:${S.mode === 'monthly' ? 'block' : 'none'}">
      <label class="field"><span>Sou base mensual (brut)</span><div class="input-suffix"><input class="input" type="number" inputmode="decimal" step="0.01" id="s-m" value="${S.monthly}"><em>${c}</em></div></label>
    </div>
    <label class="field"><span>Preu de l'hora extra pagada</span><div class="input-suffix"><input class="input" type="number" inputmode="decimal" step="0.01" id="s-x" value="${S.extraRate}"><em>${c}</em></div></label>

    <div class="sub-h">Pagues</div>
    <div class="row">
      <label class="field"><span>Pagues l'any</span><select class="input" id="s-pay">${[12, 13, 14, 15, 16].map((n) => `<option ${S.payments == n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="field"><span>Import per paga extra</span><div class="input-suffix"><input class="input" type="number" inputmode="decimal" step="0.01" id="s-pa" value="${S.extraPayAmount}"><em>${c}</em></div></label>
    </div>
    <label class="switch-row"><span class="l">Prorratejades<small>Si no, es cobren al juny i al desembre</small></span><span class="switch"><input type="checkbox" id="s-pro" ${S.prorate ? 'checked' : ''}><i></i></span></label>

    <div class="sub-h">Retencions</div>
    <div class="row">
      <label class="field"><span>Seguretat Social</span><div class="input-suffix"><input class="input" type="number" inputmode="decimal" step="0.01" id="s-ss" value="${S.ss}"><em>%</em></div></label>
      <label class="field"><span>IRPF</span><div class="input-suffix"><input class="input" type="number" inputmode="decimal" step="0.01" id="s-irpf" value="${S.irpf}"><em>%</em></div></label>
    </div>

    <div class="sub-h">Plusos fixos mensuals</div>
    <div id="s-bonuses">${S.bonuses.map(bonusRow).join('')}</div>
    <button class="btn sm" id="s-add-b">+ Afegir plus</button>

    <div class="btn-row" style="margin-top:22px"><button class="btn primary" id="s-save">Desar</button></div>
  `, (body) => {
    segBind($('#s-mode', body), (v) => { S.mode = v; $('#s-hourly', body).style.display = v === 'hourly' ? 'block' : 'none'; $('#s-monthly', body).style.display = v === 'monthly' ? 'block' : 'none'; });
    const box = $('#s-bonuses', body);
    const readBonuses = () => $$('.bonus-row', box).map((r) => ({ name: $('.b-name', r).value.trim(), amount: num($('.b-amt', r).value) }));
    const bindDel = () => $$('.b-del', box).forEach((b) => (b.onclick = () => { b.closest('.bonus-row').remove(); }));
    bindDel();
    $('#s-add-b', body).addEventListener('click', () => {
      box.insertAdjacentHTML('beforeend', bonusRow({ name: '', amount: '' }, box.children.length)); bindDel();
      $$('.b-name', box).at(-1).focus();
    });
    $('#s-save', body).addEventListener('click', () => {
      Object.assign(state.salary, {
        mode: S.mode,
        hourly: num($('#s-h', body).value), monthly: num($('#s-m', body).value), extraRate: num($('#s-x', body).value),
        paidLeave: $('#s-leave', body).checked,
        payments: num($('#s-pay', body).value, 12), extraPayAmount: num($('#s-pa', body).value), prorate: $('#s-pro', body).checked,
        ss: num($('#s-ss', body).value), irpf: num($('#s-irpf', body).value),
        bonuses: readBonuses().filter((b) => b.name || b.amount),
      });
      closeSheet(); commit('Sou actualitzat');
    });
  });
}

/* ================= Vista: Ajustos ================= */
function viewAjustos() {
  const st = state.settings;
  return `
  <div class="${ui.anim ? 'fade-in' : ''}">
    <div class="eyebrow">Configuració</div>
    <h1 class="title">Ajustos</h1>

    <h3 class="section" style="margin-top:0">Torns <small>${state.shifts.length}</small></h3>
    <div class="list">
      ${state.shifts.map((s) => `
        <button class="list-item" data-act="edit-shift" data-id="${s.id}">
          <span class="dot" style="background:${s.color};width:12px;height:12px"></span>
          <div class="main"><div class="t">${esc(s.name)}</div><div class="s num">${s.start} – ${s.end}${num(s.breakMin) ? ` · pausa ${num(s.breakMin)} min` : ''}</div></div>
          <span class="end num muted" style="font-weight:400">${fmtHM(shiftMin(s))}</span>
        </button>`).join('') || '<div class="empty">Sense torns</div>'}
    </div>
    <div class="btn-row"><button class="btn" data-act="add-shift" style="flex:0 0 auto">+ Nou torn</button></div>

    <h3 class="section">General</h3>
    <div class="card">
      <label class="field"><span>Hores d'una jornada (per convertir el banc en dies)</span><div class="input-suffix"><input class="input" type="number" inputmode="decimal" step="0.25" min="1" id="g-hpd" value="${st.hoursPerDay}"><em>h</em></div></label>
      <label class="field"><span>Moneda</span><input class="input" id="g-cur" value="${esc(st.currency)}" maxlength="4"></label>
      <div class="field"><span>Hores extra per defecte</span>
        <div class="seg" id="g-mode">
          <button data-v="bank" class="${st.defaultExtraMode === 'bank' ? 'on' : ''}">Al banc</button>
          <button data-v="paid" class="${st.defaultExtraMode === 'paid' ? 'on' : ''}">Pagades</button>
        </div>
      </div>
      <div class="field" style="margin-bottom:0"><span>Aparença</span>
        <div class="seg" id="g-theme">
          <button data-v="auto" class="${st.theme === 'auto' ? 'on' : ''}">Automàtica</button>
          <button data-v="light" class="${st.theme === 'light' ? 'on' : ''}">Clara</button>
          <button data-v="dark" class="${st.theme === 'dark' ? 'on' : ''}">Fosca</button>
        </div>
      </div>
    </div>

    <h3 class="section">Dades</h3>
    <div class="list">
      <button class="list-item" data-act="export"><div class="main"><div class="t">Fer còpia de seguretat</div><div class="s">Descarrega un fitxer amb totes les dades</div></div></button>
      <button class="list-item" data-act="import"><div class="main"><div class="t">Restaurar còpia</div><div class="s">Carrega un fitxer guardat abans</div></div></button>
      <button class="list-item" data-act="reset"><div class="main"><div class="t" style="color:var(--danger)">Esborrar-ho tot</div><div class="s">Torna a començar de zero</div></div></button>
    </div>
    <input type="file" id="import-file" accept="application/json,.json" hidden>
    <p class="hint">Les dades només es guarden en aquest dispositiu. Fes còpies de tant en tant.</p>
  </div>`;
}

function bindAjustos(root) {
  const st = state.settings;
  $('#g-hpd', root)?.addEventListener('change', (e) => { st.hoursPerDay = Math.max(1, num(e.target.value, 8)); commit('Desat'); });
  $('#g-cur', root)?.addEventListener('change', (e) => { st.currency = e.target.value.trim() || '€'; commit('Desat'); });
  segBind($('#g-mode', root), (v) => { st.defaultExtraMode = v; save(); toast('Desat'); });
  segBind($('#g-theme', root), (v) => { st.theme = v; save(); applyTheme(); });
  $('#import-file', root)?.addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!data || !Array.isArray(data.shifts)) throw new Error();
        localStorage.setItem(STORE, JSON.stringify(data)); state = load(); applyTheme(); commit('Còpia restaurada');
      } catch { toast('Fitxer no vàlid'); }
    };
    r.readAsText(f);
  });
}

function sheetShift(id) {
  const s = id ? shiftById(id) : null;
  const v = s || { name: '', short: '', start: '08:00', end: '16:00', breakMin: 0, color: COLORS[state.shifts.length % COLORS.length] };
  let color = v.color;
  openSheet(s ? 'Editar torn' : 'Nou torn', `
    <div class="row" style="grid-template-columns:1fr 90px">
      <label class="field"><span>Nom</span><input class="input" id="t-name" value="${esc(v.name)}" placeholder="Matí"></label>
      <label class="field"><span>Inicial</span><input class="input" id="t-short" value="${esc(v.short)}" maxlength="3" placeholder="M"></label>
    </div>
    <div class="row-3">
      <label class="field"><span>Entrada</span><input class="input" type="time" id="t-start" value="${v.start}"></label>
      <label class="field"><span>Sortida</span><input class="input" type="time" id="t-end" value="${v.end}"></label>
      <label class="field"><span>Pausa (min)</span><input class="input" type="number" inputmode="numeric" min="0" id="t-break" value="${v.breakMin}"></label>
    </div>
    <p class="hint" id="t-dur" style="margin:-4px 2px 14px"></p>
    <div class="field"><span>Color</span>
      <div class="swatches" id="t-colors">${COLORS.map((c) => `<button class="swatch ${c === color ? 'on' : ''}" style="background:${c}" data-c="${c}" aria-label="Color"></button>`).join('')}</div>
    </div>
    <div class="btn-row" style="margin-top:22px">
      ${s ? '<button class="btn danger" id="t-del" style="flex:0 0 auto">Eliminar</button>' : ''}
      <button class="btn primary" id="t-save">Desar</button>
    </div>
  `, (body) => {
    const upd = () => { $('#t-dur', body).textContent = 'Durada: ' + fmtHM(spanMin($('#t-start', body).value, $('#t-end', body).value, $('#t-break', body).value)); };
    ['#t-start', '#t-end', '#t-break'].forEach((q) => $(q, body).addEventListener('input', upd)); upd();
    $$('.swatch', body).forEach((b) => b.addEventListener('click', () => { color = b.dataset.c; $$('.swatch', body).forEach((x) => x.classList.toggle('on', x === b)); }));
    $('#t-save', body).addEventListener('click', () => {
      const name = $('#t-name', body).value.trim();
      if (!name) return toast('Posa-li un nom');
      const rec = { name, short: ($('#t-short', body).value.trim() || name[0]).toUpperCase(), start: $('#t-start', body).value, end: $('#t-end', body).value, breakMin: num($('#t-break', body).value), color };
      if (s) Object.assign(s, rec); else state.shifts.push({ id: uid(), ...rec });
      closeSheet(); commit('Torn desat');
    });
    $('#t-del', body)?.addEventListener('click', () => {
      const usedIn = Object.values(state.days).filter((d) => d.type === 'shift' && d.shiftId === s.id).length;
      if (!confirm(usedIn ? `Aquest torn és a ${usedIn} dies del calendari. Aquests dies quedaran buits. Eliminar?` : 'Eliminar aquest torn?')) return;
      for (const [k, d] of Object.entries(state.days)) if (d.type === 'shift' && d.shiftId === s.id) delete state.days[k];
      state.shifts = state.shifts.filter((x) => x.id !== s.id);
      closeSheet(); commit('Torn eliminat');
    });
  });
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `horaris-${todayKey()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Còpia descarregada');
}

/* ================= Render i esdeveniments ================= */
const views = { avui: viewAvui, calendari: viewCalendari, banc: viewBanc, sou: viewSou, ajustos: viewAjustos };
function render() {
  const root = $('#view');
  root.innerHTML = views[ui.tab]();
  ui.anim = false;
  if (ui.tab === 'ajustos') bindAjustos(root);
}

$('#view').addEventListener('click', (ev) => {
  const go = ev.target.closest('[data-go]');
  if (go) return setTab(go.dataset.go);

  const brush = ev.target.closest('[data-brush]');
  if (brush) { ui.brush = brush.dataset.brush || null; return render(); }

  const day = ev.target.closest('[data-day]');
  if (day) return ui.brush ? paintDay(day.dataset.day) : sheetDay(day.dataset.day);

  const el = ev.target.closest('[data-act]');
  if (el) handleAct(el);
});
$('#sheet-body').addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (el) { ev.preventDefault(); handleAct(el); }
});

function handleAct(el) {
  const { act, key, id } = el.dataset;
  switch (act) {
    case 'edit-day': return sheetDay(key);
    case 'start-extra': return startExtra();
    case 'stop-extra': return stopExtra();
    case 'cancel-extra': if (confirm('Descartar el temps comptat?')) { state.active = null; commit(); } return;
    case 'add-extra': return sheetExtra(null, key);
    case 'edit-extra': return sheetExtra(id);
    case 'add-used': return sheetUsed();
    case 'edit-used': return sheetUsed(id);
    case 'cal-prev': ui.calMonth = new Date(ui.calMonth.getFullYear(), ui.calMonth.getMonth() - 1, 1); return render();
    case 'cal-next': ui.calMonth = new Date(ui.calMonth.getFullYear(), ui.calMonth.getMonth() + 1, 1); return render();
    case 'sal-prev': ui.salMonth = new Date(ui.salMonth.getFullYear(), ui.salMonth.getMonth() - 1, 1); return render();
    case 'sal-next': ui.salMonth = new Date(ui.salMonth.getFullYear(), ui.salMonth.getMonth() + 1, 1); return render();
    case 'copy-week': return sheetCopyWeek();
    case 'edit-salary': return sheetSalary();
    case 'add-shift': return sheetShift();
    case 'edit-shift': return sheetShift(id);
    case 'export': return exportData();
    case 'import': return $('#import-file').click();
    case 'reset':
      if (confirm('Segur que vols esborrar totes les dades? No es pot desfer.')) { state = defaults(); applyTheme(); commit('Tot esborrat'); }
      return;
  }
}

// Swipe lateral per canviar de mes al calendari i al sou
(() => {
  let x0 = null, y0 = null;
  const v = $('#view');
  v.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  v.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > 40) return;
    if (e.target.closest('.brushes')) return;
    const dir = dx < 0 ? 'next' : 'prev';
    if (ui.tab === 'calendari') handleAct({ dataset: { act: 'cal-' + dir } });
    else if (ui.tab === 'sou') handleAct({ dataset: { act: 'sal-' + dir } });
  }, { passive: true });
})();

document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

applyTheme();
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
