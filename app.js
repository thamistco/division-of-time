/* Division of Time v2 — daily time tracker with Google Calendar plan-vs-actual.
   Entries live in localStorage on this device. Google access token is short-lived (1h) and kept locally. */
(() => {
'use strict';
const KEY = 'dot.v1', TKEY = 'dot.gtok';
const CFG = window.DOT_CONFIG || {};
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const H = 3600000, MIN = 60000, DAY = 24 * H;
const HOURPX = 52;

/* ---------------- state ---------------- */
const DEFAULT_CATS = [
  ['Clinical work', '#4338ca', 'work', '', 0, 'surgery, clinic, patient, on call, ward, home visit, duty'],
  ['Admin & paperwork', '#64748b', 'work', 'max', 1.5, 'admin, email, results, letters, prescriptions, meeting'],
  ['Study & exams', '#0284c7', 'growth', 'min', 1, 'study, revision, exam, akt, sca, tutorial, teaching, course, webinar, cpd'],
  ['Side projects', '#7c3aed', 'growth', '', 0, 'qaaf, coding, project, build'],
  ['Family time', '#f59e0b', 'free', 'min', 2, 'family, sam, alex, park, playgroup, nursery, birthday'],
  ['Exercise & walking', '#10b981', 'free', 'min', 0.5, 'gym, run, walk, swim, yoga, football, workout'],
  ['Chores & errands', '#a16207', 'life', '', 0, 'shopping, groceries, cleaning, laundry, garage, appointment, errand'],
  ['Rest & leisure', '#db2777', 'free', '', 0, 'tv, film, read, relax, friends, dinner'],
  ['Phone & social media', '#ef4444', 'life', 'max', 1, 'social, youtube, instagram, scrolling'],
  ['Sleep', '#334155', 'sleep', '', 0, 'sleep, nap']
].map(([name, color, kind, goalType, goal, keys]) => ({ id: uid(), name, color, kind, goalType, goal, keys }));

let S = load();
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.cats) return fix(s); } catch (e) {}
  return fix({ cats: DEFAULT_CATS, entries: [], notes: {}, settings: {} });
}
function fix(s) {
  s.entries ||= []; s.notes ||= {}; s.evMap ||= {}; s.gq ||= [];
  s.g = Object.assign({ on: false, show: ['primary'], write: false, writeCal: 'primary', cals: [] }, s.g || {});
  s.settings = Object.assign({ focusLen: 50, notify: false, wake: '07:00', bed: '23:00', shutdown: '18:30', lastCat: null, lastSeen: Date.now() }, s.settings || {});
  if (s.settings.focusLen === 25 && !s.settings.v2) s.settings.focusLen = 25;
  // migrate v1 categories
  const guessKind = n => /sleep/i.test(n) ? 'sleep' : /family|exercise|walk|rest|leisure/i.test(n) ? 'free' : /study|exam|project/i.test(n) ? 'growth' : /chore|errand|phone|social/i.test(n) ? 'life' : 'work';
  for (const c of s.cats) { c.kind ||= guessKind(c.name); c.keys ??= (DEFAULT_CATS.find(d => d.name === c.name) || {}).keys || ''; }
  s.settings.v2 = true;
  return s;
}
let saveT; function save() { localStorage.setItem(KEY, JSON.stringify(S)); }

/* ---------------- helpers ---------------- */
const NOCAT = { name: 'Uncategorised', color: '#9ca3af', id: null, kind: 'life' };
const cat = id => S.cats.find(c => c.id === id) || NOCAT;
const running = () => S.entries.find(e => e.end == null);
const sod = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const addDays = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
const ymd = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const hm = s => { const [h, m] = (s || '0:0').split(':').map(Number); return h * 60 + m; };
const atMin = (day, m) => day + m * MIN;
function fmtHM(ms) { const m = Math.round(Math.max(0, ms) / MIN); const h = Math.floor(m / 60); return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`; }
function fmtClock(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
const fmtTime = t => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toLocalInput = t => new Date(t - new Date(t).getTimezoneOffset() * MIN).toISOString().slice(0, 16);
const fromLocalInput = v => v ? new Date(v).getTime() : null;
const endOf = e => e.end ?? Date.now();
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2600); }
function overlap(e, a, b) { return Math.max(0, Math.min(endOf(e), b) - Math.max(e.start, a)); }
function byCat(a, b, filter) { const m = new Map(); for (const e of S.entries) { if (filter && !filter(e)) continue; const o = overlap(e, a, b); if (o) m.set(e.catId, (m.get(e.catId) || 0) + o); } return m; }
const sum = m => { let t = 0; for (const v of m.values()) t += v; return t; };
const isDeep = e => !e.marker && (e.focus || (cat(e.catId).kind === 'growth' && endOf(e) - e.start >= 45 * MIN));
function kindTime(a, b, kind) { let t = 0; for (const e of S.entries) if (cat(e.catId).kind === kind) t += overlap(e, a, b); return t; }
function deepTime(a, b) { let t = 0; for (const e of S.entries) if (isDeep(e)) t += overlap(e, a, b); return t; }
function waking(day) {
  let a = hm(S.settings.wake), b = hm(S.settings.bed); if (b <= a) b += 1440;
  const st = atMin(day, a), en = Math.min(atMin(day, b), Date.now());
  return { st, en: Math.max(st, en), fullEnd: atMin(day, b) };
}
// free (untracked) sub-intervals of [a,b)
function freeSlots(a, b, ignoreId) {
  const iv = S.entries.filter(e => e.id !== ignoreId && overlap(e, a, b) > 0).map(e => [Math.max(e.start, a), Math.min(endOf(e), b)]).sort((x, y) => x[0] - y[0]);
  const out = []; let cur = a;
  for (const [s, f] of iv) { if (s > cur) out.push([cur, s]); cur = Math.max(cur, f); }
  if (cur < b) out.push([cur, b]);
  return out;
}
// make room for [s,f): trim or split finished entries that overlap
function carve(s, f, keepId) {
  const add = [];
  S.entries = S.entries.filter(e => {
    if (e.id === keepId || e.end == null || e.end <= s || e.start >= f) return true;
    if (e.start >= s && e.end <= f) { gDelete(e); return false; }
    if (e.start < s && e.end > f) { const tail = { ...e, id: uid(), start: f, gid: null }; e.end = s; add.push(tail); gSync(e); gSync(tail); return true; }
    if (e.start < s) e.end = s; else e.start = f;
    gSync(e); return true;
  });
  S.entries.push(...add);
}

/* ---------------- timer ---------------- */
let selCat = S.settings.lastCat && S.cats.some(c => c.id === S.settings.lastCat) ? S.settings.lastCat : (S.cats[0]?.id ?? null);

function start(catId = selCat, desc = $('#desc').value.trim(), focusMin = 0) {
  stop(true);
  const now = Date.now();
  const e = { id: uid(), catId, desc, start: now, end: null };
  if (focusMin) { e.focus = true; e.focusEnd = now + focusMin * MIN; }
  S.entries.push(e);
  selCat = catId; S.settings.lastCat = catId; S.settings.guardAck = null; S.settings.focusDone = false;
  save(); renderAll();
}
function stop(silent, at) {
  const r = running(); if (!r) return;
  r.end = Math.min(at || Date.now(), Date.now());
  if (r.end - r.start < 15000) { S.entries = S.entries.filter(e => e !== r); save(); if (!silent) { $('#desc').value = ''; renderAll(); } return; }
  gSync(r);
  save();
  if (!silent) { $('#desc').value = ''; renderAll(); }
  if (r.focus && r.end - r.start >= 5 * MIN) askFocusQuality(r);
}
$('#startBtn').onclick = () => running() ? stop() : start();
$('#focusBtn').onclick = () => {
  const r = running();
  if (r && r.focus) { stop(); return; }
  askNotify(); start(r ? r.catId : selCat, $('#desc').value.trim(), +S.settings.focusLen);
  toast(`Focus for ${S.settings.focusLen} minutes. Phone face down.`);
};
$('#desc').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const r = running();
  if (r) { r.desc = $('#desc').value.trim(); gSync(r); save(); renderAll(); $('#desc').blur(); toast('Updated'); } else start();
});
$('#desc').addEventListener('change', () => { const r = running(); if (r) { r.desc = $('#desc').value.trim(); save(); renderDay(); } });

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
  list.style.top = Math.min(r.bottom + 6, innerHeight - Math.min(list.scrollHeight, innerHeight * .6) - 8) + 'px';
  list.style.left = Math.max(8, Math.min(r.left, innerWidth - 246)) + 'px';
  list.querySelector('button')?.focus();
  pop.onclick = e => { const b = e.target.closest('button[data-id]'); pop.hidden = true; if (b) onPick(b.dataset.id); };
  pop.onkeydown = e => { if (e.key === 'Escape') pop.hidden = true; };
}

/* ---------------- focus quality + next step ---------------- */
let fqEntry = null;
function askFocusQuality(e) {
  fqEntry = e;
  $('#focusDlgTxt').textContent = `${fmtHM(e.end - e.start)} on ${e.desc || cat(e.catId).name}.`;
  $('#fq').innerHTML = [1, 2, 3, 4, 5].map(i => `<button data-q="${i}" class="${e.quality === i ? 'on' : ''}">${i}</button>`).join('');
  $('#fNext').value = e.next || '';
  $('#focusDlg').showModal();
}
$('#fq').onclick = ev => { const b = ev.target.closest('button'); if (!b) return; $$('#fq button').forEach(x => x.classList.toggle('on', x === b)); };
$('#fSave').onclick = () => {
  const q = $('#fq .on'); if (fqEntry) { if (q) fqEntry.quality = +q.dataset.q; fqEntry.next = $('#fNext').value.trim(); save(); }
  $('#focusDlg').close(); renderAll();
};
$('#fSkip').onclick = () => $('#focusDlg').close();

/* ---------------- forgotten-timer guard ---------------- */
function seen() { if (!document.hidden) S.settings.lastSeen = Date.now(); }
['pointerdown', 'keydown', 'scroll'].forEach(ev => addEventListener(ev, () => { S.settings.lastSeen = Date.now(); }, { passive: true }));
function guard() {
  const r = running(); if (!r || S.settings.guardAck === r.id) return;
  const dur = Date.now() - r.start;
  const away = Date.now() - (S.settings.lastSeen || Date.now());
  if (dur < 3 * H && !(away > 90 * MIN && dur > 90 * MIN)) return;
  const ls = Math.max(r.start + MIN, S.settings.lastSeen || r.start);
  $('#guardTxt').textContent = `Your ${cat(r.catId).name} timer has been running for ${fmtHM(dur)}.` + (away > 20 * MIN ? ` You were last here at ${fmtTime(ls)}.` : '');
  $('#gStopSeen').textContent = `Stop at ${fmtTime(ls)}`;
  $('#gStopSeen').hidden = !(away > 20 * MIN);
  $('#gStopSeen').onclick = () => { $('#guardDlg').close(); stop(false, ls); toast(`Stopped at ${fmtTime(ls)}`); };
  if (!$('#guardDlg').open) $('#guardDlg').showModal();
}
$('#gKeep').onclick = () => { const r = running(); if (r) S.settings.guardAck = r.id; save(); $('#guardDlg').close(); };
$('#gStopNow').onclick = () => { $('#guardDlg').close(); stop(); };
$('#gDiscard').onclick = () => { const r = running(); if (r) { S.entries = S.entries.filter(e => e !== r); save(); } $('#guardDlg').close(); renderAll(); toast('Timer discarded'); };

/* ---------------- notifications ---------------- */
function askNotify() { if (S.settings.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }
function notify(msg) {
  if (S.settings.notify && 'Notification' in window && Notification.permission === 'granted') { try { new Notification('Division of Time', { body: msg, icon: 'icon-192.png', tag: 'dot' }); } catch (e) {} }
  toast(msg);
}
let warned3h = null, idleWarned = 0;

/* ---------------- tick ---------------- */
function tick() {
  const r = running();
  const el = $('#elapsed'), btn = $('#startBtn'), fb = $('#focusBar'), hint = $('#heroHint');
  if (r) {
    const ms = Date.now() - r.start;
    el.textContent = fmtClock(ms);
    btn.classList.add('running'); btn.setAttribute('aria-label', 'Stop timer');
    if (!btn.dataset.r) { btn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>'; btn.dataset.r = 1; }
    document.title = `${fmtClock(ms)} · ${r.desc || cat(r.catId).name}`;
    if (r.focus && r.focusEnd) {
      const total = r.focusEnd - r.start, left = r.focusEnd - Date.now();
      fb.hidden = false; fb.firstElementChild.style.width = Math.min(100, (1 - left / total) * 100) + '%';
      hint.textContent = left > 0 ? `Focus session · ${fmtClock(left)} left` : 'Focus session done. Take a 5–10 minute break.';
      if (left <= 0 && !S.settings.focusDone) { S.settings.focusDone = true; save(); notify('Focus session complete. Stand up, stretch, look out of a window.'); }
    } else { fb.hidden = true; hint.textContent = `${cat(r.catId).name} · since ${fmtTime(r.start)}`; }
    $('#focusBtn').classList.toggle('on', !!r.focus);
    $('#focusLbl').textContent = r.focus ? 'End focus' : `Focus ${S.settings.focusLen}`;
    if (ms > 3 * H && warned3h !== r.id) { warned3h = r.id; notify(`${cat(r.catId).name} has been running over 3 hours. Still going?`); }
  } else {
    el.textContent = '0:00:00'; btn.classList.remove('running'); btn.setAttribute('aria-label', 'Start timer');
    if (btn.dataset.r !== '') { btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'; btn.dataset.r = ''; }
    document.title = 'Division of Time'; fb.hidden = true;
    $('#focusBtn').classList.remove('on'); $('#focusLbl').textContent = `Focus ${S.settings.focusLen}`;
    const last = [...S.entries].filter(e => e.end).sort((a, b) => b.end - a.end)[0];
    hint.textContent = last && Date.now() - last.end < 12 * H ? `Not tracking · last stopped ${fmtTime(last.end)}` : 'Tap a category below to start';
    // idle nudge
    const w = waking(sod(Date.now()));
    const since = last ? Date.now() - last.end : Infinity;
    if (S.settings.notify && Date.now() > w.st && Date.now() < w.fullEnd && since > 30 * MIN && Date.now() - idleWarned > 60 * MIN && !document.hidden) { idleWarned = Date.now(); notify('Nothing has been tracked for 30 minutes. What are you doing?'); }
  }
}

/* ---------------- tracker + chips ---------------- */
function renderTracker() {
  const r = running();
  const c = cat(r ? r.catId : selCat);
  $('#catBtn .dot').style.background = c.color;
  $('#catBtn .lbl').textContent = c.name;
  if (document.activeElement !== $('#desc')) $('#desc').value = r ? (r.desc || '') : $('#desc').value;
  $('#quick').innerHTML = S.cats.map((k, i) => `<button class="chip ${r && r.catId === k.id ? 'on' : ''}" data-id="${k.id}" title="${r && r.catId === k.id ? 'Stop' : 'Switch to'} ${esc(k.name)}${i < 9 ? ' (' + (i + 1) + ')' : ''}"><span class="dot" style="background:${k.color}"></span>${esc(k.name)}</button>`).join('');
  // next step from last focus on this category
  const prev = [...S.entries].filter(e => e.catId === c.id && e.next && e.end).sort((a, b) => b.end - a.end)[0];
  const ns = $('#nextStep');
  if (prev && Date.now() - prev.end < 7 * DAY) { ns.hidden = false; ns.textContent = `↪ Pick up where you left off: ${prev.next}`; } else ns.hidden = true;
  $('#dateLine').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}
$('#quick').onclick = e => {
  const b = e.target.closest('.chip'); if (!b) return;
  const r = running();
  if (r && r.catId === b.dataset.id) { stop(); return; }
  $('#desc').value = '';
  start(b.dataset.id, '');
};

/* ---------------- Google Calendar ---------------- */
const G = { token: null, exp: 0, events: {}, loading: new Set(), err: null };
try { const t = JSON.parse(localStorage.getItem(TKEY)); if (t && t.exp > Date.now() + MIN) { G.token = t.t; G.exp = t.exp; } } catch (e) {}
const gReady = () => !!G.token && G.exp > Date.now() + 30000;
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events';
let gisP = null;
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return gisP ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = res; s.onerror = () => { gisP = null; rej(new Error('Could not load Google sign-in')); }; document.head.appendChild(s); });
}
async function gConnect() {
  if (!CFG.googleClientId) { toast('Google Calendar is not configured.'); return; }
  try { await loadGis(); } catch (e) { toast(e.message); return; }
  const client = google.accounts.oauth2.initTokenClient({
    client_id: CFG.googleClientId, scope: SCOPES, prompt: S.g.on ? '' : 'consent',
    callback: async resp => {
      if (resp.error) { toast('Google sign-in was cancelled'); return; }
      G.token = resp.access_token; G.exp = Date.now() + (resp.expires_in || 3600) * 1000; G.err = null;
      localStorage.setItem(TKEY, JSON.stringify({ t: G.token, exp: G.exp }));
      S.g.on = true; save();
      G.events = {};
      await gLoadCals();
      await gFlush();
      toast('Google Calendar connected');
      renderAll();
    },
    error_callback: () => toast('Google sign-in window was closed')
  });
  client.requestAccessToken();
}
function gDisconnect() {
  if (G.token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(G.token, () => {});
  G.token = null; G.exp = 0; G.events = {}; localStorage.removeItem(TKEY);
  S.g.on = false; S.g.write = false; save(); renderAll(); toast('Disconnected from Google Calendar');
}
async function gApi(path, opts = {}) {
  if (!gReady()) throw new Error('auth');
  const res = await fetch('https://www.googleapis.com/calendar/v3' + path, { ...opts, headers: { Authorization: 'Bearer ' + G.token, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (res.status === 401) { G.token = null; localStorage.removeItem(TKEY); renderG(); throw new Error('auth'); }
  if (res.status === 204) return null;
  if (!res.ok) { const t = await res.text(); throw new Error(`Google ${res.status}: ${t.slice(0, 140)}`); }
  return res.json();
}
async function gLoadCals() {
  try {
    const r = await gApi('/users/me/calendarList?minAccessRole=reader');
    S.g.cals = r.items.map(c => ({ id: c.id, name: c.summaryOverride || c.summary, color: c.backgroundColor, primary: !!c.primary, write: ['owner', 'writer'].includes(c.accessRole) }));
    const prim = S.g.cals.find(c => c.primary);
    if (prim) { S.g.email = prim.id; S.g.show = S.g.show.map(id => id === 'primary' ? prim.id : id); if (S.g.writeCal === 'primary') S.g.writeCal = prim.id; }
    save();
  } catch (e) { if (e.message !== 'auth') G.err = e.message; }
}
async function gFetchRange(a, b) {
  if (!gReady()) return;
  const key = a + '-' + b; if (G.loading.has(key)) return; G.loading.add(key);
  try {
    const days = {}; for (let t = a; t < b; t = addDays(t, 1)) days[ymd(t)] = [];
    for (const calId of S.g.show) {
      const cal = S.g.cals.find(c => c.id === calId) || { color: '#8e8e9e' };
      let pageToken = '';
      do {
        const q = new URLSearchParams({ timeMin: new Date(a).toISOString(), timeMax: new Date(b).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
        if (pageToken) q.set('pageToken', pageToken);
        const r = await gApi(`/calendars/${encodeURIComponent(calId)}/events?${q}`);
        for (const ev of r.items || []) {
          if (ev.status === 'cancelled' || ev.extendedProperties?.private?.dot === '1') continue;
          if ((ev.attendees || []).some(x => x.self && x.responseStatus === 'declined')) continue;
          const allDay = !!ev.start.date;
          const st = allDay ? new Date(ev.start.date + 'T00:00').getTime() : new Date(ev.start.dateTime).getTime();
          const en = allDay ? new Date(ev.end.date + 'T00:00').getTime() : new Date(ev.end.dateTime).getTime();
          const o = { id: ev.id, cal: calId, title: ev.summary || '(No title)', start: st, end: en, allDay, color: cal.color, transp: ev.transparency === 'transparent' };
          for (let t = sod(st); t < Math.max(en, st + 1); t = addDays(t, 1)) { const k = ymd(t); if (days[k]) days[k].push(o); }
        }
        pageToken = r.nextPageToken || '';
      } while (pageToken);
    }
    Object.assign(G.events, days); G.err = null;
  } catch (e) { if (e.message !== 'auth') { G.err = e.message; console.warn(e); } }
  finally { G.loading.delete(key); }
}
const dayEvents = day => G.events[ymd(day)] || [];
async function ensureDay(day) { if (gReady() && !G.events[ymd(day)]) { await gFetchRange(day, addDays(day, 1)); renderDay(); } }
// write-back of tracked time
function gBody(e) {
  const c = cat(e.catId);
  return { summary: `${e.desc ? e.desc + ' · ' : ''}${c.name}`, description: `Tracked with Division of Time${e.focus ? ' · focus session' : ''}${e.quality ? ' · focus ' + e.quality + '/5' : ''}`,
    start: { dateTime: new Date(e.start).toISOString() }, end: { dateTime: new Date(e.end).toISOString() }, transparency: 'transparent',
    extendedProperties: { private: { dot: '1', dotId: e.id } }, colorId: nearestColorId(c.color) };
}
const GCOL = { 1: '#7986cb', 2: '#33b679', 3: '#8e24aa', 4: '#e67c73', 5: '#f6bf26', 6: '#f4511e', 7: '#039be5', 8: '#616161', 9: '#3f51b5', 10: '#0b8043', 11: '#d50000' };
function nearestColorId(hex) {
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const a = rgb(hex); let best = '8', bd = 1e9;
  for (const [id, h] of Object.entries(GCOL)) { const b = rgb(h); const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2; if (d < bd) { bd = d; best = id; } }
  return best;
}
function gSync(e) {
  if (!S.g.on || !S.g.write || !e || e.end == null) return;
  if (!gReady()) { if (!S.gq.includes(e.id)) S.gq.push(e.id); return; }
  const cal = encodeURIComponent(S.g.writeCal);
  const p = e.gid ? gApi(`/calendars/${cal}/events/${e.gid}`, { method: 'PATCH', body: JSON.stringify(gBody(e)) })
                  : gApi(`/calendars/${cal}/events`, { method: 'POST', body: JSON.stringify(gBody(e)) });
  p.then(r => { if (r && r.id && !e.gid) { e.gid = r.id; save(); } }).catch(err => { if (!S.gq.includes(e.id)) S.gq.push(e.id); save(); });
}
function gDelete(e) {
  if (!e.gid || !S.g.on) return;
  if (!gReady()) { S.gq.push('del:' + e.gid); save(); return; }
  gApi(`/calendars/${encodeURIComponent(S.g.writeCal)}/events/${e.gid}`, { method: 'DELETE' }).catch(() => {});
}
async function gFlush() {
  if (!gReady() || !S.gq.length) return;
  const q = S.gq; S.gq = []; save();
  for (const id of q) {
    if (id.startsWith('del:')) { try { await gApi(`/calendars/${encodeURIComponent(S.g.writeCal)}/events/${id.slice(4)}`, { method: 'DELETE' }); } catch (e) {} continue; }
    const e = S.entries.find(x => x.id === id); if (e) gSync(e);
  }
}
async function gBackfill() {
  const since = addDays(sod(Date.now()), -6);
  const list = S.entries.filter(e => e.end && !e.gid && e.start >= since);
  for (const e of list) gSync(e);
  toast(`Copying ${list.length} entr${list.length === 1 ? 'y' : 'ies'} from the last 7 days`);
}
function guessCat(title) {
  const t = title.toLowerCase().trim();
  if (S.evMap[t] && S.cats.some(c => c.id === S.evMap[t])) return S.evMap[t];
  for (const c of S.cats) for (const k of (c.keys || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean)) if (new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t)) return c.id;
  return null;
}
const loggedEv = id => S.entries.some(e => e.evId === id);
function pastUnlogged(day) { return dayEvents(day).filter(ev => !ev.allDay && !ev.transp && ev.start < Date.now() && !loggedEv(ev.id)); }
function logEvent(ev, catId) {
  const s = Math.max(ev.start, sod(ev.start)), f = Math.min(ev.end, Date.now());
  if (f - s < 5 * MIN) return 0;
  let n = 0;
  for (const [a, b] of freeSlots(s, f)) { if (b - a < 5 * MIN) continue; const e = { id: uid(), catId, desc: ev.title, start: a, end: b, evId: ev.id }; S.entries.push(e); gSync(e); n++; }
  S.evMap[ev.title.toLowerCase().trim()] = catId;
  if (!n) S.entries.push({ id: uid(), catId, desc: ev.title, start: f, end: f, evId: ev.id, marker: true }); // mark as handled
  return n;
}
$('#logEvents').onclick = () => {
  const list = pastUnlogged(viewDay); let n = 0, skipped = 0;
  for (const ev of list) { const c = guessCat(ev.title); if (c) n += logEvent(ev, c); else skipped++; }
  save(); renderAll();
  toast(n ? `Logged ${n} block${n > 1 ? 's' : ''} from your calendar${skipped ? `. Tap the other ${skipped} to pick a category` : ''}` : skipped ? 'Tap each event to choose its category' : 'Nothing to log');
};
$('#gPill').onclick = () => { if (gReady()) { switchTab('settings'); } else gConnect(); };

function renderG() {
  const pill = $('#gPill'), txt = $('#gPillTxt');
  pill.classList.toggle('on', gReady()); pill.classList.toggle('warn', S.g.on && !gReady());
  txt.textContent = gReady() ? 'Calendar linked' : S.g.on ? 'Reconnect calendar' : 'Connect calendar';
  const box = $('#gBox'); if (!box) return;
  if (!S.g.on) {
    box.innerHTML = `<div class="gbox"><p>See your Google Calendar next to what you actually did, log meetings and clinics with one tap, and optionally copy your tracked time back into a calendar.</p><button class="primary" id="gConn">Connect Google Calendar</button><p class="muted small" style="margin-top:10px">Google may warn the app is unverified. It's your own app in testing; choose Continue.</p></div>`;
  } else {
    const cals = S.g.cals || [];
    box.innerHTML = `<div class="gbox">
      <p>${gReady() ? `Linked${S.g.email ? ' as <b>' + esc(S.g.email) + '</b>' : ''}.` : 'Your Google session has expired (they last an hour).'} ${G.err ? '<br><span class="danger small">' + esc(G.err) + '</span>' : ''}</p>
      ${gReady() ? '' : '<button class="primary" id="gConn">Reconnect</button>'}
      ${cals.length ? `<label class="lab muted small">Calendars shown as your plan</label><div class="gcals">${cals.map(c => `<label class="check"><input type="checkbox" data-cal="${esc(c.id)}" ${S.g.show.includes(c.id) ? 'checked' : ''}><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</label>`).join('')}</div>` : ''}
      <label class="check"><input type="checkbox" id="gWrite" ${S.g.write ? 'checked' : ''}> Copy tracked time into Google Calendar (shown as "free" so it never blocks your diary)</label>
      ${S.g.write ? `<label class="field">Copy into <select id="gWriteCal">${cals.filter(c => c.write).map(c => `<option value="${esc(c.id)}" ${c.id === S.g.writeCal ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <p class="muted small">Tip: make a calendar called "Division of Time" in Google Calendar first, then pick it here, so it can be hidden in one click.</p>
      <button class="sm" id="gBack">Copy the last 7 days now</button>` : ''}
      <div class="btns" style="margin-top:12px"><button class="sm" id="gRefresh">Refresh</button><button class="sm ghost danger" id="gDisc">Disconnect</button></div></div>`;
  }
  $('#gConn')?.addEventListener('click', gConnect);
  $('#gDisc')?.addEventListener('click', gDisconnect);
  $('#gRefresh')?.addEventListener('click', async () => { if (!gReady()) return gConnect(); G.events = {}; await gLoadCals(); renderAll(); toast('Refreshed'); });
  $('#gBack')?.addEventListener('click', gBackfill);
  $('#gWrite')?.addEventListener('change', e => { S.g.write = e.target.checked; save(); renderG(); });
  $('#gWriteCal')?.addEventListener('change', e => { S.g.writeCal = e.target.value; save(); });
  $$('#gBox [data-cal]').forEach(i => i.onchange = () => { const id = i.dataset.cal; S.g.show = i.checked ? [...new Set([...S.g.show, id])] : S.g.show.filter(x => x !== id); G.events = {}; save(); renderDay(); });
}

/* ---------------- Today ---------------- */
let viewDay = sod(Date.now()), scrolledFor = null;
$('#prevDay').onclick = () => { viewDay = addDays(viewDay, -1); renderDay(); };
$('#nextDay').onclick = () => { if (viewDay < sod(Date.now())) { viewDay = addDays(viewDay, 1); renderDay(); } };
$('#todayBtn').onclick = () => { viewDay = sod(Date.now()); renderDay(); };

function renderDay() {
  const a = viewDay, b = addDays(a, 1), today = sod(Date.now()), isToday = a === today;
  $('#dayLabel').textContent = isToday ? 'Today' : a === addDays(today, -1) ? 'Yesterday' : new Date(a).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#nextDay').disabled = a >= today; $('#todayBtn').hidden = isToday;
  ensureDay(a);

  const m = byCat(a, b), total = sum(m);
  const w = waking(a);
  let trackedWake = 0; for (const e of S.entries) trackedWake += overlap(e, w.st, w.en);
  const untracked = Math.max(0, (w.en - w.st) - trackedWake);
  const deep = deepTime(a, b), free = kindTime(a, b, 'free'), sleep = kindTime(a, b, 'sleep');
  $('#sTracked').textContent = fmtHM(total);
  $('#sTrackedSub').textContent = sleep ? `incl. ${fmtHM(sleep)} sleep` : `${Math.round(trackedWake / Math.max(1, w.en - w.st) * 100)}% of waking time`;
  $('#sUntracked').textContent = fmtHM(untracked);
  $('#sFocus').textContent = fmtHM(deep);
  const fs = $('#sFocusSub'); fs.textContent = deep >= 4 * H ? 'past the 4h ceiling' : deep >= H ? 'solid deep work' : 'aim for 1–4h'; fs.className = 's ' + (deep >= H && deep <= 4 * H ? 'ok' : '');
  $('#sFree').textContent = fmtHM(free);
  const fr = $('#sFreeSub'); fr.textContent = free >= 2 * H ? 'healthy (2h+)' : `${fmtHM(2 * H - free)} short of 2h`; fr.className = 's ' + (free >= 2 * H ? 'ok' : '');

  renderNudges(a, { deep, free, untracked, isToday });
  renderGrid(a, b, isToday);

  // donut
  const sorted = [...m.entries()].filter(([id]) => cat(id).kind !== 'sleep').sort((x, y) => y[1] - x[1]);
  const awake = sorted.reduce((p, [, v]) => p + v, 0);
  const C = 2 * Math.PI * 46; let off = 0;
  $('#donut').innerHTML = awake ? sorted.map(([id, v]) => {
    const len = v / awake * C, s = `<circle cx="60" cy="60" r="46" fill="none" stroke="${cat(id).color}" stroke-width="16" stroke-dasharray="${Math.max(0, len - 1.2)} ${C - Math.max(0, len - 1.2)}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"><title>${esc(cat(id).name)} ${fmtHM(v)}</title></circle>`;
    off += len; return s;
  }).join('') + `<text x="60" y="58" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor">${fmtHM(awake)}</text><text x="60" y="73" text-anchor="middle" font-size="9" fill="currentColor" opacity=".6">awake</text>`
    : `<circle cx="60" cy="60" r="46" fill="none" stroke="var(--soft)" stroke-width="16"/><text x="60" y="64" text-anchor="middle" font-size="11" fill="currentColor" opacity=".6">Nothing yet</text>`;
  $('#legend').innerHTML = sorted.slice(0, 7).map(([id, v]) => `<div class="li"><span class="dot" style="background:${cat(id).color}"></span><span class="n">${esc(cat(id).name)}</span><span class="t">${fmtHM(v)} · ${Math.round(v / awake * 100)}%</span></div>`).join('') + (sleep ? `<div class="li muted small"><span class="dot" style="background:${cat(S.cats.find(c => c.kind === 'sleep')?.id).color}"></span><span class="n">Sleep (not in chart)</span><span class="t">${fmtHM(sleep)}</span></div>` : '') || '<div class="muted small">Tap a category chip to start. Your day fills in here.</div>';

  // goals
  const goals = S.cats.filter(c => c.goalType && c.goal > 0);
  $('#goals').innerHTML = goals.length ? goals.map(c => {
    const v = m.get(c.id) || 0, g = c.goal * H, pct = Math.min(100, v / g * 100);
    let st, cls;
    if (c.goalType === 'min') { st = v >= g ? '✓ Goal reached' : `${fmtHM(g - v)} to go`; cls = v >= g ? 'ok' : ''; }
    else { st = v > g ? `${fmtHM(v - g)} over your limit` : `${fmtHM(g - v)} left in your limit`; cls = v > g ? 'bad' : 'ok'; }
    const col = c.goalType === 'max' && v > g ? 'var(--danger)' : c.color;
    return `<div class="goal"><div class="gh"><span>${esc(c.name)} <small>${c.goalType === 'min' ? '≥' : '≤'} ${c.goal}h</small></span><span>${fmtHM(v)}</span></div><div class="bar"><i style="width:${pct}%;background:${col}"></i></div><div class="st ${cls}">${st}</div></div>`;
  }).join('') : '<p class="muted small">No goals yet. Add one in Categories.</p>';

  // entries
  const list = S.entries.filter(e => !e.marker && overlap(e, a, b) > 0).sort((x, y) => y.start - x.start);
  $('#entryCount').textContent = list.length ? `${list.length} entr${list.length === 1 ? 'y' : 'ies'}` : '';
  $('#entries').innerHTML = list.length ? list.map(e => {
    const c = cat(e.catId), dur = endOf(e) - e.start;
    return `<li><span class="dot" style="background:${c.color}"></span><div class="d"><b>${esc(e.desc || c.name)}${e.focus ? '<span class="badge">focus' + (e.quality ? ' ' + e.quality + '/5' : '') + '</span>' : ''}${e.evId ? '<span class="badge">calendar</span>' : ''}</b><small>${esc(c.name)} · ${fmtTime(e.start)}–${e.end ? fmtTime(e.end) : '<span class="live">now</span>'}</small></div><span class="dur" data-live="${e.end ? '' : e.id}">${fmtHM(dur)}</span><span class="act"><button data-act="resume" data-id="${e.id}" title="Start again" aria-label="Start again">▶</button><button data-act="edit" data-id="${e.id}">Edit</button></span></li>`;
  }).join('') : '<li class="empty">Nothing tracked on this day yet.</li>';

  // review
  const n = S.notes[ymd(a)] || {};
  $('#rating').innerHTML = ['😫', '😕', '😐', '🙂', '🤩'].map((f, i) => `<button role="radio" aria-checked="${n.rating === i + 1}" class="${n.rating === i + 1 ? 'on' : ''}" data-r="${i + 1}" aria-label="${['Rough', 'Meh', 'OK', 'Good', 'Great'][i]}">${f}</button>`).join('');
  if (document.activeElement !== $('#note')) $('#note').value = n.text || '';
  if (document.activeElement !== $('#plan')) $('#plan').value = n.plan || '';
  $('#planToCal').hidden = !(gReady() && (n.plan || '').trim());
}

function renderGrid(a, b, isToday) {
  const evs = dayEvents(a);
  const timed = evs.filter(e => !e.allDay);
  const ents = S.entries.filter(e => !e.marker && overlap(e, a, b) > 0);
  let h0 = Math.floor(hm(S.settings.wake) / 60), h1 = Math.ceil(hm(S.settings.bed) / 60); if (h1 <= h0) h1 = 24;
  for (const x of [...timed, ...ents]) { const s = Math.max(x.start, a), f = Math.min(endOf(x), b); h0 = Math.min(h0, Math.floor((s - a) / H)); h1 = Math.max(h1, Math.ceil((f - a) / H)); }
  h0 = Math.max(0, h0); h1 = Math.min(24, Math.max(h1, h0 + 1));
  const top = a + h0 * H, height = (h1 - h0) * HOURPX;
  const y = t => (Math.max(t, top) - top) / H * HOURPX;
  const blk = (s, f) => `top:${y(s)}px;height:${Math.max(16, y(f) - y(s) - 2)}px`;
  let hrs = ''; for (let h = h0 + 1; h < h1; h++) hrs += `<span style="top:${(h - h0) * HOURPX}px">${String(h).padStart(2, '0')}:00</span>`;
  // plan lane
  // side-by-side layout for overlapping events
  const sortedEv = [...timed].sort((p, q) => p.start - q.start || q.end - p.end), colEnd = [], lay = new Map();
  let cluster = [], clusterEnd = 0;
  const flush = () => { const n = Math.max(...cluster.map(c => lay.get(c).col)) + 1; cluster.forEach(c => lay.get(c).n = n); cluster = []; colEnd.length = 0; };
  for (const ev of sortedEv) {
    if (cluster.length && ev.start >= clusterEnd) flush();
    let col = colEnd.findIndex(t => t <= ev.start); if (col < 0) col = colEnd.length; colEnd[col] = ev.end;
    lay.set(ev, { col, n: 1 }); cluster.push(ev); clusterEnd = Math.max(clusterEnd, ev.end);
  }
  if (cluster.length) flush();
  let plan = sortedEv.map(ev => {
    const s = Math.max(ev.start, a), f = Math.min(ev.end, b), logged = loggedEv(ev.id), short = y(f) - y(s) < 34, L = lay.get(ev);
    const pos = L.n > 1 ? `;left:calc(${L.col / L.n * 100}% + 2px);right:auto;width:calc(${100 / L.n}% - 4px)` : '';
    return `<div class="blk ev ${logged ? 'logged' : ''}" data-ev="${esc(ev.id)}" style="${blk(s, f)};border-color:${ev.color}${pos}" title="${esc(ev.title)} ${fmtTime(ev.start)}–${fmtTime(ev.end)}"><b>${esc(ev.title)}</b>${short ? '' : `<small>${fmtTime(ev.start)}–${fmtTime(ev.end)}</small> `}${logged ? '<span class="tag">✓</span>' : ev.start < Date.now() && !short ? '<span class="tag">tap to log</span>' : ''}</div>`;
  }).join('');
  if (!timed.length) plan = `<div class="blk" style="top:8px;height:auto;border:0;color:var(--muted);cursor:default;white-space:normal">${gReady() ? 'No events' : S.g.on ? 'Reconnect Google to see your plan' : 'Connect Google Calendar to see your plan here'}</div>`;
  // actual lane
  let act = ents.map(e => {
    const s = Math.max(e.start, a), f = Math.min(endOf(e), b), c = cat(e.catId), short = y(f) - y(s) < 34;
    return `<div class="blk en ${e.end ? '' : 'live'}" data-id="${e.id}" style="${blk(s, f)};background:${c.color}" title="${esc(e.desc || c.name)} ${fmtTime(s)}–${e.end ? fmtTime(f) : 'now'}"><b>${esc(e.desc || c.name)}</b>${short ? '' : `<small>${fmtTime(s)}–${e.end ? fmtTime(f) : 'now'} · ${fmtHM(f - s)}</small>`}</div>`;
  }).join('');
  const w = waking(a);
  for (const [s, f] of freeSlots(w.st, w.en)) if (f - s >= 15 * MIN) act += `<div class="blk gap" data-gap="${s}-${f}" style="${blk(s, f)}"><b>${fmtHM(f - s)} untracked</b>${y(f) - y(s) >= 34 ? '<small>tap to fill</small>' : ''}</div>`;
  const now = isToday && Date.now() > top && Date.now() < a + h1 * H ? `<div class="nowline" style="top:${y(Date.now())}px"></div>` : '';
  $('#dayGrid').innerHTML = `<div class="hrs" style="height:${height}px">${hrs}</div><div class="lane plan" style="height:${height}px">${plan}</div><div class="lane actual" id="actualLane" style="height:${height}px">${act}</div>${now}`;
  $('#dayGrid').dataset.top = top;
  // all-day
  $('#allDay').innerHTML = evs.filter(e => e.allDay).map(e => `<span title="All day">${esc(e.title)}</span>`).join('');
  $('#planSrc').textContent = gReady() ? '· Google Calendar' : '';
  const pu = gReady() ? pastUnlogged(a) : [];
  $('#logEvents').hidden = !pu.length; $('#logEvents').textContent = `Log ${pu.length} past event${pu.length > 1 ? 's' : ''}`;
  if (scrolledFor !== a) { scrolledFor = a; const sc = $('#dayScroll'); const target = isToday ? y(Date.now()) - 200 : y(w.st) - 20; requestAnimationFrame(() => sc.scrollTop = Math.max(0, target)); }
}
$('#dayGrid').onclick = e => {
  const en = e.target.closest('.blk.en'); if (en) return openEntry(en.dataset.id);
  const ev = e.target.closest('.blk.ev');
  if (ev) {
    const item = dayEvents(viewDay).find(x => x.id === ev.dataset.ev); if (!item) return;
    if (loggedEv(item.id)) { const le = S.entries.find(x => x.evId === item.id && !x.marker); if (le) openEntry(le.id); return; }
    if (item.start > Date.now()) return toast('That event hasn’t happened yet');
    return openEntry(null, { desc: item.title, start: item.start, end: Math.min(item.end, Date.now()), catId: guessCat(item.title) || selCat, evId: item.id });
  }
  const gap = e.target.closest('.blk.gap');
  if (gap) {
    const [s, f] = gap.dataset.gap.split('-').map(Number);
    const ev2 = dayEvents(viewDay).find(x => !x.allDay && x.start < f && x.end > s);
    return openEntry(null, { start: s, end: f, desc: ev2?.title || '', catId: (ev2 && guessCat(ev2.title)) || selCat });
  }
  const lane = e.target.closest('#actualLane');
  if (lane) {
    const r = lane.getBoundingClientRect(); const top = +$('#dayGrid').dataset.top;
    let t = top + (e.clientY - r.top) / HOURPX * H; t = Math.round(t / (15 * MIN)) * 15 * MIN;
    if (t > Date.now()) return;
    openEntry(null, { start: t, end: Math.min(t + 30 * MIN, Date.now()) });
  }
};

function renderNudges(day, d) {
  const out = [], now = Date.now(), nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  if (d.isToday) {
    const r = running();
    if (r && cat(r.catId).kind === 'work' && nowMin > hm(S.settings.shutdown)) out.push(['warn', '🌙', `You're past your ${S.settings.shutdown} shutdown. Write down tomorrow's first step and call it a day.`]);
    const pu = gReady() ? pastUnlogged(day) : [];
    if (pu.length) out.push(['', '📅', `${pu.length} calendar event${pu.length > 1 ? 's' : ''} today ${pu.length > 1 ? 'aren’t' : 'isn’t'} logged yet. Use “Log past events” or tap ${pu.length > 1 ? 'them' : 'it'}.`]);
    if (d.untracked > 2 * H) out.push(['warn', '🕳️', `${fmtHM(d.untracked)} of today is untracked. Tap the striped gaps to fill them while you remember.`]);
    if (nowMin > 14 * 60 && d.deep < H && nowMin < hm(S.settings.shutdown)) out.push(['', '🎯', 'No deep-work block yet today. Even one 50-minute focus session makes a day feel productive.']);
    if (d.deep > 4 * H) out.push(['good', '🧠', `${fmtHM(d.deep)} of deep work. That's around the daily ceiling where quality drops, so ease off.`]);
    if (nowMin > hm(S.settings.shutdown) + 60 && !(S.notes[ymd(day)] || {}).rating) out.push(['', '📝', 'Two-minute shutdown review below: rate the day and set tomorrow’s one big thing.']);
    if (nowMin > 19 * 60 && d.free < H) out.push(['warn', '🌿', 'Very little free time today. Wellbeing drops below about 2 hours; protect some this evening.']);
  }
  if (!S.entries.length) out.unshift(['good', '👋', 'Welcome! Tap a category chip to start a timer, or connect Google Calendar to log your clinics and meetings in one tap.']);
  $('#nudges').innerHTML = out.slice(0, 3).map(([k, i, t]) => `<div class="nudge ${k}"><span class="ic">${i}</span><span>${t}</span></div>`).join('');
}

$('#entries').onclick = e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const en = S.entries.find(x => x.id === b.dataset.id);
  if (b.dataset.act === 'edit') openEntry(en.id);
  else { $('#desc').value = en.desc || ''; start(en.catId, en.desc || ''); window.scrollTo({ top: 0, behavior: 'smooth' }); }
};
$('#rating').onclick = e => { const b = e.target.closest('button'); if (!b) return; const k = ymd(viewDay); S.notes[k] = { ...(S.notes[k] || {}), rating: +b.dataset.r }; save(); renderDay(); };
$('#note').addEventListener('input', () => { const k = ymd(viewDay); S.notes[k] = { ...(S.notes[k] || {}), text: $('#note').value }; save(); });
$('#plan').addEventListener('input', () => { const k = ymd(viewDay); S.notes[k] = { ...(S.notes[k] || {}), plan: $('#plan').value }; save(); $('#planToCal').hidden = !(gReady() && $('#plan').value.trim()); });
$('#planToCal').onclick = async () => {
  const text = $('#plan').value.trim(); if (!text) return;
  const m = text.match(/\b(?:at\s*)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b/i);
  let h = 9, mi = 0; if (m) { h = +m[1]; mi = +(m[2] || 0); if (/pm/i.test(m[3] || '') && h < 12) h += 12; if (/am/i.test(m[3] || '') && h === 12) h = 0; }
  if (h > 23) h = 9;
  const day = addDays(viewDay, 1), s = day + h * H + mi * MIN;
  const cal = S.g.cals.find(c => c.primary)?.id || 'primary';
  try {
    await gApi(`/calendars/${encodeURIComponent(cal)}/events`, { method: 'POST', body: JSON.stringify({ summary: '🎯 ' + text.replace(/^i will\s*/i, ''), description: 'Your one big thing, set in your Division of Time shutdown review.', start: { dateTime: new Date(s).toISOString() }, end: { dateTime: new Date(s + H).toISOString() }, reminders: { useDefault: true } }) });
    toast(`Added to your calendar for ${new Date(s).toLocaleDateString('en-GB', { weekday: 'short' })} ${fmtTime(s)}`);
    delete G.events[ymd(day)];
  } catch (e) { toast(e.message === 'auth' ? 'Reconnect Google first' : 'Couldn’t add it: ' + e.message); }
};

/* ---------------- entry dialog ---------------- */
let editing = null, preset = null;
function openEntry(id, pre) {
  editing = id ? S.entries.find(e => e.id === id) : null; preset = pre || null;
  $('#entryTitle').textContent = editing ? 'Edit entry' : pre?.evId ? 'Log calendar event' : 'Add time';
  $('#eCat').innerHTML = S.cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const now = Date.now(), base = viewDay === sod(now) ? now : viewDay + 12 * H;
  const src = editing || pre || {};
  $('#eDesc').value = src.desc || '';
  $('#eCat').value = src.catId || selCat;
  $('#eStart').value = toLocalInput(src.start ?? base - H);
  $('#eEnd').value = editing ? (editing.end ? toLocalInput(editing.end) : '') : toLocalInput(src.end ?? base);
  $('#eFocus').checked = !!src.focus;
  $('#eDel').hidden = !editing; $('#eErr').textContent = '';
  $('#entryDlg').showModal();
  if (!pre?.desc) setTimeout(() => $('#eDesc').focus(), 50);
}
$('#addEntry').onclick = () => openEntry(null);
$('#eSave').onclick = () => {
  const s = fromLocalInput($('#eStart').value), f = fromLocalInput($('#eEnd').value);
  const isRunning = editing && editing.end == null && !f;
  if (!s) return $('#eErr').textContent = 'Add a start time.';
  if (!isRunning && !f) return $('#eErr').textContent = 'Add an end time.';
  if (f && f <= s) return $('#eErr').textContent = 'End must be after start.';
  if (s > Date.now()) return $('#eErr').textContent = 'Start can’t be in the future.';
  if ((f || 0) > Date.now() + MIN) return $('#eErr').textContent = 'End can’t be in the future.';
  if (f && f - s > 20 * H) return $('#eErr').textContent = 'That’s over 20 hours. Check the dates.';
  const data = { desc: $('#eDesc').value.trim(), catId: $('#eCat').value, start: s, end: isRunning ? null : f, focus: $('#eFocus').checked };
  if (editing) { Object.assign(editing, data); if (!isRunning) carve(s, f, editing.id); gSync(editing); }
  else {
    carve(s, f, null);
    const e = { id: uid(), ...data }; if (preset?.evId) { e.evId = preset.evId; S.evMap[(preset.desc || '').toLowerCase().trim()] = data.catId; }
    S.entries.push(e); gSync(e);
  }
  save(); $('#entryDlg').close(); renderAll(); toast(editing ? 'Entry updated' : 'Time added');
};
$('#eDel').onclick = () => {
  if (!editing || !confirm('Delete this entry?')) return;
  gDelete(editing); S.entries = S.entries.filter(e => e !== editing && !(editing.evId && e.marker && e.evId === editing.evId));
  save(); $('#entryDlg').close(); renderAll(); toast('Entry deleted');
};

/* ---------------- Insights ---------------- */
let range = 'week';
$('#range').onclick = e => { const b = e.target.closest('button'); if (!b) return; range = b.dataset.r; $$('#range button').forEach(x => x.classList.toggle('active', x === b)); renderReports(); };
function rangeBounds() {
  const today = sod(Date.now()), dow = (new Date(today).getDay() + 6) % 7;
  if (range === 'week') return [addDays(today, -dow), addDays(today, 7 - dow)];
  if (range === 'lastweek') return [addDays(today, -dow - 7), addDays(today, -dow)];
  if (range === 'month') { const d = new Date(today); d.setDate(1); const s = d.getTime(); d.setMonth(d.getMonth() + 1); return [s, d.getTime()]; }
  return [addDays(today, -29), addDays(today, 1)];
}
function switchesPerHour(a, b) {
  const es = S.entries.filter(e => !e.marker && overlap(e, a, b) > 0 && cat(e.catId).kind !== 'sleep').sort((x, y) => x.start - y.start);
  let sw = 0, t = 0;
  for (let i = 0; i < es.length; i++) { t += overlap(es[i], a, b); if (i && es[i].catId !== es[i - 1].catId && es[i].start - endOf(es[i - 1]) < 10 * MIN) sw++; }
  return t > H ? sw / (t / H) : null;
}
function planKept(a, b) {
  let planned = 0, kept = 0;
  for (let d = a; d < b; d = addDays(d, 1)) for (const ev of dayEvents(d)) {
    if (ev.allDay || ev.transp || ev.start >= Date.now() || sod(ev.start) !== d) continue;
    const s = ev.start, f = Math.min(ev.end, Date.now()); if (f <= s) continue;
    planned += f - s; const gc = guessCat(ev.title);
    for (const e of S.entries) if (!e.marker && (e.evId === ev.id || (gc && e.catId === gc))) kept += overlap(e, s, f);
  }
  return planned > 30 * MIN ? Math.min(1, kept / planned) : null;
}
async function renderReports() {
  const [a, b] = rangeBounds(), today = sod(Date.now());
  if (gReady()) { let missing = false; for (let t = a; t < Math.min(b, addDays(today, 1)); t = addDays(t, 1)) if (!G.events[ymd(t)]) missing = true; if (missing) gFetchRange(a, Math.min(b, addDays(today, 1))).then(() => { if ($('#tab-reports').classList.contains('active')) renderReports(); }); }
  const days = []; for (let t = a; t < b; t = addDays(t, 1)) days.push(t);
  const past = days.filter(t => t <= today), nd = past.length || 1;
  const m = byCat(a, b), total = sum(m), deep = deepTime(a, b);
  const sleepT = kindTime(a, b, 'sleep'), awakeT = total - sleepT;
  $('#rTotal').textContent = fmtHM(awakeT); $('#rAvg').textContent = `${fmtHM(awakeT / nd)}/day` + (sleepT ? ` · sleep ${fmtHM(sleepT / nd)}` : '');
  $('#rFocus').textContent = fmtHM(deep); $('#rFocusSub').textContent = `${fmtHM(deep / nd)} a day`;
  const sph = switchesPerHour(a, b); $('#rSwitch').textContent = sph == null ? '–' : sph.toFixed(1);
  const pk = planKept(a, b); $('#rPlan').textContent = pk == null ? '–' : Math.round(pk * 100) + '%';

  // bars
  const W = 700, HH = 240, pad = 30, n = days.length, bw = (W - pad) / n;
  const per = days.map(t => byCat(t, addDays(t, 1), e => cat(e.catId).kind !== 'sleep'));
  const maxH = Math.max(4, Math.ceil(Math.max(...per.map(sum)) / H));
  const yy = h => HH - 22 - (h / maxH) * (HH - 36);
  const step = maxH > 12 ? 4 : 2;
  let svg = '';
  for (let h = 0; h <= maxH; h += step) svg += `<line x1="${pad}" x2="${W}" y1="${yy(h)}" y2="${yy(h)}" stroke="var(--line)" stroke-dasharray="${h ? '3 4' : ''}"/><text x="0" y="${yy(h) + 4}">${h}h</text>`;
  per.forEach((mm, i) => {
    let acc = 0; const x = pad + i * bw + bw * .18, w = bw * .64;
    const order = S.cats.map(c => c.id).concat([null]);
    const segs = order.filter(id => mm.get(id));
    segs.forEach((id, j) => {
      const v = mm.get(id) / H, y1 = yy(acc + v), y0 = yy(acc), last = j === segs.length - 1;
      svg += `<rect x="${x}" y="${y1}" width="${w}" height="${Math.max(0, y0 - y1 - (last ? 0 : 1))}" rx="${last ? Math.min(5, w / 3) : 0}" fill="${cat(id).color}"><title>${new Date(days[i]).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${esc(cat(id).name)} ${fmtHM(v * H)}</title></rect>`;
      acc += v;
    });
    if (n <= 10 || i % Math.ceil(n / 10) === 0) svg += `<text x="${pad + i * bw + bw / 2}" y="${HH - 5}" text-anchor="middle" ${days[i] === today ? 'font-weight="700"' : ''}>${new Date(days[i]).toLocaleDateString('en-GB', n <= 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' })}</text>`;
  });
  $('#bars').innerHTML = svg;

  // table
  const rows = [...m.entries()].sort((p, q) => (cat(p[0]).kind === 'sleep') - (cat(q[0]).kind === 'sleep') || q[1] - p[1]);
  $('#rTable tbody').innerHTML = rows.length ? rows.map(([id, v]) => {
    const c = cat(id), avg = v / nd;
    let g = '<span class="muted">–</span>';
    if (c.goalType && c.goal) { const gm = c.goal * H, ok = c.goalType === 'min' ? avg >= gm : avg <= gm; g = `<span style="color:${ok ? 'var(--ok)' : 'var(--danger)'}">${ok ? '✓' : '✗'} ${fmtHM(avg)}/day</span>`; }
    return `<tr><td><span class="cn"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</span></td><td>${fmtHM(v)}</td><td>${Math.round(v / total * 100)}%</td><td>${g}</td></tr>`;
  }).join('') : '<tr><td colspan="4" class="muted">No time tracked in this range yet.</td></tr>';

  // activities
  const acts = new Map();
  for (const e of S.entries) { if (e.marker || cat(e.catId).kind === 'sleep') continue; const o = overlap(e, a, b); if (!o) continue; const k = (e.desc || '').trim() || `(${cat(e.catId).name})`; const key = k.toLowerCase() + '|' + e.catId; acts.set(key, { k, c: e.catId, v: (acts.get(key)?.v || 0) + o }); }
  const top = [...acts.values()].sort((p, q) => q.v - p.v).slice(0, 8);
  $('#rDesc tbody').innerHTML = top.length ? top.map(x => `<tr><td>${esc(x.k)}</td><td><span class="cn"><span class="dot" style="background:${cat(x.c).color}"></span>${esc(cat(x.c).name)}</span></td><td>${fmtHM(x.v)}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">Nothing yet.</td></tr>';

  const heat = renderHeat();
  renderInsights({ a, b, days, past, nd, m, total, deep, sph, pk, rows, heat });
}
function renderHeat() {
  const today = sod(Date.now()), a = addDays(today, -27), b = addDays(today, 1);
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const e of S.entries) {
    if (!isDeep(e) || overlap(e, a, b) <= 0) continue;
    const wgt = e.quality ? e.quality / 3 : 1;
    for (let t = Math.max(e.start, a); t < Math.min(endOf(e), b);) {
      const d = new Date(t), next = Math.min(endOf(e), b, new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime());
      grid[(d.getDay() + 6) % 7][d.getHours()] += (next - t) / MIN * wgt; t = next;
    }
  }
  const mx = Math.max(1, ...grid.flat());
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  $('#heat').innerHTML = grid.map((row, i) => `<span>${names[i]}</span>` + row.map((v, h) => `<i title="${names[i]} ${String(h).padStart(2, '0')}:00 · ${Math.round(v)} min" style="${v ? `background:color-mix(in srgb,var(--accent) ${Math.round(15 + 85 * v / mx)}%,var(--soft))` : ''}"></i>`).join('')).join('') + '<span></span><div class="hl"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>';
  const byHour = Array(24).fill(0); grid.forEach(r => r.forEach((v, h) => byHour[h] += v));
  let best = -1, bh = 0; for (let h = 0; h < 23; h++) { const v = byHour[h] + byHour[h + 1]; if (v > best) { best = v; bh = h; } }
  const totalMin = byHour.reduce((p, q) => p + q, 0);
  $('#heatNote').textContent = totalMin > 240 ? `Your strongest focus window: ${String(bh).padStart(2, '0')}:00–${String(bh + 2).padStart(2, '0')}:00. Protect it for your hardest work.` : 'Shows deep-work blocks (focus sessions, or work and study of 45 minutes or more). It fills in as you track.';
  return totalMin > 240 ? bh : null;
}
function renderInsights(x) {
  const L = [];
  if (!x.total) { $('#insight').innerHTML = '<h3>What stands out</h3><ul><li><span class="ic">🌱</span><span>Track for a few days and your patterns show up here: where the hours go, when you focus best, and what to change.</span></li></ul>'; return; }
  const top = x.rows.filter(([id]) => cat(id).kind !== 'sleep')[0];
  if (top) L.push(['📊', `<b>${esc(cat(top[0]).name)}</b> took the most waking time: ${fmtHM(top[1])} (${fmtHM(top[1] / x.nd)} a day).`]);
  if (x.sph != null) L.push(x.sph > 6 ? ['🔀', `You switched activity ${x.sph.toFixed(1)} times an hour. Each switch leaves “attention residue”; batch admin and messages into set blocks.`] : ['🔀', `Switching was low (${x.sph.toFixed(1)} an hour), which helps your focus.`]);
  const dpd = x.deep / x.nd;
  L.push(dpd < H ? ['🎯', `Deep work averaged ${fmtHM(dpd)} a day. Most people get about 1h 12m of uninterrupted time; one protected 50–90 minute block a day would beat that.`] : dpd > 4 * H ? ['🧠', `Deep work averaged ${fmtHM(dpd)} a day, above the roughly 4-hour ceiling where quality drops. Rest is part of the work.`] : ['🎯', `Deep work averaged ${fmtHM(dpd)} a day, a sustainable range.`]);
  if (x.heat != null) L.push(['⏰', `You focus best around ${String(x.heat).padStart(2, '0')}:00–${String(x.heat + 2).padStart(2, '0')}:00. Put your hardest task there and keep admin out of it.`]);
  const poor = x.past.filter(d => kindTime(d, addDays(d, 1), 'free') < 2 * H && sum(byCat(d, addDays(d, 1))) > 4 * H).length;
  if (poor >= 3) L.push(['🌿', `${poor} days had under 2 hours of free time. Wellbeing tends to dip below that, so protect evenings, or pay to save time on chores.`]);
  if (x.pk != null) L.push(x.pk < .7 ? ['📅', `You kept ${Math.round(x.pk * 100)}% of your calendar plan. Plan less than you think you can; people underestimate how long things take.`] : ['📅', `You kept ${Math.round(x.pk * 100)}% of your calendar plan. Your planning is realistic.`]);
  const sd = hm(S.settings.shutdown);
  let spill = 0; for (const d of x.past) { const wd = new Date(d).getDay(); const lim = wd === 0 || wd === 6 ? d : atMin(d, sd); let t = 0; for (const e of S.entries) if (cat(e.catId).kind === 'work') t += overlap(e, Math.max(lim, d), addDays(d, 1)); if (t > 15 * MIN) spill++; }
  if (spill >= 2) L.push(['🌙', `Work spilled past your ${S.settings.shutdown} shutdown or into the weekend on ${spill} days. Try a fixed shutdown routine: list loose ends, set tomorrow's first step, done.`]);
  const tracked = x.past.filter(d => S.entries.some(e => !e.marker && overlap(e, d, addDays(d, 1)) > 0)).length;
  const reviewed = x.past.filter(d => (S.notes[ymd(d)] || {}).rating).length;
  L.push(['🔥', `Tracked ${tracked} of ${x.past.length} days, reviewed ${reviewed}. ${reviewed >= Math.min(5, x.past.length) ? 'Great consistency.' : 'Regular reviews are what make tracking pay off.'}`]);
  const rated = x.past.map(d => (S.notes[ymd(d)] || {}).rating).filter(Boolean);
  if (rated.length >= 3) L.push(['😊', `Average day rating: ${(rated.reduce((p, q) => p + q, 0) / rated.length).toFixed(1)} out of 5.`]);
  const over = S.cats.filter(c => c.goalType === 'max' && c.goal && (x.m.get(c.id) || 0) / x.nd > c.goal * H);
  if (over.length) L.push(['⚠️', `Over your daily limit on average: ${over.map(c => esc(c.name)).join(', ')}.`]);
  $('#insight').innerHTML = '<h3>What stands out</h3><ul>' + L.map(([i, t]) => `<li><span class="ic">${i}</span><span>${t}</span></li>`).join('') + '</ul>';
}

/* ---------------- categories ---------------- */
let editCat = null;
const KINDS = { work: 'Work', growth: 'Growth & study', life: 'Life admin', free: 'Free time', sleep: 'Sleep' };
function renderCats() {
  $('#catList').innerHTML = S.cats.map((c, i) => `<li><span class="sw" style="background:${c.color}"></span><span class="n">${esc(c.name)}<small>${KINDS[c.kind] || ''}${c.goalType && c.goal ? ' · ' + (c.goalType === 'min' ? 'at least ' : 'at most ') + c.goal + 'h a day' : ''}</small></span>${i ? `<button class="sm ghost" data-up="${c.id}" aria-label="Move up">↑</button>` : ''}<button class="sm" data-id="${c.id}">Edit</button></li>`).join('');
}
$('#catList').onclick = e => {
  const up = e.target.closest('[data-up]');
  if (up) { const i = S.cats.findIndex(c => c.id === up.dataset.up); [S.cats[i - 1], S.cats[i]] = [S.cats[i], S.cats[i - 1]]; save(); renderAll(); return; }
  const b = e.target.closest('button[data-id]'); if (b) openCat(b.dataset.id);
};
$('#addCat').onclick = () => openCat(null);
function openCat(id) {
  editCat = id ? S.cats.find(c => c.id === id) : null;
  $('#catTitle').textContent = editCat ? 'Edit category' : 'New category';
  $('#cName').value = editCat?.name || '';
  $('#cColor').value = editCat?.color || '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  $('#cKind').value = editCat?.kind || 'work';
  $('#cGoalType').value = editCat?.goalType || '';
  $('#cGoal').value = editCat?.goal || '';
  $('#cKeys').value = editCat?.keys || '';
  $('#cDel').hidden = !editCat;
  $('#catDlg').showModal();
}
$('#cSave').onclick = () => {
  const name = $('#cName').value.trim(); if (!name) return $('#cName').focus();
  const d = { name, color: $('#cColor').value, kind: $('#cKind').value, goalType: $('#cGoalType').value, goal: +$('#cGoal').value || 0, keys: $('#cKeys').value.trim() };
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

/* ---------------- settings ---------------- */
function renderSettings() {
  $('#focusLen').value = String(S.settings.focusLen);
  $('#notifyOn').checked = !!S.settings.notify;
  $('#wake').value = S.settings.wake; $('#bed').value = S.settings.bed; $('#shutdown').value = S.settings.shutdown;
}
$('#focusLen').onchange = e => { S.settings.focusLen = +e.target.value; save(); tick(); };
$('#notifyOn').onchange = e => { S.settings.notify = e.target.checked; save(); if (e.target.checked) { if (!('Notification' in window)) toast('This browser doesn’t support notifications'); else Notification.requestPermission(); } };
for (const k of ['wake', 'bed', 'shutdown']) $('#' + k).onchange = e => { if (e.target.value) S.settings[k] = e.target.value; save(); renderDay(); };
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
$('#expJson').onclick = () => download(`division-of-time-${ymd(Date.now())}.json`, JSON.stringify(S, null, 1), 'application/json');
$('#expCsv').onclick = () => {
  const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['Date', 'Start', 'End', 'Minutes', 'Category', 'Type', 'Description', 'Focus', 'Quality']].concat(
    S.entries.filter(e => !e.marker).sort((a, b) => a.start - b.start).map(e => [ymd(e.start), fmtTime(e.start), e.end ? fmtTime(e.end) : '', Math.round((endOf(e) - e.start) / MIN), cat(e.catId).name, KINDS[cat(e.catId).kind] || '', e.desc, e.focus ? 'yes' : '', e.quality || '']));
  download(`division-of-time-${ymd(Date.now())}.csv`, rows.map(r => r.map(q).join(',')).join('\n'), 'text/csv');
};
$('#impJson').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const s = JSON.parse(await f.text()); if (!s.cats || !s.entries) throw 0; if (!confirm('Replace all current data with this backup?')) return; S = fix(s); save(); renderAll(); toast('Backup imported'); }
  catch (err) { alert('That file is not a Division of Time backup.'); }
  e.target.value = '';
};
$('#wipe').onclick = () => { if (confirm('Delete every entry, category and note on this device? This cannot be undone.')) { localStorage.removeItem(KEY); S = load(); selCat = S.cats[0].id; save(); renderAll(); } };

/* ---------------- tabs + keys ---------------- */
function switchTab(name) {
  $$('.tabs button').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
  $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  if (name === 'reports') renderReports();
  if (name === 'today') { scrolledFor = null; renderDay(); }
}
$$('.tabs button').forEach(b => b.onclick = () => switchTab(b.dataset.tab));
document.addEventListener('keydown', e => {
  if (e.target.matches('input,textarea,select') || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  if (e.key === 's') { running() ? stop() : start(); }
  else if (e.key === 'f') $('#focusBtn').click();
  else if (e.key === 'n') { e.preventDefault(); $('#desc').focus(); }
  else if (/^[1-9]$/.test(e.key) && S.cats[+e.key - 1]) { const id = S.cats[+e.key - 1].id; const r = running(); if (r && r.catId === id) stop(); else { $('#desc').value = ''; start(id, ''); } }
});

function renderAll() { renderTracker(); renderG(); renderDay(); renderCats(); renderSettings(); if ($('#tab-reports').classList.contains('active')) renderReports(); tick(); }
renderAll();
guard();
let lastToday = sod(Date.now());
setInterval(() => {
  tick();
  const r = running();
  if (r) { const el = document.querySelector(`[data-live="${r.id}"]`); if (el) el.textContent = fmtHM(Date.now() - r.start); }
  const t = sod(Date.now());
  if (t !== lastToday) { if (viewDay === lastToday) viewDay = t; lastToday = t; renderAll(); }
}, 1000);
setInterval(() => { save(); if ($('#tab-today').classList.contains('active')) renderDay(); }, 60000);
addEventListener('storage', e => { if (e.key === KEY) { S = load(); renderAll(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { guard(); renderAll(); } else { S.settings.lastSeen = Date.now(); save(); } });
addEventListener('pagehide', () => { S.settings.lastSeen = Date.now(); save(); });
if (gReady()) { gLoadCals().then(() => { gFlush(); renderAll(); }); }
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
// test hook
window.__dot = { get S() { return S; }, G, renderAll, start, stop, switchTab, guard };
})();
