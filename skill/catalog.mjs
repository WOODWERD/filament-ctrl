#!/usr/bin/env node
// Builds catalog.json, Bambu Lab's filament lines and colours, from Bambu Studio's own files (FM-R60 to FM-R62).
// Reads the Studio install on this computer, or the same files in the public BambuStudio repo on GitHub.
// Bambu's files are AGPL-3.0 and are never copied into the Filament Ctrl repo; the result goes to the person's own data repo.
// No dependencies. Node 18 or later.

import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const SCHEMA = 1;
const GITHUB_REPO = 'bambulab/BambuStudio';
const PROFILES = 'resources/profiles';
const COLOUR_FILE = 'filaments_color_codes.json';
const KIND = { '单色': 'solid', '渐变色': 'gradient', '多拼色': 'multi-colour' };

// Material as the app groups it (FM-U13). Support lines first, since some share a plastic with a part line.
export function materialOf(type, name) {
  const t = String(type || '').toUpperCase();
  if (/support/i.test(name) || t === 'PVA') return 'Support';
  if (t.startsWith('TPU')) return 'TPU';
  if (t.startsWith('PETG')) return 'PETG';
  if (t.startsWith('PLA')) return 'PLA';
  if (t.startsWith('ABS') || t.startsWith('ASA')) return 'ABS and ASA';
  return 'Engineering';
}

const one = (v) => (Array.isArray(v) ? v[0] : v);
const num = (v) => { const x = Number(one(v)); return v === undefined || v === null || one(v) === '' || Number.isNaN(x) ? null : x; };
const flag = (v) => (v === undefined ? null : String(one(v)) === '1');

// '#RRGGBBAA' to '#RRGGBB' when fully opaque; anything else is kept as given.
export function colourValue(v) {
  const s = String(v || '').trim();
  return /^#[0-9a-f]{8}$/i.test(s) && /ff$/i.test(s) ? s.slice(0, 7).toUpperCase() : s.toUpperCase() || null;
}

// A profile with everything it inherits folded in, nearest last. Files are found by the path BBL.json gives,
// since a name can hold a character a file name can't (Support For PA/PET is saved as "PA PET").
async function resolve(read, paths, name, depth = 0) {
  const file = paths.get(name) || `filament/${name}.json`;
  const own = await read(file);
  if (!own) throw new Error(`Studio file missing: ${file}`);
  if (!own.inherits || depth > 8) return own;
  return { ...(await resolve(read, paths, own.inherits, depth + 1)), ...own };
}

// One catalog line from a resolved base profile (FM-R61). Facts Studio doesn't give are null, never guessed.
export function lineFrom(p) {
  const name = String(p.name).replace(/ @base$/, '').replace(/^Bambu /, '');
  const hrc = num(p.required_nozzle_HRC);
  return {
    id: p.filament_id || null,
    name,
    brand: 'Bambu Lab',
    type: one(p.filament_type) || null,
    material: materialOf(one(p.filament_type), name),
    nozzle: { low: num(p.nozzle_temperature_range_low), high: num(p.nozzle_temperature_range_high) },
    plate: num(p.textured_plate_temp),
    softens: num(p.temperature_vitrification),
    density: num(p.filament_density),
    hardenedNozzle: hrc === null ? null : hrc >= 20,
    drying: { temp: num(p.filament_dev_ams_drying_temperature), hours: num(p.filament_dev_ams_drying_time) },
    support: flag(p.filament_is_support),
    soluble: flag(p.filament_soluble),
    studioNote: p.description || null,
    colours: [],
  };
}

export function colourFrom(c) {
  const names = c.fila_color_name || {};
  return {
    name: names.en || null,
    names,
    values: (c.fila_color || []).map(colourValue).filter(Boolean),
    code: c.color_code || null,
    studioCode: c.fila_color_code || null,
    kind: KIND[c.fila_color_type] || null,
  };
}

// The whole catalog. `read(path)` returns parsed JSON for a path under resources/profiles/BBL/, or null.
export async function buildCatalog(read, source) {
  const bbl = await read('../BBL.json');
  if (!bbl) throw new Error('Studio file missing: BBL.json');
  const list = bbl.filament_list || [];
  const paths = new Map(list.filter((f) => f.sub_path).map((f) => [f.name, f.sub_path]));
  const bases = list.map((f) => f.name).filter((n) => /^Bambu .* @base$/.test(n));
  const lines = [];
  for (const n of bases) lines.push(lineFrom(await resolve(read, paths, n)));
  lines.sort((a, b) => a.material.localeCompare(b.material) || a.name.localeCompare(b.name));
  const byId = new Map(lines.map((l) => [l.id, l]));
  const colourFile = await read(`filament/${COLOUR_FILE}`);
  const unmatched = [];
  for (const c of colourFile?.data || []) {
    const line = byId.get(c.fila_id);
    if (line) line.colours.push(colourFrom(c));
    else unmatched.push({ lineId: c.fila_id, ...colourFrom(c) });
  }
  return {
    schema: SCHEMA,
    source: { ...source, profileVersion: bbl.version || null },
    built: new Date().toISOString(),
    counts: { lines: lines.length, colours: lines.reduce((n, l) => n + l.colours.length, 0), unmatched: unmatched.length },
    lines,
    unmatched,
  };
}

// --- Where the files come from ---

export function studioPaths() {
  if (process.platform === 'darwin') return ['/Applications/BambuStudio.app/Contents/Resources/profiles'];
  if (process.platform === 'win32') return [join(process.env.ProgramFiles || 'C:\\Program Files', 'Bambu Studio', 'resources', 'profiles')];
  return [join(process.env.HOME || '', '.local/share/BambuStudio/resources/profiles'), '/opt/bambu-studio/resources/profiles'];
}

const exists = (p) => access(p).then(() => true, () => false);

export function localReader(profiles) {
  return async (rel) => {
    try { return JSON.parse(await readFile(join(profiles, 'BBL', rel), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  };
}

async function studioAppVersion() {
  if (process.platform !== 'darwin') return null;
  try {
    const { stdout } = await promisify(execFile)('/usr/bin/defaults', ['read', '/Applications/BambuStudio.app/Contents/Info', 'CFBundleShortVersionString']);
    return stdout.trim() || null;
  } catch { return null; }
}

// The public repo at one commit, so every file comes from the same version (FM-A13). By default that's the latest
// Studio release, not master: master carries lines and colours that aren't in any Studio people can install yet.
export async function githubReader(fetchFn = fetch, ref = null) {
  const api = (path) => fetchFn(`https://api.github.com/repos/${GITHUB_REPO}/${path}`, { headers: { accept: 'application/vnd.github+json' } });
  if (!ref) {
    const rel = await api('releases/latest');
    if (!rel.ok) throw new Error(`GitHub answered ${rel.status} for the latest BambuStudio release`);
    ref = (await rel.json()).tag_name;
  }
  const r = await api(`commits/${encodeURIComponent(ref)}`);
  if (!r.ok) throw new Error(`GitHub answered ${r.status} for the BambuStudio commit`);
  const sha = (await r.json()).sha;
  const read = async (rel) => {
    const path = rel.startsWith('../') ? `${PROFILES}/${rel.slice(3)}` : `${PROFILES}/BBL/${rel}`;
    const res = await fetchFn(`https://raw.githubusercontent.com/${GITHUB_REPO}/${sha}/${path.split('/').map(encodeURIComponent).join('/')}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${path}`);
    return res.json();
  };
  return { read, sha, ref };
}

// --- Command line ---

function args(argv) {
  const a = { out: 'catalog.json', studio: null, github: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') a.out = argv[++i];
    else if (argv[i] === '--studio') a.studio = argv[++i];
    else if (argv[i] === '--github') a.github = true;
    else if (argv[i] === '--help') a.help = true;
  }
  return a;
}

async function main() {
  const a = args(process.argv.slice(2));
  if (a.help) {
    console.log('node catalog.mjs [--out catalog.json] [--studio <Bambu Studio profiles folder>] [--github]');
    return;
  }
  let read, source;
  const local = a.github ? null : a.studio ? [a.studio] : studioPaths();
  const found = [];
  for (const p of local || []) if (await exists(join(p, 'BBL.json'))) found.push(p);
  if (found.length) {
    read = localReader(found[0]);
    source = { from: 'Bambu Studio on this computer', path: found[0], studioVersion: await studioAppVersion() };
  } else {
    if (!a.github) console.log('Bambu Studio not found on this computer; reading the public BambuStudio repo on GitHub instead.');
    const g = await githubReader();
    read = g.read;
    source = { from: 'GitHub', repo: GITHUB_REPO, release: g.ref, commit: g.sha, studioVersion: String(g.ref).replace(/^v/, '') };
  }
  const cat = await buildCatalog(read, source);
  await writeFile(a.out, JSON.stringify(cat, null, 1) + '\n');
  const v = cat.source.from === 'GitHub' ? `${cat.source.repo} ${cat.source.release} (${cat.source.commit.slice(0, 7)})` : `Bambu Studio ${cat.source.studioVersion || 'on this computer'}`;
  console.log(`${cat.counts.lines} lines, ${cat.counts.colours} colours from ${v} (profiles ${cat.source.profileVersion}). Written to ${a.out}.`);
  if (cat.counts.unmatched) console.log(`${cat.counts.unmatched} colours name a line that isn't in the catalog; kept under "unmatched".`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
