#!/usr/bin/env node
// Turns the approved guides (guides.md, kept with the spec) into site/guides.js for the Materials view (FM-R64).
// node tools/guides.mjs ~/WOODWERD-Claude/projects/filament-ctrl/guides.md
// Who-said-what notes such as "(Drew, 2026-11-06, …)" are for the draft and are left out of the app.

import { readFile, writeFile } from 'node:fs/promises';

const src = process.argv[2];
if (!src) { console.error('node tools/guides.mjs <guides.md>'); process.exit(1); }
const md = await readFile(src, 'utf8');

const clean = (s) => s.replace(/\s*\((?:Drew|from Bambu)[^)]*\)\.?/g, '').replace(/\*\*/g, '').replace(/`/g, '').replace(/\s+/g, ' ').trim();
const ensureStop = (s) => { const t = s.charAt(0).toUpperCase() + s.slice(1); return /[.!?]$/.test(t) ? t : t + '.'; };
const sections = md.split(/^## /m).slice(1).map((b) => { const i = b.indexOf('\n'); return [b.slice(0, i).trim(), b.slice(i + 1)]; });
const section = (name) => sections.find(([h]) => h === name)?.[1] || '';

const statement = clean(/\*(These guides are an aid[^*]+)\*/.exec(md)?.[1] || '');
if (!statement) throw new Error('The aid-only statement is missing from the guides');

const start = section('Start here');
const choose = [...start.matchAll(/^\| (?!If the part|---)(.+?) \| (.+?) \| (.+?) \|$/gm)].map((m) => ({ part: clean(m[1]), lookAt: clean(m[2]), why: clean(m[3]) }));

const list = (body, label) => {
  const m = new RegExp(`\\*\\*${label}\\*\\*\\n((?:- .+\\n?)+)`).exec(body);
  return m ? m[1].trim().split('\n').map((l) => ensureStop(clean(l.replace(/^- /, '')))) : [];
};
const para = (body, label) => ensureStop(clean(new RegExp(`\\*\\*${label}\\*\\* (.+)`).exec(body)?.[1] || ''));

const materials = {};
for (const name of ['PLA', 'PETG', 'ABS and ASA', 'TPU', 'Engineering', 'Support']) {
  const body = section(name);
  if (!body) throw new Error(`No guide for ${name}`);
  const lines = {};
  for (const m of body.matchAll(/^- ((?:\*\*[^*]+\*\*(?:, | and )?)+) — (.+)$/gm)) {
    const names = [...m[1].matchAll(/\*\*([^*]+)\*\*/g)].map((x) => x[1]);
    for (const n of names) lines[n] = ensureStop(clean(m[2]));
  }
  materials[name] = { what: para(body, 'What it is.'), goodFor: list(body, 'Good for'), watchFor: list(body, 'Watch for'), needs: para(body, 'Your printer needs.'), lines };
}

const out = `// Made by tools/guides.mjs from the approved guides. Don't edit by hand; edit guides.md and run it again.
export const STATEMENT = ${JSON.stringify(statement)};
export const CHOOSE = ${JSON.stringify(choose, null, 1)};
export const GUIDES = ${JSON.stringify(materials, null, 1)};
`;
await writeFile(new URL('../site/guides.js', import.meta.url), out);
console.log(`Guides for ${Object.keys(materials).length} materials, ${Object.values(materials).reduce((n, m) => n + Object.keys(m.lines).length, 0)} line notes, ${choose.length} Start here rows.`);
