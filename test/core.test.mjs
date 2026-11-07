// Filament Ctrl core tests, by FM ID. Made-up data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyRecord, addSpools, markOpened, markEmpty, moveSpool, setLeft, getSpool, getFilament, inPlace, filamentCounts,
  shelfCounts, shelf, defaultTicks, applyProposal, declineProposal, orderKnown, keepListed, spoolId } from '../site/core.js';

const DAY = '2026-11-06';
const BLACK = { brand: 'Bambu Lab', line: 'PLA Basic', lineId: 'GFA00', material: 'PLA', colour: 'Black', values: ['#000000'], code: 'K0', diameter: 1.75 };
const WHITE = { brand: 'Bambu Lab', line: 'PETG HF', lineId: 'GFG02', material: 'PETG', colour: 'White', values: ['#FFFFFF'], code: 'W0', diameter: 1.75 };
const ORDER = {
  format: 1, id: 'order-bambu-lab-store-4417-2093', read: DAY, status: 'Waiting',
  source: { kind: 'Order', seller: 'Bambu Lab store', number: '4417-2093', date: '2026-11-03', address: '1 Made Up Lane', total: '$80.00' },
  changes: [
    { type: 'newSpools', ref: 'n1', count: 3, net: 1000, place: 'Sealed', filament: { ...BLACK, price: '19.99' }, sure: 'Sure', textRead: 'PLA Basic - Black x3' },
    { type: 'newSpools', ref: 'n2', count: 1, net: 1000, place: 'Sealed', filament: WHITE, sure: 'Sure', textRead: 'PETG HF - White x1' },
  ],
};

test('FM-R05 spool IDs are FM- and three digits, given in order by the app', () => {
  assert.equal(spoolId(7), 'FM-007');
  assert.equal(spoolId(1234), 'FM-1234');
  const { ids } = addSpools(emptyRecord(), { filament: BLACK, count: 2, date: DAY });
  assert.deepEqual(ids, ['FM-001', 'FM-002']);
});

test('FM-A01, FM-R16, FM-R52 an order of 3 black and 1 white adds 4 sealed spools with the order, and no address or price', () => {
  const { rec, proposal } = applyProposal(emptyRecord(), ORDER, defaultTicks(ORDER), DAY);
  assert.equal(rec.spools.length, 4);
  assert.ok(rec.spools.every((s) => s.place.kind === 'Sealed' && s.left.grams === 1000 && s.left.from === 'New'));
  assert.deepEqual(rec.spools[0].order, { seller: 'Bambu Lab store', number: '4417-2093', date: '2026-11-03' });
  assert.equal(rec.filaments.length, 2);
  const text = JSON.stringify(rec);
  assert.ok(!text.includes('Made Up Lane') && !text.includes('80.00') && !text.includes('19.99'));
  assert.equal(proposal.status, 'Accepted');
  assert.deepEqual(proposal.added, { n1: ['FM-001', 'FM-002', 'FM-003'], n2: ['FM-004'] });
});

test('FM-A02, FM-R14 the same order is known once added, or while its proposal waits', () => {
  assert.equal(orderKnown(emptyRecord(), [ORDER], 'Bambu Lab store', '4417-2093'), true, 'waiting');
  const { rec, proposal } = applyProposal(emptyRecord(), ORDER, undefined, DAY);
  assert.equal(orderKnown(rec, [proposal], 'Bambu Lab store', '4417-2093'), true, 'added');
  assert.equal(orderKnown(rec, [proposal], 'Bambu Lab store', '9999-0000'), false);
  assert.equal(orderKnown(rec, [], 'Amazon', '4417-2093'), false, 'another seller with the same number is another order');
});

test('FM-U10 review ticks Sure and Likely, leaves Guess; a partly ticked proposal is Partly accepted', () => {
  const p = { ...ORDER, changes: [...ORDER.changes, { type: 'newSpools', ref: 'n3', count: 1, net: 1000, filament: { brand: 'Bambu Lab', line: 'PLA Basic', material: 'PLA', colour: null }, sure: 'Guess' }] };
  const ticks = defaultTicks(p);
  assert.deepEqual(ticks, [true, true, false]);
  const r = applyProposal(emptyRecord(), p, ticks, DAY);
  assert.equal(r.rec.spools.length, 4);
  assert.equal(r.proposal.status, 'Partly accepted');
  assert.equal(declineProposal(p, DAY).status, 'Declined');
});

test('FM-A10 Empty is one change and drops the spool from the counts; Undo is the record before it', () => {
  const before = applyProposal(emptyRecord(), ORDER, undefined, DAY).rec;
  const fid = before.spools[0].filament;
  const after = markEmpty(before, 'FM-002', DAY);
  assert.equal(filamentCounts(before, fid).sealed, 3);
  assert.equal(filamentCounts(after, fid).sealed, 2);
  assert.equal(getSpool(after, 'FM-002').place.kind, 'Empty', 'FM-R06 it stays in the record');
  assert.equal(getSpool(before, 'FM-002').place.kind, 'Sealed', 'the old record is untouched, so Undo is writing it back');
  assert.equal(shelfCounts(after).spools, 3);
});

test('FM-A11, FM-R07 one open black at 200 of 1,000 g and none sealed is Low, and the Low count filters to it', () => {
  let rec = addSpools(emptyRecord(), { filament: BLACK, date: DAY }).rec;
  rec = markOpened(rec, 'FM-001', DAY);
  rec = setLeft(rec, 'FM-001', 200, 'Used', DAY);
  rec = addSpools(rec, { filament: WHITE, date: DAY }).rec;
  const black = getFilament(rec, getSpool(rec, 'FM-001').filament);
  assert.equal(filamentCounts(rec, black.id).low, true);
  assert.equal(shelfCounts(rec).low, 1);
  const lowShelf = shelf(rec, 'low');
  assert.equal(lowShelf.length, 1);
  assert.equal(lowShelf[0].rows[0].filament.colour, 'Black');
});

test('FM-R07 not Low with a sealed spool behind it, or with a quarter or more left', () => {
  let rec = addSpools(emptyRecord(), { filament: BLACK, count: 2, date: DAY }).rec;
  rec = setLeft(markOpened(rec, 'FM-001', DAY), 'FM-001', 100, 'Used', DAY);
  const fid = getSpool(rec, 'FM-001').filament;
  assert.equal(filamentCounts(rec, fid).low, false, 'a sealed spool behind it');
  rec = markEmpty(rec, 'FM-002', DAY);
  rec = setLeft(rec, 'FM-001', 250, 'Used', DAY);
  assert.equal(filamentCounts(rec, fid).low, false, 'exactly 25% is not under 25%');
});

test('FM-E04 moving into a full slot sends the spool there back to Open; Undo puts both back', () => {
  let rec = addSpools(emptyRecord(), { filament: BLACK, count: 2, date: DAY }).rec;
  rec = moveSpool(rec, 'FM-001', { kind: 'AMS', unit: 1, slot: 4 }, DAY);
  const before = rec;
  const after = moveSpool(before, 'FM-002', { kind: 'AMS', unit: 1, slot: 4 }, DAY);
  assert.equal(inPlace(after, { kind: 'AMS', unit: 1, slot: 4 }).id, 'FM-002');
  assert.equal(getSpool(after, 'FM-001').place.kind, 'Open');
  assert.equal(getSpool(after, 'FM-002').opened, DAY, 'loading a sealed spool opens it');
  assert.equal(inPlace(before, { kind: 'AMS', unit: 1, slot: 4 }).id, 'FM-001');
});

test('FM-S10 the phone quick changes: Opened, Empty, Move to slot, each with a history line', () => {
  let rec = addSpools(emptyRecord(), { filament: BLACK, date: DAY }).rec;
  rec = markOpened(rec, 'FM-001', DAY);
  rec = moveSpool(rec, 'FM-001', { kind: 'External' }, DAY);
  rec = markEmpty(rec, 'FM-001', DAY);
  assert.deepEqual(getSpool(rec, 'FM-001').history.map((h) => h.what), ['Added', 'Opened', 'Moved to External holder', 'Empty']);
  assert.throws(() => moveSpool(rec, 'FM-001', { kind: 'AMS', unit: 1, slot: 5 }), /slot from 1 to 4/);
});

test('FM-U07 the shelf groups filaments by material and counts sealed, open and in the printer', () => {
  let rec = applyProposal(emptyRecord(), ORDER, undefined, DAY).rec;
  rec = moveSpool(rec, 'FM-001', { kind: 'AMS', unit: 1, slot: 2 }, DAY);
  const groups = shelf(rec);
  assert.deepEqual(groups.map((g) => g.material), ['PETG', 'PLA']);
  const black = groups[1].rows[0];
  assert.deepEqual({ sealed: black.sealed, open: black.open, inPrinter: black.inPrinter, grams: black.grams }, { sealed: 2, open: 1, inPrinter: 1, grams: 3000 });
  assert.deepEqual(shelfCounts(rec), { spools: 4, sealed: 3, open: 1, inPrinter: 1, low: 0 });
});

test('a known filament is reused, not doubled, when more of it arrives', () => {
  let rec = addSpools(emptyRecord(), { filament: BLACK, date: DAY }).rec;
  rec = addSpools(rec, { filament: { ...BLACK, colour: 'black' }, date: DAY }).rec;
  assert.equal(rec.filaments.length, 1);
});

test('FM-R62 a rebuilt catalog keeps a line and colour a live spool still uses, marked No longer listed', () => {
  const oldCat = { lines: [{ id: 'GFA00', name: 'PLA Basic', colours: [{ name: 'Black', code: 'K0' }, { name: 'Gone Pink', code: 'P9' }] },
    { id: 'GFA99', name: 'PLA Old', colours: [{ name: 'Teal', code: 'T0' }] }] };
  const newCat = { lines: [{ id: 'GFA00', name: 'PLA Basic', colours: [{ name: 'White', code: 'W0' }] }] };
  let rec = addSpools(emptyRecord(), { filament: BLACK, date: DAY }).rec;
  rec = addSpools(rec, { filament: { brand: 'Bambu Lab', line: 'PLA Old', lineId: 'GFA99', material: 'PLA', colour: 'Teal', code: 'T0' }, date: DAY }).rec;
  const out = keepListed(newCat, oldCat, rec);
  const basic = out.lines.find((l) => l.id === 'GFA00');
  assert.deepEqual(basic.colours.map((c) => [c.code, !!c.noLongerListed]), [['W0', false], ['K0', true]]);
  assert.ok(!basic.colours.some((c) => c.code === 'P9'), 'unused colours that Bambu dropped go');
  assert.equal(out.lines.find((l) => l.id === 'GFA99').noLongerListed, true);
  assert.equal(keepListed(newCat, oldCat, markEmpty(rec, 'FM-002', DAY)).lines.length, 1, 'an Empty spool keeps nothing');
});

test('FM-R14, FM-A08 the same order accepted twice adds its spools once', () => {
  const { rec } = applyProposal(emptyRecord(), ORDER, defaultTicks(ORDER), DAY);
  assert.throws(() => applyProposal(rec, ORDER, defaultTicks(ORDER), DAY), /Already added/);
});
