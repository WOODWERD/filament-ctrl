// Filament Ctrl: the screens (FM-S01 to FM-S13, FM-U01 to FM-U16). Plain DOM, one delegated click handler, as Photo Ctrl.
import { emptyRecord, addSpools, markOpened, markEmpty, moveSpool, setLeft, getSpool, getFilament, inPlace, filamentCounts,
  shelfCounts, shelf, defaultTicks, applyProposal, declineProposal, placeText, SLOTS, isoToday } from './core.js';
import { client, standin, standinAllowed } from './github.js';
import * as db from './store.js';
import { STATEMENT, CHOOSE, GUIDES } from './guides.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const wide = matchMedia('(min-width:768px)');
const MATERIALS = ['PLA', 'PETG', 'ABS and ASA', 'TPU', 'Engineering', 'Support'];

const S = {
  view: 'shelf', conn: null, gh: null, problem: null, loaded: false,
  rec: null, catalog: null, proposals: [], snapshot: null,
  filter: 'all', q: '', open: null, sheet: null, undo: null, saving: false, notice: null,
  mq: '', mfilter: 'all', line: null, chooseOpen: false, ask: {}, review: 0, ticks: null,
  add: { material: 'PLA', line: null, colour: null, count: 1, net: 1000, place: 'Sealed', other: false, o: {} },
  connectMsg: null, busy: false, focus: null,
};

// ---------- start, load, save ----------
async function start() {
  S.conn = db.getMeta('conn');
  const cached = db.getMeta('cache');
  if (cached) Object.assign(S, { rec: cached.rec, catalog: cached.catalog, proposals: cached.proposals || [] });
  if (new URLSearchParams(location.search).has('standin') && standinAllowed()) S.conn = { repo: 'standin', standin: true };
  // F3: draw at once (Reading your repo, or the shelf as last seen) rather than a blank page while the repo is read.
  if (S.conn) { S.gh = S.conn.standin ? standin() : client(S.conn.repo, S.conn.token); render(); await refresh(); }
  if (S.rec && S.view === 'shelf' && S.rec.spools.some((s) => s.place.kind === 'AMS')) S.view = 'printer'; // FM-U03
  render();
  wide.addEventListener('change', render);
}

async function refresh() {
  const r = await S.gh.load();
  if (r.error) { S.problem = r.error; render(); return; }
  S.problem = null; S.loaded = true;
  S.rec = r.record || emptyRecord();
  S.catalog = r.catalog; S.proposals = r.proposals; S.snapshot = r.snapshot;
  if (!S.conn.standin) db.setMeta('cache', { rec: S.rec, catalog: S.catalog, proposals: S.proposals });
}

// One change, one commit (FM-A10). Undo writes the record before it back, in one more commit.
async function commit(next, message, extra = [], undoable = true) {
  // Until the repo has been read once, the page can't know whether its copy is the latest (F5), so it doesn't save.
  if (!S.loaded) { S.problem = { kind: 'reading', text: 'Still reading your repo, so nothing was saved. Try again in a moment.' }; render(); return false; }
  const before = S.rec;
  S.saving = true; S.rec = next; render();
  const r = await S.gh.save([{ path: 'filament-ctrl.json', json: next }, ...extra], message);
  S.saving = false;
  if (r.error?.kind === 'stale') { S.undo = null; await refresh(); S.problem = r.error; render(); return false; } // F5: read again, never write over
  if (r.error) { S.rec = before; S.problem = r.error; render(); return false; }
  S.undo = undoable ? { rec: before, message } : null;
  if (!S.conn.standin) db.setMeta('cache', { rec: S.rec, catalog: S.catalog, proposals: S.proposals });
  render();
  return true;
}
async function undo() {
  if (!S.undo) return;
  const u = S.undo; S.undo = null;
  await commit(u.rec, `Undo: ${u.message}`, [], false);
}

// ---------- small parts ----------
// Swatch (WOODWERD Digital, FM-U05): the filament's own colour, never a state; hollow for No colour; split for several.
function sw(values, size = 21) {
  const v = (values || []).filter(Boolean);
  if (!v.length) return `<span class="sw none" style="--s:${size}px" aria-hidden="true"></span>`;
  const bg = v.length === 1 ? v[0] : `conic-gradient(${v.map((c, i) => `${c} ${(i * 100) / v.length}% ${((i + 1) * 100) / v.length}%`).join(',')})`;
  return `<span class="sw" style="--s:${size}px;background:${esc(bg)}" aria-hidden="true"></span>`;
}
const colourName = (f) => f?.colour || 'No colour';
const filamentLine = (f) => [f?.brand === 'Bambu Lab' ? 'Bambu' : f?.brand, f?.line].filter(Boolean).join(' ');
const grams = (n) => (n == null ? '—' : `${Math.round(n).toLocaleString('en-US')} g`);
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
function leftBar(s) {
  const pct = s.net ? Math.max(0, Math.min(100, Math.round((100 * (s.left?.grams || 0)) / s.net))) : 0;
  return `<span class="track" aria-hidden="true"><i style="width:${pct}%"></i></span>`;
}
const low = () => '<span class="lowtag"><i></i>Low</span>'; // FM-U06: the word, with an attention dot
const tier = (n, title, desc, state, stateCls, body, cls = '') => `<section class="tier ${cls}"><div class="tier-h">${n ? `<span class="n">${n}</span>` : ''}<h2>${esc(title)}</h2><span class="tier-d">${desc}</span>${state ? `<span class="tier-s ${stateCls}">${esc(state)}</span>` : ''}</div><div class="pad">${body}</div></section>`;
const waiting = () => S.proposals.filter((p) => p.status === 'Waiting');

// How old the places are, in honest words (FM-U12, FM-R25)
function printerState() {
  const p = S.rec?.places || {};
  const age = p.at ? (Date.now() - Date.parse(p.at)) / 864e5 : 0;
  if (p.from === 'Read from the printer') return age > 1 ? [`Last read ${p.at}`, 'warn'] : ['Read from the printer', 'ok'];
  if (p.from === 'From Bambu Studio') return age > 1 ? [`Last read ${p.at}`, 'warn'] : ['From Bambu Studio', 'idle'];
  return ['Set by hand', 'idle'];
}

function leds() { // FM-U02: Repo, Printer, Waiting
  const out = [];
  if (!S.conn) out.push(['', 'Not connected']);
  else if (S.problem?.kind === 'stale') out.push(['on-busy', 'Read again']);
  else if (S.problem?.kind === 'reading') out.push(['on-busy blink', 'Reading']);
  else if (S.problem) out.push(['on-fault', 'Repo problem']);
  else if (S.saving) out.push(['on-busy blink', 'Saving']);
  else if (!S.loaded) out.push(['on-busy blink', 'Reading']);
  else out.push(['on-ok', S.conn.standin ? 'Stand-in repo' : 'Repo']);
  if (S.rec) { const [t, c] = printerState(); out.push([c === 'ok' ? 'on-ok' : c === 'warn' ? 'on-busy' : '', t]); }
  const w = waiting().length;
  if (w) out.push(['on-busy', `${w} waiting`]);
  $('#leds').innerHTML = out.map(([c, t]) => `<span class="led ${c}"><i></i><span>${esc(t)}</span></span>`).join('');
  const dc = document.querySelector('[data-act="disconnect"]'); if (dc) dc.hidden = !S.conn || S.conn.standin;
}

// ---------- render ----------
function render() {
  leds();
  let v;
  if (!S.conn) v = S.view === 'connect' ? connectView() : firstView();
  else if (!S.rec) v = S.problem ? problemView() : tier(0, 'Loading', 'Reading your repo', 'Reading', 'idle', '<p class="small">One moment.</p>');
  else {
    const views = { printer: printerView, shelf: shelfView, materials: materialsView, review: reviewView, ask: askView, add: addView };
    if (!wide.matches && (S.view === 'review' || S.view === 'add')) S.view = 'shelf'; // FM-U09
    v = (S.problem ? problemView() : '') + barView() + (views[S.view] || shelfView)();
  }
  $('#app').innerHTML = v + undoBar() + (S.sheet ? sheetView() : '');
  if (S.focus) { const el = document.getElementById(S.focus); if (el) { el.focus(); const n = el.value?.length ?? 0; try { el.setSelectionRange(n, n); } catch { /* not a text box */ } } }
}

function undoBar() {
  if (!S.undo || S.saving) return '';
  return `<div class="undobar" role="status"><span>${esc(S.undo.message)}. Saved.</span><button type="button" class="key" data-act="undo">Undo</button></div>`;
}

function barView() { // FM-U03 and the phone's FM-U09
  const c = shelfCounts(S.rec);
  const w = waiting().length;
  const seg = [['printer', 'Printer', ''], ['shelf', 'Shelf', c.spools], ['materials', 'Materials', '']];
  if (wide.matches) seg.push(['review', 'Review', w]);
  return `<div class="bar">
    <span class="segc views" role="group" aria-label="View">${seg.map(([k, t, n]) => `<button type="button" data-act="view" data-v="${k}" aria-pressed="${S.view === k}">${t}${n !== '' ? ` <span class="mono">${n}</span>` : ''}</button>`).join('')}</span>
    <span class="sp"></span>
    ${wide.matches ? `<button type="button" class="key" data-act="view" data-v="ask">Ask Claude</button>${S.view === 'shelf' ? '<button type="button" class="key" data-act="view" data-v="add">Add spools</button>' : ''}` : ''}
  </div>${wide.matches ? '' : '<div class="health"><b>On a phone</b><span>Add spools and review on a computer or iPad.</span></div>'}`;
}

// ---------- first open, connect, problems (FM-S01, S02, S08) ----------
function firstView() {
  return tier(1, 'Get started', 'Your own private repo', 'Not connected', 'idle', `
    <p class="lede">Filament Ctrl keeps count of the filament on your shelf and knows which spools are in the printer. Your record lives in a private GitHub repo of your own, and your own Claude reads your orders and Bambu Studio into it.</p>
    <div class="row"><button type="button" class="key go" data-act="connect">Connect a data repo</button><a class="guidelink" href="guide.html#start">How it works, and making the repo</a></div>`);
}
function connectView() {
  const m = S.connectMsg;
  return tier(1, 'Connect', 'Your Filament Ctrl data repo', m?.ok ? 'Private · ready' : 'Not connected', m?.ok ? 'ok' : 'idle', `
    <form class="fields" id="connectForm" autocomplete="off">
      <label class="field"><span class="lbl">Data repo</span><input class="in mono" name="repo" placeholder="you/filament-data" value="${esc(m?.repo || '')}" required><span class="help">As owner/name. A private repo of its own.</span></label>
      <label class="field"><span class="lbl">Token</span><input class="in" name="token" type="password" required><span class="help">A fine-grained token for this one repo, with Contents read and write.</span></label>
    </form>
    ${m && !m.ok ? `<div class="health bad"><b>${esc(m.title)}</b><span>${esc(m.text)}</span></div>` : ''}
    <div class="row"><button type="submit" form="connectForm" class="key go" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Checking' : 'Connect'}</button><button type="button" class="key" data-act="cancel">Cancel</button></div>
    <p class="small">The token stays on this device only. Disconnect deletes it.</p>`);
}
function problemView() {
  const p = S.problem;
  return tier(0, 'Data repo', `<span class="mono">${esc(S.conn.repo)}</span>`, p.kind === 'offline' ? 'Offline' : p.kind === 'public' ? 'Repo is public' : p.kind === 'stale' ? 'Read again' : p.kind === 'reading' ? 'Reading' : 'Repo problem', ['offline', 'stale', 'reading'].includes(p.kind) ? 'warn' : 'bad', `
    <div class="health ${['offline', 'stale', 'reading'].includes(p.kind) ? 'warn' : 'bad'}"><b>${p.kind === 'public' ? 'Nothing was saved. This repo is public' : p.kind === 'offline' ? 'Not connected to GitHub' : p.kind === 'stale' ? 'Changed somewhere else' : p.kind === 'reading' ? 'Not ready yet' : 'Nothing was saved'}</b><span>${esc(p.text)}</span></div>
    <div class="row"><button type="button" class="key go" data-act="recheck">Check again</button>${p.kind === 'auth' || p.kind === 'missing' ? '<button type="button" class="key" data-act="reconnect">Connect again</button>' : ''}</div>`);
}

// ---------- Printer (FM-S03, FM-U04) ----------
function printerView() {
  const pr = S.rec.printer || {};
  const units = pr.ams?.length ? pr.ams : [{ unit: 1, model: null }];
  const [state, cls] = printerState();
  const areas = units.map((u) => tier(0, `AMS ${u.unit}`, esc(u.model || 'AMS'), state, cls, `<div class="slots">${
    Array.from({ length: SLOTS }, (_, i) => slotCard({ kind: 'AMS', unit: u.unit, slot: i + 1 })).join('')}</div>`, 'ams')).join('');
  const ext = inPlace(S.rec, { kind: 'External' });
  const extRow = `<button type="button" class="extrow" data-act="slot" data-place='${JSON.stringify({ kind: 'External' })}'>
    <span class="mono b">EXT</span>${ext ? `${sw(getFilament(S.rec, ext.filament)?.values)}<span class="grow"><b>${esc(colourName(getFilament(S.rec, ext.filament)))}</b> <span class="small">${esc(filamentLine(getFilament(S.rec, ext.filament)))}</span></span><span class="mono">${grams(ext.left?.grams)}</span><span class="mono small">${esc(ext.id)}</span>` : '<span class="sw none" style="--s:21px"></span><span class="grow small">External holder empty</span>'}</button>`;
  return areas + extRow + printerDetails();
}
function slotCard(place) {
  const s = inPlace(S.rec, place);
  const data = `data-act="slot" data-place='${JSON.stringify(place)}'`;
  if (!s) return `<button type="button" class="slot empty" ${data}><span class="mono b">SLOT ${place.slot}</span><span class="row">${sw([], 34)}<b>Empty slot</b></span><span class="small">Load a spool</span></button>`;
  const f = getFilament(S.rec, s.filament);
  const isLow = filamentCounts(S.rec, s.filament).low;
  return `<button type="button" class="slot" ${data}>
    <span class="spread"><span class="mono b">SLOT ${place.slot}</span><span class="mono small">${esc(s.id)}</span></span>
    <span class="row nowrap">${sw(f?.values, 34)}<span class="sm"><b>${esc(colourName(f))}</b><span class="small">${esc(filamentLine(f))}</span></span></span>
    ${leftBar(s)}
    <span class="spread small"><span class="mono ink">${grams(s.left?.grams)}</span><span>${isLow ? low() : esc(s.left?.from || '')}</span></span></button>`;
}
function printerDetails() { // FM-R66: what printer fit is checked against
  const p = S.rec.printer || {};
  const yn = (k, v) => `<select class="mini" name="${k}"><option value="">Not known</option><option value="yes" ${v === true ? 'selected' : ''}>Yes</option><option value="no" ${v === false ? 'selected' : ''}>No</option></select>`;
  return `<details class="pdetails"><summary>Printer details <span class="small">${esc([p.model, p.topNozzle ? `${p.topNozzle} °C` : null].filter(Boolean).join(' · ') || 'Not set')}</span></summary>
    <form id="printerForm" class="fields">
      <label class="field"><span class="lbl">Printer</span><input class="in" name="model" value="${esc(p.model || '')}" placeholder="X1 Carbon"></label>
      <label class="field"><span class="lbl">Top nozzle temperature</span><input class="in mono" name="topNozzle" inputmode="numeric" value="${esc(p.topNozzle ?? '')}" placeholder="300"><span class="help">In °C. Used to say whether a material fits.</span></label>
      <label class="field"><span class="lbl">Hardened nozzle</span>${yn('hardenedNozzle', p.hardenedNozzle)}</label>
      <label class="field"><span class="lbl">Enclosed</span>${yn('enclosed', p.enclosed)}</label>
      <label class="field"><span class="lbl">AMS units</span><input class="in mono" name="amsCount" inputmode="numeric" value="${esc(p.ams?.length ?? 1)}"><span class="help">0 to 4. Four slots each.</span></label>
      <label class="field"><span class="lbl">AMS model</span><input class="in" name="amsModel" value="${esc(p.ams?.[0]?.model || '')}" placeholder="AMS 2 Pro"></label>
    </form>
    <div class="row"><button type="submit" form="printerForm" class="key">Save printer details</button></div></details>`;
}

// ---------- Shelf (FM-S04, S05, FM-U07, U08) ----------
function shelfView() {
  const c = shelfCounts(S.rec);
  const q = S.q.trim().toLowerCase();
  const groups = shelf(S.rec, S.filter).map((g) => ({ ...g, rows: g.rows.filter((r) => !q || [r.filament.colour, r.filament.line, r.filament.brand, r.filament.material].join(' ').toLowerCase().includes(q)) })).filter((g) => g.rows.length);
  const shown = groups.reduce((n, g) => n + g.rows.length, 0);
  const counts = [['all', 'Spools', c.spools], ['sealed', 'Sealed', c.sealed], ['open', 'Open', c.open], ['inPrinter', 'In printer', c.inPrinter], ['low', 'Low', c.low]];
  const list = `<div class="counts">${counts.map(([k, t, n]) => `<button type="button" class="countb" data-act="filter" data-v="${k}" aria-pressed="${S.filter === k}"><b class="mono">${n}</b><span>${t}</span></button>`).join('')}</div>
    <input class="in" id="shelfSearch" type="search" placeholder="Search the shelf" value="${esc(S.q)}" aria-label="Search the shelf">
    <p class="small"><b class="mono ink">${shown}</b> of <b class="mono ink">${S.rec.filaments.filter((f) => { const k = filamentCounts(S.rec, f.id); return k.sealed + k.open; }).length}</b> filaments</p>
    ${groups.length ? groups.map((g) => `<div class="grp"><span>${esc(g.material)}</span><span class="mono">${g.rows.length}</span></div>${g.rows.map((r) => `
      <button type="button" class="drow ${S.open === r.filament.id ? 'on' : ''}" data-act="openf" data-v="${r.filament.id}">
        ${sw(r.filament.values)}<span class="sm"><b>${esc(colourName(r.filament))}</b><span class="small">${esc(filamentLine(r.filament))}${r.filament.diameter && r.filament.diameter !== 1.75 ? ` · ${r.filament.diameter} mm` : ''}</span><span class="mono small">${r.sealed} sealed · ${r.open} open</span></span>
        <span class="mono">${grams(r.grams)}</span>${r.low ? low() : '<span></span>'}</button>`).join('')}`).join('')
      : `<div class="empty">${S.rec.spools.length ? 'Nothing here with this filter or search.' : 'No spools yet. Add spools, or ask Claude to read your orders.'}</div>`}`;
  const detail = S.open ? filamentDetail(S.open) : '';
  if (!wide.matches) return S.open ? `<button type="button" class="lnk" data-act="closef">‹ Shelf</button>${detail}` : list;
  return `<div class="ld"><div class="lcol">${list}</div><div class="dcol">${detail || '<div class="empty">Choose a filament to see its spools.</div>'}</div></div>`;
}

function filamentDetail(fid) {
  const f = getFilament(S.rec, fid);
  if (!f) return '';
  const ss = S.rec.spools.filter((s) => s.filament === fid).sort((a, b) => (a.place.kind === 'Empty') - (b.place.kind === 'Empty') || a.id.localeCompare(b.id));
  const c = filamentCounts(S.rec, fid);
  return `<section class="tier"><div class="tier-h"><h2>${esc(colourName(f))}</h2><span class="tier-d">${esc(filamentLine(f))} · ${esc(f.diameter || 1.75)} mm${f.lineId ? ` · <span class="mono">${esc(f.lineId)}</span>` : ''}</span>${c.low ? '<span class="tier-s warn">Low</span>' : ''}</div><div class="pad">
    <div class="row nowrap">${sw(f.values, 34)}<span class="small">${c.sealed} sealed · ${c.open} open · ${grams(c.grams)} in all</span></div>
    <div class="spools">${ss.map((s) => `<button type="button" class="srow2 ${s.place.kind === 'Empty' ? 'gone' : ''}" data-act="sheet" data-v="${s.id}">
      <span class="mono b">${esc(s.id)}</span><span class="sm"><span>${esc(placeText(s.place))}</span><span class="small">${s.opened ? `Opened ${esc(s.opened)}` : 'Not opened'}${s.order?.number ? ` · order <span class="mono">${esc(s.order.number)}</span>` : ''}</span></span>
      <span class="leftcol">${leftBar(s)}<span class="mono small">${grams(s.left?.grams)} · ${esc(s.left?.from || '')}</span></span></button>`).join('')}</div>
    <details class="hist"><summary>History</summary><ul>${ss.flatMap((s) => s.history.map((h) => `<li><span class="mono">${esc(h.date)}</span> <span class="mono">${esc(s.id)}</span> ${esc(h.what)}</li>`)).reverse().join('')}</ul></details>
  </div></section>`;
}

// A spool's quick changes (FM-S10). On a phone, only Opened, Empty and Move to slot (FM-R41).
function loadSheet(p) { // an empty slot or holder, set by hand (FM-R26)
  const ss = S.rec.spools.filter((s) => s.place.kind === 'Open' || s.place.kind === 'Sealed').sort((a, b) => (a.place.kind === 'Sealed') - (b.place.kind === 'Sealed') || a.id.localeCompare(b.id));
  return `<div class="scrim" data-act="closesheet"></div><section class="sheet" role="dialog" aria-label="Load ${esc(placeText(p))}">
    <div class="row nowrap"><b class="big">Load ${esc(placeText(p))}</b><span class="sp"></span><button type="button" class="key sq" data-act="closesheet" aria-label="Close">×</button></div>
    ${ss.length ? `<div class="picks">${ss.map((s) => { const f = getFilament(S.rec, s.filament); return `<button type="button" class="pick" data-act="loadpick" data-v="${esc(s.id)}"><span class="mono">${esc(s.id)}</span>${sw(f?.values)}<span class="grow">${esc(colourName(f))} · ${esc(filamentLine(f))}</span><span class="small">${esc(s.place.kind)} · ${grams(s.left?.grams)}</span></button>`; }).join('')}</div>`
      : '<div class="empty">No open or sealed spools to load. Add spools first.</div>'}</section>`;
}
function sheetView() {
  if (S.sheet.load) return loadSheet(S.sheet.load);
  const s = getSpool(S.rec, S.sheet.id);
  if (!s) return '';
  const f = getFilament(S.rec, s.filament);
  const places = [];
  for (const u of (S.rec.printer?.ams?.length ? S.rec.printer.ams : [{ unit: 1 }])) for (let i = 1; i <= SLOTS; i++) places.push({ kind: 'AMS', unit: u.unit, slot: i });
  places.push({ kind: 'External' }, { kind: 'Open' });
  const move = S.sheet.move ? `<div class="picks">${places.map((p) => { const o = inPlace(S.rec, p); const of = o && getFilament(S.rec, o.filament); const here = p.kind === s.place.kind && (p.kind !== 'AMS' || (p.unit === s.place.unit && p.slot === s.place.slot));
    return `<button type="button" class="pick" data-act="moveto" data-place='${JSON.stringify(p)}' ${here ? 'aria-current="true" disabled' : ''}><span class="mono">${p.kind === 'AMS' ? `AMS ${p.unit}·${p.slot}` : p.kind === 'External' ? 'EXT' : 'SHELF'}</span>${p.kind === 'Open' ? '<span class="grow">Back on the shelf, open</span>' : o ? `${sw(of?.values)}<span class="grow">${esc(colourName(of))}, ${esc(o.id)}</span>` : `${sw([])}<span class="grow">Empty</span>`}</button>`; }).join('')}
    <p class="small">Moving into a full slot sends that spool back to Open. Undo stays until your next change.</p></div>` : '';
  const live = s.place.kind !== 'Empty';
  return `<div class="scrim" data-act="closesheet"></div><section class="sheet" role="dialog" aria-label="${esc(s.id)}">
    <div class="row nowrap">${sw(f?.values, 34)}<span class="sm"><b class="big">${esc(colourName(f))}</b><span class="small">${esc(filamentLine(f))} · ${esc(f?.diameter || 1.75)} mm</span></span><span class="sp"></span><button type="button" class="key sq" data-act="closesheet" aria-label="Close">×</button></div>
    <dl class="readout"><dt>Spool</dt><dd class="mono b">${esc(s.id)}</dd><dt>Place</dt><dd>${esc(placeText(s.place))}</dd><dt>Left</dt><dd>${leftBar(s)}<span class="mono">${grams(s.left?.grams)} · ${esc(s.left?.from || '')}</span></dd><dt>Opened</dt><dd class="mono">${esc(s.opened || '—')}</dd></dl>
    ${live ? `<div class="row">
      ${s.opened ? '' : '<button type="button" class="key" data-act="opened">Opened</button>'}
      <button type="button" class="key ${S.sheet.move ? 'on' : ''}" data-act="move">Move to slot</button>
      <button type="button" class="key" data-act="empty">Mark empty</button>
    </div>${s.opened ? '<p class="small">Already open, so Opened isn\'t offered.</p>' : ''}
    ${wide.matches ? `<form id="leftForm" class="row"><label class="small" for="leftIn">Left, weighed or guessed</label><input id="leftIn" class="mini mono" name="g" inputmode="numeric" placeholder="${esc(s.left?.grams ?? '')}"><select class="mini" name="from"><option>Used</option><option>Guess</option></select><button class="key" type="submit">Set</button></form>` : ''}` : '<p class="small">Empty. Kept for its history.</p>'}
    ${move}</section>`;
}

// ---------- Add spools (FM-S09, FM-R10) ----------
function catalogLines() { return S.catalog?.lines || []; }
function addView() {
  const a = S.add;
  const lines = catalogLines().filter((l) => l.material === a.material);
  const line = lines.find((l) => l.id === a.line);
  const colour = line?.colours.find((c) => c.code === a.colour);
  const known = S.rec.filaments;
  const pick = a.other ? `
    <div class="fields">
      ${[['brand', 'Brand', 'Sunlu'], ['line', 'Line', 'PLA+'], ['material', 'Material', 'PLA'], ['colour', 'Colour name', 'Orange'], ['value', 'Colour value', '#F28C28'], ['diameter', 'Diameter, mm', '1.75']].map(([k, t, ph]) => `<label class="field"><span class="lbl">${t}</span><input class="in ${k === 'value' || k === 'diameter' ? 'mono' : ''}" data-add="${k}" value="${esc(a.o[k] || '')}" placeholder="${ph}"></label>`).join('')}
    </div>` : `
    ${S.catalog ? '' : '<div class="health warn"><b>No materials list yet</b><span>Ask Claude to update the materials list, or add another maker\'s filament by hand.</span></div>'}
    <span class="segc" role="group" aria-label="Material">${MATERIALS.map((m) => `<button type="button" data-act="addmat" data-v="${esc(m)}" aria-pressed="${a.material === m}">${esc(m)}</button>`).join('')}</span>
    <div class="row">${lines.map((l) => `<button type="button" class="chip ${a.line === l.id ? 'on' : ''}" data-act="addline" data-v="${esc(l.id)}">${esc(l.name)}</button>`).join('')}</div>
    ${line ? `<div class="cgrid">${line.colours.map((c) => `<button type="button" class="cell ${a.colour === c.code ? 'on' : ''}" data-act="addcolour" data-v="${esc(c.code)}">${sw(c.values)}<span class="sm"><b>${esc(c.name)}</b><span class="mono small">${esc(c.code)}</span></span></button>`).join('') || '<div class="empty">No colours listed for this line. Add it with No colour.</div>'}</div>` : ''}`;
  const ready = a.other ? a.o.line && a.o.material : line && (colour || !line.colours.length);
  return tier(0, 'Add spools', 'Pick the filament, then how many and where', '', '', `
    <div class="row"><span class="segc" role="group" aria-label="From"><button type="button" data-act="addother" data-v="" aria-pressed="${!a.other}">Bambu Lab</button><button type="button" data-act="addother" data-v="1" aria-pressed="${a.other}">Another maker</button></span>
    ${known.length ? `<select class="mini" data-act-change="addknown" aria-label="Or one you have"><option value="">Or one you have…</option>${known.map((f) => `<option value="${esc(f.id)}">${esc(colourName(f))} · ${esc(filamentLine(f))}</option>`).join('')}</select>` : ''}</div>
    ${pick}
    <div class="row"><label class="small">How many <input class="mini mono" data-add="count" inputmode="numeric" value="${esc(a.count)}" size="3"></label>
      <label class="small">Net weight, g <input class="mini mono" data-add="net" inputmode="numeric" value="${esc(a.net)}" size="5"></label>
      <label class="small">Place <select class="mini" data-add="place">${['Sealed', 'Open'].map((p) => `<option ${a.place === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label></div>
    <div class="row"><button type="button" class="key go" data-act="doadd" ${ready ? '' : 'disabled'}>Add ${plural(Math.max(1, parseInt(a.count, 10) || 1), 'spool')}</button><button type="button" class="key" data-act="view" data-v="shelf">Cancel</button>
      <span class="small">New IDs from <span class="mono">FM-${String(S.rec.meta.nextSpool).padStart(3, '0')}</span>.</span></div>`);
}
function addFilament() {
  const a = S.add;
  if (a.other) return { brand: a.o.brand || null, line: a.o.line, material: a.o.material, colour: a.o.colour || null, values: /^#[0-9a-f]{6}$/i.test(a.o.value || '') ? [a.o.value.toUpperCase()] : [], diameter: Number(a.o.diameter) || 1.75 };
  const line = catalogLines().find((l) => l.id === a.line);
  const c = line?.colours.find((x) => x.code === a.colour);
  return { brand: 'Bambu Lab', line: line.name, lineId: line.id, material: line.material, colour: c?.name || null, values: c?.values || [], code: c?.code || null, diameter: 1.75 };
}

// ---------- Review (FM-S06, FM-U10) ----------
function reviewView() {
  const ws = waiting();
  if (!ws.length) return tier(0, 'Review', 'Proposals from your own Claude', 'Nothing waiting', 'idle', `<div class="empty">Nothing to review. Ask Claude to read your orders or the printer, and what it finds waits here.</div><div class="row"><button type="button" class="key" data-act="view" data-v="ask">Ask Claude</button></div>`);
  const i = Math.min(S.review, ws.length - 1);
  const p = ws[i];
  if (!S.ticks || S.ticks.id !== p.id) S.ticks = { id: p.id, t: defaultTicks(p) };
  const src = p.source || {};
  const title = src.kind === 'Order' ? 'New spools' : src.kind === 'Bambu Studio' ? 'Slots from Bambu Studio' : src.kind === 'Print' ? 'After a print' : 'Changes';
  const n = p.changes.reduce((k, c, j) => k + (S.ticks.t[j] ? (c.type === 'newSpools' ? c.count || 1 : 1) : 0), 0);
  const rows = p.changes.map((c, j) => {
    const f = c.filament || getFilament(S.rec, getSpool(S.rec, c.spool)?.filament) || {};
    const what = c.type === 'newSpools' ? `${c.count > 1 ? `${c.count} × ` : ''}${esc(filamentLine(f))} · ${grams(c.net)}` : c.type === 'spoolOpened' ? `${esc(c.spool)} opened` : c.type === 'spoolEmpty' ? `${esc(c.spool)} empty`
      : c.type === 'spoolUsed' ? `${esc(c.spool)} less ${grams(c.grams)}` : `${esc(c.spool)} to ${esc(placeText(c.to))}`;
    const dot = c.sure === 'Sure' ? 'ok' : c.sure === 'Likely' ? 'likely' : 'guess';
    return `<label class="prow"><input type="checkbox" data-act="tick" data-v="${j}" ${S.ticks.t[j] ? 'checked' : ''}>${sw(f.values)}
      <span class="sm"><b>${esc(colourName(f))}</b><span class="small">${what}${c.textRead ? ` · <span class="mono">“${esc(c.textRead)}”</span>` : ''}</span></span>
      <span class="small">${esc(c.place || '')}</span><span class="sure ${dot}"><i></i>${esc(c.sure)}</span></label>`;
  }).join('');
  return tier(0, title, `${src.kind === 'Order' ? `From an order · ${esc(src.seller || '')} · <span class="mono">${esc(src.number || '')}</span> · ${esc(src.date || '')}` : src.kind === 'Bambu Studio' ? `Bambu Studio's AMS list, as of ${esc(src.date || '')}. Line only, not colour` : src.kind === 'Print' ? `${esc(src.job || '')} ran on ${esc(src.date || '')}` : esc(src.kind || '')}`, 'Waiting for you', 'warn', `
    <p class="small">Read by Claude on ${esc(p.read || '')}. Addresses, payment and prices are never copied. Sure and Likely lines are ticked; a Guess is left for you.</p>
    <div class="plist">${rows}</div>
    ${(p.skipped || []).map((s) => `<div class="health"><b>Skipped</b><span class="mono">“${esc(s.textRead)}”</span><span>${esc(s.why)}</span></div>`).join('')}
    <div class="row"><button type="button" class="key go" data-act="accept" ${n && !S.saving ? '' : 'disabled'}>${p.changes.every((c) => c.type === 'newSpools') ? `Add ${plural(n, 'spool')}` : `Accept ${plural(S.ticks.t.filter(Boolean).length, 'change')}`}</button>
      <button type="button" class="key" data-act="decline">Decline</button>${ws.length > 1 ? '<button type="button" class="key" data-act="later">Later</button>' : ''}
      <span class="sp"></span><span class="small mono">${i + 1} of ${ws.length} waiting</span></div>`);
}

// ---------- Ask Claude (FM-S07, FM-U11) ----------
const ASKS = [
  ['orders', 'Read my orders', `Use the Filament Ctrl skill to read my filament orders since ${isoToday(new Date(Date.now() - 30 * 864e5))} and propose the new spools.`, 'Any seller. Claude reads your mail through its own connector, or a PDF or text you give it. Spool lines only: no address, payment or price.'],
  ['printer', 'Read the printer', 'Use the Filament Ctrl skill to read my printer\'s AMS.', 'Runs in your own Terminal. A printer in its normal mode may not answer; then Claude can read Bambu Studio\'s AMS list instead, which gives the line in each slot but not the colour.'],
  ['plan', 'Plan a print', 'Use the Filament Ctrl skill to plan this print. [drop the sliced .3mf here]', 'Slice it in Bambu Studio first, so the file says how many grams of each filament it needs.'],
  ['catalog', 'Update the materials list', 'Use the Filament Ctrl skill to update my materials list.', 'Builds Bambu Lab\'s lines and colours from Bambu Studio on your computer, or its latest release on GitHub.'],
];
function askView() {
  return `<div class="askhead"><h2 class="h2">Ask Claude</h2><p class="small">Reading is done by your own Claude with the Filament Ctrl skill, not by this page. Copy a sentence and say it to Claude; what it finds comes back here to review.</p></div>
    <div class="cards">${ASKS.map(([k, t, say, help]) => `<div class="card"><b>${t}</b><div class="say mono">${esc(say)}</div><button type="button" class="key" data-act="copy" data-v="${k}">${S.ask[k] ? 'Copied' : 'Copy'}</button><p class="small">${help}</p></div>`).join('')}</div>`;
}

// ---------- Materials (FM-S11 to S13, FM-U13 to U16) ----------
const onShelf = (lineId, code) => S.rec.spools.filter((s) => { if (s.place.kind === 'Empty') return false; const f = getFilament(S.rec, s.filament); return f?.lineId === lineId && (code === undefined || f.code === code); });
const studioSaysNoAms = (l) => /not compatible with the AMS/i.test(l.studioNote || '');
// FM-R66: fits when the printer's top temperature reaches the bottom of the line's range and its other needs are met.
function fit(l) {
  const p = S.rec.printer || {};
  const needEnclosure = l.material === 'ABS and ASA' || l.material === 'Engineering';
  const reasons = [], unknown = [];
  if (p.topNozzle == null) unknown.push('top nozzle temperature'); else if (l.nozzle?.low != null && l.nozzle.low > p.topNozzle) reasons.push(`needs ${l.nozzle.low} °C, your printer tops out at ${p.topNozzle} °C`);
  if (l.hardenedNozzle) { if (p.hardenedNozzle == null) unknown.push('hardened nozzle'); else if (!p.hardenedNozzle) reasons.push('needs a hardened nozzle'); }
  if (needEnclosure) { if (p.enclosed == null) unknown.push('enclosure'); else if (!p.enclosed) reasons.push('wants an enclosed printer'); }
  if (reasons.length) return { ok: false, text: `Doesn't fit: ${reasons.join('; ')}.` };
  if (unknown.length) return { ok: null, text: `Not known: set your printer's ${unknown.join(', ')} in Printer details.` };
  const needs = [l.hardenedNozzle ? 'hardened nozzle' : null, needEnclosure ? 'enclosure' : null].filter(Boolean);
  return { ok: true, text: `Fits your ${p.model || 'printer'}. ${needs.length ? `Uses its ${needs.join(' and ')}.` : 'No hardened nozzle or enclosure needed.'}` };
}

function materialsView() {
  if (!S.catalog) return tier(0, 'Materials', 'Bambu Lab\'s lines and colours', 'Not read yet', 'idle', `
    <p class="lede">The materials list is built by your own Claude from Bambu Studio's files, into your repo.</p>
    <div class="card"><b>Update the materials list</b><div class="say mono">${esc(ASKS[3][2])}</div><button type="button" class="key" data-act="copy" data-v="catalog">${S.ask.catalog ? 'Copied' : 'Copy'}</button></div>`); // FM-S13
  const lines = catalogLines();
  const q = S.mq.trim().toLowerCase();
  const pass = { all: () => true, shelf: (l) => onShelf(l.id).length > 0, fits: (l) => fit(l).ok === true };
  const shown = lines.filter(pass[S.mfilter] || pass.all).filter((l) => !q || l.name.toLowerCase().includes(q) || l.colours.some((c) => (c.name || '').toLowerCase().includes(q)));
  const counts = [['all', 'Lines', lines.length], ['colours', 'Colours', lines.reduce((n, l) => n + l.colours.length, 0)], ['shelf', 'On your shelf', lines.filter(pass.shelf).length], ['fits', 'Fit your printer', lines.filter(pass.fits).length]];
  const list = `<div class="counts">${counts.map(([k, t, n]) => `<button type="button" class="countb" ${k === 'colours' ? 'disabled' : `data-act="mfilter" data-v="${k}"`} aria-pressed="${S.mfilter === k}"><b class="mono">${n}</b><span>${t}</span></button>`).join('')}</div>
    <input class="in" id="matSearch" type="search" placeholder="Search lines and colours" value="${esc(S.mq)}" aria-label="Search lines and colours">
    ${MATERIALS.map((m) => { const ls = shown.filter((l) => l.material === m); return ls.length ? `<div class="grp"><span>${esc(m)}</span><span class="mono">${ls.length} lines</span></div>${ls.map((l) => { const own = onShelf(l.id).length;
      return `<button type="button" class="lrow ${S.line === l.id ? 'on' : ''}" data-act="openline" data-v="${esc(l.id)}"><span class="strip">${l.colours.slice(0, 6).map((c) => sw(c.values, 13)).join('') || sw([], 13)}</span>
        <span class="sm"><b>${esc(l.name)}</b><span class="mono small">${esc(l.id)} · ${plural(l.colours.length, 'colour')}</span></span><span class="small ink">${own ? `${own} on shelf` : ''}</span></button>`; }).join('')}` : ''; }).join('') || '<div class="empty">No lines match.</div>'}`;
  const line = lines.find((l) => l.id === S.line);
  const detail = line ? lineDetail(line) : chooseArea();
  const head = `<div class="row"><button type="button" class="key ${S.chooseOpen && !S.line ? 'on' : ''}" data-act="choose">Choose a material</button><span class="small">From Bambu Studio ${esc(S.catalog.source?.studioVersion || '')}${S.catalog.source?.from === 'GitHub' ? ' on GitHub' : ''}, read ${esc((S.catalog.built || '').slice(0, 10))}.</span></div>`;
  if (!wide.matches) return head + (S.line || S.chooseOpen ? `<button type="button" class="lnk" data-act="closeline">‹ Materials</button>${detail}` : list);
  return head + `<div class="ld"><div class="lcol">${list}</div><div class="dcol">${detail}</div></div>`;
}

function lineDetail(l) {
  const g = GUIDES[l.material] || {};
  const note = g.lines?.[l.name];
  const ft = fit(l);
  const own = new Map(); for (const s of onShelf(l.id)) { const c = getFilament(S.rec, s.filament).code; own.set(c, (own.get(c) || 0) + 1); }
  const ro = [['Nozzle', l.nozzle?.low != null ? `${l.nozzle.low}–${l.nozzle.high} °C` : null], ['Plate', l.plate != null ? `${l.plate} °C` : null], ['Softens at', l.softens != null ? `${l.softens} °C` : null],
    ['Drying', l.drying?.temp != null ? `${l.drying.temp} °C · ${l.drying.hours} h` : null], ['Hardened nozzle', l.hardenedNozzle == null ? null : l.hardenedNozzle ? 'Needed' : 'Not needed'], ['Density', l.density != null ? `${l.density} g/cm³` : null]];
  return `<section class="tier"><div class="tier-h"><h2>${esc(l.name)}</h2><span class="tier-d mono">${esc(l.brand)} · ${esc(l.id)} · ${esc(l.type || '')}</span><span class="tier-s ${ft.ok ? 'ok' : ft.ok === false ? 'warn' : 'idle'}">${ft.ok ? 'Fits your printer' : ft.ok === false ? 'Doesn\'t fit' : 'Fit not known'}</span></div><div class="pad">
    ${l.noLongerListed ? '<div class="health warn"><b>No longer listed</b><span>Bambu Studio no longer lists this line. Kept because a spool on your shelf uses it.</span></div>' : ''}
    ${note ? `<p class="lede">${esc(note)}</p>` : `<p class="small">No note for this line yet; the ${esc(l.material)} guide below applies.</p>`}
    <div class="two"><div><b class="micro">Good for</b><ul class="plain">${(g.goodFor || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div><div><b class="micro">Watch for</b><ul class="plain">${(g.watchFor || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>
    <div class="health ${ft.ok ? 'ok' : ft.ok === false ? 'warn' : ''}"><b>${ft.ok ? 'Fits your printer' : ft.ok === false ? 'Doesn\'t fit your printer' : 'Fit not known'}</b><span>${esc(ft.text)} ${studioSaysNoAms(l) ? 'Load it on the external holder: Studio says it\'s too soft for the AMS.' : ''}</span></div>
    <dl class="readout">${ro.map(([k, v]) => `<dt>${k}</dt><dd class="${v ? 'mono' : 'small'}">${esc(v ?? 'Not stated')}</dd>`).join('')}</dl>
    ${l.studioNote ? `<p class="small"><b class="ink">Studio says</b> ${esc(l.studioNote)}</p>` : ''}
    <div class="spread"><b class="micro">Colours</b><span class="mono small">${l.colours.length}${own.size ? ` · ${[...own.values()].reduce((a, b) => a + b, 0)} on your shelf` : ''}</span></div>
    ${l.colours.length ? `<div class="cgrid">${l.colours.map((c) => `<div class="cell ${own.has(c.code) ? 'own' : ''}">${sw(c.values)}<span class="sm"><b>${esc(c.name)}</b><span class="mono small">${esc(c.code)}${c.kind && c.kind !== 'solid' ? ` · ${esc(c.kind)}` : ''}${own.has(c.code) ? ` · ${own.get(c.code)} on shelf` : ''}${c.noLongerListed ? ' · No longer listed' : ''}</span></span></div>`).join('')}</div>` : '<p class="small">No colours listed.</p>'}
    <p class="small">${esc(g.what || '')} ${esc(g.needs || '')}</p>
    <p class="small statement">${esc(STATEMENT)} <a href="https://wiki.bambulab.com/en/filament-acc/filament" target="_blank" rel="noopener">Bambu Lab wiki ↗</a></p>
  </div></section>`;
}

// Choose a material (FM-R65, FM-U15). Suggests from a few plain questions; nothing is pre-chosen; it never buys.
const QUESTIONS = [
  ['where', 'Where will it live', [['in', 'Indoors'], ['sun', 'Outdoors or in sun']]],
  ['heat', 'Heat nearby', [['no', 'No'], ['warm', 'A warm car'], ['hot', 'Hotter']]],
  ['bend', 'Must it bend', [['no', 'No'], ['yes', 'Yes']]],
  ['strong', 'Must it be strong', [['no', 'No'], ['yes', 'Yes']]],
  ['look', 'How it looks', [['any', 'Any'], ['matte', 'Matte'], ['shine', 'Shiny'], ['clear', 'See-through'], ['wood', 'Wood'], ['speckle', 'Speckled']]],
];
function suggestions(a) {
  const out = [];
  const add = (name, why) => { if (!out.some((x) => x.name === name)) out.push({ name, why }); };
  if (a.bend === 'yes') { add('TPU for AMS', 'Flexible, and firm enough to run from the AMS.'); add('TPU 95A HF', 'Flexible and quicker to print; load it on the external holder.'); add('TPU 90A', 'Softer, for grips and squashy parts; external holder.'); }
  if (a.heat === 'hot') { add('PAHT-CF', 'Holds its shape in real heat, and stiff.'); add('PC', 'Heat-resistant to about 120 °C, and tough.'); add('ABS', 'Holds to about 100 °C; print enclosed.'); }
  if (a.where === 'sun') { add('ASA', 'Stands up to sun and weather, to about 100 °C.'); add('PETG HF', 'Copes with mild outdoor use and warmth to about 70 °C.'); }
  if (a.heat === 'warm') { add('PETG HF', 'Holds to about 70 °C, where PLA sags.'); add('ASA', 'For hotter cars and full sun.'); }
  if (a.strong === 'yes') { add('PLA Tough+', 'Takes knocks better than PLA Basic, just as easy to print.'); add('PETG-CF', 'Stiff and steady in size.'); add('PAHT-CF', 'Strong and stiff for parts that work hard.'); }
  const looks = { matte: [['PLA Matte', 'A flat finish that hides layer lines.'], ['PETG Matte', 'Matte, with PETG\'s warmth resistance.']], shine: [['PLA Silk+', 'A glossy, metallic-looking sheen.'], ['PLA Metal', 'A metallic look.']],
    clear: [['PLA Translucent', 'Lets light through; easy to print.'], ['PETG Translucent', 'Clear-ish and tougher.']], wood: [['PLA Wood', 'Looks and sands like wood.']], speckle: [['PLA Sparkle', 'Metal flake that catches the light.'], ['PLA Galaxy', 'A deeper speckle, without the flake.'], ['PLA Marble', 'Stone-like.']] };
  for (const [n, w] of looks[a.look] || []) add(n, w);
  if (!out.length) add('PLA Basic', 'Easy to print, most colours, right for most indoor parts.');
  const lines = catalogLines();
  return out.map((s) => ({ ...s, line: lines.find((l) => l.name === s.name) })).filter((s) => s.line)
    .map((s) => ({ ...s, own: onShelf(s.line.id).length, fit: fit(s.line) }))
    .sort((x, y) => (y.own > 0) - (x.own > 0) || (y.fit.ok === true) - (x.fit.ok === true)).slice(0, 6);
}
function chooseArea() {
  const a = S.choose || {};
  const answered = QUESTIONS.some(([k]) => a[k]);
  const sug = answered ? suggestions(a) : [];
  return tier(0, 'Choose a material', 'A few questions, then a short list', answered ? `${sug.length} to look at` : 'Not started', answered ? 'ok' : 'idle', `
    ${QUESTIONS.map(([k, t, opts]) => `<div class="q"><span class="small">${t}</span><span class="segc" role="group" aria-label="${t}">${opts.map(([v, l]) => `<button type="button" data-act="ans" data-k="${k}" data-v="${v}" aria-pressed="${a[k] === v}">${l}</button>`).join('')}</span></div>`).join('')}
    ${answered ? `<div class="plist">${sug.map((s) => `<button type="button" class="lrow" data-act="openline" data-v="${esc(s.line.id)}"><span class="strip">${s.line.colours.slice(0, 5).map((c) => sw(c.values, 13)).join('')}</span><span class="sm"><b>${esc(s.name)}</b><span class="small">${esc(s.why)}</span></span><span class="small ${s.fit.ok === false ? '' : 'ink'}">${s.own ? 'On your shelf' : s.fit.ok === false ? 'Doesn\'t fit' : s.fit.ok ? 'Fits' : 'Fit not known'}</span></button>`).join('')}</div>
      <div class="row"><button type="button" class="key" data-act="reset">Start again</button></div>` : `<div class="cgrid wide">${CHOOSE.map((r) => `<div class="card mini2"><b>${esc(r.part)}</b><span class="small">${esc(r.lookAt)}: ${esc(r.why)}</span></div>`).join('')}</div>`}
    <p class="small statement">${esc(STATEMENT)}</p>`);
}

// ---------- events ----------
const today = () => isoToday();
const name = (s) => { const f = getFilament(S.rec, s.filament); return `${s.id} ${colourName(f)} ${f?.line || ''}`.trim(); };
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || !$('#app').contains(b) && b.dataset.act !== 'disconnect') return;
  const act = b.dataset.act, v = b.dataset.v;
  // One change at a time: while a save is on its way to GitHub, a second click would apply it again (FM-A08).
  if (S.saving && !['cancel', 'later'].includes(act)) return;
  S.focus = null;
  switch (act) {
    case 'connect': S.view = 'connect'; break;
    case 'cancel': S.view = 'first'; S.connectMsg = null; break;
    case 'recheck': S.problem = null; await refresh(); break;
    case 'reconnect': S.conn = null; db.delMeta('conn'); S.view = 'connect'; break;
    case 'disconnect': S.conn = null; S.gh = null; S.rec = null; db.delMeta('conn'); db.delMeta('cache'); S.view = 'first'; break;
    case 'view': S.view = v; S.sheet = null; break;
    case 'filter': S.filter = v; break;
    case 'openf': S.open = v; break;
    case 'closef': S.open = null; break;
    case 'sheet': S.sheet = { id: v, move: false }; break;
    case 'slot': { const p = JSON.parse(b.dataset.place); const s = inPlace(S.rec, p);
      S.sheet = s ? { id: s.id, move: false } : { load: p }; break; }
    case 'loadpick': { const s = getSpool(S.rec, v); const p = S.sheet.load; S.sheet = null;
      await commit(moveSpool(S.rec, s.id, p, today()), `${name(s)} moved to ${placeText(p)}`); return; }
    case 'closesheet': S.sheet = null; break;
    case 'move': S.sheet.move = !S.sheet.move; break;
    case 'opened': { const s = getSpool(S.rec, S.sheet.id); await commit(markOpened(S.rec, s.id, today()), `${name(s)} opened`); return; }
    case 'empty': { const s = getSpool(S.rec, S.sheet.id); await commit(markEmpty(S.rec, s.id, today()), `${name(s)} empty`); return; }
    case 'moveto': { const s = getSpool(S.rec, S.sheet.id); const p = JSON.parse(b.dataset.place); S.sheet.move = false;
      await commit(moveSpool(S.rec, s.id, p, today()), `${name(s)} moved to ${placeText(p)}`); return; }
    case 'undo': await undo(); return;
    case 'mfilter': S.mfilter = S.mfilter === v ? 'all' : v; break;
    case 'openline': S.line = v; S.chooseOpen = false; break;
    case 'closeline': S.line = null; S.chooseOpen = false; break;
    case 'choose': S.line = null; S.chooseOpen = true; break;
    case 'ans': S.choose = { ...(S.choose || {}), [b.dataset.k]: v }; break;
    case 'reset': S.choose = {}; break;
    case 'copy': { const t = ASKS.find((x) => x[0] === v)[2]; try { await navigator.clipboard.writeText(t); S.ask[v] = true; } catch { S.ask[v] = false; } break; }
    case 'addmat': S.add.material = v; S.add.line = null; S.add.colour = null; break;
    case 'addline': S.add.line = v; S.add.colour = null; break;
    case 'addcolour': S.add.colour = v; break;
    case 'addother': S.add.other = !!v; break;
    case 'doadd': { const f = addFilament(); const n = Math.max(1, parseInt(S.add.count, 10) || 1);
      const r = addSpools(S.rec, { filament: f, count: n, net: parseInt(S.add.net, 10) || 1000, place: S.add.place, date: today() });
      if (await commit(r.rec, `Add ${plural(n, 'spool')}: ${f.colour || 'No colour'} ${f.line}`)) { S.view = 'shelf'; S.open = findOpen(r.ids[0]); render(); } return; }
    case 'tick': S.ticks.t[+v] = b.checked; break;
    case 'later': S.review += 1; S.ticks = null; break;
    case 'accept': case 'decline': {
      const ws = waiting(); const p = ws[Math.min(S.review, ws.length - 1)];
      let out;
      try { out = act === 'accept' ? applyProposal(S.rec, p, S.ticks.t, today()) : { rec: S.rec, proposal: declineProposal(p, today()) }; }
      catch (err) { S.problem = { kind: 'other', text: err.message === 'Already added' ? `Order ${p.source.number} is already on the shelf, so it wasn't added again. Decline this proposal to clear it.` : err.message }; render(); return; }
      const { path, ...file } = out.proposal;
      const msg = `Review: ${p.source?.number ? `order ${p.source.number}` : p.id} ${file.status.toLowerCase()}`;
      if (await commit(out.rec, msg, [{ path: p.path, json: file }], false)) { S.proposals = S.proposals.map((x) => (x.path === p.path ? { ...file, path: p.path } : x)); S.ticks = null; render(); }
      return; }
    default: return;
  }
  render();
});
const findOpen = (id) => getSpool(S.rec, id)?.filament || null;

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.actChange === 'addknown' && t.value) { const f = getFilament(S.rec, t.value);
    if (f.lineId) Object.assign(S.add, { other: false, material: S.catalog?.lines.find((l) => l.id === f.lineId)?.material || 'PLA', line: f.lineId, colour: f.code });
    else Object.assign(S.add, { other: true, o: { brand: f.brand, line: f.line, material: f.material, colour: f.colour, value: f.values?.[0] || '', diameter: f.diameter } });
    render(); }
  if (t.dataset.add === 'place') S.add.place = t.value;
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'shelfSearch') { S.q = t.value; S.focus = t.id; render(); }
  else if (t.id === 'matSearch') { S.mq = t.value; S.focus = t.id; render(); }
  else if (t.dataset.add) { if (['count', 'net'].includes(t.dataset.add)) S.add[t.dataset.add] = t.value; else S.add.o[t.dataset.add] = t.value;
    const go = document.querySelector('[data-act="doadd"]'); if (go) { const ready = S.add.other ? S.add.o.line && S.add.o.material : true; go.disabled = !ready; go.textContent = `Add ${plural(Math.max(1, parseInt(S.add.count, 10) || 1), 'spool')}`; } }
});
document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  if (e.target.id === 'connectForm') {
    const repo = String(f.get('repo')).trim(), token = String(f.get('token')).trim();
    S.busy = true; render();
    const gh = client(repo, token), c = await gh.check();
    S.busy = false;
    if (c.error) { S.connectMsg = { repo, title: 'Not connected', text: c.error.text }; render(); return; }
    if (!c.private) { S.connectMsg = { repo, title: 'This repo is public', text: 'Make it private on GitHub, then connect again. Filament Ctrl never writes to a public repo.' }; render(); return; }
    if (!c.canWrite) { S.connectMsg = { repo, title: 'Can\'t write', text: 'Give the token Contents read and write for this repo.' }; render(); return; }
    S.conn = { repo, token }; db.setMeta('conn', S.conn); S.gh = gh; S.connectMsg = null; S.view = 'shelf';
    await gh.ensureReadme(); await refresh(); render();
  } else if (e.target.id === 'printerForm') {
    const yn = (k) => (f.get(k) === 'yes' ? true : f.get(k) === 'no' ? false : null);
    const n = Math.max(0, Math.min(4, parseInt(f.get('amsCount'), 10) || 0));
    const next = structuredClone(S.rec);
    next.printer = { model: String(f.get('model')).trim() || null, topNozzle: parseInt(f.get('topNozzle'), 10) || null, hardenedNozzle: yn('hardenedNozzle'), enclosed: yn('enclosed'),
      ams: Array.from({ length: n }, (_, i) => ({ unit: i + 1, model: String(f.get('amsModel')).trim() || null })) };
    await commit(next, 'Printer details');
  } else if (e.target.id === 'leftForm') {
    const s = getSpool(S.rec, S.sheet.id); const g = parseInt(f.get('g'), 10);
    if (Number.isFinite(g)) await commit(setLeft(S.rec, s.id, g, String(f.get('from')), today()), `${name(s)} left ${g} g`);
  }
});
addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.sheet) { S.sheet = null; render(); } });

start();
