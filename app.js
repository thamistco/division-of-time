/* Division of Time — a daily time tracker. All data in localStorage. */
(() => {
'use strict';
const KEY = 'dot.v1';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const DAY = 86400000;

const DEFAULT_CATS = [
  ['Clinical work', '#4f46e5', 'min', 0], ['Admin & paperwork', '#64748b', 'max', 1.5],
  ['Study & exams', '#0ea5e9', 'min', 1], ['Side projects', '#8b5cf6', '', 0],
  ['Family time', '#f59e0b', 'min', 2], ['Exercise & walking', '#10b981', 'min', 0.5],
  ['Chores & errands', '#a16207', '', 0], ['Rest & leisure', '#ec4899', '', 0],
  ['Phone & social media', '#ef4444', 'max', 1], ['Sleep', '#334155', '', 0]
].map(([name, color, goalType, goal]) => ({ id: uid(), name, color, goalType, goal }));

let S = load();
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.cats) return fix(s); } catch (e) {}
  return fix({ cats: DEFAULT_CATS, entries: [], notes: {}, settings: {} });
}
function fix(s) {
  s.entries ||= []; s.notes ||= {};
  s.settings = Object.assign({ focusLen: 25, notify: false, wake: '07:00', bed: '23:00', lastCat: null }, s.settings || {});
  return s;
}
function save() { localStorage.setItem(KEY, JSON.stringify(S)); }

// ---------- helpers ----------
const cat = id => S.cats.find(c => c.id === id) || { name: 'Uncategorised', color: '#9ca3af', id: null };
const running = () => S.entries.find(e => e.end == null);
const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const addDays = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
const ymd = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function fmtHM(ms) { const m = Math.round(ms / 60000); const h = Math.floor(m / 60); return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`; }
function fmtClock(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
const fmtTime = t => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toLocalInput = t => { const d = new Date(t - new Date(t).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
const fromLocalInput = v => v ? new Date(v).getTime() : null;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2200); }

// time of entry e falling inside [a,b)
function overlap(e, a, b) { const s = Math.max(e.start, a), f = Math.min(e.end ?? Date.now(), b); return Math.max(0, f - s); }
function byCat(a, b) {
  const m = new Map();
  for (const e of S.entries) { const o = overlap(e, a, b); if (o) m.set(e.catId, (m.get(e.catId) || 0) + o); }
  return m;
}
function sum(m) { let t = 0; for (const v of m.values()) t += v; return t; }

// ---------- timer ----------
let selCat = S.settings.lastCat && S.cats.some(c => c.id === S.settings.lastCat) ? S.settings.lastCat : (S.cats[0]?.id ?? null);
let focusEnd = null; // ms timestamp, in-memory + persisted
if (S.settings.focusEnd && running()) focusEnd = S.settings.focusEnd;

function start(catId = selCat, desc = $('#desc').value.trim(), focusMin = 0) {
  stop(true);
  const now = Date.now();
  S.entries.push({ id: uid(), catId, desc, start: now, end: null });
  selCat = catId; S.settings.lastCat = catId;
  focusEnd = focusMin ? now + focusMin * 60000 : null;
  S.settings.focusEnd = focusEnd; S.settings.focusDone = false;
  save(); renderAll();
}
function stop(silent) {
  const r = running(); if (!r) return;
  r.end = Date.now();
  if (r.end - r.start < 5000) S.entries = S.entries.filter(e => e !== r); // ignore accidental taps
  focusEnd = null; S.settings.focusEnd = null;
  save();
  if (!silent) { $('#desc').value = ''; renderAll(); }
}
$('#startBtn').onclick = () => running() ? stop() : start();
$('#focusBtn').onclick = () => { askNotify(); start(selCat, $('#desc').value.trim(), +S.settings.focusLen); toast(`Focus session: ${S.settings.focusLen} min`); };
$('#desc').addEventListener('keydown', e => { if (e.key === 'Enter') { const r = running(); if (r) { r.desc = $('#desc').value.trim(); save(); renderAll(); toast('Description updated'); } else start(); } });
$('#desc').addEventListener('change', () => { const r = running(); if (r) { r.desc = $('#desc').value.trim(); save(); renderDay(); } });

// category popover
$('#catBtn').onclick = () => openCatPop($('#catBtn'), id => {
  selCat = id; S.settings.lastCat = id;
  const r = running(); if (r) r.catId = id;
  save(); renderAll();
});
function openCatPop(anchor, onPick) {
  const pop = $('#catPop'), list = $('#catPopList');
  list.innerHTML = S.cats.map(c => `<button data-id="${c.id}"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</button>`).join('');
  pop.hidden = false;
  const r = anchor.getBoundingClientRect();
  list.style.top = Math.min(r.bottom + 6, innerHeight - 300) + 'px';
  list.style.left = Math.max(8, Math.min(r.left, innerWidth - 240)) + 'px';
  list.querySelector('button')?.focus();
  pop.onclick = e => { const b = e.target.closest('button[data-id]'); pop.hidden = true; if (b) onPick(b.dataset.id); };
  pop.onkeydown = e => { if (e.key === 'Escape') pop.hidden = true; };
}

// ---------- notifications ----------
function askNotify() { if (S.settings.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }
function notify(msg) {
  if (S.settings.notify && 'Notification' in window && Notification.permission === 'granted') { try { new Notification('Division of Time', { body: msg, icon: 'icon-192.png' }); } catch (e) {} }
  toast(msg);
}
let warned3h = null;

// ---------- tick ----------
function tick() {
  const r = running();
  const el = $('#elapsed'), btn = $('#startBtn'), fi = $('#focusInfo');
  if (r) {
    const ms = Date.now() - r.start;
    el.textContent = fmtClock(ms);
    btn.classList.add('running'); btn.setAttribute('aria-label', 'Stop timer');
    btn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
    document.title = `${fmtClock(ms)} · ${cat(r.catId).name}`;
    if (focusEnd) {
      const left = focusEnd - Date.now();
      fi.hidden = false;
      if (left > 0) fi.textContent = `Focus session · ${fmtClock(left)} left`;
      else { fi.textContent = 'Focus session complete. Keep going or stop the timer.'; if (!S.settings.focusDone) { S.settings.focusDone = true; save(); notify('Focus session complete. Take a short break.'); } }
    } else fi.hidden = true;
    if (ms > 3 * 3600000 && warned3h !== r.id) { warned3h = r.id; notify(`Timer for ${cat(r.catId).name} has been running over 3 hours. Still going?`); }
  } else {
    el.textContent = '0:00:00'; btn.classList.remove('running'); btn.setAttribute('aria-label', 'Start timer');
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    document.title = 'Division of Time'; fi.hidden = true; S.settings.focusDone = false;
  }
  const t0 = startOfDay(Date.now());
  $('#todayTotal').textContent = `${fmtHM(sum(byCat(t0, t0 + DAY)))} today`;
}

// ---------- render: tracker + quick chips ----------
function renderTracker() {
  const r = running();
  const c = cat(r ? r.catId : selCat);
  $('#catBtn .dot').style.background = c.color;
  $('#catBtn .lbl').textContent = c.name;
  if (r && document.activeElement !== $('#desc')) $('#desc').value = r.desc || '';
  const q = $('#quick');
  q.innerHTML = S.cats.map(k => `<button class="chip ${r && r.catId === k.id ? 'on' : ''}" data-id="${k.id}" title="Switch to ${esc(k.name)}"><span class="dot" style="background:${k.color}"></span>${esc(k.name)}</button>`).join('');
}
$('#quick').onclick = e => {
  const b = e.target.closest('.chip'); if (!b) return;
  const r = running();
  if (r && r.catId === b.dataset.id) { stop(); return; }
  $('#desc').value = '';
  start(b.dataset.id, '');
};

// ---------- render: day ----------
let viewDay = startOfDay(Date.now());
$('#prevDay').onclick = () => { viewDay = addDays(viewDay, -1); renderDay(); };
$('#nextDay').onclick = () => { if (viewDay < startOfDay(Date.now())) { viewDay = addDays(viewDay, 1); renderDay(); } };

function wakingMs(dayStart) {
  const [wh, wm] = S.settings.wake.split(':').map(Number), [bh, bm] = S.settings.bed.split(':').map(Number);
  let a = wh * 60 + wm, b = bh * 60 + bm; if (b <= a) b += 1440;
  const now = Date.now();
  const end = Math.min(dayStart + b * 60000, now), st = dayStart + a * 60000;
  return { st, end: Math.max(st, end) };
}

function renderDay() {
  const a = viewDay, b = addDays(a, 1), today = startOfDay(Date.now());
  const d = new Date(a);
  $('#dayLabel').textContent = a === today ? 'Today' : a === addDays(today, -1) ? 'Yesterday' : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#nextDay').disabled = a >= today;

  const m = byCat(a, b), total = sum(m);
  $('#sTracked').textContent = fmtHM(total);
  // untracked within waking hours (excluding Sleep category)
  const w = wakingMs(a);
  let trackedWake = 0; for (const e of S.entries) trackedWake += overlap(e, w.st, w.end);
  $('#sUntracked').textContent = fmtHM(Math.max(0, (w.end - w.st) - trackedWake));
  const sorted = [...m.entries()].sort((x, y) => y[1] - x[1]);
  $('#sTop').textContent = sorted.length ? cat(sorted[0][0]).name : '–';

  // timeline
  const tl = $('#timeline');
  const dayEntries = S.entries.filter(e => overlap(e, a, b) > 0).sort((x, y) => x.start - y.start);
  tl.innerHTML = dayEntries.map(e => {
    const s = Math.max(e.start, a), f = Math.min(e.end ?? Date.now(), b), c = cat(e.catId);
    return `<div class="seg" data-id="${e.id}" style="left:${(s - a) / DAY * 100}%;width:${(f - s) / DAY * 100}%;background:${c.color}" title="${esc(c.name)}${e.desc ? ' · ' + esc(e.desc) : ''} · ${fmtTime(s)}–${e.end ? fmtTime(f) : 'now'} (${fmtHM(f - s)})"></div>`;
  }).join('') + (a === today ? `<div class="now" style="left:${(Date.now() - a) / DAY * 100}%"></div>` : '');

  // donut
  const C = 2 * Math.PI * 46; let off = 0;
  $('#donut').innerHTML = total ? sorted.map(([id, v]) => {
    const len = v / total * C, s = `<circle cx="60" cy="60" r="46" fill="none" stroke="${cat(id).color}" stroke-width="18" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"><title>${esc(cat(id).name)} ${fmtHM(v)}</title></circle>`;
    off += len; return s;
  }).join('') + `<text x="60" y="64" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor">${fmtHM(total)}</text>`
    : `<circle cx="60" cy="60" r="46" fill="none" stroke="var(--line)" stroke-width="18"/><text x="60" y="64" text-anchor="middle" font-size="12" fill="currentColor">No time yet</text>`;
  $('#legend').innerHTML = sorted.map(([id, v]) => `<div class="li"><span class="dot" style="background:${cat(id).color}"></span><span class="n">${esc(cat(id).name)}</span><span class="t">${fmtHM(v)} · ${Math.round(v / total * 100)}%</span></div>`).join('') || '<div class="muted">Start a timer or tap a category to begin.</div>';

  // goals
  const goals = S.cats.filter(c => c.goalType && c.goal > 0);
  $('#goals').innerHTML = goals.length ? goals.map(c => {
    const v = m.get(c.id) || 0, g = c.goal * 3600000, pct = Math.min(100, v / g * 100);
    let st, cls;
    if (c.goalType === 'min') { st = v >= g ? 'Goal reached' : `${fmtHM(g - v)} to go`; cls = v >= g ? 'ok' : ''; }
    else { st = v > g ? `${fmtHM(v - g)} over limit` : `${fmtHM(g - v)} left`; cls = v > g ? 'bad' : 'ok'; }
    const col = c.goalType === 'max' && v > g ? 'var(--danger)' : c.color;
    return `<div class="goal"><div class="gh"><span>${esc(c.name)} <small class="muted">${c.goalType === 'min' ? 'at least' : 'at most'} ${c.goal}h</small></span><span>${fmtHM(v)}</span></div><div class="bar"><i style="width:${pct}%;background:${col}"></i></div><div class="st ${cls}">${st}</div></div>`;
  }).join('') : '<p class="muted">No goals yet. Add one in Categories.</p>';

  // entries
  const list = [...dayEntries].sort((x, y) => y.start - x.start);
  $('#entries').innerHTML = list.length ? list.map(e => {
    const c = cat(e.catId), dur = (e.end ?? Date.now()) - e.start;
    return `<li><span class="dot" style="background:${c.color}"></span><div class="d"><b>${esc(e.desc || c.name)}</b><small>${esc(c.name)} · ${fmtTime(e.start)}–${e.end ? fmtTime(e.end) : '<span class="live">running</span>'}</small></div><span class="dur" data-live="${e.end ? '' : e.id}">${fmtHM(dur)}</span><span class="act"><button data-act="resume" data-id="${e.id}" title="Start again" aria-label="Start again">▶</button><button data-act="edit" data-id="${e.id}" aria-label="Edit">Edit</button></span></li>`;
  }).join('') : '<li class="empty">Nothing tracked on this day.</li>';

  // review
  const n = S.notes[ymd(a)] || {};
  $('#rating').innerHTML = ['😫', '😕', '😐', '🙂', '🤩'].map((f, i) => `<button role="radio" aria-checked="${n.rating === i + 1}" class="${n.rating === i + 1 ? 'on' : ''}" data-r="${i + 1}" aria-label="${i + 1} of 5">${f}</button>`).join('');
  if (document.activeElement !== $('#note')) $('#note').value = n.text || '';
}
$('#timeline').onclick = e => { const s = e.target.closest('.seg'); if (s) openEntry(s.dataset.id); };
$('#entries').onclick = e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const en = S.entries.find(x => x.id === b.dataset.id);
  if (b.dataset.act === 'edit') openEntry(en.id);
  else { $('#desc').value = en.desc || ''; start(en.catId, en.desc || ''); window.scrollTo({ top: 0, behavior: 'smooth' }); }
};
$('#rating').onclick = e => { const b = e.target.closest('button'); if (!b) return; const k = ymd(viewDay); S.notes[k] = { ...(S.notes[k] || {}), rating: +b.dataset.r }; save(); renderDay(); };
$('#note').addEventListener('input', () => { const k = ymd(viewDay); S.notes[k] = { ...(S.notes[k] || {}), text: $('#note').value }; save(); });

// ---------- entry dialog ----------
let editing = null;
function openEntry(id) {
  editing = id ? S.entries.find(e => e.id === id) : null;
  $('#entryTitle').textContent = editing ? 'Edit entry' : 'Add time';
  $('#eCat').innerHTML = S.cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const now = Date.now();
  const base = viewDay === startOfDay(now) ? now : viewDay + 12 * 3600000;
  $('#eDesc').value = editing?.desc || '';
  $('#eCat').value = editing?.catId || selCat;
  $('#eStart').value = toLocalInput(editing ? editing.start : base - 3600000);
  $('#eEnd').value = editing ? (editing.end ? toLocalInput(editing.end) : '') : toLocalInput(base);
  $('#eEnd').placeholder = 'Running';
  $('#eDel').hidden = !editing; $('#eErr').textContent = '';
  $('#entryDlg').showModal();
}
$('#addEntry').onclick = () => openEntry(null);
$('#eSave').onclick = () => {
  const s = fromLocalInput($('#eStart').value), f = fromLocalInput($('#eEnd').value);
  const isRunning = editing && editing.end == null && !f;
  if (!s) return $('#eErr').textContent = 'Add a start time.';
  if (!isRunning && !f) return $('#eErr').textContent = 'Add an end time.';
  if (f && f <= s) return $('#eErr').textContent = 'End must be after start.';
  if ((f || 0) > Date.now() + 60000) return $('#eErr').textContent = 'End can’t be in the future.';
  if (s > Date.now()) return $('#eErr').textContent = 'Start can’t be in the future.';
  const data = { desc: $('#eDesc').value.trim(), catId: $('#eCat').value, start: s, end: isRunning ? null : f };
  if (editing) Object.assign(editing, data); else S.entries.push({ id: uid(), ...data });
  save(); $('#entryDlg').close(); renderAll(); toast(editing ? 'Entry updated' : 'Time added');
};
$('#eDel').onclick = () => {
  if (!editing || !confirm('Delete this entry?')) return;
  S.entries = S.entries.filter(e => e !== editing); save(); $('#entryDlg').close(); renderAll(); toast('Entry deleted');
};

// ---------- reports ----------
let range = 'week';
$('#range').onclick = e => { const b = e.target.closest('button'); if (!b) return; range = b.dataset.r; $$('#range button').forEach(x => x.classList.toggle('active', x === b)); renderReports(); };
function rangeBounds() {
  const today = startOfDay(Date.now());
  const dow = (new Date(today).getDay() + 6) % 7; // Monday start
  if (range === 'week') return [addDays(today, -dow), addDays(today, 7 - dow)];
  if (range === 'lastweek') return [addDays(today, -dow - 7), addDays(today, -dow)];
  if (range === 'month') { const d = new Date(today); d.setDate(1); const s = d.getTime(); d.setMonth(d.getMonth() + 1); return [s, d.getTime()]; }
  return [addDays(today, -29), addDays(today, 1)];
}
function renderReports() {
  const [a, b] = rangeBounds(), today = startOfDay(Date.now());
  const days = []; for (let t = a; t < b; t = addDays(t, 1)) days.push(t);
  const elapsedDays = days.filter(t => t <= today).length || 1;
  const m = byCat(a, b), total = sum(m);
  $('#rTotal').textContent = fmtHM(total);
  $('#rAvg').textContent = fmtHM(total / elapsedDays);
  let longest = null;
  for (const e of S.entries) { const o = overlap(e, a, b); if (o && (!longest || o > longest.o)) longest = { o, e }; }
  $('#rLong').textContent = longest ? `${fmtHM(longest.o)} · ${cat(longest.e.catId).name}` : '–';

  // stacked bars
  const W = 700, H = 260, pad = 28, n = days.length, bw = (W - pad) / n;
  const per = days.map(t => byCat(t, addDays(t, 1)));
  const maxH = Math.max(4, Math.ceil(Math.max(...per.map(sum)) / 3600000));
  const y = h => H - 20 - (h / maxH) * (H - 34);
  let svg = '';
  for (let h = 0; h <= maxH; h += maxH > 12 ? 4 : 2) svg += `<line x1="${pad}" x2="${W}" y1="${y(h)}" y2="${y(h)}" stroke="var(--line)"/><text x="0" y="${y(h) + 4}">${h}h</text>`;
  per.forEach((mm, i) => {
    let acc = 0; const x = pad + i * bw + bw * 0.15, w = bw * 0.7;
    for (const c of S.cats.concat([{ id: null }])) {
      const v = (mm.get(c.id) || 0) / 3600000; if (!v) continue;
      svg += `<rect x="${x}" y="${y(acc + v)}" width="${w}" height="${y(acc) - y(acc + v)}" fill="${cat(c.id).color}"><title>${new Date(days[i]).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${esc(cat(c.id).name)} ${fmtHM(v * 3600000)}</title></rect>`;
      acc += v;
    }
    if (n <= 10 || i % Math.ceil(n / 10) === 0) svg += `<text x="${pad + i * bw + bw / 2}" y="${H - 4}" text-anchor="middle">${new Date(days[i]).toLocaleDateString('en-GB', n <= 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' })}</text>`;
  });
  $('#bars').innerHTML = svg;

  // table
  const rows = [...m.entries()].sort((p, q) => q[1] - p[1]);
  $('#rTable tbody').innerHTML = rows.length ? rows.map(([id, v]) => {
    const c = cat(id); const avg = v / elapsedDays;
    let g = '–';
    if (c.goalType && c.goal) { const gm = c.goal * 3600000; const ok = c.goalType === 'min' ? avg >= gm : avg <= gm; g = `<span style="color:${ok ? 'var(--ok)' : 'var(--danger)'}">${c.goalType === 'min' ? '≥' : '≤'} ${c.goal}h ${ok ? '✓' : '✗'}</span>`; }
    return `<tr><td><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</td><td>${fmtHM(v)}</td><td>${Math.round(v / total * 100)}%</td><td>${fmtHM(avg)}</td><td>${g}</td></tr>`;
  }).join('') : '<tr><td colspan="5" class="muted">No time tracked in this range.</td></tr>';

  // activities
  const acts = new Map();
  for (const e of S.entries) { const o = overlap(e, a, b); if (!o) continue; const k = (e.desc || '').trim() || `(${cat(e.catId).name})`; const key = k + '|' + e.catId; acts.set(key, { k, c: e.catId, v: (acts.get(key)?.v || 0) + o }); }
  const top = [...acts.values()].sort((p, q) => q.v - p.v).slice(0, 8);
  $('#rDesc tbody').innerHTML = top.length ? top.map(x => `<tr><td>${esc(x.k)}</td><td>${esc(cat(x.c).name)}</td><td>${fmtHM(x.v)}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">Nothing yet.</td></tr>';

  // insight
  const ins = [];
  if (rows.length) {
    ins.push(`<p><b>${esc(cat(rows[0][0]).name)}</b> took the most time: ${fmtHM(rows[0][1])} (${Math.round(rows[0][1] / total * 100)}%).</p>`);
    const over = S.cats.filter(c => c.goalType === 'max' && c.goal && (m.get(c.id) || 0) / elapsedDays > c.goal * 3600000);
    if (over.length) ins.push(`<p>Over your limit on average: ${over.map(c => esc(c.name)).join(', ')}.</p>`);
    const under = S.cats.filter(c => c.goalType === 'min' && c.goal && (m.get(c.id) || 0) / elapsedDays < c.goal * 3600000);
    if (under.length) ins.push(`<p>Below your target on average: ${under.map(c => esc(c.name)).join(', ')}.</p>`);
    const rated = days.map(t => S.notes[ymd(t)]?.rating).filter(Boolean);
    if (rated.length) ins.push(`<p>Average day rating: ${(rated.reduce((p, q) => p + q, 0) / rated.length).toFixed(1)} / 5 over ${rated.length} day${rated.length > 1 ? 's' : ''}.</p>`);
  } else ins.push('<p>Track a few days and your patterns will show up here.</p>');
  $('#insight').innerHTML = '<h3>What stands out</h3>' + ins.join('');
}

// ---------- categories ----------
let editCat = null;
function renderCats() {
  $('#catList').innerHTML = S.cats.map(c => `<li><span class="dot" style="background:${c.color}"></span><span class="n">${esc(c.name)}<br><small>${c.goalType && c.goal ? (c.goalType === 'min' ? 'At least ' : 'At most ') + c.goal + 'h a day' : 'No goal'}</small></span><button data-id="${c.id}">Edit</button></li>`).join('');
}
$('#catList').onclick = e => { const b = e.target.closest('button'); if (b) openCat(b.dataset.id); };
$('#addCat').onclick = () => openCat(null);
function openCat(id) {
  editCat = id ? S.cats.find(c => c.id === id) : null;
  $('#catTitle').textContent = editCat ? 'Edit category' : 'New category';
  $('#cName').value = editCat?.name || '';
  $('#cColor').value = editCat?.color || '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  $('#cGoalType').value = editCat?.goalType || '';
  $('#cGoal').value = editCat?.goal || '';
  $('#cDel').hidden = !editCat;
  $('#catDlg').showModal();
}
$('#cSave').onclick = () => {
  const name = $('#cName').value.trim(); if (!name) return $('#cName').focus();
  const d = { name, color: $('#cColor').value, goalType: $('#cGoalType').value, goal: +$('#cGoal').value || 0 };
  if (editCat) Object.assign(editCat, d); else S.cats.push({ id: uid(), ...d });
  save(); $('#catDlg').close(); renderAll();
};
$('#cDel').onclick = () => {
  const used = S.entries.filter(e => e.catId === editCat.id).length;
  if (!confirm(used ? `Delete "${editCat.name}"? Its ${used} entries will become Uncategorised.` : `Delete "${editCat.name}"?`)) return;
  S.cats = S.cats.filter(c => c !== editCat);
  if (selCat === editCat.id) selCat = S.cats[0]?.id ?? null;
  save(); $('#catDlg').close(); renderAll();
};

// ---------- settings ----------
function renderSettings() {
  $('#focusLen').value = String(S.settings.focusLen);
  $('#notifyOn').checked = !!S.settings.notify;
  $('#wake').value = S.settings.wake; $('#bed').value = S.settings.bed;
}
$('#focusLen').onchange = e => { S.settings.focusLen = +e.target.value; save(); };
$('#notifyOn').onchange = e => { S.settings.notify = e.target.checked; save(); if (e.target.checked) askNotify(); };
$('#wake').onchange = e => { S.settings.wake = e.target.value || '07:00'; save(); renderDay(); };
$('#bed').onchange = e => { S.settings.bed = e.target.value || '23:00'; save(); renderDay(); };
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
$('#expJson').onclick = () => download(`division-of-time-${ymd(Date.now())}.json`, JSON.stringify(S, null, 1), 'application/json');
$('#expCsv').onclick = () => {
  const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['Date', 'Start', 'End', 'Minutes', 'Category', 'Description']].concat(
    [...S.entries].sort((a, b) => a.start - b.start).map(e => [ymd(e.start), fmtTime(e.start), e.end ? fmtTime(e.end) : '', Math.round(((e.end ?? Date.now()) - e.start) / 60000), cat(e.catId).name, e.desc]));
  download(`division-of-time-${ymd(Date.now())}.csv`, rows.map(r => r.map(q).join(',')).join('\n'), 'text/csv');
};
$('#impJson').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const s = JSON.parse(await f.text()); if (!s.cats || !s.entries) throw 0; if (!confirm('Replace all current data with this backup?')) return; S = fix(s); save(); renderAll(); toast('Backup imported'); }
  catch (err) { alert('That file is not a Division of Time backup.'); }
  e.target.value = '';
};
$('#wipe').onclick = () => { if (confirm('Delete every entry, category and note? This cannot be undone.')) { localStorage.removeItem(KEY); S = load(); selCat = S.cats[0].id; save(); renderAll(); } };

// ---------- tabs ----------
$$('.tabs button').forEach(b => b.onclick = () => {
  $$('.tabs button').forEach(x => x.classList.toggle('active', x === b));
  $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
  if (b.dataset.tab === 'reports') renderReports();
});

// keyboard: S start/stop when not typing
document.addEventListener('keydown', e => {
  if (e.target.matches('input,textarea,select') || e.metaKey || e.ctrlKey || document.querySelector('dialog[open]')) return;
  if (e.key === 's') { running() ? stop() : start(); }
  if (e.key === 'n') { e.preventDefault(); $('#desc').focus(); }
});

function renderAll() { renderTracker(); renderDay(); renderCats(); renderSettings(); if ($('#tab-reports').classList.contains('active')) renderReports(); tick(); }
renderAll();
let lastToday = startOfDay(Date.now());
setInterval(() => {
  tick();
  const r = running();
  if (r) { const el = document.querySelector(`[data-live="${r.id}"]`); if (el) el.textContent = fmtHM(Date.now() - r.start); }
  const t = startOfDay(Date.now());
  if (t !== lastToday) { if (viewDay === lastToday) viewDay = t; lastToday = t; renderAll(); }
}, 1000);
setInterval(renderDay, 60000);
window.addEventListener('storage', e => { if (e.key === KEY) { S = load(); renderAll(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderAll(); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
