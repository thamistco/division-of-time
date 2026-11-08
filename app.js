/* Division of Time v5
   A personal time tracker for a GP trainee and parent: plan vs actual with Google Calendar,
   training-week targets, focus sessions, shutdown and weekly reviews.
   Entries live in localStorage on this device; the Google token (1 hour) is kept locally. */
(() => {
'use strict';
const KEY = 'dot.v1', TKEY = 'dot.gtok', VERSION = 5;
const CFG = window.DOT_CONFIG || {};
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const H = 3600000, MIN = 60000, DAY = 24 * H;
const HOURPX = 52;

/* ---------------- palette (light / dark tones, see research-design.md) ---------------- */
const PAL = [
  // v5: colour carries meaning. Work is cool (blues, steel), learning is violet, family is warm, health is green,
  // life admin is earthy, sleep is night. OKLCH with matched lightness and chroma, so no hue shouts; every tone is
  // at least 3:1 on its surfaces (WCAG 1.4.11). Light tone first, dark-theme tone second.
  ['Blue', '#0D6ABB', '#66A9F2'], ['Navy', '#364493', '#7B8DD6'], ['Steel', '#347285', '#80B4C5'], ['Teal', '#027C7C', '#74C1C0'],
  ['Violet', '#724AAB', '#B191E8'], ['Iris', '#7777C0', '#B5B6F9'], ['Orchid', '#8B4E8F', '#CC94CE'], ['Rose', '#B64466', '#ED87A0'],
  ['Terracotta', '#B9562C', '#ED9471'], ['Ochre', '#A36E09', '#E4B471'], ['Green', '#1A8656', '#76C598'], ['Sage', '#677E49', '#ABC092'],
  ['Taupe', '#796456', '#B4A093'], ['Night', '#333D50', '#5E697E']
];
const isDark = () => document.documentElement.dataset.theme === 'dark';
function colour(c) {
  const hex = (c && c.color || '#796456').toUpperCase();
  const p = PAL.find(x => x[1] === hex || x[2] === hex);
  return p ? (isDark() ? p[2] : p[1]) : hex;
}

/* ---------------- state ---------------- */
const KINDS = { clinical: 'Clinical', admin: 'Admin', learning: 'Learning & exams', family: 'Family', free: 'Free time & health', life: 'Life admin', sleep: 'Sleep' };
const FREEK = ['family', 'free'], WORKK = ['clinical', 'admin'];
const P = name => PAL.find(p => p[0] === name)[1];
const GP_SET = [
  ['Surgery & clinics', 'Blue', 'clinical', '', 0, 'day', 'surgery, clinic, patient, home visit, duty, triage, on call, ward'],
  ['Results & letters', 'Steel', 'admin', 'max', 1.5, 'day', 'results, letters, admin, prescriptions, docman, email, paperwork'],
  ['Out of hours', 'Navy', 'clinical', 'min', 4, 'month', 'ooh, out of hours, urgent care, 111, extended access'],
  ['Tutorial & teaching', 'Violet', 'learning', 'min', 2, 'week', 'tutorial, teaching, hdr, half day release, vts, debrief, balint'],
  ['Self-study & exams', 'Iris', 'learning', 'min', 4, 'week', 'study, revision, akt, sca, exam, course, webinar, cpd, mock', true],
  ['ePortfolio', 'Orchid', 'learning', '', 0, 'week', 'eportfolio, portfolio, ccr, learning log, cot, cbd, msf, arcp'],
  ['Side projects', 'Rose', 'learning', '', 0, 'week', 'qaaf, coding, project, build, app', true],
  ['Family time', 'Terracotta', 'family', 'min', 2, 'day', 'family, sam, alex, park, nursery, playgroup, birthday, dinner'],
  ['Exercise & walking', 'Green', 'free', 'min', 0.5, 'day', 'gym, run, walk, swim, yoga, football, workout'],
  ['Rest & leisure', 'Sage', 'free', '', 0, 'day', 'tv, film, read, relax, friends, mosque, prayer'],
  ['Chores & errands', 'Ochre', 'life', '', 0, 'day', 'shopping, groceries, cleaning, laundry, garage, appointment, errand'],
  ['Phone & social media', 'Taupe', 'life', 'max', 1, 'day', 'social, youtube, instagram, scrolling'],
  ['Sleep', 'Night', 'sleep', 'min', 7, 'day', 'sleep, nap']
];
const mkCat = ([name, col, kind, goalType, goal, period, keys, project]) => ({ id: uid(), name, color: col.startsWith('#') ? col : P(col), kind, goalType, goal, period, keys, project: !!project });

let S = load();
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.cats) return fix(s); } catch (e) {}
  return fix({ cats: GP_SET.map(mkCat), entries: [], notes: {}, settings: { v: VERSION } });
}
function fix(s) {
  s.entries ||= []; s.notes ||= {}; s.weeks ||= {}; s.evMap ||= {}; s.gq ||= [];
  s.g = Object.assign({ on: false, show: ['primary'], write: false, writeCal: 'primary', cals: [] }, s.g || {});
  s.settings = Object.assign({ focusLen: 50, notify: false, haptics: true, wake: '07:00', bed: '23:00', shutdown: '18:30', theme: 'system', weekStart: 1, ifThen: true, ifThenText: '', dismissed: {}, ltft: 100, examName: '', examDate: '', lastCat: null, lastSeen: Date.now() }, s.settings || {});
  const v = s.settings.v || (s.settings.v2 ? 2 : 1);
  if (v < 3) {
    // v1/v2 → v3: richer types, goal periods, new palette, GP trainee names for the old defaults
    const RENAME = { 'Clinical work': ['Surgery & clinics', 'Blue', 'clinical'], 'Admin & paperwork': ['Results & letters', 'Steel', 'admin'], 'Study & exams': ['Self-study & exams', 'Iris', 'learning'],
      'Side projects': [null, 'Rose', 'learning'], 'Family time': [null, 'Terracotta', 'family'], 'Exercise & walking': [null, 'Green', 'free'], 'Chores & errands': [null, 'Ochre', 'life'],
      'Rest & leisure': [null, 'Sage', 'free'], 'Phone & social media': [null, 'Taupe', 'life'], 'Sleep': [null, 'Night', 'sleep'] };
    for (const c of s.cats) {
      const r = RENAME[c.name];
      if (r) { const t = GP_SET.find(g => g[0] === (r[0] || c.name)); c.name = r[0] || c.name; c.color = r[1].startsWith('#') ? r[1] : P(r[1]); c.kind = r[2]; if (t) { c.keys = t[6]; if (!c.goalType) { c.goalType = t[3]; c.goal = t[4]; } c.period = t[5]; } }
      else c.kind = { work: 'clinical', growth: 'learning' }[c.kind] || c.kind || 'clinical';
      c.period ||= 'day'; c.keys ??= '';
    }
    let at = s.cats.findIndex(c => c.name === 'Results & letters') + 1 || Math.min(2, s.cats.length);
    for (const t of GP_SET) if (['Out of hours', 'Tutorial & teaching', 'ePortfolio'].includes(t[0]) && !s.cats.some(c => c.name === t[0])) s.cats.splice(at++, 0, mkCat(t));
  }
  if (v < 4) {
    // v4: active projects (cap of three) and paused categories
    for (const c of s.cats) if (['Side projects', 'Self-study & exams'].includes(c.name)) c.project = true;
  }
  if (v < 5) {
    // v5 palette: defaults take their family colour; custom categories move from the old swatch to its nearest new one
    const OLD = { '#2563EB': 'Blue', '#C26A00': 'Terracotta', '#00876A': 'Teal', '#BE3A8C': 'Rose', '#0A85C2': 'Iris', '#8F6243': 'Steel', '#3D8B37': 'Green', '#D1402B': 'Rose',
      '#9A7F00': 'Ochre', '#7C4DDB': 'Violet', '#4F5BD5': 'Navy', '#475569': 'Taupe', '#334155': 'Night', '#64748B': 'Taupe' };
    for (const c of s.cats) {
      const t = GP_SET.find(g => g[0] === c.name), o = OLD[(c.color || '').toUpperCase()];
      if (t) c.color = P(t[1]); else if (o) c.color = P(o);
    }
  }
  s.settings.v = VERSION;
  for (const c of s.cats) { c.period ||= 'day'; c.kind ||= 'clinical'; c.keys ??= ''; }
  return s;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); nativeSync(); } catch (e) { toast('Storage is full. Export a backup.'); } }
/* ---------------- Android app bridge (only present inside the Division of Time Android app) ---------------- */
var NATIVE = window.DotNative || null;
const shortName = n => n.split(/ & | and /)[0].trim();
function widgetCats() {
  const ok = id => S.cats.some(c => c.id === id && !c.paused);
  const chosen = (S.settings.widgetCats || []).filter(ok);
  if (chosen.length) return chosen.slice(0, 4);
  const since = Date.now() - 14 * 864e5;
  return S.cats.filter(c => !c.paused && c.kind !== 'sleep').map(c => [c.id, catTime(since, Date.now(), c.id)]).sort((x, y) => y[1] - x[1]).slice(0, 4).map(x => x[0]);
}
let nativeT;
function nativeSync() {
  if (!NATIVE) return;
  clearTimeout(nativeT);
  nativeT = setTimeout(() => {
    try {
      const r = S.entries.find(e => e.end === null), c = r && S.cats.find(k => k.id === r.catId);
      NATIVE.sync(JSON.stringify({
        running: r && c ? { catId: r.catId, name: r.desc || c.name, color: colour(c), start: r.start } : null,
        cats: widgetCats().map(id => { const k = S.cats.find(x => x.id === id); return { id, name: k.name, short: shortName(k.name), color: colour(k) }; })
      }));
    } catch (e) {}
  }, 150);
}
// Apply taps made on the home-screen widget while the app was closed, at the time they were tapped.
window.__dotNativePending = () => {
  if (!NATIVE) return;
  let acts = []; try { acts = JSON.parse(NATIVE.takePending() || '[]'); } catch (e) {}
  if (!acts.length) { nativeSync(); return; }
  for (const a of acts) {
    const r = S.entries.find(e => e.end === null);
    if (r) { r.end = Math.max(r.start, a.at); if (r.end - r.start < 15000) S.entries = S.entries.filter(e => e !== r); else gSync(r); }
    if (a.t === 'start' && S.cats.some(c => c.id === a.cat)) { S.entries.push({ id: uid(), catId: a.cat, desc: '', start: a.at, end: null }); S.settings.lastCat = a.cat; }
  }
  save(); renderAll();
};

/* ---------------- helpers ---------------- */
const NOCAT = { name: 'Uncategorised', color: '#796456', id: null, kind: 'life' };
const cat = id => S.cats.find(c => c.id === id) || NOCAT;
const kindOf = e => cat(e.catId).kind;
const running = () => S.entries.find(e => e.end == null);
const sod = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const addDays = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
const monday = t => addDays(sod(t), -((new Date(t).getDay() - (S.settings.weekStart == null ? 1 : +S.settings.weekStart) + 7) % 7)); // start of the user's week (Monday by default)
const live = () => S.cats.filter(c => !c.paused);
const monthStart = t => { const d = new Date(sod(t)); d.setDate(1); return d.getTime(); };
const monthEnd = t => { const d = new Date(monthStart(t)); d.setMonth(d.getMonth() + 1); return d.getTime(); };
const ymd = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const hm = s => { const [h, m] = (s || '0:0').split(':').map(Number); return h * 60 + m; };
const atMin = (day, m) => day + m * MIN;
function fmtHM(ms) { const m = Math.round(Math.max(0, ms) / MIN); const h = Math.floor(m / 60); return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`; }
const fmtH = ms => { const h = ms / H; return (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10) + 'h'; };
function fmtClock(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
const fmtTime = t => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const fmtDay = (t, o) => new Date(t).toLocaleDateString('en-GB', o || { weekday: 'long', day: 'numeric', month: 'long' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toLocalInput = t => new Date(t - new Date(t).getTimezoneOffset() * MIN).toISOString().slice(0, 16);
const fromLocalInput = v => v ? new Date(v).getTime() : null;
const endOf = e => e.end ?? Date.now();
const real = e => !e.marker;
const ltft = () => (+S.settings.ltft || 100) / 100;
function overlap(e, a, b) { return Math.max(0, Math.min(endOf(e), b) - Math.max(e.start, a)); }
function byCat(a, b, filter) { const m = new Map(); for (const e of S.entries) { if (!real(e) || (filter && !filter(e))) continue; const o = overlap(e, a, b); if (o) m.set(e.catId, (m.get(e.catId) || 0) + o); } return m; }
const sum = m => { let t = 0; for (const v of m.values()) t += v; return t; };
const isDeep = e => real(e) && (e.focus || (kindOf(e) === 'learning' && endOf(e) - e.start >= 45 * MIN));
function kindTime(a, b, kinds) { const ks = [].concat(kinds); let t = 0; for (const e of S.entries) if (real(e) && ks.includes(kindOf(e))) t += overlap(e, a, b); return t; }
function catTime(a, b, id) { let t = 0; for (const e of S.entries) if (real(e) && e.catId === id) t += overlap(e, a, b); return t; }
function deepTime(a, b) { let t = 0; for (const e of S.entries) if (isDeep(e)) t += overlap(e, a, b); return t; }
function waking(day) {
  let a = hm(S.settings.wake), b = hm(S.settings.bed); if (b <= a) b += 1440;
  const st = atMin(day, a), en = Math.min(atMin(day, b), Date.now());
  return { st, en: Math.max(st, en), fullEnd: atMin(day, b) };
}
function freeSlots(a, b, ignoreId) {
  const iv = S.entries.filter(e => e.id !== ignoreId && real(e) && overlap(e, a, b) > 0).map(e => [Math.max(e.start, a), Math.min(endOf(e), b)]).sort((x, y) => x[0] - y[0]);
  const out = []; let cur = a;
  for (const [s, f] of iv) { if (s > cur) out.push([cur, s]); cur = Math.max(cur, f); }
  if (cur < b) out.push([cur, b]);
  return out;
}
function carve(s, f, keepId) {
  const add = [];
  S.entries = S.entries.filter(e => {
    if (e.id === keepId || e.end == null || !real(e) || e.end <= s || e.start >= f) return true;
    if (e.start >= s && e.end <= f) { gDelete(e); return false; }
    if (e.start < s && e.end > f) { const tail = { ...e, id: uid(), start: f, gid: null }; e.end = s; add.push(tail); gSync(e); gSync(tail); return true; }
    if (e.start < s) e.end = s; else e.start = f;
    gSync(e); return true;
  });
  S.entries.push(...add);
}
const buzz = p => { if (S.settings.haptics && navigator.vibrate) try { navigator.vibrate(p); } catch (e) {} };
const announce = t => { $('#live').textContent = t; };

/* ---------------- toast with undo ---------------- */
let toastT;
function toast(msg, undo) {
  const t = $('#toast'), b = $('#toastBtn');
  $('#toastTxt').textContent = msg;
  b.hidden = !undo; b.onclick = () => { undo(); t.classList.remove('show'); };
  t.classList.add('show'); clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), undo ? 5000 : 2600);
}
function snapshot() { return JSON.stringify({ entries: S.entries, cats: S.cats }); }
function restore(snap) { const o = JSON.parse(snap); S.entries = o.entries; S.cats = o.cats; save(); renderAll(); }

/* ---------------- theme ---------------- */
function applyTheme() {
  let t = S.settings.theme || 'system';
  if (t === 'system') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  $('#themeColor').content = t === 'dark' ? '#0F0F12' : '#F5F4F0';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (S.settings.theme === 'system') { applyTheme(); renderAll(); } });

/* ---------------- timer ---------------- */
let selCat = S.settings.lastCat && S.cats.some(c => c.id === S.settings.lastCat) ? S.settings.lastCat : (S.cats[0]?.id ?? null);
function start(catId = selCat, desc = $('#desc').value.trim(), focusMin = 0, ifThen = '') {
  stop(true);
  const now = Date.now();
  const e = { id: uid(), catId, desc, start: now, end: null };
  if (focusMin) { e.focus = true; e.focusEnd = now + focusMin * MIN; if (ifThen) e.ifThen = ifThen; }
  S.entries.push(e);
  selCat = catId; S.settings.lastCat = catId; S.settings.guardAck = null; S.settings.focusDone = false;
  save(); buzz(10); announce(`Started ${cat(catId).name}`); renderAll();
}
function stop(silent, at) {
  const r = running(); if (!r) return;
  r.end = Math.min(at || Date.now(), Date.now());
  if (r.end - r.start < 15000) { S.entries = S.entries.filter(e => e !== r); save(); if (!silent) { $('#desc').value = ''; renderAll(); } return; }
  gSync(r); save();
  if (!silent) { buzz([10, 30, 10]); announce(`Stopped ${cat(r.catId).name}, ${fmtHM(r.end - r.start)}`); $('#desc').value = ''; renderAll(); }
  if (r.focus && r.end - r.start >= 5 * MIN) askFocusQuality(r);
}
$('#startBtn').onclick = () => running() ? stop() : start();
$('#focusBtn').onclick = () => {
  const r = running();
  if (r && r.focus) { stop(); return; }
  if (S.settings.ifThen) { openFocusStart(); return; }
  beginFocus(r ? r.catId : selCat, $('#desc').value.trim() || (r ? r.desc : ''), +S.settings.focusLen, '');
};
function beginFocus(catId, desc, len, ifThen) {
  askNotify(); $('#desc').value = desc; start(catId, desc, len, ifThen);
  toast(`Focus for ${len} minutes. Phone face down, inbox closed.`);
}
// implementation intention before a focus block (Gollwitzer & Sheeran 2006)
let fsLen = 50;
function openFocusStart() {
  const r = running();
  $('#fsDesc').value = $('#desc').value.trim() || (r ? r.desc || '' : '');
  $('#fsCat').innerHTML = live().map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('#fsCat').value = r ? r.catId : selCat;
  fsLen = +S.settings.focusLen; $$('#fsLen button').forEach(b => b.classList.toggle('active', +b.dataset.m === fsLen));
  $('#fsIf').value = S.settings.ifThenText || '';
  $('#focusStart').showModal(); setTimeout(() => $('#fsDesc').focus(), 50);
}
$('#fsLen').onclick = e => { const b = e.target.closest('button'); if (!b) return; fsLen = +b.dataset.m; $$('#fsLen button').forEach(x => x.classList.toggle('active', x === b)); };
$('#fsGo').onclick = () => {
  const it = $('#fsIf').value.trim() || $('#fsIf').placeholder;
  S.settings.ifThenText = $('#fsIf').value.trim(); S.settings.focusLen = fsLen;
  $('#focusStart').close(); beginFocus($('#fsCat').value, $('#fsDesc').value.trim(), fsLen, it);
};
$('#focusStart').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); $('#fsGo').click(); } });
$('#desc').addEventListener('keydown', e => {
  if (e.key === 'Escape') { $('#desc').blur(); return; }
  if (e.key !== 'Enter') return;
  const r = running();
  if (r) { r.desc = $('#desc').value.trim(); gSync(r); save(); renderAll(); $('#desc').blur(); toast('Description updated'); } else start();
});
$('#desc').addEventListener('change', () => { const r = running(); if (r) { r.desc = $('#desc').value.trim(); save(); renderDay(); } });
$('#catBtn').onclick = () => openCatPop($('#catBtn'), id => {
  selCat = id; S.settings.lastCat = id;
  const r = running(); if (r) r.catId = id;
  save(); renderAll();
});
function openCatPop(anchor, onPick) {
  const pop = $('#catPop'), list = $('#catPopList');
  list.innerHTML = S.cats.map(c => `<button data-id="${c.id}" role="option"><span class="dot" style="background:${colour(c)}"></span>${esc(c.name)}</button>`).join('');
  pop.hidden = false;
  const r = anchor.getBoundingClientRect();
  list.style.top = Math.min(r.bottom + 6, innerHeight - Math.min(list.scrollHeight, innerHeight * .6) - 8) + 'px';
  list.style.left = Math.max(8, Math.min(r.left, innerWidth - 256)) + 'px';
  list.querySelector('button')?.focus();
  pop.onclick = e => { const b = e.target.closest('button[data-id]'); pop.hidden = true; if (b) onPick(b.dataset.id); };
  pop.onkeydown = e => {
    if (e.key === 'Escape') pop.hidden = true;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const bs = [...list.querySelectorAll('button')]; const i = bs.indexOf(document.activeElement); bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus(); }
  };
}

/* ---------------- focus quality + next step ---------------- */
let fqEntry = null;
function askFocusQuality(e) {
  fqEntry = e;
  $('#focusDlgTxt').textContent = `${fmtHM(e.end - e.start)} on ${e.desc || cat(e.catId).name}. 1 is scattered, 5 is fully absorbed.`;
  $('#fq').innerHTML = [1, 2, 3, 4, 5].map(i => `<button data-q="${i}" class="${e.quality === i ? 'on' : ''}" aria-label="${i} out of 5">${i}</button>`).join('');
  $('#fNext').value = e.next || '';
  $('#focusDlg').showModal();
}
$('#fq').onclick = ev => { const b = ev.target.closest('button'); if (b) $$('#fq button').forEach(x => x.classList.toggle('on', x === b)); };
$('#fSave').onclick = () => {
  const q = $('#fq .on'); if (fqEntry) { if (q) fqEntry.quality = +q.dataset.q; fqEntry.next = $('#fNext').value.trim(); save(); }
  $('#focusDlg').close(); renderAll();
};
$('#fSkip').onclick = () => $('#focusDlg').close();

/* ---------------- forgotten-timer guard ---------------- */
['pointerdown', 'keydown', 'scroll'].forEach(ev => addEventListener(ev, () => { S.settings.lastSeen = Date.now(); }, { passive: true }));
function guard() {
  const r = running(); if (!r || S.settings.guardAck === r.id) return;
  const dur = Date.now() - r.start, away = Date.now() - (S.settings.lastSeen || Date.now());
  if (dur < 3 * H && !(away > 90 * MIN && dur > 90 * MIN)) return;
  const ls = Math.max(r.start + MIN, S.settings.lastSeen || r.start);
  $('#guardTxt').textContent = `${cat(r.catId).name} has been running for ${fmtHM(dur)}.` + (away > 20 * MIN ? ` You were last here at ${fmtTime(ls)}.` : '');
  $('#gStopSeen').textContent = `Stop it at ${fmtTime(ls)}`;
  $('#gStopSeen').hidden = !(away > 20 * MIN);
  $('#gStopSeen').onclick = () => { $('#guardDlg').close(); stop(false, ls); toast(`Stopped at ${fmtTime(ls)}`); };
  if (!$('#guardDlg').open) $('#guardDlg').showModal();
}
$('#gKeep').onclick = () => { const r = running(); if (r) S.settings.guardAck = r.id; save(); $('#guardDlg').close(); };
$('#gStopNow').onclick = () => { $('#guardDlg').close(); stop(); };
$('#gDiscard').onclick = () => { const snap = snapshot(); const r = running(); if (r) { S.entries = S.entries.filter(e => e !== r); save(); } $('#guardDlg').close(); renderAll(); toast('Timer discarded', () => restore(snap)); };

/* ---------------- notifications ---------------- */
function askNotify() { if (S.settings.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }
function notify(msg) {
  if (S.settings.notify && 'Notification' in window && Notification.permission === 'granted') { try { new Notification('Division of Time', { body: msg, icon: 'icon-192.png', tag: 'dot' }); } catch (e) {} }
  toast(msg);
}
let warned3h = null, idleWarned = 0;

/* ---------------- tick ---------------- */
const PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg>', STOP = '<svg viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/></svg>';
function tick() {
  const r = running(), el = $('#elapsed'), btn = $('#startBtn'), fb = $('#focusBar'), hint = $('#heroHint'), hero = $('#hero');
  if (r) {
    const ms = Date.now() - r.start, c = cat(r.catId);
    el.textContent = fmtClock(ms);
    hero.classList.add('running'); hero.style.setProperty('--run', colour(c));
    if (btn.dataset.r !== '1') { btn.innerHTML = STOP; btn.dataset.r = '1'; btn.classList.add('running'); btn.setAttribute('aria-label', 'Stop timer'); }
    document.title = `${fmtClock(ms)} · ${r.desc || c.name}`;
    if (r.focus && r.focusEnd) {
      const total = r.focusEnd - r.start, left = r.focusEnd - Date.now();
      fb.hidden = false; fb.firstElementChild.style.width = Math.min(100, (1 - left / total) * 100) + '%';
      hint.textContent = left > 0 ? `Focus · ${fmtClock(left)} left` : 'Focus session done. Take a 5–10 minute break.';
      if (left <= 0 && !S.settings.focusDone) { S.settings.focusDone = true; save(); buzz([20, 60, 20]); notify('Focus session complete. Stand up, stretch, look out of a window.'); }
    } else { fb.hidden = true; hint.textContent = `${c.name} · since ${fmtTime(r.start)}`; }
    $('#focusBtn').classList.toggle('on', !!r.focus);
    $('#focusLbl').textContent = r.focus ? 'End focus' : `Focus ${S.settings.focusLen}`;
    if (ms > 3 * H && warned3h !== r.id) { warned3h = r.id; notify(`${c.name} has been running over 3 hours. Still going?`); }
  } else {
    el.textContent = '0:00:00'; hero.classList.remove('running');
    if (btn.dataset.r !== '0') { btn.innerHTML = PLAY; btn.dataset.r = '0'; btn.classList.remove('running'); btn.setAttribute('aria-label', 'Start timer'); }
    document.title = 'Division of Time'; fb.hidden = true;
    $('#focusBtn').classList.remove('on'); $('#focusLbl').textContent = `Focus ${S.settings.focusLen}`;
    const last = lastStopped();
    hint.textContent = last && Date.now() - last.end < 12 * H ? `Not tracking · stopped at ${fmtTime(last.end)}` : 'Tap a category to start';
    const w = waking(sod(Date.now())), since = last ? Date.now() - last.end : Infinity;
    if (S.settings.notify && Date.now() > w.st && Date.now() < w.fullEnd && since > 30 * MIN && Date.now() - idleWarned > 60 * MIN && !document.hidden) { idleWarned = Date.now(); notify('Nothing tracked for 30 minutes. What are you doing?'); }
  }
}
let lastStoppedCache = null;
function lastStopped() { if (!lastStoppedCache) lastStoppedCache = [...S.entries].filter(e => e.end && real(e)).sort((a, b) => b.end - a.end)[0] || 0; return lastStoppedCache || null; }

/* ---------------- tracker + chips ---------------- */
function renderTracker() {
  lastStoppedCache = null;
  const r = running(), c = cat(r ? r.catId : selCat);
  $('#catBtn .dot').style.background = colour(c);
  $('#catBtn .lbl').textContent = c.name;
  if (document.activeElement !== $('#desc') && r) $('#desc').value = r.desc || '';
  $('#quick').innerHTML = live().map((k, i) => `<button class="chip ${r && r.catId === k.id ? 'on' : ''}" style="--c:${colour(k)}" data-id="${k.id}" title="${r && r.catId === k.id ? 'Stop' : 'Start'} ${esc(k.name)}${i < 9 ? ' · ' + (i + 1) : ''}" aria-pressed="${!!(r && r.catId === k.id)}"><span class="dot" style="background:${colour(k)}"></span>${esc(k.name)}${k.project ? '<span class="proj" title="Active project">★</span>' : ''}</button>`).join('') + '<button class="chip ghost manage" id="manageCats" title="Edit categories">Edit</button>';
  const prev = [...S.entries].filter(e => e.catId === c.id && e.next && e.end).sort((a, b) => b.end - a.end)[0];
  const ns = $('#nextStep');
  if (r && r.focus && r.ifThen) { ns.hidden = false; ns.textContent = `If distracted: ${r.ifThen}`; }
  else if (prev && Date.now() - prev.end < 7 * DAY) { ns.hidden = false; ns.textContent = `↪ Last time you left off: ${prev.next}`; } else ns.hidden = true;
  $('#dateLine').textContent = fmtDay(Date.now());
  // exam countdown
  const ep = $('#examPill');
  if (S.settings.examDate) {
    const d = Math.round((sod(new Date(S.settings.examDate + 'T00:00').getTime()) - sod(Date.now())) / DAY);
    ep.hidden = d < 0; ep.innerHTML = d === 0 ? `${esc(S.settings.examName || 'Exam')} <b>today</b>` : `${esc(S.settings.examName || 'Exam')} in <b>${d}</b> day${d === 1 ? '' : 's'}`;
    const wk = kindTime(monday(Date.now()), addDays(monday(Date.now()), 7), 'learning');
    ep.title = `${fmtHM(wk)} of learning this week`;
  } else ep.hidden = true;
}
$('#quick').onclick = e => {
  if (e.target.closest('#manageCats')) { switchTab('categories'); return; }
  const b = e.target.closest('.chip'); if (!b) return;
  const r = running();
  if (r && r.catId === b.dataset.id) { stop(); return; }
  $('#desc').value = ''; start(b.dataset.id, '');
};

/* ---------------- Google Calendar ---------------- */
const G = { token: null, exp: 0, events: {}, pending: {}, tried: {}, err: null };
try { const t = JSON.parse(localStorage.getItem(TKEY)); if (t && t.exp > Date.now() + MIN) { G.token = t.t; G.exp = t.exp; } } catch (e) {}
const gReady = () => !!G.token && G.exp > Date.now() + 30000;
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events';
let gisP = null;
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return gisP ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = res; s.onerror = () => { gisP = null; rej(new Error('Couldn’t load Google sign-in. Check your connection.')); }; document.head.appendChild(s); });
}
async function gConnect() {
  if (!CFG.googleClientId) { toast('Google Calendar isn’t configured.'); return; }
  if (NATIVE) { NATIVE.googleAuth(SCOPES, false); return; }
  try { await loadGis(); } catch (e) { toast(e.message); return; }
  google.accounts.oauth2.initTokenClient({
    client_id: CFG.googleClientId, scope: SCOPES, prompt: S.g.on ? '' : 'consent', login_hint: S.g.email || undefined,
    callback: async resp => {
      if (resp.error) { toast('Google sign-in was cancelled'); return; }
      G.token = resp.access_token; G.exp = Date.now() + (resp.expires_in || 3600) * 1000; G.err = null;
      localStorage.setItem(TKEY, JSON.stringify({ t: G.token, exp: G.exp }));
      S.g.on = true; save(); G.events = {}; G.tried = {};
      await gLoadCals(); await gFlush();
      toast('Google Calendar connected'); renderAll();
    },
    error_callback: () => toast('The Google window was closed')
  }).requestAccessToken();
}
window.__dotGoogleToken = async (t, secs, err) => {
  if (!t) { if (err && err !== 'needs-consent') toast('Google sign-in didn’t finish'); renderG(); return; }
  const first = !S.g.on;
  G.token = t; G.exp = Date.now() + secs * 1000; G.err = null;
  localStorage.setItem(TKEY, JSON.stringify({ t: G.token, exp: G.exp }));
  S.g.on = true; save(); G.events = {}; G.tried = {};
  await gLoadCals(); await gFlush();
  if (first) toast('Google Calendar connected'); renderAll();
};
function gDisconnect() {
  if (G.token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(G.token, () => {});
  G.token = null; G.exp = 0; G.events = {}; G.tried = {}; localStorage.removeItem(TKEY);
  S.g.on = false; S.g.write = false; save(); renderAll(); toast('Disconnected from Google Calendar');
}
async function gApi(path, opts = {}) {
  if (!gReady()) throw new Error('auth');
  const res = await fetch('https://www.googleapis.com/calendar/v3' + path, { ...opts, headers: { Authorization: 'Bearer ' + G.token, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (res.status === 401) { G.token = null; localStorage.removeItem(TKEY); renderG(); if (NATIVE) NATIVE.googleAuth(SCOPES, true); throw new Error('auth'); }
  if (res.status === 204) return null;
  if (!res.ok) { const t = await res.text(); throw new Error(`Google ${res.status}: ${t.slice(0, 140)}`); }
  return res.json();
}
async function gLoadCals() {
  try {
    const r = await gApi('/users/me/calendarList?minAccessRole=reader');
    S.g.cals = r.items.map(c => ({ id: c.id, name: c.summaryOverride || c.summary, color: c.backgroundColor, primary: !!c.primary, write: ['owner', 'writer'].includes(c.accessRole), hidden: !!c.hidden }));
    S.g.cals.sort((a, b) => b.primary - a.primary || a.hidden - b.hidden || a.name.localeCompare(b.name));
    const prim = S.g.cals.find(c => c.primary);
    if (prim) { S.g.email = prim.id; S.g.show = S.g.show.map(id => id === 'primary' ? prim.id : id); if (S.g.writeCal === 'primary') S.g.writeCal = prim.id; }
    save();
  } catch (e) { if (e.message !== 'auth') G.err = e.message; }
}
async function gFetchRange(a, b) {
  if (!gReady()) return;
  const key = a + '-' + b; if (G.pending[key]) return G.pending[key];
  return (G.pending[key] = gFetchRangeNow(a, b).finally(() => { delete G.pending[key]; }));
}
async function gFetchRangeNow(a, b) {
  try {
    const days = {}; for (let t = a; t < b; t = addDays(t, 1)) days[ymd(t)] = [];
    await Promise.all(S.g.show.map(async calId => {
      const cal = S.g.cals.find(c => c.id === calId) || { color: '#8E8E96' };
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
    }));
    Object.assign(G.events, days); G.err = null;
  } catch (e) { if (e.message !== 'auth') { G.err = e.message; console.warn(e); } }
}
const dayEvents = day => G.events[ymd(day)] || [];
async function ensureDay(day) { const k = 'd' + day; if (gReady() && !G.events[ymd(day)] && !G.tried[k]) { G.tried[k] = 1; await gFetchRange(addDays(day, -1), addDays(day, 2)); setTimeout(renderDay, 0); } }
function gBody(e) {
  const c = cat(e.catId);
  return { summary: `${e.desc ? e.desc + ' · ' : ''}${c.name}`, description: `Tracked with Division of Time${e.focus ? ' · focus session' : ''}${e.quality ? ' · focus ' + e.quality + '/5' : ''}`,
    start: { dateTime: new Date(e.start).toISOString() }, end: { dateTime: new Date(e.end).toISOString() }, transparency: 'transparent',
    extendedProperties: { private: { dot: '1', dotId: e.id } }, colorId: nearestColorId(PAL.find(p => p[1] === (c.color || '').toUpperCase())?.[1] || c.color || '#616161') };
}
const GCOL = { 1: '#7986cb', 2: '#33b679', 3: '#8e24aa', 4: '#e67c73', 5: '#f6bf26', 6: '#f4511e', 7: '#039be5', 8: '#616161', 9: '#3f51b5', 10: '#0b8043', 11: '#d50000' };
function nearestColorId(hex) {
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const a = rgb(hex); let best = '8', bd = 1e9;
  for (const [id, h] of Object.entries(GCOL)) { const b = rgb(h); const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2; if (d < bd) { bd = d; best = id; } }
  return best;
}
function gSync(e) {
  if (!S.g.on || !S.g.write || !e || e.end == null || !real(e)) return;
  if (!gReady()) { if (!S.gq.includes(e.id)) S.gq.push(e.id); return; }
  const cal = encodeURIComponent(S.g.writeCal);
  const p = e.gid ? gApi(`/calendars/${cal}/events/${e.gid}`, { method: 'PATCH', body: JSON.stringify(gBody(e)) })
                  : gApi(`/calendars/${cal}/events`, { method: 'POST', body: JSON.stringify(gBody(e)) });
  p.then(r => { if (r && r.id && !e.gid) { e.gid = r.id; save(); } }).catch(() => { if (!S.gq.includes(e.id)) S.gq.push(e.id); save(); });
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
function gBackfill() {
  const since = addDays(sod(Date.now()), -6);
  const list = S.entries.filter(e => e.end && real(e) && !e.gid && e.start >= since);
  list.forEach(gSync);
  toast(`Copying ${list.length} entr${list.length === 1 ? 'y' : 'ies'} from the last 7 days`);
}
function guessCat(title) {
  const t = title.toLowerCase().trim();
  if (S.evMap[t] && S.cats.some(c => c.id === S.evMap[t])) return S.evMap[t];
  for (const c of S.cats) for (const k of (c.keys || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean)) if (new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t)) return c.id;
  return null;
}
const loggedEv = id => S.entries.some(e => e.evId === id);
function pastUnlogged(day) { return dayEvents(day).filter(ev => !ev.allDay && !ev.transp && ev.start < Date.now() && sod(ev.start) === day && !loggedEv(ev.id)); }
function logEvent(ev, catId) {
  const s = ev.start, f = Math.min(ev.end, Date.now());
  if (f - s < 5 * MIN) return 0;
  let n = 0;
  for (const [a, b] of freeSlots(s, f)) { if (b - a < 5 * MIN) continue; const e = { id: uid(), catId, desc: ev.title, start: a, end: b, evId: ev.id }; S.entries.push(e); gSync(e); n++; }
  S.evMap[ev.title.toLowerCase().trim()] = catId;
  if (!n) S.entries.push({ id: uid(), catId, desc: ev.title, start: f, end: f, evId: ev.id, marker: true });
  return n;
}
$('#logEvents').onclick = () => {
  const snap = snapshot();
  const list = pastUnlogged(viewDay); let n = 0, skipped = 0;
  for (const ev of list) { const c = guessCat(ev.title); if (c) n += logEvent(ev, c); else skipped++; }
  save(); renderAll();
  if (n) toast(`Logged ${n} block${n > 1 ? 's' : ''} from your calendar${skipped ? ` · tap the other ${skipped} to choose` : ''}`, () => restore(snap));
  else toast(skipped ? 'Tap each event to choose its category' : 'Nothing to log');
};
$('#gPill').onclick = () => { if (gReady()) switchTab('settings'); else gConnect(); };

function renderG() {
  const pill = $('#gPill');
  pill.classList.toggle('on', gReady()); pill.classList.toggle('warn', S.g.on && !gReady());
  $('#gPillTxt').textContent = gReady() ? 'Calendar linked' : S.g.on ? 'Reconnect calendar' : 'Connect calendar';
  const box = $('#gBox');
  if (!S.g.on) {
    box.innerHTML = `<p class="muted" style="margin:0 0 14px">See your diary beside what you actually did, log clinics and meetings in one tap, and send tomorrow's one big thing to your calendar.</p><button class="primary" id="gConn">Connect Google Calendar</button><p class="muted small" style="margin:12px 0 0">Google may say the app is unverified. It's your own app in testing, so choose Continue.</p>`;
  } else {
    const cals = S.g.cals || [];
    box.innerHTML = `<p style="margin:0 0 12px">${gReady() ? `Linked${S.g.email ? ' as <b>' + esc(S.g.email) + '</b>' : ''}.` : 'Your Google session has ended (they last an hour).'}${G.err ? '<br><span class="danger small">' + esc(G.err) + '</span>' : ''}</p>
      ${gReady() ? '' : '<button class="primary" id="gConn" style="margin-bottom:12px">Reconnect</button>'}
      ${cals.length ? `<label class="lab">Calendars shown as your plan</label><div class="gcals">${cals.map(c => `<label class="check"><input type="checkbox" data-cal="${esc(c.id)}" ${S.g.show.includes(c.id) ? 'checked' : ''}><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}</label>`).join('')}</div>` : ''}
      <label class="check"><input type="checkbox" id="gWrite" ${S.g.write ? 'checked' : ''}> Copy tracked time into a Google calendar, marked as free so it never blocks your diary</label>
      ${S.g.write ? `<label class="field" style="margin-top:8px">Copy into <select id="gWriteCal">${cals.filter(c => c.write).map(c => `<option value="${esc(c.id)}" ${c.id === S.g.writeCal ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <p class="muted small">Tip: create a calendar called "Division of Time" in Google Calendar first and pick it here, so you can hide it in one click.</p><button class="sm" id="gBack">Copy the last 7 days now</button>` : ''}
      <div class="btns" style="margin-top:14px"><button class="sm" id="gRefresh">Refresh</button><button class="sm ghost danger" id="gDisc">Disconnect</button></div>`;
  }
  $('#gConn')?.addEventListener('click', gConnect);
  $('#gDisc')?.addEventListener('click', gDisconnect);
  $('#gRefresh')?.addEventListener('click', async () => { if (!gReady()) return gConnect(); G.events = {}; G.tried = {}; await gLoadCals(); renderAll(); toast('Calendar refreshed'); });
  $('#gBack')?.addEventListener('click', gBackfill);
  $('#gWrite')?.addEventListener('change', e => { S.g.write = e.target.checked; save(); renderG(); });
  $('#gWriteCal')?.addEventListener('change', e => { S.g.writeCal = e.target.value; save(); });
  $$('#gBox [data-cal]').forEach(i => i.onchange = () => { const id = i.dataset.cal; S.g.show = i.checked ? [...new Set([...S.g.show, id])] : S.g.show.filter(x => x !== id); G.events = {}; G.tried = {}; save(); renderDay(); });
}

/* ---------------- Today ---------------- */
let viewDay = sod(Date.now()), scrolledFor = null;
function goDay(n) { const t = addDays(viewDay, n); if (t > sod(Date.now())) return; viewDay = t; renderDay(); }
$('#prevDay').onclick = () => goDay(-1);
$('#nextDay').onclick = () => goDay(1);
$('#todayBtn').onclick = () => { viewDay = sod(Date.now()); renderDay(); };
// swipe between days on the timeline
(() => { let x0 = null, y0 = 0; const el = $('#tab-today');
  el.addEventListener('touchstart', e => { if (e.target.closest('.dayscroll,input,textarea')) return; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null; if (Math.abs(dx) > 70 && Math.abs(dy) < 40) goDay(dx > 0 ? -1 : 1); }, { passive: true });
})();

function renderDay() {
  const a = viewDay, b = addDays(a, 1), today = sod(Date.now()), isToday = a === today;
  const lbl = isToday ? 'Today' : a === addDays(today, -1) ? 'Yesterday' : fmtDay(a, { weekday: 'long' });
  $('#dayLabel').innerHTML = `${lbl}<small>${fmtDay(a, { day: 'numeric', month: 'long', year: 'numeric' })}</small>`;
  $('#nextDay').disabled = a >= today; $('#todayBtn').hidden = isToday;
  ensureDay(a);

  const m = byCat(a, b), w = waking(a);
  let trackedWake = 0; for (const e of S.entries) if (real(e)) trackedWake += overlap(e, w.st, w.en);
  const untracked = Math.max(0, (w.en - w.st) - trackedWake);
  const deep = deepTime(a, b), free = kindTime(a, b, FREEK), sleep = kindTime(a, b, 'sleep'), awake = sum(m) - sleep;
  $('#sTracked').textContent = fmtHM(awake);
  $('#sTrackedSub').textContent = `${Math.round(trackedWake / Math.max(1, w.en - w.st) * 100)}% of waking time` + (sleep ? ` · ${fmtHM(sleep)} sleep` : '');
  $('#sUntracked').textContent = fmtHM(untracked);
  $('#sFocus').textContent = fmtHM(deep);
  const fs = $('#sFocusSub'); fs.textContent = deep > 4 * H ? 'past the ~4h ceiling' : deep >= H ? 'solid deep work' : 'aim for one 50–90m block'; fs.className = 's ' + (deep >= H && deep <= 4 * H ? 'ok' : '');
  $('#sFree').textContent = fmtHM(free);
  const fr = $('#sFreeSub'); fr.textContent = free >= 2 * H ? 'healthy, 2h or more' : `${fmtHM(2 * H - free)} short of 2h`; fr.className = 's ' + (free >= 2 * H ? 'ok' : '');

  renderNudges(a, { deep, free, untracked, isToday });
  renderGrid(a, b, isToday);

  // where it went: sorted horizontal bars (length is read more accurately than angle)
  const rows = [...m.entries()].sort((x, y) => (cat(x[0]).kind === 'sleep') - (cat(y[0]).kind === 'sleep') || y[1] - x[1]);
  const max = Math.max(1, ...rows.filter(([id]) => cat(id).kind !== 'sleep').map(r => r[1]));
  $('#hbars').innerHTML = rows.length ? rows.map(([id, v]) => {
    const c = cat(id), sl = c.kind === 'sleep';
    return `<div class="hb ${sl ? 'sleep' : ''}" style="--c:${colour(c)}"><span class="n"><span class="dot" style="background:${colour(c)}"></span><span>${esc(c.name)}</span></span><span class="t">${fmtHM(v)}${sl || !awake ? '' : ' · ' + Math.round(v / awake * 100) + '%'}</span><span class="track"><i style="width:${Math.min(100, v / max * 100)}%"></i></span></div>`;
  }).join('') : '<div class="empty"><b>Nothing tracked yet</b>Tap a category above to start your first timer.</div>';

  renderGoals(a);

  const list = S.entries.filter(e => real(e) && overlap(e, a, b) > 0).sort((x, y) => y.start - x.start);
  $('#entryCount').textContent = list.length ? `${list.length} entr${list.length === 1 ? 'y' : 'ies'}` : '';
  $('#entries').innerHTML = list.length ? list.map(e => {
    const c = cat(e.catId), dur = endOf(e) - e.start;
    return `<li><span class="dot" style="background:${colour(c)}"></span><div class="d"><b><span class="x">${esc(e.desc || c.name)}</span>${e.focus ? '<span class="badge">focus' + (e.quality ? ' ' + e.quality + '/5' : '') + '</span>' : ''}${e.evId ? '<span class="badge">calendar</span>' : ''}</b><small>${esc(c.name)} · ${fmtTime(e.start)}–${e.end ? fmtTime(e.end) : '<span class="live">now</span>'}</small></div><span class="dur" data-live="${e.end ? '' : e.id}" title="${fmtTime(e.start)}–${e.end ? fmtTime(e.end) : 'now'}">${fmtHM(dur)}</span><span class="act"><button class="icon ghost" data-act="resume" data-id="${e.id}" title="Start this again" aria-label="Start this again"><svg class="i"><use href="#i-play"/></svg></button><button class="icon ghost" data-act="edit" data-id="${e.id}" title="Edit" aria-label="Edit entry"><svg class="i"><use href="#i-edit"/></svg></button></span></li>`;
  }).join('') : '<li class="empty"><b>No entries on this day</b>Fill gaps on the timeline, or use + Add time.</li>';

}

/* ---------------- Review tab: habits, shutdown, weekly review, projects ---------------- */
let rvDay = sod(Date.now()), wrOff = 0;
$('#rvPrev').onclick = () => { rvDay = addDays(rvDay, -1); renderReview(); };
$('#rvNext').onclick = () => { if (rvDay < sod(Date.now())) { rvDay = addDays(rvDay, 1); renderReview(); } };
$('#wrSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; wrOff = +b.dataset.w; renderReview(); };
// "never miss twice" (Clear): daily at-least goals become habits; 1 met, 0 missed, -1 before tracking began, 2 today in progress
function habits() {
  const today = sod(Date.now()), first = S.entries.filter(real).reduce((m, e) => Math.min(m, sod(e.start)), Infinity);
  const L = live().filter(c => c.goalType === 'min' && c.goal > 0 && (c.period || 'day') === 'day').map(c => ({ name: c.name, col: colour(c), test: d => catTime(d, addDays(d, 1), c.id) >= c.goal * H }));
  L.push({ name: 'Shutdown review', col: 'var(--accent)', test: d => !!(S.notes[ymd(d)] || {}).rating });
  return L.map(h => {
    const days = []; for (let i = 13; i >= 0; i--) { const d = addDays(today, -i); days.push(d < first ? -1 : h.test(d) ? 1 : i === 0 ? 2 : 0); }
    let streak = 0; for (let i = days[13] === 1 ? 13 : 12; i >= 0 && days[i] === 1; i--) streak++;
    return { ...h, days, streak };
  });
}
function renderHabits() {
  const hs = habits(), today = sod(Date.now());
  const head = Array.from({ length: 14 }, (_, i) => fmtDay(addDays(today, i - 13), { weekday: 'narrow' }));
  $('#habitSub').textContent = 'last 14 days';
  $('#habits').innerHTML = `<div class="hab head"><span></span><div class="cells">${head.map((d, i) => `<b class="${i === 13 ? 'now' : ''}">${d}</b>`).join('')}</div><span>Streak</span></div>` + hs.map(h => {
    const twice = h.days[12] === 0 && h.days[11] === 0 && h.days[13] !== 1, once = h.days[12] === 0 && h.days[13] !== 1;
    const st = twice ? '<span class="st bad">Missed twice: restart small today</span>' : once ? '<span class="st warn">Don’t miss twice</span>' : '';
    return `<div class="hab"><span class="n"><span class="dot" style="background:${h.col}"></span>${esc(h.name)}${st}</span><div class="cells">${h.days.map((v, i) => `<i class="c${v}" style="--c:${h.col}" title="${fmtDay(addDays(today, i - 13), { weekday: 'short', day: 'numeric', month: 'short' })} · ${['missed', 'done', 'today'][v] || 'before tracking'}"></i>`).join('')}</div><span class="streak num">${h.streak ? h.streak + 'd' : '–'}</span></div>`;
  }).join('') + '<p class="muted small">Habits come from your daily “at least” goals. Missing once is normal; the aim is never twice in a row.</p>';
}
function renderShutdown() {
  const today = sod(Date.now());
  $('#shutSub').textContent = `· ${rvDay === today ? 'today' : rvDay === addDays(today, -1) ? 'yesterday' : fmtDay(rvDay, { weekday: 'short', day: 'numeric', month: 'short' })}`;
  $('#rvNext').disabled = rvDay >= today;
  const n = S.notes[ymd(rvDay)] || {};
  $('#rating').innerHTML = ['Rough', 'Meh', 'OK', 'Good', 'Great'].map((f, i) => `<button role="radio" aria-checked="${n.rating === i + 1}" class="${n.rating === i + 1 ? 'on' : ''}" data-r="${i + 1}">${f}</button>`).join('');
  $('#control').innerHTML = [1, 2, 3, 4, 5].map(i => `<button role="radio" aria-checked="${n.control === i}" class="${n.control === i ? 'on' : ''}" data-c="${i}" title="${['Not at all', 'A little', 'Somewhat', 'Mostly', 'Completely'][i - 1]}">${i}</button>`).join('');
  $('#ccr').value = n.ccr || 0;
  const ms = monthStart(rvDay), me = monthEnd(rvDay); let mc = 0; for (const [k, v] of Object.entries(S.notes)) { const t = new Date(k + 'T00:00').getTime(); if (t >= ms && t < me) mc += v.ccr || 0; }
  $('#ccrMonth').textContent = `${mc} this month · aim ${Math.round(3 * ltft() * 10) / 10}`;
  if (document.activeElement !== $('#note')) $('#note').value = n.text || '';
  if (document.activeElement !== $('#plan')) $('#plan').value = n.plan || '';
  $('#planToCal').hidden = !(gReady() && (n.plan || '').trim());
}
function renderProjects() {
  const ps = S.cats.filter(c => c.project && !c.paused), a = monday(Date.now()), b = addDays(a, 7);
  $('#projSub').textContent = `· ${ps.length} of 3`;
  $('#projects').innerHTML = ps.length ? ps.map(c => {
    const v = catTime(a, b, c.id), last = [...S.entries].filter(e => e.catId === c.id && e.end).sort((x, y) => y.end - x.end)[0];
    const nx = last && last.next ? `Next: ${esc(last.next)}` : last ? `Last worked on ${fmtDay(last.end, { weekday: 'short', day: 'numeric', month: 'short' })}` : 'Not started yet';
    return `<div class="proj-row"><span class="dot" style="background:${colour(c)}"></span><div class="d"><b>${esc(c.name)}</b><small>${nx}</small></div><span class="num">${fmtHM(v)}<small class="muted"> this week</small></span><button class="icon ghost" data-start="${c.id}" aria-label="Start ${esc(c.name)}" title="Start"><svg class="i"><use href="#i-play"/></svg></button></div>`;
  }).join('') + (ps.length >= 3 ? '<p class="muted small">Three active projects is the cap. Finish or pause one before starting another.</p>' : '<p class="muted small">Up to three at a time. Fewer projects in progress means each one actually moves.</p>')
    : '<div class="empty"><b>No active projects</b>Mark up to three categories as projects, such as SCA prep or Qaaf.</div>';
}
$('#projects').onclick = e => { const b = e.target.closest('[data-start]'); if (b) { $('#desc').value = ''; start(b.dataset.start, ''); scrollTo({ top: 0 }); } };
$('#projEdit').onclick = () => switchTab('categories');
function reviewDue() {
  const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes(), today = sod(Date.now()), wd = now.getDay();
  const day = nowMin > hm(S.settings.shutdown) && !(S.notes[ymd(today)] || {}).rating;
  const wk = ((wd === 5 && nowMin > hm(S.settings.shutdown)) || wd === 0 || wd === 6) && !(S.weeks[ymd(monday(today))] || {}).wins;
  return day || wk;
}
function renderReview() {
  renderHabits(); renderShutdown();
  $$('#wrSeg button').forEach(b => b.classList.toggle('active', +b.dataset.w === wrOff));
  renderWeekReview(addDays(monday(Date.now()), 7 * wrOff));
  renderProjects();
}

function goalWindow(period, day) {
  if (period === 'week') { const s = monday(day); return [s, addDays(s, 7), 'this week']; }
  if (period === 'month') return [monthStart(day), monthEnd(day), 'this month'];
  return [day, addDays(day, 1), 'today'];
}
function renderGoals(day) {
  const goals = S.cats.filter(c => c.goalType && c.goal > 0);
  if (!goals.length) { $('#goals').innerHTML = '<p class="muted small">No goals yet. Add one in Categories.</p>'; return; }
  const scale = c => (['clinical', 'admin', 'learning'].includes(c.kind) && c.period !== 'day' ? ltft() : 1);
  // Only goals that still need attention are shown; met goals collapse into the count.
  let met = 0;
  const needs = (c, per) => { const [a, b] = goalWindow(per, day), v = catTime(a, b, c.id), g = c.goal * scale(c) * H;
    const ok = c.goalType === 'min' ? v >= g : v <= g * 0.75; if (ok) met++; return !ok; };
  const html = ['day', 'week', 'month'].map(per => {
    const gs = goals.filter(c => (c.period || 'day') === per && needs(c, per)); if (!gs.length) return '';
    return `<div class="goalsec">${{ day: 'Today', week: 'This week', month: 'This month' }[per]}</div>` + gs.map(c => {
      const [a, b] = goalWindow(per, day), v = catTime(a, b, c.id), g = c.goal * scale(c) * H, pct = Math.min(100, v / g * 100);
      let st, cls;
      if (c.goalType === 'min') { st = v >= g ? 'Goal reached' : `${fmtHM(g - v)} to go`; cls = v >= g ? 'ok' : ''; }
      else { st = v > g ? `${fmtHM(v - g)} over your limit` : `${fmtHM(g - v)} left`; cls = v > g ? 'bad' : 'ok'; }
      const col = c.goalType === 'max' && v > g ? 'var(--danger)' : colour(c);
      const done = c.goalType === 'min' && v >= g;
      return `<div class="goal ${done ? 'done' : ''}"><div class="gh"><span>${esc(c.name)} <small>${c.goalType === 'min' ? 'at least' : 'at most'} ${fmtH(g)}</small></span><span class="num">${done ? '<span class="tick" aria-label="Goal reached">✓</span>' : ''}${fmtHM(v)}</span></div><div class="bar"><i style="width:${pct}%;background:${col}"></i></div>${done ? '' : `<div class="st ${cls}">${st}</div>`}</div>`;
    }).join('');
  }).join('');
  $('#goalSub').textContent = met ? `✓ ${met} of ${goals.length} on track` : '';
  $('#goals').innerHTML = html || '<p class="muted small" style="margin:0">Everything’s on track. Nothing needs you here.</p>';
}

function renderGrid(a, b, isToday) {
  const evs = dayEvents(a), timed = evs.filter(e => !e.allDay);
  const ents = S.entries.filter(e => real(e) && overlap(e, a, b) > 0);
  let h0 = Math.floor(hm(S.settings.wake) / 60), h1 = Math.ceil(hm(S.settings.bed) / 60); if (h1 <= h0) h1 = 24;
  for (const x of [...timed, ...ents]) { const s = Math.max(x.start, a), f = Math.min(endOf(x), b); h0 = Math.min(h0, Math.floor((s - a) / H)); h1 = Math.max(h1, Math.ceil((f - a) / H)); }
  h0 = Math.max(0, h0); h1 = Math.min(24, Math.max(h1, h0 + 1));
  const top = a + h0 * H, height = (h1 - h0) * HOURPX;
  const y = t => (Math.max(t, top) - top) / H * HOURPX;
  const blk = (s, f) => `top:${y(s) + 1}px;height:${Math.max(16, y(f) - y(s) - 2)}px`;
  let hrs = ''; for (let h = h0 + 1; h < h1; h++) hrs += `<span style="top:${(h - h0) * HOURPX}px">${String(h).padStart(2, '0')}:00</span>`;
  // overlapping events side by side
  const sortedEv = [...timed].sort((p, q) => p.start - q.start || q.end - p.end), colEnd = [], lay = new Map();
  let cluster = [], clusterEnd = 0;
  const flush = () => { const n = Math.max(...cluster.map(c => lay.get(c).col)) + 1; cluster.forEach(c => lay.get(c).n = n); cluster = []; colEnd.length = 0; };
  for (const ev of sortedEv) {
    if (cluster.length && ev.start >= clusterEnd) flush();
    let col = colEnd.findIndex(t => t <= ev.start); if (col < 0) col = colEnd.length; colEnd[col] = ev.end;
    lay.set(ev, { col, n: 1 }); cluster.push(ev); clusterEnd = Math.max(clusterEnd, ev.end);
  }
  if (cluster.length) flush();
  let plan;
  const loading = gReady() && !G.events[ymd(a)];
  if (loading) plan = [9, 12.5, 15].map(h => `<div class="blk sk" style="top:${(h - h0) * HOURPX}px;height:${HOURPX * 1.4}px"></div>`).join('');
  else if (!timed.length) plan = `<div class="blk" style="top:8px;height:auto;cursor:default;white-space:normal;color:var(--text-3)">${gReady() ? 'Nothing in your calendar' : S.g.on ? 'Reconnect Google to see your plan' : '<a href="#" id="planConnect" style="color:var(--accent)">Connect Google Calendar</a> to see your plan here'}</div>`;
  else plan = sortedEv.map(ev => {
    const s = Math.max(ev.start, a), f = Math.min(ev.end, b), logged = loggedEv(ev.id), short = y(f) - y(s) < 34, L = lay.get(ev);
    const pos = L.n > 1 ? `;left:calc(${L.col / L.n * 100}% + 2px);right:auto;width:calc(${100 / L.n}% - 4px)` : '';
    return `<div class="blk ev ${logged ? 'logged' : ''}" data-ev="${esc(ev.id)}" style="${blk(s, f)};--c:${esc(ev.color)}${pos}" title="${esc(ev.title)} · ${fmtTime(ev.start)}–${fmtTime(ev.end)}"><b>${logged ? '✓ ' : ''}${esc(ev.title)}</b>${short ? '' : `<small>${fmtTime(ev.start)}–${fmtTime(ev.end)}</small> `}${!logged && ev.start < Date.now() && !short ? '<span class="tag">· log</span>' : ''}</div>`;
  }).join('');
  let act = ents.map(e => {
    const s = Math.max(e.start, a), f = Math.min(endOf(e), b), c = cat(e.catId), short = y(f) - y(s) < 34;
    return `<div class="blk en ${e.end ? '' : 'live'}" data-id="${e.id}" style="${blk(s, f)};--c:${colour(c)}" title="${esc(e.desc || c.name)} · ${fmtTime(s)}–${e.end ? fmtTime(f) : 'now'}"><b>${esc(e.desc || c.name)}</b>${short ? '' : `<small>${fmtTime(s)}–${e.end ? fmtTime(f) : 'now'} · ${fmtHM(f - s)}</small>`}</div>`;
  }).join('');
  const w = waking(a);
  for (const [s, f] of freeSlots(w.st, w.en)) if (f - s >= 15 * MIN) act += `<div class="blk gap" data-gap="${s}-${f}" style="${blk(s, f)}" title="Untracked ${fmtTime(s)}–${fmtTime(f)}"><b>${fmtHM(f - s)} untracked</b>${y(f) - y(s) >= 34 ? '<small>tap to fill</small>' : ''}</div>`;
  const now = isToday && Date.now() > top && Date.now() < a + h1 * H ? `<div class="nowline" style="top:${y(Date.now())}px"></div>` : '';
  $('#dayGrid').innerHTML = `<div class="hrs" style="height:${height}px">${hrs}</div><div class="lane plan" style="height:${height}px">${plan}</div><div class="lane actual" id="actualLane" style="height:${height}px">${act}</div>${now}`;
  $('#dayGrid').dataset.top = top;
  $('#planConnect')?.addEventListener('click', e => { e.preventDefault(); gConnect(); });
  $('#allDay').innerHTML = evs.filter(e => e.allDay).map(e => `<span title="All day">${esc(e.title)}</span>`).join('');
  $('#planHead').textContent = gReady() ? 'Plan · Google Calendar' : 'Plan';
  const pu = gReady() ? pastUnlogged(a) : [];
  $('#logEvents').hidden = !pu.length; $('#logEvents').textContent = `Log ${pu.length} past event${pu.length > 1 ? 's' : ''}`;
  if (scrolledFor !== a) { scrolledFor = a; const sc = $('#dayScroll'); const target = isToday ? y(Date.now()) - 220 : y(w.st) - 20; requestAnimationFrame(() => { sc.scrollTop = Math.max(0, target); }); }
}
$('#dayGrid').onclick = e => {
  const en = e.target.closest('.blk.en'); if (en) return openEntry(en.dataset.id);
  const ev = e.target.closest('.blk.ev');
  if (ev) {
    const item = dayEvents(viewDay).find(x => x.id === ev.dataset.ev); if (!item) return;
    if (loggedEv(item.id)) { const le = S.entries.find(x => x.evId === item.id && real(x)); if (le) openEntry(le.id); return; }
    if (item.start > Date.now()) return toast('That hasn’t happened yet');
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
    const r = lane.getBoundingClientRect(), top = +$('#dayGrid').dataset.top;
    let t = top + (e.clientY - r.top) / HOURPX * H; t = Math.round(t / (15 * MIN)) * 15 * MIN;
    if (t > Date.now()) return;
    openEntry(null, { start: t, end: Math.min(t + 30 * MIN, Date.now()) });
  }
};

function lastNightSleep(day) { let t = 0; for (const e of S.entries) if (real(e) && kindOf(e) === 'sleep' && e.end && e.end > day + 2 * H && e.end < day + 14 * H) t += e.end - e.start; return t; }
function renderNudges(day, d) {
  const out = [], nowMin = new Date().getHours() * 60 + new Date().getMinutes(), sd = hm(S.settings.shutdown);
  if (!S.entries.length) out.push(['good', '👋', 'Welcome. Tap a category to start a timer. Track a full week, sleep and family included, to see where your 168 hours really go.']);
  if (d.isToday) {
    const r = running(), wd = new Date().getDay();
    if (r && WORKK.includes(kindOf(r)) && (nowMin > sd || wd === 0 || wd === 6)) out.push(['warn', '🌙', `Work after ${wd === 0 || wd === 6 ? 'a weekday' : S.settings.shutdown}. Jot the loose ends and their next steps in the review below, then switch off.`]);
    const sl = lastNightSleep(day); if (sl && sl < 6.5 * H && nowMin < 12 * 60) out.push(['warn', '😴', `${fmtHM(sl)} sleep last night. Go easy on deep work today and protect bedtime tonight.`]);
    const pu = gReady() ? pastUnlogged(day) : [];
    if (pu.length) out.push(['', '📅', `${pu.length} calendar event${pu.length > 1 ? 's' : ''} from today ${pu.length > 1 ? 'aren’t' : 'isn’t'} logged yet.`, 'Log', () => $('#logEvents').click()]);
    if (d.untracked > 2 * H) out.push(['warn', '◌', `${fmtHM(d.untracked)} of today is untracked. Fill the striped gaps while you still remember.`]);
    if (nowMin > 14 * 60 && d.deep < 30 * MIN && nowMin < sd) out.push(['', '🎯', 'No deep-work block yet today. One 50-minute focus session is enough to move the needle.', 'Focus', () => $('#focusBtn').click()]);
    if (nowMin > sd + 60 && !(S.notes[ymd(day)] || {}).rating) out.push(['', '📝', 'Close the day: rate it, list loose ends, set tomorrow’s one big thing.', 'Review', () => { rvDay = day; switchTab('review'); }]);
    const twice = habits().filter(h => h.days[12] === 0 && h.days[13] !== 1);
    if (twice.length) out.push(['warn', '🔁', `Missed yesterday: ${twice.map(h => esc(h.name)).join(', ')}. Never miss twice; even ten minutes today keeps it going.`, 'Habits', () => switchTab('review')]);
    if (nowMin > 19 * 60 && d.free < H) out.push(['warn', '🌿', 'Little family or free time today. Wellbeing tends to dip below about 2 hours, so protect some of this evening.']);
    if (wd === 1 && nowMin < 12 * 60) out.push(['good', '✨', 'Fresh week. What one thing would make it a good one? Put it in your calendar now.']);
    if ((wd === 5 && nowMin > sd) || wd === 0) { const k = ymd(monday(day)); if (!(S.weeks[k] || {}).wins) out.push(['', '🗓️', 'Weekly review: five minutes on wins, what to drop and next week’s top three.', 'Open', () => { wrOff = 0; switchTab('review'); setTimeout(() => $('#weekReview').scrollIntoView({ block: 'start' }), 50); }]); }
  }
  const dk = ymd(day), gone = (S.settings.dismissed || {})[dk] || [];
  const show = out.filter(n => !gone.includes(n[1])).slice(0, 1); // one suggestion at a time keeps Today calm
  $('#nudges').innerHTML = show.map(([k, i, t, btn], j) => `<div class="nudge ${k}"><span>${t}</span>${btn ? `<button class="sm" data-n="${j}">${btn}</button>` : ''}<button class="icon ghost x" data-x="${j}" aria-label="Dismiss" title="Dismiss for today"><svg class="i"><use href="#i-x"/></svg></button></div>`).join('');
  $$('#nudges [data-n]').forEach(b => b.onclick = show[+b.dataset.n][4]);
  $$('#nudges [data-x]').forEach(b => b.onclick = () => { S.settings.dismissed = { [dk]: [...gone, show[+b.dataset.x][1]] }; save(); renderDay(); });
}

$('#entries').onclick = e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const en = S.entries.find(x => x.id === b.dataset.id);
  if (b.dataset.act === 'edit') openEntry(en.id);
  else { $('#desc').value = en.desc || ''; start(en.catId, en.desc || ''); scrollTo({ top: 0 }); }
};
const noteSet = (k, v) => { const d = ymd(rvDay); S.notes[d] = { ...(S.notes[d] || {}), [k]: v }; save(); };
$('#rating').onclick = e => { const b = e.target.closest('button'); if (!b) return; noteSet('rating', +b.dataset.r); buzz(8); renderReview(); };
$('#control').onclick = e => { const b = e.target.closest('button'); if (!b) return; noteSet('control', +b.dataset.c); buzz(8); renderReview(); };
$('#ccrPlus').onclick = () => { noteSet('ccr', ((S.notes[ymd(rvDay)] || {}).ccr || 0) + 1); buzz(8); renderReview(); };
$('#ccrMinus').onclick = () => { noteSet('ccr', Math.max(0, ((S.notes[ymd(rvDay)] || {}).ccr || 0) - 1)); renderReview(); };
$('#note').addEventListener('input', () => noteSet('text', $('#note').value));
$('#plan').addEventListener('input', () => { noteSet('plan', $('#plan').value); $('#planToCal').hidden = !(gReady() && $('#plan').value.trim()); });
$('#planToCal').onclick = async () => {
  const text = $('#plan').value.trim(); if (!text) return;
  let h = 9, mi = 0, ap = '';
  const m1 = text.match(/(\d{1,2})[:.](\d{2})\s*(am|pm)?/i), m2 = text.match(/\bat\s+(\d{1,2})\s*(am|pm)?\b/i);
  if (m1) { h = +m1[1]; mi = +m1[2]; ap = (m1[3] || '').toLowerCase(); } else if (m2) { h = +m2[1]; ap = (m2[2] || '').toLowerCase(); }
  if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || mi > 59) { h = 9; mi = 0; }
  const day = addDays(rvDay, 1), s = day + h * H + mi * MIN;
  const cal = S.g.cals.find(c => c.primary)?.id || 'primary';
  try {
    await gApi(`/calendars/${encodeURIComponent(cal)}/events`, { method: 'POST', body: JSON.stringify({ summary: '🎯 ' + text.replace(/^i will\s*/i, ''), description: 'Your one big thing, set in your Division of Time shutdown review.', start: { dateTime: new Date(s).toISOString() }, end: { dateTime: new Date(s + H).toISOString() }, reminders: { useDefault: true } }) });
    toast(`Added to your calendar: ${fmtDay(s, { weekday: 'short' })} ${fmtTime(s)}`);
    delete G.events[ymd(day)];
  } catch (e) { toast(e.message === 'auth' ? 'Reconnect Google first' : 'Couldn’t add it: ' + e.message); }
};

/* ---------------- entry dialog ---------------- */
let editing = null, preset = null;
function openEntry(id, pre) {
  editing = id ? S.entries.find(e => e.id === id) : null; preset = pre || null;
  $('#entryTitle').textContent = editing ? 'Edit entry' : pre?.evId ? 'Log calendar event' : 'Add time';
  $('#eCat').innerHTML = S.cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const now = Date.now(), base = viewDay === sod(now) ? now : viewDay + 12 * H, src = editing || pre || {};
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
  const err = m => { $('#eErr').textContent = m; buzz([8, 40, 8]); };
  if (!s) return err('Add a start time.');
  if (!isRunning && !f) return err('Add an end time.');
  if (f && f <= s) return err('End must be after start.');
  if (s > Date.now()) return err('Start can’t be in the future.');
  if ((f || 0) > Date.now() + MIN) return err('End can’t be in the future.');
  if (f && f - s > 20 * H) return err('That’s over 20 hours. Check the dates.');
  const snap = snapshot();
  const data = { desc: $('#eDesc').value.trim(), catId: $('#eCat').value, start: s, end: isRunning ? null : f, focus: $('#eFocus').checked };
  const wasEdit = !!editing;
  if (editing) { Object.assign(editing, data); if (!isRunning) carve(s, f, editing.id); gSync(editing); }
  else {
    carve(s, f, null);
    const e = { id: uid(), ...data }; if (preset?.evId) { e.evId = preset.evId; S.evMap[(preset.desc || '').toLowerCase().trim()] = data.catId; }
    S.entries.push(e); gSync(e);
  }
  save(); $('#entryDlg').close(); renderAll(); toast(wasEdit ? 'Entry updated' : 'Time added', () => restore(snap));
};
$('#eDel').onclick = () => {
  if (!editing) return;
  const snap = snapshot(), victim = editing;
  gDelete(victim); S.entries = S.entries.filter(e => e !== victim && !(victim.evId && e.marker && e.evId === victim.evId));
  save(); $('#entryDlg').close(); renderAll(); toast('Entry deleted', () => restore(snap));
};

/* ---------------- Insights ---------------- */
let range = 'week';
$('#range').onclick = e => { const b = e.target.closest('button'); if (!b) return; range = b.dataset.r; $$('#range button').forEach(x => x.classList.toggle('active', x === b)); renderReports(); };
function rangeBounds() {
  const today = sod(Date.now()), mon = monday(today);
  if (range === 'week') return [mon, addDays(mon, 7)];
  if (range === 'lastweek') return [addDays(mon, -7), mon];
  if (range === 'month') return [monthStart(today), monthEnd(today)];
  return [addDays(today, -29), addDays(today, 1)];
}
function switchesPerHour(a, b) {
  const es = S.entries.filter(e => real(e) && overlap(e, a, b) > 0 && kindOf(e) !== 'sleep').sort((x, y) => x.start - y.start);
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
    for (const e of S.entries) if (real(e) && (e.evId === ev.id || (gc && e.catId === gc))) kept += overlap(e, s, f);
  }
  return planned > 30 * MIN ? Math.min(1, kept / planned) : null;
}
function renderReports() {
  const [a, b] = rangeBounds(), today = sod(Date.now());
  if (gReady()) {
    const e2 = Math.min(b, addDays(today, 1)), rk = a + '-' + e2;
    let missing = false; for (let t = a; t < e2; t = addDays(t, 1)) if (!G.events[ymd(t)]) missing = true;
    if (missing && !G.tried[rk]) { G.tried[rk] = 1; gFetchRange(a, e2).then(() => { setTimeout(() => { if ($('#tab-reports').classList.contains('active')) renderReports(); }, 0); }); }
  }
  const days = []; for (let t = a; t < b; t = addDays(t, 1)) days.push(t);
  const past = days.filter(t => t <= today), nd = past.length || 1;
  const m = byCat(a, b), total = sum(m), deep = deepTime(a, b), sleepT = kindTime(a, b, 'sleep'), awakeT = total - sleepT;
  $('#rTotal').textContent = fmtHM(awakeT); $('#rAvg').textContent = `${fmtHM(awakeT / nd)} a day` + (sleepT ? ` · sleep ${fmtHM(sleepT / nd)}` : '');
  $('#rFocus').textContent = fmtHM(deep); $('#rFocusSub').textContent = `${fmtHM(deep / nd)} a day`;
  const sph = switchesPerHour(a, b); $('#rSwitch').textContent = sph == null ? '–' : sph.toFixed(1);
  const pk = planKept(a, b); $('#rPlan').textContent = pk == null ? '–' : Math.round(pk * 100) + '%';

  renderTraining(a, b, nd);
  const isWeek = range === 'week' || range === 'lastweek';
  $('#wkCard').hidden = !isWeek;
  if (isWeek) renderWeekGrid(a);

  // hours per day, stacked by category (awake only)
  const W = Math.max(300, Math.round($('#bars').getBoundingClientRect().width) || 700), HH = 220, pad = 28, n = days.length, bw = (W - pad) / n;
  $('#bars').setAttribute('viewBox', `0 0 ${W} ${HH}`);
  const per = days.map(t => byCat(t, addDays(t, 1), e => kindOf(e) !== 'sleep'));
  const maxH = Math.max(4, Math.ceil(Math.max(...per.map(sum)) / H));
  const yy = h => HH - 20 - (h / maxH) * (HH - 32);
  const step = maxH > 12 ? 4 : 2;
  let svg = '';
  for (let h = 0; h <= maxH; h += step) svg += `<line x1="${pad}" x2="${W}" y1="${yy(h)}" y2="${yy(h)}" stroke="var(--border)" ${h ? 'stroke-dasharray="2 4"' : ''}/><text x="0" y="${yy(h) + 4}">${h}h</text>`;
  per.forEach((mm, i) => {
    let acc = 0; const x = pad + i * bw + bw * .2, w = bw * .6;
    const segs = S.cats.map(c => c.id).concat([null]).filter(id => mm.get(id));
    segs.forEach(id => {
      const v = mm.get(id) / H, y1 = yy(acc + v), y0 = yy(acc);
      svg += `<rect x="${x}" y="${y1}" width="${w}" height="${Math.max(0, y0 - y1 - 1.5)}" rx="2" fill="${colour(cat(id))}"><title>${fmtDay(days[i], { weekday: 'short', day: 'numeric', month: 'short' })} · ${esc(cat(id).name)} ${fmtHM(v * H)}</title></rect>`;
      acc += v;
    });
    if (n <= 10 || i % Math.ceil(n / (W < 500 ? 6 : 10)) === 0) svg += `<text x="${pad + i * bw + bw / 2}" y="${HH - 4}" text-anchor="middle" ${days[i] === today ? 'font-weight="600" style="fill:var(--text)"' : ''}>${fmtDay(days[i], n <= 7 ? { weekday: 'short' } : { day: 'numeric', month: n > 14 && W < 500 ? undefined : 'short' })}</text>`;
  });
  $('#bars').innerHTML = svg;

  const rows = [...m.entries()].sort((p, q) => (cat(p[0]).kind === 'sleep') - (cat(q[0]).kind === 'sleep') || q[1] - p[1]);
  const x_awake = awakeT;
  $('#rTable tbody').innerHTML = rows.length ? rows.map(([id, v]) => {
    const c = cat(id), avg = v / nd;
    let g = '<span class="muted">–</span>';
    if (c.goalType && c.goal) {
      const per = c.period || 'day', target = c.goal * H * (['clinical', 'admin', 'learning'].includes(c.kind) && per !== 'day' ? ltft() : 1);
      if (per === 'day') { const ok = c.goalType === 'min' ? avg >= target : avg <= target; g = `<span style="color:${ok ? 'var(--success)' : 'var(--danger)'}">${ok ? '✓' : '✗'} ${fmtHM(avg)} a day</span>`; }
      else { const tgt = target * Math.max(1, nd / (per === 'week' ? 7 : 30.4)); const ok = c.goalType === 'min' ? v >= tgt : v <= tgt; g = `<span style="color:${ok ? 'var(--success)' : 'var(--text-2)'}">${ok ? '✓ ' : ''}${fmtH(v)} of ${fmtH(tgt)}</span>`; }
    }
    return `<tr><td><span class="cn"><span class="dot" style="background:${colour(c)}"></span>${esc(c.name)}</span></td><td>${fmtHM(v)}</td><td class="hide-m">${c.kind === 'sleep' || !x_awake ? '–' : Math.round(v / x_awake * 100) + '%'}</td><td>${g}</td></tr>`;
  }).join('') : '<tr><td colspan="4" class="muted">No time tracked in this range yet.</td></tr>';

  const acts = new Map();
  for (const e of S.entries) { if (!real(e) || kindOf(e) === 'sleep') continue; const o = overlap(e, a, b); if (!o) continue; const k = (e.desc || '').trim() || cat(e.catId).name; const key = k.toLowerCase() + '|' + e.catId; acts.set(key, { k, c: e.catId, v: (acts.get(key)?.v || 0) + o }); }
  const top = [...acts.values()].sort((p, q) => q.v - p.v).slice(0, 8);
  $('#rDesc tbody').innerHTML = top.length ? top.map(x => `<tr><td>${esc(x.k)}</td><td><span class="cn"><span class="dot" style="background:${colour(cat(x.c))}"></span>${esc(cat(x.c).name)}</span></td><td>${fmtHM(x.v)}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">Nothing yet.</td></tr>';

  const heat = renderHeat();
  renderInsights({ a, b, past, nd, m, total, awakeT, deep, sph, pk, rows, heat });
}
function renderTraining(a, b, nd) {
  // COGPED/HEE training week: 70:30 clinical:educational, 28h clinical + 12h education per full-time week (pro rata LTFT)
  const weeks = Math.max(1, nd / 7), L = ltft();
  const clin = kindTime(a, b, 'clinical'), adminT = kindTime(a, b, 'admin'), learn = kindTime(a, b, 'learning');
  const ooh = S.cats.filter(c => /out of hours|ooh/i.test(c.name)).reduce((t, c) => t + catTime(monthStart(Date.now()), monthEnd(Date.now()), c.id), 0);
  const ct = 28 * L * weeks * H, lt = 12 * L * weeks * H, ratio = clin ? adminT / clin : 0;
  $('#trainSub').textContent = `· targets ${L < 1 ? 'at ' + Math.round(L * 100) + '% LTFT' : 'full time'}, per COGPED's 70:30 week`;
  const cell = (k, v, s, pct, col) => `<div><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div><div class="meter"><i style="width:${Math.min(100, pct * 100)}%;background:${col}"></i></div></div>`;
  $('#train').innerHTML =
    cell('Clinical', fmtH(clin), `target ${fmtH(ct)}${weeks > 1.1 ? '' : ' a week'}`, clin / ct, colour(S.cats.find(c => c.kind === 'clinical'))) +
    cell('Education', fmtH(learn), `target ${fmtH(lt)} incl. tutorial & self-study`, learn / lt, colour({ color: P('Violet') })) +
    cell('Admin : clinical', clin ? `1 : ${(1 / Math.max(ratio, 0.01)).toFixed(1)}` : '–', ratio > 1 / 3 ? 'above BMA’s 1 : 3 guide' : 'BMA guide is 1 : 3', Math.min(1, ratio * 3), ratio > 1 / 3 ? 'var(--warn)' : 'var(--success)') +
    cell('OOH this month', fmtH(ooh), `typical ${fmtH(4 * L * H)} a month`, ooh / (4 * L * H), colour({ color: P('Navy') }));
}
function renderWeekGrid(a) {
  const names = Array.from({ length: 7 }, (_, d) => fmtDay(addDays(a, d), { weekday: 'short' })), used = new Set();
  let html = '';
  for (let d = 0; d < 7; d++) {
    const day = addDays(a, d); html += `<span>${names[d]}</span>`;
    for (let s = 0; s < 48; s++) {
      const t0 = day + s * 30 * MIN, t1 = t0 + 30 * MIN; let best = null, bv = 0;
      if (t0 < Date.now()) for (const e of S.entries) { if (!real(e)) continue; const o = overlap(e, t0, t1); if (o > bv) { bv = o; best = e.catId; } }
      if (bv >= 10 * MIN) { used.add(best); html += `<i style="background:${colour(cat(best))}" title="${names[d]} ${fmtTime(t0)} · ${esc(cat(best).name)}"></i>`; }
      else html += `<i title="${names[d]} ${fmtTime(t0)}${t0 < Date.now() ? ' · untracked' : ''}"></i>`;
    }
  }
  html += '<span></span><div class="hl"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>';
  $('#wk').innerHTML = html;
  $('#wkLegend').innerHTML = S.cats.filter(c => used.has(c.id)).map(c => `<span><span class="dot" style="background:${colour(c)}"></span>${esc(c.name)}</span>`).join('');
}
function renderWeekReview(a) {
  const k = ymd(a), w = S.weeks[k] || {};
  $('#wrSub').textContent = `· week of ${fmtDay(a, { day: 'numeric', month: 'short' })}`;
  for (const [id, f] of [['wrWins', 'wins'], ['wrDrop', 'drop'], ['wrNext', 'next'], ['wrAdv', 'adv']]) {
    const el = $('#' + id); if (document.activeElement !== el) el.value = w[f] || '';
    el.oninput = () => { S.weeks[k] = { ...(S.weeks[k] || {}), [f]: el.value }; save(); };
  }
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
  const mx = Math.max(1, ...grid.flat()), names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  $('#heat').innerHTML = grid.map((row, i) => `<span>${names[i]}</span>` + row.map((v, h) => `<i title="${names[i]} ${String(h).padStart(2, '0')}:00 · ${Math.round(v)} min" style="${v ? `background:color-mix(in oklch,var(--accent) ${Math.round(18 + 82 * v / mx)}%,var(--surface-2))` : ''}"></i>`).join('')).join('') + '<span></span><div class="hl"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>';
  const byHour = Array(24).fill(0); grid.forEach(r => r.forEach((v, h) => byHour[h] += v));
  let best = -1, bh = 0; for (let h = 0; h < 23; h++) { const v = byHour[h] + byHour[h + 1]; if (v > best) { best = v; bh = h; } }
  const totalMin = byHour.reduce((p, q) => p + q, 0);
  $('#heatNote').textContent = totalMin > 240 ? `Your strongest window is ${String(bh).padStart(2, '0')}:00–${String(bh + 2).padStart(2, '0')}:00. Guard it for your hardest work.` : 'Counts focus sessions and learning blocks of 45 minutes or more, weighted by your focus rating. It fills in as you track.';
  return totalMin > 240 ? bh : null;
}
function renderInsights(x) {
  const L = [], ul = $('#insight');
  if (!x.total) { ul.innerHTML = '<li><span class="ic info"></span><span>Track a full week, sleep and family included, and your patterns show up here: where the hours go, when you focus best and what to change.</span></li>'; return; }
  const top = x.rows.filter(([id]) => cat(id).kind !== 'sleep')[0];
  if (top) L.push(['📊', `<b>${esc(cat(top[0]).name)}</b> took the most waking time: ${fmtHM(top[1])}, about ${fmtHM(top[1] / x.nd)} a day.`]);
  const freeT = kindTime(x.a, Math.min(x.b, Date.now()), FREEK);
  if (range === 'week' || range === 'lastweek') L.push(['🕰️', `You had ${fmtH(freeT)} of family and free time this week. ${freeT > 15 * H ? 'More than it felt like?' : 'Tight. What could you drop or pay to save?'}`]);
  const dpd = x.deep / x.nd;
  L.push(dpd < H ? ['🎯', `Deep work averaged ${fmtHM(dpd)} a day. The typical worker gets about 1h 12m uninterrupted; one protected 50–90 minute block would beat that.`] : dpd > 4 * H ? ['🧠', `Deep work averaged ${fmtHM(dpd)} a day, above the roughly 4-hour mark where quality drops.`] : ['🎯', `Deep work averaged ${fmtHM(dpd)} a day, a sustainable range.`]);
  if (x.heat != null) L.push(['⏰', `Your best focus is around ${String(x.heat).padStart(2, '0')}:00–${String(x.heat + 2).padStart(2, '0')}:00. Keep admin and messages out of it.`]);
  if (x.sph != null && x.sph > 4) L.push(['🔀', `${x.sph.toFixed(1)} switches an hour. Each one costs refocusing time; batch results and messages into set slots.`]);
  const clin = kindTime(x.a, x.b, 'clinical'), adm = kindTime(x.a, x.b, 'admin');
  if (clin > 3 * H && adm / clin > 1 / 3) L.push(['📨', `Admin ran at 1 : ${(clin / adm).toFixed(1)} against clinical time, above the BMA’s 1 : 3 guide. Two fixed results slots a day, plus a tidy-up after each surgery, usually helps.`]);
  // fragmentation of free time
  const freeEs = S.entries.filter(e => real(e) && FREEK.includes(kindOf(e)) && overlap(e, x.a, x.b) > 0);
  const crumbs = freeEs.filter(e => endOf(e) - e.start < 30 * MIN).reduce((t, e) => t + overlap(e, x.a, x.b), 0);
  if (freeT > 2 * H && crumbs / freeT > .4) L.push(['🍞', `${Math.round(crumbs / freeT * 100)}% of your free time came in crumbs under 30 minutes. One longer stretch feels more restful.`]);
  const poor = x.past.filter(d => kindTime(d, addDays(d, 1), FREEK) < 2 * H && sum(byCat(d, addDays(d, 1))) > 6 * H).length;
  if (poor >= 3) L.push(['🌿', `${poor} days had under 2 hours of family and free time. Wellbeing tends to dip below that.`]);
  const ctrl = x.past.map(d => (S.notes[ymd(d)] || {}).control).filter(Boolean);
  if (ctrl.filter(c => c <= 2).length >= 2) L.push(['🧭', 'Two or more days when you felt out of control of your time. Pick one thing to drop or delegate next week.']);
  else if (ctrl.length >= 3) L.push(['🧭', `You felt in control ${(ctrl.reduce((p, q) => p + q, 0) / ctrl.length).toFixed(1)} out of 5 on average. That feeling predicts wellbeing better than hours worked.`]);
  if (x.pk != null) L.push(x.pk < .7 ? ['📅', `You kept ${Math.round(x.pk * 100)}% of your calendar plan. Plan less than feels possible; people underestimate how long things take.`] : ['📅', `You kept ${Math.round(x.pk * 100)}% of your calendar plan. Realistic planning.`]);
  const sd = hm(S.settings.shutdown);
  let spill = 0; for (const d of x.past) { const wd = new Date(d).getDay(); const lim = wd === 0 || wd === 6 ? d : atMin(d, sd); if (kindTime(Math.max(lim, d), addDays(d, 1), WORKK) > 15 * MIN) spill++; }
  if (spill >= 2) L.push(['🌙', `Work spilled past ${S.settings.shutdown} or into the weekend on ${spill} days. A fixed shutdown, with loose ends written down, makes switching off easier.`]);
  const sleeps = x.past.map(d => lastNightSleep(d)).filter(Boolean);
  if (sleeps.length >= 3) { const av = sleeps.reduce((p, q) => p + q, 0) / sleeps.length; if (av < 7 * H) L.push(['😴', `Sleep averaged ${fmtHM(av)}. Parents of young children typically lose sleep for years, so guard bedtime like an appointment.`]); }
  const tracked = x.past.filter(d => S.entries.some(e => real(e) && overlap(e, d, addDays(d, 1)) > 0)).length;
  const reviewed = x.past.filter(d => (S.notes[ymd(d)] || {}).rating).length;
  L.push(['🔥', `Tracked ${tracked} of ${x.past.length} days, closed ${reviewed} with a review. ${reviewed >= Math.min(5, x.past.length) ? 'Lovely consistency.' : 'Reviews are where tracking pays off.'}`]);
  const over = S.cats.filter(c => c.goalType === 'max' && c.goal && c.period === 'day' && (x.m.get(c.id) || 0) / x.nd > c.goal * H);
  if (over.length) L.push(['⚠️', `Over your daily limit on average: ${over.map(c => esc(c.name)).join(', ')}.`]);
  const WARN = '⚠️🌙😴🌿🔀📨🍞', GOOD = '🔥';
  ul.innerHTML = L.map(([i, t]) => { const tone = /felt out of control|below|dip|Tight|crumbs|above|spilled|Over your|switches an hour/.test(t) || WARN.includes(i) ? 'warn' : 'info'; return `<li><span class="ic ${tone}" aria-hidden="true"></span><span>${t}</span></li>`; }).join('');
}

/* ---------------- categories ---------------- */
let editCat = null, pickCol = null;
function renderCats() {
  $('#catList').innerHTML = S.cats.map((c, i) => {
    const g = c.goalType && c.goal ? ` · ${c.goalType === 'min' ? 'at least' : 'at most'} ${c.goal}h a ${c.period || 'day'}` : '';
    return `<li class="${c.paused ? 'paused' : ''}"><span class="sw" style="--c:${colour(c)}"></span><span class="n">${esc(c.name)}${c.project ? ' <span class="badge">project</span>' : ''}${c.paused ? ' <span class="badge muted-b">paused</span>' : ''}<small>${KINDS[c.kind] || ''}${g}</small></span>${i ? `<button class="icon ghost" data-up="${c.id}" aria-label="Move ${esc(c.name)} up" title="Move up">↑</button>` : ''}<button class="sm" data-id="${c.id}">Edit</button></li>`;
  }).join('');
}
$('#catList').onclick = e => {
  const up = e.target.closest('[data-up]');
  if (up) { const i = S.cats.findIndex(c => c.id === up.dataset.up); [S.cats[i - 1], S.cats[i]] = [S.cats[i], S.cats[i - 1]]; save(); renderAll(); return; }
  const b = e.target.closest('button[data-id]'); if (b) openCat(b.dataset.id);
};
$('#addCat').onclick = () => openCat(null);
$('#gpTemplate').onclick = () => {
  const snap = snapshot(); let n = 0;
  for (const t of GP_SET) if (!S.cats.some(c => c.name.toLowerCase() === t[0].toLowerCase())) { S.cats.push(mkCat(t)); n++; }
  save(); renderAll(); toast(n ? `Added ${n} GP trainee categor${n === 1 ? 'y' : 'ies'}` : 'You already have the full GP trainee set', n ? () => restore(snap) : null);
};
function openCat(id) {
  editCat = id ? S.cats.find(c => c.id === id) : null;
  $('#catTitle').textContent = editCat ? 'Edit category' : 'New category';
  $('#cName').value = editCat?.name || '';
  pickCol = (editCat?.color || PAL.find(p => !S.cats.some(c => (c.color || '').toUpperCase() === p[1]))?.[1] || PAL[0][1]).toUpperCase();
  $('#cSwatches').innerHTML = PAL.map(p => `<button type="button" style="--c:${isDark() ? p[2] : p[1]}" data-col="${p[1]}" class="${p[1] === pickCol ? 'on' : ''}" aria-label="${p[0]}" title="${p[0]}"></button>`).join('');
  $('#cKind').value = editCat?.kind || 'clinical';
  $('#cGoalType').value = editCat?.goalType || '';
  $('#cGoal').value = editCat?.goal || '';
  $('#cPeriod').value = editCat?.period || 'day';
  $('#cKeys').value = editCat?.keys || '';
  $('#cProject').checked = !!editCat?.project; $('#cPaused').checked = !!editCat?.paused; $('#cErr').textContent = '';
  $('#cDel').hidden = !editCat;
  $('#catDlg').showModal();
}
$('#cSwatches').onclick = e => { const b = e.target.closest('[data-col]'); if (!b) return; pickCol = b.dataset.col; $$('#cSwatches button').forEach(x => x.classList.toggle('on', x === b)); };
$('#cSave').onclick = () => {
  const name = $('#cName').value.trim(); if (!name) return $('#cName').focus();
  const d = { name, color: pickCol, kind: $('#cKind').value, goalType: $('#cGoalType').value, goal: +$('#cGoal').value || 0, period: $('#cPeriod').value, keys: $('#cKeys').value.trim(), project: $('#cProject').checked, paused: $('#cPaused').checked };
  if (d.project && !d.paused && S.cats.filter(c => c !== editCat && c.project && !c.paused).length >= 3) { $('#cErr').textContent = 'You already have three active projects. Pause or finish one first: fewer at once means each one moves.'; buzz([8, 40, 8]); return; }
  if (d.paused && running()?.catId === editCat?.id) stop(true);
  if (editCat) Object.assign(editCat, d); else S.cats.push({ id: uid(), ...d });
  save(); $('#catDlg').close(); renderAll();
};
$('#cDel').onclick = () => {
  const snap = snapshot(), victim = editCat;
  S.cats = S.cats.filter(c => c !== victim);
  if (selCat === victim.id) selCat = S.cats[0]?.id ?? null;
  save(); $('#catDlg').close(); renderAll(); toast(`Deleted ${victim.name}`, () => restore(snap));
};

/* ---------------- settings ---------------- */
function renderSettings() {
  $('#focusLen').value = String(S.settings.focusLen);
  $('#notifyOn').checked = !!S.settings.notify; $('#hapticOn').checked = !!S.settings.haptics;
  for (const k of ['wake', 'bed', 'shutdown', 'examName', 'examDate']) if (document.activeElement !== $('#' + k)) $('#' + k).value = S.settings[k] || '';
  $('#ltft').value = String(S.settings.ltft || 100);
  $('#weekStart').value = String(S.settings.weekStart ?? 1); $('#ifThenOn').checked = !!S.settings.ifThen;
  $$('#themeSeg button').forEach(b => b.classList.toggle('active', b.dataset.t === (S.settings.theme || 'system')));
  $('#widgetCard').hidden = !NATIVE;
  $('#appCard').hidden = !!NATIVE || !/Android/i.test(navigator.userAgent);
  if (NATIVE && !$('#wSel').contains(document.activeElement)) {
    const cur = S.settings.widgetCats || [], opts = live().map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    $('#wSel').innerHTML = [0, 1, 2, 3].map(i => `<label class="field">Button ${i + 1} <select data-w="${i}"><option value="">Automatic</option>${opts}</select></label>`).join('');
    $$('#wSel select').forEach(sel => { sel.value = cur[+sel.dataset.w] || ''; sel.onchange = () => { const v = $$('#wSel select').map(x => x.value); S.settings.widgetCats = v.some(Boolean) ? v.filter(Boolean) : []; save(); }; });
  }
}
$('#focusLen').onchange = e => { S.settings.focusLen = +e.target.value; save(); tick(); };
$('#notifyOn').onchange = e => { S.settings.notify = e.target.checked; save(); if (e.target.checked) { if (!('Notification' in window)) toast('This browser doesn’t support notifications'); else Notification.requestPermission(); } };
$('#hapticOn').onchange = e => { S.settings.haptics = e.target.checked; save(); buzz(10); };
for (const k of ['wake', 'bed', 'shutdown']) $('#' + k).onchange = e => { if (e.target.value) S.settings[k] = e.target.value; save(); renderDay(); };
for (const k of ['examName', 'examDate']) $('#' + k).onchange = e => { S.settings[k] = e.target.value.trim(); save(); renderTracker(); };
$('#weekStart').onchange = e => { S.settings.weekStart = +e.target.value; save(); renderAll(); };
$('#ifThenOn').onchange = e => { S.settings.ifThen = e.target.checked; save(); };
$('#ltft').onchange = e => { S.settings.ltft = +e.target.value; save(); renderAll(); };
$('#themeSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.settings.theme = b.dataset.t; save(); applyTheme(); renderAll(); };
function download(name, text, type) { if (NATIVE) { NATIVE.saveFile(name, text, type || 'application/octet-stream'); return; } const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
$('#expJson').onclick = () => download(`division-of-time-${ymd(Date.now())}.json`, JSON.stringify(S, null, 1), 'application/json');
$('#expCsv').onclick = () => {
  const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['Date', 'Start', 'End', 'Minutes', 'Category', 'Type', 'Description', 'Focus', 'Quality']].concat(
    S.entries.filter(real).sort((a, b) => a.start - b.start).map(e => [ymd(e.start), fmtTime(e.start), e.end ? fmtTime(e.end) : '', Math.round((endOf(e) - e.start) / MIN), cat(e.catId).name, KINDS[kindOf(e)] || '', e.desc, e.focus ? 'yes' : '', e.quality || '']));
  download(`division-of-time-${ymd(Date.now())}.csv`, rows.map(r => r.map(q).join(',')).join('\n'), 'text/csv');
};
$('#impJson').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const s = JSON.parse(await f.text()); if (!s.cats || !s.entries) throw 0; const snap = JSON.stringify(S); S = fix(s); save(); renderAll(); toast('Backup imported', () => { S = JSON.parse(snap); save(); renderAll(); }); }
  catch (err) { toast('That file isn’t a Division of Time backup'); }
  e.target.value = '';
};
$('#wipe').onclick = () => {
  if (!confirm('Delete every entry, category and note on this device? Export a backup first if you might want them.')) return;
  const snap = JSON.stringify(S); localStorage.removeItem(KEY); S = load(); selCat = S.cats[0].id; save(); renderAll();
  toast('All data deleted', () => { S = JSON.parse(snap); save(); renderAll(); });
};

/* ---------------- command menu ---------------- */
let cmdItems = [], cmdSel = 0;
function commands() {
  const r = running(), L = [];
  if (r) L.push(['Stop timer', () => stop(), 'Space']);
  L.push([r?.focus ? 'End focus session' : `Start a ${S.settings.focusLen}-minute focus session`, () => $('#focusBtn').click(), 'F']);
  live().forEach((c, i) => L.push([`Start ${c.name}`, () => { $('#desc').value = ''; start(c.id, ''); }, i < 9 ? String(i + 1) : '', colour(c)]));
  L.push(['Add past time', () => openEntry(null), 'A'], ['Go to today', () => { switchTab('today'); viewDay = sod(Date.now()); renderDay(); }], ['Previous day', () => { switchTab('today'); goDay(-1); }, '←'],
    ['Shutdown review', () => { rvDay = sod(Date.now()); switchTab('review'); }, 'R'], ['Habits', () => switchTab('review')], ['Insights', () => switchTab('reports')], ['Weekly review', () => { wrOff = 0; switchTab('review'); setTimeout(() => $('#weekReview').scrollIntoView(), 50); }],
    ['Categories', () => switchTab('categories')], ['Settings', () => switchTab('settings')]);
  if (gReady()) L.push(['Log today’s past calendar events', () => { switchTab('today'); viewDay = sod(Date.now()); renderDay(); $('#logEvents').click(); }]);
  else L.push(['Connect Google Calendar', gConnect]);
  L.push([isDark() ? 'Switch to light theme' : 'Switch to dark theme', () => { S.settings.theme = isDark() ? 'light' : 'dark'; save(); applyTheme(); renderAll(); }], ['Keyboard shortcuts', () => $('#keysDlg').showModal(), '?'], ['Export backup', () => $('#expJson').click()]);
  return L;
}
function renderCmd() {
  const q = $('#cmdIn').value.trim().toLowerCase();
  cmdItems = commands().filter(c => !q || q.split(/\s+/).every(w => c[0].toLowerCase().includes(w)));
  cmdSel = Math.min(cmdSel, Math.max(0, cmdItems.length - 1));
  $('#cmdList').innerHTML = cmdItems.map((c, i) => `<button role="option" class="${i === cmdSel ? 'sel' : ''}" data-i="${i}">${c[3] ? `<span class="dot" style="background:${c[3]}"></span>` : ''}${esc(c[0])}${c[2] ? `<kbd>${c[2]}</kbd>` : ''}</button>`).join('') || '<div class="empty">No matching command</div>';
  $('#cmdList .sel')?.scrollIntoView({ block: 'nearest' });
}
function openCmd() { $('#cmdIn').value = ''; cmdSel = 0; renderCmd(); $('#cmd').showModal(); $('#cmdIn').focus(); }
function runCmd(i) { const c = cmdItems[i]; $('#cmd').close(); if (c) c[1](); }
$('#cmdBtn').onclick = openCmd;
$('#cmdIn').oninput = () => { cmdSel = 0; renderCmd(); };
$('#cmdIn').onkeydown = e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); cmdSel = (cmdSel + 1) % Math.max(1, cmdItems.length); renderCmd(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); cmdSel = (cmdSel - 1 + cmdItems.length) % Math.max(1, cmdItems.length); renderCmd(); }
  else if (e.key === 'Enter') { e.preventDefault(); runCmd(cmdSel); }
};
$('#cmdList').onclick = e => { const b = e.target.closest('[data-i]'); if (b) runCmd(+b.dataset.i); };
$('#cmd').addEventListener('click', e => { if (e.target.id === 'cmd') $('#cmd').close(); });

/* ---------------- tabs + keys ---------------- */
function switchTab(name) {
  const jump = name === 'categories' ? '#catCard' : null; if (jump) name = 'settings';
  $$('.tabs button').forEach(x => { const on = x.dataset.tab === name; x.classList.toggle('active', on); x.setAttribute('aria-selected', on); });
  $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  if (name === 'reports') renderReports();
  if (name === 'today') { scrolledFor = null; renderDay(); }
  if (name === 'review') renderReview();
  if (jump) setTimeout(() => $(jump).scrollIntoView({ block: 'start' }), 30);
  else if (scrollY > 200) scrollTo({ top: 0 });
}
$$('.tabs button').forEach(b => b.onclick = () => switchTab(b.dataset.tab));
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#cmd').open ? $('#cmd').close() : openCmd(); return; }
  if (e.target.matches('input,textarea,select') || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
  const k = e.key;
  if (k === ' ' || k === 's') { e.preventDefault(); running() ? stop() : start(); }
  else if (k === 'f') { e.preventDefault(); $('#focusBtn').click(); }
  else if (k === 'r') { rvDay = sod(Date.now()); switchTab('review'); }
  else if (k === 'n') { e.preventDefault(); $('#desc').focus(); }
  else if (k === 'a') { e.preventDefault(); openEntry(null); }
  else if (k === '/') { e.preventDefault(); openCmd(); }
  else if (k === '?') $('#keysDlg').showModal();
  else if (k === 'ArrowLeft' && $('#tab-today').classList.contains('active')) goDay(-1);
  else if (k === 'ArrowRight' && $('#tab-today').classList.contains('active')) goDay(1);
  else if (/^[1-9]$/.test(k) && live()[+k - 1]) { const id = live()[+k - 1].id, r = running(); if (r && r.catId === id) stop(); else { $('#desc').value = ''; start(id, ''); } }
});
// close dialogs on backdrop click
$$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d && d.id !== 'guardDlg') d.close(); }));

function renderAll() { renderTracker(); renderG(); renderDay(); renderCats(); renderSettings(); if ($('#tab-reports').classList.contains('active')) renderReports(); if ($('#tab-review').classList.contains('active')) renderReview(); $('#reviewDot').hidden = !reviewDue(); tick(); }
applyTheme(); renderAll(); guard();
let lastToday = sod(Date.now());
setInterval(() => {
  tick();
  const r = running();
  if (r) { const el = document.querySelector(`[data-live="${r.id}"]`); if (el) el.textContent = fmtHM(Date.now() - r.start); }
  const t = sod(Date.now());
  if (t !== lastToday) { if (viewDay === lastToday) viewDay = t; lastToday = t; renderAll(); }
}, 1000);
setInterval(() => { save(); if ($('#tab-today').classList.contains('active') && !document.querySelector('dialog[open]')) renderDay(); }, 60000);
addEventListener('storage', e => { if (e.key === KEY) { S = load(); renderAll(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { guard(); renderAll(); } else { S.settings.lastSeen = Date.now(); save(); } });
addEventListener('pagehide', () => { S.settings.lastSeen = Date.now(); save(); });
addEventListener('online', () => { gFlush(); });
let rsz; addEventListener('resize', () => { clearTimeout(rsz); rsz = setTimeout(() => { if ($('#tab-reports').classList.contains('active')) renderReports(); }, 200); });
if (gReady()) gLoadCals().then(() => { gFlush(); renderAll(); });
// In the Android app, check once a day whether a newer APK is on the site.
function nativeUpdateCheck() {
  if (!NATIVE || !NATIVE.versionCode) return;
  fetch('app/version.json', { cache: 'no-store' }).then(r => r.json()).then(v => {
    const newer = v.code > NATIVE.versionCode(); $('#appUpdate').hidden = !newer;
    if (newer && S.settings.updNag !== ymd(Date.now())) { S.settings.updNag = ymd(Date.now()); save(); toast('An app update is ready in Settings'); }
  }).catch(() => {});
}
if (NATIVE) { document.documentElement.classList.add('native'); nativeUpdateCheck(); if (S.g.on && !gReady()) NATIVE.googleAuth(SCOPES, true); window.__dotNativePending(); setInterval(() => { if (S.g.on && G.exp && G.exp - Date.now() < 5 * 60000) NATIVE.googleAuth(SCOPES, true); }, 60000); }
// compact the sticky timer once the page scrolls (hysteresis stops it flickering at the threshold)
addEventListener('scroll', () => { const h = $('#hero'), c = h.classList.contains('compact'); if (!c && scrollY > 160) h.classList.add('compact'); else if (c && scrollY < 40) h.classList.remove('compact'); }, { passive: true });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.__dot = { get S() { return S; }, G, renderAll, start, stop, switchTab, guard, openCmd, habits };
})();
