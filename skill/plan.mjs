#!/usr/bin/env node
// "What should I load for this?" (FM-R30 to FM-R34). Reads a job sliced in Bambu Studio and the record, and says which
// spools to use. It never edits the job file and says nothing about how to slice it (FM-R33).
//   node plan.mjs --job part.3mf --record <data>/filament-ctrl.json [--catalog <data>/catalog.json]
//   node plan.mjs --job part.3mf --record <data>/filament-ctrl.json --ran --data <data>     after the print ran (FM-R34)

import { readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { join } from 'node:path';
import { readJson, writeJson, isoToday, getFilament, live, placeText, args } from './common.mjs';

export const MARGIN = 0.10; // FM-R31: covers the job plus 10%
export const DRY_AFTER_DAYS = 30; // FM-R32: open longer than this, these want drying first
const THIRSTY = /^(PA|PC|TPU|PETG|PPA|PET|PVA)/i;

// The one file wanted from a .3mf, which is a zip. Stored or deflated entries, no other library.
export function unzipOne(buf, name) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('Not a .3mf (zip) file');
  let p = buf.readUInt32LE(eocd + 16);
  const n = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const fname = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (fname === name) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return (method === 0 ? data : inflateRawSync(data)).toString('utf8');
    }
    p += 46 + nameLen + extra + comment;
  }
  return null;
}

const attrs = (tag) => Object.fromEntries([...tag.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
// FM-R30: each filament the job uses, with its Bambu filament ID where Studio wrote one, type, colour and grams.
export function needsFromSliceInfo(xml, plate = null) {
  const plates = [...xml.matchAll(/<plate>([\s\S]*?)<\/plate>/g)].map((m) => m[1]);
  const pick = plate ? plates.filter((p) => new RegExp(`key="index" value="${plate}"`).test(p)) : plates;
  const sum = new Map();
  for (const p of pick) for (const t of p.match(/<filament [^>]*\/>/g) || []) {
    const a = attrs(t);
    const g = parseFloat(a.used_g) || 0;
    if (!g) continue;
    const key = `${a.tray_info_idx || ''}|${a.type}|${(a.color || '').toUpperCase()}`;
    const prev = sum.get(key);
    sum.set(key, { lineId: a.tray_info_idx || null, type: a.type || null, colour: (a.color || '').toUpperCase().slice(0, 7) || null, grams: (prev?.grams || 0) + g });
  }
  return [...sum.values()];
}
export function needsFromGcode(text) {
  const head = text.slice(0, 200000);
  const get = (k) => (new RegExp(`^; ${k} = (.*)$`, 'm').exec(head)?.[1] || '').split(/[;,]\s*/).map((s) => s.trim());
  const g = get('filament used \\[g\\]').map(Number), types = get('filament_type'), cols = get('filament_colour'), ids = get('filament_ids');
  return g.map((grams, i) => ({ lineId: ids[i] || null, type: types[i] || null, colour: (cols[i] || '').toUpperCase().slice(0, 7) || null, grams })).filter((n) => n.grams > 0);
}

const rgb = (h) => (/^#[0-9A-F]{6}$/i.test(h || '') ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : null);
const near = (a, b) => { const x = rgb(a), y = rgb(b); return x && y && Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 48; };
const sameType = (f, need, catalog) => {
  if (need.lineId && f.lineId) return need.lineId === f.lineId;
  const t = (catalog?.lines.find((l) => l.id === f.lineId)?.type || f.material || '').toUpperCase();
  return !!need.type && t.split('-')[0] === need.type.toUpperCase().split('-')[0];
};
const loaded = (s) => s.place.kind === 'AMS' || s.place.kind === 'External';
const tierOf = (s) => (loaded(s) ? 0 : s.place.kind === 'Open' ? 1 : 2);

// FM-R31: loaded first, then open, then sealed; within each, the least left that still covers the job plus 10%.
export function planJob(needs, record, catalog = null, today = isoToday()) {
  const used = new Set();
  return needs.map((need) => {
    const want = need.grams * (1 + MARGIN);
    const cands = record.spools.filter((s) => live(s) && !used.has(s.id)).map((s) => ({ s, f: getFilament(record, s.filament) }))
      .filter(({ f }) => f && sameType(f, need, catalog) && (!need.colour || f.values?.some((v) => near(v, need.colour))));
    const covers = cands.filter(({ s }) => (s.left?.grams ?? 0) >= want).sort((a, b) => tierOf(a.s) - tierOf(b.s) || (a.s.left.grams - b.s.left.grams));
    const pick = covers[0] || null;
    if (pick) used.add(pick.s.id);
    const freeSlot = !pick || loaded(pick.s) ? null : firstFreeSlot(record);
    const opened = pick?.s.opened ? (Date.parse(today) - Date.parse(pick.s.opened)) / 864e5 : 0;
    return {
      need, spool: pick?.s || null, filament: pick?.f || cands[0]?.f || null,
      action: !pick ? (cands.length ? 'short' : 'none') : loaded(pick.s) ? 'keep' : freeSlot ? 'load' : 'swap',
      slot: freeSlot, partial: !pick && cands.length ? cands.sort((a, b) => (b.s.left?.grams ?? 0) - (a.s.left?.grams ?? 0))[0].s : null,
      shortLoaded: pick && !loaded(pick.s) ? cands.find(({ s }) => loaded(s) && (s.left?.grams ?? 0) < want)?.s || null : null,
      dry: !!pick && THIRSTY.test(need.type || pick.f.material || '') && opened > DRY_AFTER_DAYS,
    };
  });
}
function firstFreeSlot(record) {
  const units = record.printer?.ams?.length || 1;
  for (let u = 1; u <= units; u++) for (let n = 1; n <= 4; n++) if (!record.spools.some((s) => live(s) && s.place.kind === 'AMS' && s.place.unit === u && s.place.slot === n)) return { kind: 'AMS', unit: u, slot: n };
  return null;
}

const g = (n) => `${Math.round(n)} g`;
const desc = (f, need) => (f ? `${f.colour || 'no-colour'} ${f.line || f.material}` : `${need.colour || ''} ${need.type || 'filament'}`.trim());
export function planText(rows) {
  const lines = [`This print needs ${rows.map((r) => `${g(r.need.grams)} of ${desc(r.filament, r.need)}`).join(' and ')}.`];
  for (const r of rows) {
    const s = r.spool;
    if (r.action === 'keep') lines.push(`${desc(r.filament, r.need)}: ${placeText(s.place)} has ${s.id} with ${g(s.left.grams)}. That covers it, so no change.`);
    else if (r.action === 'load') lines.push(`${desc(r.filament, r.need)}: ${r.shortLoaded ? `${placeText(r.shortLoaded.place)} has ${r.shortLoaded.id} with only ${g(r.shortLoaded.left?.grams ?? 0)}, which won't cover it. ` : ''}Load ${s.id} (${s.place.kind.toLowerCase()}, ${g(s.left.grams)}) into ${placeText(r.slot)}.`);
    else if (r.action === 'swap' && r.shortLoaded) lines.push(`${desc(r.filament, r.need)}: ${placeText(r.shortLoaded.place)} has ${r.shortLoaded.id} with only ${g(r.shortLoaded.left?.grams ?? 0)}, which won't cover it. Swap in ${s.id} (${s.place.kind.toLowerCase()}, ${g(s.left.grams)}).`);
    else if (r.action === 'swap' && !r.shortLoaded) lines.push(`${desc(r.filament, r.need)}: ${s.id} (${s.place.kind.toLowerCase()}, ${g(s.left.grams)}) covers it, but every slot is full, so it means swapping one out.`);
    else if (r.action === 'short') lines.push(`${desc(r.filament, r.need)}: nothing on record covers ${g(r.need.grams * (1 + MARGIN))}. The most on one spool is ${r.partial.id} with ${g(r.partial.left?.grams ?? 0)}. You'd need more ${desc(r.filament, r.need)}.`);
    else lines.push(`${desc(r.filament, r.need)}: there's none on the shelf. You'd need to buy some ${desc(null, r.need)}.`);
    if (r.dry) lines.push(`  ${s.id} has been open since ${s.opened}; ${r.need.type || r.filament.material} wants drying first.`);
  }
  lines.push('Grams are what\'s on record. After the print, say it ran and I\'ll propose taking the grams off the spools used.');
  return lines.join('\n');
}

// FM-R34: after it ran, take the job's grams off the spools that were loaded for it, unless the AMS reads them.
export function usedProposal(rows, jobName, read = isoToday()) {
  const changes = rows.filter((r) => r.spool && r.action === 'keep' && r.spool.left?.from !== 'AMS')
    .map((r) => ({ type: 'spoolUsed', spool: r.spool.id, grams: Math.round(r.need.grams), sure: 'Likely', textRead: `${jobName}: ${g(r.need.grams)}` }));
  return { format: 1, id: `print-${read}-${jobName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`, source: { kind: 'Print', job: jobName, date: read }, read, status: 'Waiting', changes, skipped: [] };
}

async function main() {
  const a = args(process.argv.slice(2), ['job', 'record', 'catalog', 'plate', 'ran', 'data']);
  if (!a.job || !a.record) { console.log('node plan.mjs --job part.3mf --record filament-ctrl.json [--catalog catalog.json] [--plate 1] [--ran --data <data folder>]'); return; }
  const buf = await readFile(a.job);
  let needs;
  if (/\.3mf$/i.test(a.job)) {
    const xml = unzipOne(buf, 'Metadata/slice_info.config');
    if (!xml) { console.log('This .3mf hasn\'t been sliced, so it doesn\'t say how many grams it needs. Slice it in Bambu Studio and export it again.'); return; }
    needs = needsFromSliceInfo(xml, a.plate);
  } else needs = needsFromGcode(buf.toString('utf8'));
  if (!needs.length) { console.log('No filament amounts found in the job.'); return; }
  const record = await readJson(a.record);
  const catalog = a.catalog ? await readJson(a.catalog).catch(() => null) : null;
  const rows = planJob(needs, record, catalog);
  if (!a.ran) { console.log(planText(rows)); return; }
  if (!a.data) { console.log('Say where the data repo is with --data.'); return; }
  const p = usedProposal(rows, a.job.split('/').pop());
  if (!p.changes.length) { console.log('Nothing to take off: the spools used are read by the AMS, or none were loaded for this job.'); return; }
  await writeJson(join(a.data, 'proposals', `${p.id}.json`), p);
  console.log(`Proposed taking the grams off ${p.changes.map((c) => c.spool).join(', ')}. Review it in Filament Ctrl.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
