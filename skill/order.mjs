#!/usr/bin/env node
// Turns one order, as Claude read it, into a proposal of new spools (FM-R11 to FM-R16).
// Claude reads the confirmation and writes order.json: seller, number, date, and each line's text and spool count.
// This script does the matching, so the same words always match the same way (FM-R12, FM-A14).
//   node order.mjs --order order.json --catalog <data>/catalog.json --record <data>/filament-ctrl.json --proposals <data>/proposals
// order.json: { "seller": "Bambu Lab store", "number": "4417-2093", "date": "2026-11-03",
//   "lines": [ { "text": "PETG HF - Lake Blue (33601) Refill", "spools": 2, "net": 1000 },
//              { "text": "Sunlu PLA+ Orange 1kg", "spools": 1, "brand": "Sunlu", "line": "PLA+", "material": "PLA", "colour": "Orange" },
//              { "text": "PLA Matte - Ash Grey", "spools": 1, "skip": "Refunded" } ] }
// Addresses, payment and prices are never put in order.json, and nothing here would copy them (FM-R52).

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readJson, writeJson, isoToday, norm, slug, filamentFrom, orderKnown, args } from './common.mjs';

const BAMBU_SELLER = /bambu/i;

// The catalog line named in the text: the longest line name found, so "PLA Basic Gradient" beats "PLA Basic" if both exist.
export function findLine(catalog, text) {
  const t = norm(text);
  let best = null;
  for (const l of catalog.lines) {
    const n = norm(l.name);
    const at = t.search(new RegExp(`(^|[^a-z0-9+])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9+])`));
    if (at >= 0 && (!best || n.length > norm(best.name).length)) best = l;
  }
  return best;
}

// The colour on that line: by Studio's five-digit code or the two-character code in the text first, then the longest name.
const cnorm = (x) => norm(x).replace(/grey/g, 'gray').replace(/colour/g, 'color'); // UK and US spellings read the same
export function findColour(line, text) {
  const t = cnorm(text);
  for (const c of line.colours) if (c.studioCode && new RegExp(`\\b${c.studioCode}\\b`).test(t)) return c;
  for (const c of line.colours) if (c.code && new RegExp(`\\(${c.code.toLowerCase()}\\)`).test(t)) return c;
  let best = null;
  for (const c of line.colours) {
    const names = [c.name, ...Object.values(c.names || {})].filter(Boolean).map(cnorm);
    const hit = names.find((n) => new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(t));
    if (hit && (!best || hit.length > best.len)) best = { c, len: hit.length };
  }
  return best?.c || null;
}

// FM-R12: Bambu orders match the catalog and read Sure; other sellers read Likely when brand, material and colour
// are all named, otherwise Guess with the line as read.
export function matchLine(catalog, seller, l) {
  const bambuOrder = BAMBU_SELLER.test(seller || '');
  const line = catalog ? findLine(catalog, l.text) : null;
  const named = !l.brand || /bambu/i.test(l.brand);
  if (line && named) {
    const colour = findColour(line, l.text);
    const sure = colour ? (bambuOrder ? 'Sure' : 'Likely') : 'Guess';
    return { filament: filamentFrom(line, colour), sure };
  }
  const f = { brand: l.brand || null, line: l.line || null, lineId: null, material: l.material || null, colour: l.colour || null, values: l.value ? [l.value] : [], code: null, diameter: Number(l.diameter) || 1.75 };
  return { filament: f, sure: f.brand && f.material && f.colour ? 'Likely' : 'Guess' };
}

export function proposalFor(order, catalog, read = isoToday()) {
  const changes = [], skipped = [];
  let n = 0;
  for (const l of order.lines || []) {
    if (l.skip) { skipped.push({ textRead: l.text, why: l.skip }); continue; }
    const count = Math.max(1, parseInt(l.spools, 10) || 1);
    const m = matchLine(catalog, order.seller, l);
    changes.push({ type: 'newSpools', ref: `n${++n}`, count, net: Number(l.net) || 1000, place: 'Sealed', filament: m.filament, sure: m.sure, textRead: l.text });
  }
  return {
    format: 1,
    id: `order-${slug(order.seller)}-${slug(order.number)}`,
    source: { kind: 'Order', seller: order.seller || null, number: String(order.number || ''), date: order.date || null },
    read, status: 'Waiting', changes, skipped,
  };
}

async function main() {
  const a = args(process.argv.slice(2), ['order', 'catalog', 'record', 'proposals']);
  if (!a.order || !a.proposals) { console.log('node order.mjs --order order.json --catalog catalog.json --record filament-ctrl.json --proposals <folder>'); return; }
  const order = await readJson(a.order);
  const catalog = a.catalog ? await readJson(a.catalog).catch(() => null) : null;
  const record = a.record ? await readJson(a.record).catch(() => null) : null;
  const files = await readdir(a.proposals).catch(() => []);
  const proposals = await Promise.all(files.filter((f) => f.endsWith('.json')).map((f) => readJson(join(a.proposals, f))));
  if (orderKnown(record, proposals, order.seller, order.number)) { console.log(`Order ${order.number} is already in the record or waiting. Nothing written.`); return; }
  const p = proposalFor(order, catalog);
  if (!p.changes.length) { console.log(`Order ${order.number}: no filament lines to propose.`); return; }
  await writeJson(join(a.proposals, `${p.id}.json`), p);
  const spools = p.changes.reduce((k, c) => k + c.count, 0);
  const by = (s) => p.changes.filter((c) => c.sure === s).length;
  console.log(`Order ${order.number}: ${spools} spools in ${p.changes.length} lines (${by('Sure')} Sure, ${by('Likely')} Likely, ${by('Guess')} Guess)${p.skipped.length ? `, ${p.skipped.length} skipped` : ''}. Written to proposals/${p.id}.json.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
