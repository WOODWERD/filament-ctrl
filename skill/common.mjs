// Shared by the skill's scripts. The skill is installed on its own, so it doesn't import the app's files;
// where a rule is also in site/core.js it says so, and the tests hold both to the same checks.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
export async function writeJson(p, x) { await mkdir(dirname(p), { recursive: true }); await writeFile(p, JSON.stringify(x, null, 1) + '\n'); }
export const isoToday = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const norm = (s) => String(s ?? '').toLowerCase().replace(/[‐-―]/g, '-').replace(/\s+/g, ' ').trim();
export const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// A filament as the record keeps it, from a catalog line and colour.
export function filamentFrom(line, colour, diameter = 1.75) {
  return { brand: line.brand || 'Bambu Lab', line: line.name, lineId: line.id, material: line.material,
    colour: colour?.name || null, values: colour?.values || [], code: colour?.code || null, diameter };
}

// FM-R14, as orderKnown in site/core.js: known once a live or empty spool carries the number, or a proposal waits with it.
export function orderKnown(record, proposals, seller, number) {
  const n = norm(number), sl = norm(seller);
  if (!n) return false;
  const match = (o) => o && norm(o.number) === n && (!sl || !o.seller || norm(o.seller) === sl);
  return (record?.spools || []).some((s) => match(s.order)) || proposals.some((p) => p.status === 'Waiting' && p.source?.kind === 'Order' && match(p.source));
}

export const getFilament = (rec, id) => rec.filaments.find((f) => f.id === id);
export const live = (s) => s.place.kind !== 'Empty';
export const placeText = (p) => (p.kind === 'AMS' ? `AMS ${p.unit} slot ${p.slot}` : p.kind === 'External' ? 'External holder' : p.kind);
export const samePlace = (a, b) => a.kind === b.kind && (a.kind !== 'AMS' || (a.unit === b.unit && a.slot === b.slot));

export function args(argv, flags) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, '');
    if (flags.includes(k)) a[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    else (a._ ||= []).push(argv[i]);
  }
  return a;
}
