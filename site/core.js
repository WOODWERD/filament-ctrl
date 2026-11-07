// Filament Ctrl core: the record, places, Left, counts, Low, proposals and Undo. No DOM, so the tests run it in Node.
// Every change returns a new record and leaves the old one untouched; Undo is the old one, written back in one more commit (FM-A10).

export const FORMAT = 1;
export const LOW_SHARE = 0.25; // FM-R07, Q10
export const PLACES = ['Sealed', 'Open', 'AMS', 'External', 'Empty'];
export const SLOTS = 4; // FM-R27: four slots a unit
export const LEFT_FROM = ['AMS', 'New', 'Used', 'Guess'];
export const SURE = ['Sure', 'Likely', 'Guess'];

const clone = (x) => structuredClone(x);
export function isoToday(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function emptyRecord() {
  return {
    format: FORMAT,
    meta: { nextSpool: 1, updated: null },
    printer: { model: null, topNozzle: null, hardenedNozzle: null, enclosed: null, ams: [] },
    filaments: [],
    spools: [],
    places: { from: 'Set by hand', at: null },
  };
}

// FM-R05: spool IDs come from the app only.
export const spoolId = (n) => `FM-${String(n).padStart(3, '0')}`;
export const getSpool = (rec, id) => rec.spools.find((s) => s.id === id);
export const getFilament = (rec, id) => rec.filaments.find((f) => f.id === id);

// FM-R02: only these fields make a filament, so nothing else from a proposal or a form gets in (FM-R52).
const FILAMENT_FIELDS = ['brand', 'line', 'lineId', 'material', 'colour', 'values', 'code', 'diameter'];
export function cleanFilament(f = {}) {
  const out = {};
  for (const k of FILAMENT_FIELDS) out[k] = f[k] ?? null;
  out.values = Array.isArray(f.values) ? f.values.filter((v) => typeof v === 'string') : [];
  out.diameter = Number(f.diameter) || 1.75;
  return out;
}

// Same filament: by Bambu line and colour code when both have them, otherwise by brand, line, colour and diameter.
const norm = (s) => String(s ?? '').trim().toLowerCase();
export function sameFilament(a, b) {
  if (a.lineId && b.lineId && a.code && b.code) return a.lineId === b.lineId && a.code === b.code;
  return norm(a.brand) === norm(b.brand) && norm(a.line) === norm(b.line) && norm(a.colour) === norm(b.colour)
    && Number(a.diameter || 1.75) === Number(b.diameter || 1.75);
}
export const findFilament = (rec, f) => rec.filaments.find((x) => sameFilament(x, f));

function ensureFilament(rec, f) {
  const found = findFilament(rec, f);
  if (found) return found.id;
  const id = 'f' + (rec.filaments.reduce((n, x) => Math.max(n, parseInt(x.id.slice(1), 10) || 0), 0) + 1);
  rec.filaments.push({ id, ...cleanFilament(f) });
  return id;
}

export function cleanPlace(p) {
  const kind = typeof p === 'string' ? p : p?.kind;
  if (!PLACES.includes(kind)) throw new Error(`Not a place: ${kind}`);
  if (kind !== 'AMS') return { kind };
  const unit = Number(p.unit), slot = Number(p.slot);
  if (!(unit >= 1) || !(slot >= 1 && slot <= SLOTS)) throw new Error('An AMS place needs a unit and a slot from 1 to 4');
  return { kind, unit, slot };
}
const samePlace = (a, b) => a.kind === b.kind && (a.kind !== 'AMS' || (a.unit === b.unit && a.slot === b.slot));
const holds = (p) => p.kind === 'AMS' || p.kind === 'External';
export const placeText = (p) => (p.kind === 'AMS' ? `AMS ${p.unit} slot ${p.slot}` : p.kind === 'External' ? 'External holder' : p.kind);

const note = (s, date, what) => s.history.push({ date, what });

// FM-R10, FM-R16: one spool per unit. Returns the new record and the IDs given.
export function addSpools(rec, { filament, count = 1, net = 1000, place = 'Sealed', order = null, date = isoToday() }) {
  const next = clone(rec);
  const fid = ensureFilament(next, filament);
  const p = cleanPlace(place);
  const n = Math.max(1, Math.min(99, parseInt(count, 10) || 1));
  const ids = [];
  for (let i = 0; i < n; i++) {
    const id = spoolId(next.meta.nextSpool++);
    const o = order ? { seller: order.seller ?? null, number: order.number ?? null, date: order.date ?? null } : null;
    const s = { id, filament: fid, net: Number(net) || null, left: { grams: Number(net) || null, from: 'New', at: date },
      place: { kind: 'Sealed' }, opened: null, order: o, tag: null, history: [] };
    note(s, date, o?.number ? `Added from order ${o.number}` : 'Added');
    next.spools.push(s);
    ids.push(id);
  }
  // A loaded place goes to the first spool only; the rest stay sealed.
  let out = next;
  if (p.kind !== 'Sealed') out = moveSpool(out, ids[0], p, date);
  out.meta.updated = date;
  return { rec: out, ids };
}

// FM-S10: Opened. A sealed spool becomes Open; Left stays New until something reads or uses it.
export function markOpened(rec, id, date = isoToday()) {
  const next = clone(rec);
  const s = getSpool(next, id);
  if (!s) throw new Error(`No spool ${id}`);
  if (s.opened) return next;
  s.opened = date;
  if (s.place.kind === 'Sealed') s.place = { kind: 'Open' };
  note(s, date, 'Opened');
  next.meta.updated = date;
  return next;
}

// FM-R06: Empty stays in the record and leaves the counts.
export function markEmpty(rec, id, date = isoToday()) {
  const next = clone(rec);
  const s = getSpool(next, id);
  if (!s) throw new Error(`No spool ${id}`);
  s.place = { kind: 'Empty' };
  s.left = { grams: 0, from: s.left?.from === 'AMS' ? 'AMS' : 'Used', at: date };
  note(s, date, 'Empty');
  next.meta.updated = date;
  return next;
}

// Moving a sealed spool anywhere but the shelf opens it. FM-E04: whatever held that slot or the holder goes back to Open.
export function moveSpool(rec, id, to, date = isoToday()) {
  const next = clone(rec);
  const s = getSpool(next, id);
  if (!s) throw new Error(`No spool ${id}`);
  const p = cleanPlace(to);
  if (samePlace(s.place, p)) return next;
  if (holds(p)) for (const o of next.spools) if (o !== s && samePlace(o.place, p)) { o.place = { kind: 'Open' }; note(o, date, `Moved out of ${placeText(p)}, to Open`); }
  if ((holds(p) || p.kind === 'Open') && !s.opened) s.opened = date;
  s.place = p;
  note(s, date, `Moved to ${placeText(p)}`);
  next.meta.updated = date;
  return next;
}

// Left, with where the number came from (the Left term, FM-R34).
export function setLeft(rec, id, grams, from, date = isoToday()) {
  if (!LEFT_FROM.includes(from)) throw new Error(`Not a Left source: ${from}`);
  const next = clone(rec);
  const s = getSpool(next, id);
  s.left = { grams: Math.max(0, Math.round(Number(grams) || 0)), from, at: date };
  note(s, date, `Left ${s.left.grams} g (${from})`);
  next.meta.updated = date;
  return next;
}

export const inPlace = (rec, p) => rec.spools.find((s) => samePlace(s.place, cleanPlace(p))) || null;
const live = (s) => s.place.kind !== 'Empty';

// FM-R07: counts by filament. Open includes spools loaded in the printer, since they're open too.
// Low: no sealed spool behind it, and what's left on the open ones is under 25% of a full spool.
export function filamentCounts(rec, fid) {
  const ss = rec.spools.filter((s) => s.filament === fid && live(s));
  const sealed = ss.filter((s) => s.place.kind === 'Sealed').length;
  const open = ss.filter((s) => s.place.kind !== 'Sealed');
  const grams = ss.reduce((n, s) => n + (s.left?.grams || 0), 0);
  const full = Math.max(0, ...ss.map((s) => s.net || 0));
  const openLeft = open.reduce((n, s) => n + (s.left?.grams || 0), 0);
  const low = ss.length > 0 && sealed === 0 && full > 0 && openLeft < full * LOW_SHARE;
  return { sealed, open: open.length, inPrinter: open.filter((s) => holds(s.place)).length, grams, low };
}

// FM-U07, Counts that filter: the numbers above the shelf.
export function shelfCounts(rec) {
  const live_ = rec.spools.filter(live);
  const lows = rec.filaments.filter((f) => filamentCounts(rec, f.id).low);
  return {
    spools: live_.length,
    sealed: live_.filter((s) => s.place.kind === 'Sealed').length,
    open: live_.filter((s) => s.place.kind !== 'Sealed').length,
    inPrinter: live_.filter((s) => holds(s.place)).length,
    low: lows.length,
  };
}

export const SHELF_FILTERS = {
  all: () => true,
  sealed: (c) => c.sealed > 0,
  open: (c) => c.open > 0,
  inPrinter: (c) => c.inPrinter > 0,
  low: (c) => c.low,
};
// The shelf: filaments with any live spool, grouped by material, each with its counts.
export function shelf(rec, filter = 'all') {
  const pick = SHELF_FILTERS[filter] || SHELF_FILTERS.all;
  const groups = new Map();
  for (const f of rec.filaments) {
    const c = filamentCounts(rec, f.id);
    if (c.sealed + c.open === 0 || !pick(c)) continue;
    const m = f.material || 'Other';
    if (!groups.has(m)) groups.set(m, []);
    groups.get(m).push({ filament: f, ...c });
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b))
    .map(([material, rows]) => ({ material, rows: rows.sort((a, b) => String(a.filament.line).localeCompare(b.filament.line) || String(a.filament.colour).localeCompare(b.filament.colour)) }));
}

// --- Proposals (FM-R14, FM-R15, FM-U10) ---

export const proposalReadable = (p) => p && p.format <= FORMAT;
export const ticked = (change) => change.sure === 'Sure' || change.sure === 'Likely';
export const defaultTicks = (p) => p.changes.map(ticked);

// FM-R14: an order is known once any spool carries its number, or a waiting proposal does.
export function orderKnown(rec, proposals, seller, number) {
  const n = norm(number), sl = norm(seller);
  if (!n) return false;
  const match = (o) => o && norm(o.number) === n && (!sl || !o.seller || norm(o.seller) === sl);
  return rec.spools.some((s) => match(s.order)) || proposals.some((p) => p.status === 'Waiting' && p.source?.kind === 'Order' && match(p.source));
}

// Accept the ticked changes. Returns the new record and the proposal with its status and the spools it added.
export function applyProposal(rec, p, ticks = defaultTicks(p), date = isoToday()) {
  if (!proposalReadable(p)) throw new Error('Needs a newer Filament Ctrl');
  // FM-R14 in the app too: an order already on a spool is never added twice (FM-A08 found a double Accept).
  if (p.source?.kind === 'Order' && p.source.number && rec.spools.some((s) => s.order?.number === String(p.source.number) && s.order?.seller === (p.source.seller ?? null))) throw new Error('Already added');
  let next = rec;
  const added = {};
  let taken = 0;
  p.changes.forEach((c, i) => {
    if (!ticks[i]) return;
    taken++;
    if (c.type === 'newSpools') {
      const order = p.source?.kind === 'Order' ? p.source : null;
      const r = addSpools(next, { filament: c.filament, count: c.count, net: c.net, place: c.place || 'Sealed', order, date });
      next = r.rec;
      added[c.ref || `c${i + 1}`] = r.ids;
    } else if (c.type === 'spoolOpened') next = markOpened(next, c.spool, c.date || date);
    else if (c.type === 'spoolEmpty') next = markEmpty(next, c.spool, date);
    else if (c.type === 'spoolMoved') next = moveSpool(next, c.spool, c.to, date);
    else if (c.type === 'spoolUsed') { const s = getSpool(next, c.spool); if (s) next = setLeft(next, c.spool, (s.left?.grams || 0) - (Number(c.grams) || 0), 'Used', date); }
    else throw new Error(`Unknown change: ${c.type}`);
  });
  // FM-U04: places accepted from Bambu Studio's list are marked as such, with the date of that list.
  if (taken && p.source?.kind === 'Bambu Studio') { next = clone(next); next.places = { from: 'From Bambu Studio', at: p.source.date || date }; }
  const status = taken === 0 ? 'Declined' : taken === p.changes.length ? 'Accepted' : 'Partly accepted';
  return { rec: next, proposal: { ...clone(p), status, reviewed: date, added } };
}

export const declineProposal = (p, date = isoToday()) => ({ ...clone(p), status: 'Declined', reviewed: date, added: {} });

// Commit messages, one commit a change (FM-A10).
export function commitMessage(kind, detail) {
  return {
    add: `Add ${detail}`, opened: `${detail} opened`, empty: `${detail} empty`, moved: `${detail} moved`,
    review: `Review: ${detail}`, undo: `Undo: ${detail}`,
  }[kind] || detail;
}

// --- Catalog upkeep (FM-R62) ---

// A rebuilt catalog keeps any line or colour a live spool still points at, marked No longer listed.
export function keepListed(newCat, oldCat, rec) {
  const out = clone(newCat);
  if (!oldCat?.lines) return out;
  const used = new Set();
  for (const s of rec.spools) {
    if (!live(s)) continue;
    const f = getFilament(rec, s.filament);
    if (f?.lineId) used.add(`${f.lineId}|${f.code ?? ''}`);
  }
  const byId = new Map(out.lines.map((l) => [l.id, l]));
  for (const ol of oldCat.lines) {
    const keepColours = ol.colours.filter((c) => used.has(`${ol.id}|${c.code ?? ''}`));
    const lineUsed = keepColours.length > 0 || used.has(`${ol.id}|`);
    if (!lineUsed) continue;
    let line = byId.get(ol.id);
    if (!line) { line = { ...clone(ol), colours: [], noLongerListed: true }; out.lines.push(line); byId.set(ol.id, line); }
    for (const c of keepColours) if (!line.colours.some((x) => x.code === c.code)) line.colours.push({ ...clone(c), noLongerListed: true });
  }
  return out;
}
