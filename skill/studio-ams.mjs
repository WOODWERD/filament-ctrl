#!/usr/bin/env node
// Reads Bambu Studio's saved AMS list for one printer, and nothing else from its settings file (FM-R28).
// The settings file also holds printer access codes. This script finds the "ams_filament_ids" entry in the text and
// parses only that; it never parses, prints, copies or keeps anything else in the file.
// Studio writes the list when you sync filaments with the AMS: one Bambu filament ID per tray, AMS 1 slots 1 to 4,
// then AMS 2, and so on. So it's as current as your last sync, and gives the line, not the colour or what's left.
//   node studio-ams.mjs                                       lists the printers it has a list for, by serial
//   node studio-ams.mjs --serial <serial> --units 1 --catalog <data>/catalog.json --record <data>/filament-ctrl.json --data <data>

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readJson, writeJson, isoToday, getFilament, live, samePlace, placeText, args } from './common.mjs';

export function confPaths() {
  if (process.platform === 'darwin') return [join(homedir(), 'Library/Application Support/BambuStudio/BambuStudio.conf')];
  if (process.platform === 'win32') return [join(process.env.APPDATA || '', 'BambuStudio', 'BambuStudio.conf')];
  return [join(homedir(), '.config/BambuStudio/BambuStudio.conf')];
}

// Only the {...} that follows "ams_filament_ids": found by matching braces in the text, then parsed on its own.
export function amsEntry(text) {
  const at = text.indexOf('"ams_filament_ids"');
  if (at < 0) return null;
  const open = text.indexOf('{', at);
  if (open < 0 || /[^\s:]/.test(text.slice(at + 18, open))) return null;
  let depth = 0, inStr = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (ch === '\\') i++; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      const obj = JSON.parse(text.slice(open, i + 1));
      const out = {};
      for (const [k, v] of Object.entries(obj)) if (typeof v === 'string') out[k] = v; // serial: "GFA00,GFG02,…"
      return out;
    }
  }
  return null;
}

// Slots from the list: four per unit, in order; anything past the units is the external holder.
export function slotsFrom(list, units = 1) {
  const ids = String(list).split(',').map((s) => s.trim());
  return ids.map((id, i) => {
    const place = i < units * 4 ? { kind: 'AMS', unit: Math.floor(i / 4) + 1, slot: (i % 4) + 1 } : { kind: 'External' };
    return { place, lineId: id || null };
  }).filter((s) => s.place.kind === 'AMS' || s.lineId);
}

// FM-R28, FM-E06: a slot is matched to the one Open spool of that line; with none or several, the review asks.
// A spool already there of the same line stays. Nothing changes until the person accepts it.
export function proposalFromStudio(slots, catalog, record, at, read = isoToday()) {
  const lineOf = (id) => catalog?.lines.find((l) => l.id === id) || null;
  const changes = [], skipped = [];
  const taken = new Set();
  for (const s of slots) {
    if (!s.lineId) continue;
    const there = record.spools.find((x) => live(x) && samePlace(x.place, s.place));
    const thereF = there && getFilament(record, there.filament);
    if (thereF?.lineId === s.lineId) { taken.add(there.id); continue; }
    const line = lineOf(s.lineId);
    const name = line?.name || s.lineId;
    const open = record.spools.filter((x) => x.place.kind === 'Open' && !taken.has(x.id) && getFilament(record, x.filament)?.lineId === s.lineId);
    if (open.length === 1) {
      taken.add(open[0].id);
      changes.push({ type: 'spoolMoved', spool: open[0].id, to: s.place, sure: 'Likely', textRead: `${placeText(s.place)}: ${name}` });
    } else {
      skipped.push({ textRead: `${placeText(s.place)}: ${name}`, why: open.length ? `${open.length} open spools of ${name}; move the right one by hand` : `No open spool of ${name}; open one or add it, then move it here` });
    }
  }
  return { format: 1, id: `studio-${read}`, source: { kind: 'Bambu Studio', date: at }, read, status: 'Waiting', changes, skipped };
}

async function main() {
  const a = args(process.argv.slice(2), ['conf', 'serial', 'units', 'catalog', 'record', 'data']);
  const conf = a.conf || confPaths()[0];
  let text;
  try { text = await readFile(conf, 'utf8'); } catch { console.log('Bambu Studio\'s settings file wasn\'t found. Is Studio installed and signed in on this computer?'); return; }
  const entry = amsEntry(text);
  text = null; // drop the rest of the file now
  if (!entry || !Object.keys(entry).length) { console.log('Bambu Studio has no saved AMS list yet. In Studio, connect to the printer and sync filaments with the AMS, then try again.'); return; }
  const at = isoToday(new Date((await stat(conf)).mtime));
  if (!a.serial) { console.log(`Saved AMS lists, by printer serial (Studio's settings last saved ${at}):\n${Object.keys(entry).map((k) => `  ${k}`).join('\n')}\nRun again with --serial and the one to read.`); return; }
  const list = entry[a.serial];
  if (list === undefined) { console.log(`No saved AMS list for ${a.serial}.`); return; }
  const slots = slotsFrom(list, parseInt(a.units, 10) || 1);
  const catalog = a.catalog ? await readJson(a.catalog).catch(() => null) : null;
  const named = (id) => catalog?.lines.find((l) => l.id === id)?.name || id || 'Empty';
  console.log(`From Bambu Studio, as of your last AMS sync (Studio's settings last saved ${at}):\n${slots.map((s) => `  ${placeText(s.place)}: ${named(s.lineId)}`).join('\n')}`);
  if (!a.data || !a.record) return;
  const record = await readJson(a.record);
  await writeJson(join(a.data, 'snapshots', `${isoToday()}-studio.json`), { format: 1, from: 'From Bambu Studio', at, slots: slots.map((s) => ({ ...s.place, lineId: s.lineId, line: s.lineId ? named(s.lineId) : null })) });
  const p = proposalFromStudio(slots, catalog, record, at);
  await writeJson(join(a.data, 'proposals', `${p.id}.json`), p);
  console.log(`Snapshot written to snapshots/, and a proposal with ${p.changes.length} moves and ${p.skipped.length} slots to settle by hand.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
