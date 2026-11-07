// The skill's readers, by FM ID. Made-up data only, shaped like Bambu Studio's and a real order.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { proposalFor, matchLine } from '../skill/order.mjs';
import { amsEntry, slotsFrom, proposalFromStudio } from '../skill/studio-ams.mjs';
import { unzipOne, needsFromSliceInfo, needsFromGcode, planJob, planText, usedProposal } from '../skill/plan.mjs';
import { orderKnown as skillKnown } from '../skill/common.mjs';
import { emptyRecord, addSpools, moveSpool, markOpened, setLeft, applyProposal, getSpool, orderKnown as appKnown } from '../site/core.js';

const DAY = '2026-11-06';
const CAT = { lines: [
  { id: 'GFA00', name: 'PLA Basic', brand: 'Bambu Lab', type: 'PLA', material: 'PLA', colours: [
    { name: 'Black', names: { en: 'Black', de: 'Schwarz' }, values: ['#000000'], code: 'K0', studioCode: '10101' },
    { name: 'Jade White', names: { en: 'Jade White' }, values: ['#FFFFFF'], code: 'W1', studioCode: '10100' },
    { name: 'White', names: { en: 'White' }, values: ['#F4F4F2'], code: 'W0', studioCode: '10102' } ] },
  { id: 'GFG02', name: 'PETG HF', brand: 'Bambu Lab', type: 'PETG', material: 'PETG', colours: [
    { name: 'Lake Blue', names: { en: 'Lake Blue' }, values: ['#1F79E5'], code: 'B1', studioCode: '33601' } ] },
  { id: 'GFA05', name: 'PLA Silk', brand: 'Bambu Lab', type: 'PLA', material: 'PLA', colours: [] },
  { id: 'GFA06', name: 'PLA Silk+', brand: 'Bambu Lab', type: 'PLA', material: 'PLA', colours: [{ name: 'Gold', names: { en: 'Gold' }, values: ['#E4BD68'], code: 'Y2' }] },
] };
const BAMBU = { seller: 'Bambu Lab store', number: '4417-2093', date: '2026-11-03' };

test('FM-A14 a Bambu order line "PETG HF – Lake Blue" matches GFG02, colour B1, Sure', () => {
  const m = matchLine(CAT, BAMBU.seller, { text: 'PETG HF – Lake Blue' });
  assert.equal(m.filament.lineId, 'GFG02');
  assert.equal(m.filament.code, 'B1');
  assert.equal(m.sure, 'Sure');
});

test('FM-R12 the longest name wins, and a Studio code beats a name', () => {
  assert.equal(matchLine(CAT, BAMBU.seller, { text: 'PLA Silk+ - Gold' }).filament.lineId, 'GFA06');
  assert.equal(matchLine(CAT, BAMBU.seller, { text: 'PLA Basic - Jade White' }).filament.code, 'W1', 'not plain White');
  assert.equal(matchLine(CAT, BAMBU.seller, { text: 'PLA Basic (10102) 1kg' }).filament.code, 'W0');
  const grey = { ...CAT, lines: [{ ...CAT.lines[0], colours: [{ name: 'Ash Gray', names: { en: 'Ash Gray' }, values: ['#9B9EA0'], code: 'D2' }] }] };
  assert.equal(matchLine(grey, BAMBU.seller, { text: 'PLA Basic - Ash Grey' }).filament.code, 'D2', 'grey and gray read the same');
});

test('FM-R12 other sellers read Likely with brand, material and colour named, otherwise Guess; a Bambu line with no colour is a Guess', () => {
  assert.equal(matchLine(CAT, 'Amazon', { text: 'Sunlu PLA+ 1kg Orange', brand: 'Sunlu', line: 'PLA+', material: 'PLA', colour: 'Orange' }).sure, 'Likely');
  assert.equal(matchLine(CAT, 'Amazon', { text: 'Mystery PLA 1kg', brand: 'Generic', material: 'PLA' }).sure, 'Guess');
  assert.equal(matchLine(CAT, 'Amazon', { text: 'Bambu PETG HF Lake Blue' }).sure, 'Likely', 'a Bambu line bought elsewhere is Likely, not Sure');
  const r = matchLine(CAT, BAMBU.seller, { text: 'PLA Basic Refill – Random Colour' });
  assert.equal(r.sure, 'Guess');
  assert.deepEqual(r.filament.values, []);
});

test('FM-A01, FM-R16, FM-E03, FM-R52 one proposal: spools per line, a refunded line skipped, nothing else copied', () => {
  const p = proposalFor({ ...BAMBU, address: '1 Made Up Lane', total: '$80', lines: [
    { text: 'PLA Basic - Black', spools: 3, price: '$19.99' }, { text: 'PETG HF - Lake Blue', spools: 1 }, { text: 'PLA Basic - White', spools: 1, skip: 'Refunded' }] }, CAT, DAY);
  assert.equal(p.id, 'order-bambu-lab-store-4417-2093');
  assert.deepEqual(p.changes.map((c) => [c.filament.code, c.count, c.place, c.sure]), [['K0', 3, 'Sealed', 'Sure'], ['B1', 1, 'Sealed', 'Sure']]);
  assert.deepEqual(p.skipped, [{ textRead: 'PLA Basic - White', why: 'Refunded' }]);
  const text = JSON.stringify(p);
  assert.ok(!text.includes('Made Up Lane') && !text.includes('$80') && !text.includes('19.99'));
  const applied = applyProposal(emptyRecord(), p, undefined, DAY);
  assert.equal(applied.rec.spools.length, 4, 'the app reads what the skill writes');
});

test('FM-A02, FM-R14 the skill and the app agree on when an order is already known', () => {
  const p = proposalFor({ ...BAMBU, lines: [{ text: 'PLA Basic - Black' }] }, CAT, DAY);
  const rec = applyProposal(emptyRecord(), p, undefined, DAY).rec;
  for (const [r, ps, seller, n] of [[emptyRecord(), [p], BAMBU.seller, BAMBU.number], [rec, [], BAMBU.seller, BAMBU.number], [rec, [], 'Amazon', BAMBU.number], [emptyRecord(), [], BAMBU.seller, '1']])
    assert.equal(skillKnown(r, ps, seller, n), appKnown(r, ps, seller, n));
  assert.equal(skillKnown(rec, [], BAMBU.seller, BAMBU.number), true);
});

test('FM-R28 only the ams_filament_ids entry is read from Studio\'s settings; access codes never come out', () => {
  const conf = JSON.stringify({ access_code: { '01P00A000000001': 'SECRET12' }, app: { note: 'a } brace and "quote" in a string' },
    ams_filament_ids: { '01P00A000000001': 'GFA00,GFG02,,GFA00,GFU02' }, user_access_code: { x: 'SECRET34' } }, null, 2);
  const e = amsEntry(conf);
  assert.deepEqual(e, { '01P00A000000001': 'GFA00,GFG02,,GFA00,GFU02' });
  assert.ok(!JSON.stringify(e).includes('SECRET'));
  assert.equal(amsEntry('{"other": 1}'), null);
});

test('FM-R28, FM-E05 four slots a unit in order; anything after is the external holder', () => {
  const s = slotsFrom('GFA00,GFG02,,GFA00,GFU02', 1);
  assert.deepEqual(s.map((x) => [x.place.kind, x.place.slot ?? null, x.lineId]), [['AMS', 1, 'GFA00'], ['AMS', 2, 'GFG02'], ['AMS', 3, null], ['AMS', 4, 'GFA00'], ['External', null, 'GFU02']]);
  assert.equal(slotsFrom('a,b,c,d,e,f,g,h', 2).filter((x) => x.place.unit === 2).length, 4);
});

test('FM-R28, FM-E06 a slot goes to the one open spool of its line, Likely; with two or none the review asks; a matching spool stays', () => {
  const black = { brand: 'Bambu Lab', line: 'PLA Basic', lineId: 'GFA00', material: 'PLA', colour: 'Black', values: ['#000000'], code: 'K0' };
  const blue = { brand: 'Bambu Lab', line: 'PETG HF', lineId: 'GFG02', material: 'PETG', colour: 'Lake Blue', values: ['#1F79E5'], code: 'B1' };
  let rec = addSpools(emptyRecord(), { filament: black, count: 2, date: DAY }).rec; // FM-001, FM-002
  rec = moveSpool(rec, 'FM-001', { kind: 'AMS', unit: 1, slot: 1 }, DAY);
  rec = markOpened(rec, 'FM-002', DAY);
  rec = addSpools(rec, { filament: blue, count: 2, place: 'Sealed', date: DAY }).rec; // FM-003, FM-004 sealed
  rec = markOpened(markOpened(rec, 'FM-003', DAY), 'FM-004', DAY);
  const p = proposalFromStudio(slotsFrom('GFA00,GFG02,,GFA00', 1), CAT, rec, DAY, DAY);
  assert.deepEqual(p.changes.map((c) => [c.spool, c.to.slot, c.sure]), [['FM-002', 4, 'Likely']], 'slot 1 already holds black; slot 4 gets the one open black');
  assert.equal(p.skipped.length, 1);
  assert.match(p.skipped[0].why, /2 open spools of PETG HF/);
  const out = applyProposal(rec, p, undefined, DAY).rec;
  assert.deepEqual(out.places, { from: 'From Bambu Studio', at: DAY }, 'FM-U04 the printer view says where the places came from');
  assert.equal(getSpool(out, 'FM-002').place.slot, 4);
});

// A stored (and one deflated) zip, enough to stand in for a sliced .3mf.
function zip(files) {
  const parts = [], central = [];
  let off = 0;
  for (const [name, text, deflate] of files) {
    const raw = Buffer.from(text), data = deflate ? deflateRawSync(raw) : raw, n = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(deflate ? 8 : 0, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(deflate ? 8 : 0, 10); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    parts.push(local, n, data); central.push(c, n); off += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}
const SLICE = `<?xml version="1.0"?><config><plate><metadata key="index" value="1"/>
  <filament id="1" tray_info_idx="GFA00" type="PLA" color="#000000" used_m="70.1" used_g="180.0" />
  <filament id="2" tray_info_idx="GFA00" type="PLA" color="#FFFFFF" used_m="12.0" used_g="38.0" /></plate></config>`;

test('FM-R30 a sliced .3mf gives each filament\'s line, colour and grams; so does G-code', () => {
  const buf = zip([['3D/3dmodel.model', '<model/>', false], ['Metadata/slice_info.config', SLICE, true]]);
  const needs = needsFromSliceInfo(unzipOne(buf, 'Metadata/slice_info.config'));
  assert.deepEqual(needs, [{ lineId: 'GFA00', type: 'PLA', colour: '#000000', grams: 180 }, { lineId: 'GFA00', type: 'PLA', colour: '#FFFFFF', grams: 38 }]);
  const gc = needsFromGcode('; HEADER\n; filament used [g] = 12.50, 4.00\n; filament_type = PLA;PETG\n; filament_colour = #000000;#1F79E5\n; filament_ids = GFA00;GFG02\n');
  assert.deepEqual(gc.map((n) => [n.lineId, n.grams]), [['GFA00', 12.5], ['GFG02', 4]]);
});

const BLACK = { brand: 'Bambu Lab', line: 'PLA Basic', lineId: 'GFA00', material: 'PLA', colour: 'Black', values: ['#000000'], code: 'K0', diameter: 1.75 };
function shelfWithSlot2(grams) {
  let rec = addSpools(emptyRecord(), { filament: BLACK, count: 3, date: DAY }).rec; // FM-001..003
  rec = moveSpool(rec, 'FM-001', { kind: 'AMS', unit: 1, slot: 2 }, DAY);
  rec = setLeft(rec, 'FM-001', grams, 'Used', DAY);
  rec = setLeft(markOpened(rec, 'FM-002', DAY), 'FM-002', 600, 'Used', DAY);
  return rec;
}
const NEED = [{ lineId: 'GFA00', type: 'PLA', colour: '#000000', grams: 180 }];

test('FM-A05 180 g black with slot 2 at 400 of 1,000 g: slot 2, no swap', () => {
  const rows = planJob(NEED, shelfWithSlot2(400), CAT, DAY);
  assert.equal(rows[0].action, 'keep');
  assert.equal(rows[0].spool.id, 'FM-001');
  assert.match(planText(rows), /AMS 1 slot 2 has FM-001 with 400 g\. That covers it, so no change\./);
});

test('FM-A06, FM-R31 with slot 2 at 100 g: says slot 2 won\'t cover it, and names the open spool before a sealed one', () => {
  const rows = planJob(NEED, shelfWithSlot2(100), CAT, DAY);
  assert.equal(rows[0].action, 'load');
  assert.equal(rows[0].spool.id, 'FM-002', 'open before sealed');
  assert.deepEqual(rows[0].slot, { kind: 'AMS', unit: 1, slot: 1 });
  assert.match(planText(rows), /only 100 g, which won't cover it\. Load FM-002/);
});

test('FM-R32, FM-E09 drying for a thirsty material open a while; and saying when nothing covers the job', () => {
  const petg = { ...BLACK, line: 'PETG HF', lineId: 'GFG02', material: 'PETG', colour: 'Lake Blue', values: ['#1F79E5'] };
  let rec = addSpools(emptyRecord(), { filament: petg, date: '2026-09-01' }).rec;
  rec = markOpened(rec, 'FM-001', '2026-09-01');
  const rows = planJob([{ lineId: 'GFG02', type: 'PETG', colour: '#1F79E5', grams: 50 }, { lineId: 'GFA00', type: 'PLA', colour: '#FF0000', grams: 20 }], rec, CAT, DAY);
  assert.equal(rows[0].dry, true);
  assert.equal(rows[1].action, 'none');
  assert.match(planText(rows), /wants drying first[\s\S]*none on the shelf/);
});

test('FM-R34 after the print, the grams come off the loaded spools that the AMS doesn\'t read', () => {
  const rec = shelfWithSlot2(400);
  const p = usedProposal(planJob(NEED, rec, CAT, DAY), 'bracket.3mf', DAY);
  assert.deepEqual(p.changes.map((c) => [c.type, c.spool, c.grams]), [['spoolUsed', 'FM-001', 180]]);
  assert.equal(getSpool(applyProposal(rec, p, undefined, DAY).rec, 'FM-001').left.grams, 220);
});
