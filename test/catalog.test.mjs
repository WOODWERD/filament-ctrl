// Catalog builder tests, by FM ID. Made-up Studio files only, shaped like Bambu Studio's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog, materialOf, colourValue, githubReader } from '../skill/catalog.mjs';

const FILES = {
  '../BBL.json': { version: '09.09.00.01', filament_list: [
    { name: 'fdm_filament_pla' }, { name: 'Bambu Test PLA @base' }, { name: 'Bambu Test PLA @BBL X1C' },
    { name: 'Bambu Test PA-CF @base' }, { name: 'Bambu Support For A/B @base', sub_path: 'filament/Bambu Support For A B @base.json' }, { name: 'Generic PLA @base' } ] },
  'filament/fdm_filament_pla.json': { name: 'fdm_filament_pla', filament_type: ['PLA'], nozzle_temperature_range_low: ['190'],
    nozzle_temperature_range_high: ['240'], filament_density: ['1.24'], filament_cost: ['20'] },
  'filament/Bambu Test PLA @base.json': { name: 'Bambu Test PLA @base', inherits: 'fdm_filament_pla', filament_id: 'GFZ00',
    filament_density: ['1.26'], filament_cost: ['19.99'], textured_plate_temp: ['55'], temperature_vitrification: ['45'],
    required_nozzle_HRC: ['3'], filament_dev_ams_drying_temperature: ['45', '45'], filament_dev_ams_drying_time: ['12', '12'],
    filament_is_support: ['0'], filament_soluble: ['0'] },
  'filament/Bambu Test PA-CF @base.json': { name: 'Bambu Test PA-CF @base', filament_id: 'GFZ01', filament_type: ['PA-CF'],
    nozzle_temperature_range_low: ['260'], nozzle_temperature_range_high: ['300'], required_nozzle_HRC: ['40'],
    description: 'A made-up line note.' },
  'filament/Bambu Support For A B @base.json': { name: 'Bambu Support For A/B @base', filament_id: 'GFZ02', filament_type: ['PLA'],
    filament_is_support: ['1'] },
  'filament/filaments_color_codes.json': { data: [
    { fila_id: 'GFZ00', fila_type: 'Test PLA', fila_color_type: '单色', fila_color_name: { en: 'Test White', de: 'Testweiß' },
      fila_color: ['#FFFFFFFF'], color_code: 'W0', fila_color_code: '10100' },
    { fila_id: 'GFZ00', fila_type: 'Test PLA', fila_color_type: '渐变色', fila_color_name: { en: 'Test Dusk' },
      fila_color: ['#1F79E5FF', '#F9DFB9FF'], color_code: 'M0', fila_color_code: '10900' },
    { fila_id: 'GFZ99', fila_type: 'Gone', fila_color_type: '单色', fila_color_name: { en: 'Orphan' }, fila_color: ['#000000FF'], color_code: 'K0' } ] },
};
const read = async (p) => FILES[p] ?? null;
const SOURCE = { from: 'Bambu Studio on this computer', studioVersion: '9.9.9' };

test('FM-R60 only Bambu base profiles become lines, found by the path Studio lists; machine variants and other makers are left out', async () => {
  const c = await buildCatalog(read, SOURCE);
  assert.deepEqual(c.lines.map((l) => l.name).sort(), ['Support For A/B', 'Test PA-CF', 'Test PLA']);
});

test('FM-R61 a line keeps Studio facts, folding in what it inherits; no price is kept', async () => {
  const pla = (await buildCatalog(read, SOURCE)).lines.find((l) => l.id === 'GFZ00');
  assert.equal(pla.type, 'PLA');
  assert.equal(pla.material, 'PLA');
  assert.deepEqual(pla.nozzle, { low: 190, high: 240 });
  assert.equal(pla.density, 1.26, 'the line overrides what it inherits');
  assert.equal(pla.plate, 55);
  assert.equal(pla.softens, 45);
  assert.equal(pla.hardenedNozzle, false);
  assert.deepEqual(pla.drying, { temp: 45, hours: 12 });
  assert.equal(pla.support, false);
  assert.ok(!JSON.stringify(pla).includes('19.99') && !('cost' in pla), 'filament_cost is not a price and is not stored (FM-R67)');
});

test('FM-R61 a fact Studio does not give is null, never guessed', async () => {
  const pa = (await buildCatalog(read, SOURCE)).lines.find((l) => l.id === 'GFZ01');
  assert.equal(pa.plate, null);
  assert.equal(pa.density, null);
  assert.deepEqual(pa.drying, { temp: null, hours: null });
  assert.equal(pa.support, null);
  assert.equal(pa.hardenedNozzle, true);
  assert.equal(pa.material, 'Engineering');
  assert.equal(pa.studioNote, 'A made-up line note.');
});

test('FM-R61 colours: names in every language, values without full alpha, code, kind', async () => {
  const pla = (await buildCatalog(read, SOURCE)).lines.find((l) => l.id === 'GFZ00');
  assert.deepEqual(pla.colours[0], { name: 'Test White', names: { en: 'Test White', de: 'Testweiß' }, values: ['#FFFFFF'], code: 'W0', studioCode: '10100', kind: 'solid' });
  assert.deepEqual(pla.colours[1].values, ['#1F79E5', '#F9DFB9']);
  assert.equal(pla.colours[1].kind, 'gradient');
});

test('FM-A12 every colour sits on its line by filament ID; counts add up; strays are kept, not dropped', async () => {
  const c = await buildCatalog(read, SOURCE);
  assert.deepEqual(c.counts, { lines: 3, colours: 2, unmatched: 1 });
  assert.equal(c.unmatched[0].lineId, 'GFZ99');
  assert.equal(c.lines.find((l) => l.id === 'GFZ01').colours.length, 0, 'FM-E12 a line with no colours is still a line');
});

test('FM-R62 the catalog says where it came from, which profile version, and when', async () => {
  const c = await buildCatalog(read, SOURCE);
  assert.equal(c.schema, 1);
  assert.equal(c.source.from, 'Bambu Studio on this computer');
  assert.equal(c.source.studioVersion, '9.9.9');
  assert.equal(c.source.profileVersion, '09.09.00.01');
  assert.ok(!Number.isNaN(Date.parse(c.built)));
});

test('FM-A13 from GitHub: the latest Studio release, every file read at its one commit, and both recorded', async () => {
  const urls = [];
  const fakeFetch = async (url) => {
    urls.push(url);
    if (url.endsWith('/releases/latest')) return { ok: true, status: 200, json: async () => ({ tag_name: 'v09.09.01.01' }) };
    if (url.endsWith('/commits/v09.09.01.01')) return { ok: true, status: 200, json: async () => ({ sha: 'abc1234def' }) };
    if (url.startsWith('https://api.github.com/')) return { ok: false, status: 404 };
    const path = decodeURIComponent(url.split('/abc1234def/resources/profiles/')[1]);
    const key = path.startsWith('BBL/') ? path.slice(4) : `../${path}`;
    return FILES[key] ? { ok: true, status: 200, json: async () => FILES[key] } : { ok: false, status: 404 };
  };
  const g = await githubReader(fakeFetch);
  assert.equal(g.ref, 'v09.09.01.01', 'the latest release, not master');
  const c = await buildCatalog(g.read, { from: 'GitHub', release: g.ref, commit: g.sha });
  assert.equal(c.counts.lines, 3);
  assert.equal(c.source.commit, 'abc1234def');
  assert.ok(urls.slice(2).every((u) => u.startsWith('https://raw.githubusercontent.com/bambulab/BambuStudio/abc1234def/')));
});

test('materials group the way the Materials view shows them (FM-U13)', () => {
  assert.equal(materialOf('PLA', 'PLA Basic'), 'PLA');
  assert.equal(materialOf('PLA', 'Support For PLA'), 'Support');
  assert.equal(materialOf('PVA', 'PVA'), 'Support');
  assert.equal(materialOf('PETG-CF', 'PETG-CF'), 'PETG');
  assert.equal(materialOf('ASA-AERO', 'ASA-Aero'), 'ABS and ASA');
  assert.equal(materialOf('TPU-AMS', 'TPU for AMS'), 'TPU');
  assert.equal(materialOf('PPS-CF', 'PPS-CF'), 'Engineering');
  assert.equal(colourValue('#00000080'), '#00000080', 'part-transparent values keep their alpha');
});
