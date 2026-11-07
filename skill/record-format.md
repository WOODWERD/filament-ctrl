# Record and proposal files, format 1

Both live in the person's private data repo. Filament Ctrl writes `filament-ctrl.json`; the skill only ever writes `proposals/`, `snapshots/` and `catalog.json`, and never edits the record (FM-R05, FM-R15).

## `filament-ctrl.json`

```json
{
  "format": 1,
  "meta": { "nextSpool": 5, "updated": "2026-11-06" },
  "printer": { "model": "X1 Carbon", "topNozzle": 300, "hardenedNozzle": true, "enclosed": true,
               "ams": [ { "unit": 1, "model": "AMS 2 Pro" } ] },
  "filaments": [
    { "id": "f1", "brand": "Bambu Lab", "line": "PLA Basic", "lineId": "GFA00", "material": "PLA",
      "colour": "Black", "values": ["#000000"], "code": "K0", "diameter": 1.75 }
  ],
  "spools": [
    { "id": "FM-001", "filament": "f1", "net": 1000,
      "left": { "grams": 1000, "from": "New", "at": "2026-11-03" },
      "place": { "kind": "Sealed" },
      "opened": null, "order": { "seller": "Bambu Lab store", "number": "4417-2093", "date": "2026-11-03" },
      "tag": null, "history": [ { "date": "2026-11-06", "what": "Added from order 4417-2093" } ] }
  ],
  "places": { "from": "Set by hand", "at": "2026-11-06" }
}
```

- `printer` is what the person tells Filament Ctrl. Any value not given is `null`, and printer fit reads Not known (FM-R66).
- A filament from Bambu's catalog carries `lineId` and `code`. Another maker's has them `null`. `values` is empty for No colour (FM-E07).
- `place.kind` is `Sealed`, `Open`, `AMS` (with `unit` and `slot`, 1 to 4), `External`, or `Empty`.
- `left.from` is `AMS`, `New`, `Used` or `Guess` (the Left term).
- Spool IDs are `FM-` and three digits or more, given by Filament Ctrl from `meta.nextSpool`, never by the skill.
- An Empty spool stays, for its history, and drops out of the counts (FM-R06).

## `proposals/<id>.json`

Photo Ctrl's shared format (PH-R90 to PH-R93) with Filament Ctrl's change kinds.

```json
{
  "format": 1,
  "id": "order-bambu-lab-store-4417-2093",
  "source": { "kind": "Order", "seller": "Bambu Lab store", "number": "4417-2093", "date": "2026-11-03" },
  "read": "2026-11-06",
  "status": "Waiting",
  "changes": [
    { "type": "newSpools", "ref": "n1", "count": 3, "net": 1000, "place": "Sealed",
      "filament": { "brand": "Bambu Lab", "line": "PLA Basic", "lineId": "GFA00", "material": "PLA",
                    "colour": "Black", "values": ["#000000"], "code": "K0", "diameter": 1.75 },
      "sure": "Sure", "textRead": "PLA Basic - Black (K0) 1kg x3" },
    { "type": "spoolOpened", "spool": "FM-004", "date": "2026-11-05", "sure": "Likely" },
    { "type": "spoolEmpty", "spool": "FM-002", "sure": "Sure" },
    { "type": "spoolMoved", "spool": "FM-011", "to": { "kind": "AMS", "unit": 1, "slot": 2 }, "sure": "Sure" },
    { "type": "spoolUsed", "spool": "FM-011", "grams": 212, "sure": "Likely", "textRead": "bracket-set.3mf: 212 g" }
  ],
  "skipped": [ { "textRead": "PLA Matte - Ash Grey x1", "why": "Refunded" } ]
}
```

- `type`: `newSpools`, `spoolOpened`, `spoolEmpty`, `spoolMoved` or `spoolUsed` (grams off after a print, FM-R34). A multi-pack is one `newSpools` change with its `count` (FM-R16).
- Every change carries `sure`: `Sure`, `Likely` or `Guess`. Review ticks Sure and Likely, and leaves Guess unticked (FM-U10).
- Only the fields shown are read. Addresses, payment details and prices are never written, and Filament Ctrl ignores any it finds (FM-R52).
- `source.kind` is `Order`, `Bambu Studio` (the AMS list, FM-R28; accepting it marks the places From Bambu Studio) or `Print` (FM-R34).
- `source.number` is how an order is known: the skill skips an order whose number is already on a spool or in a waiting proposal (FM-R14).
- `status` is `Waiting` until reviewed. Filament Ctrl writes `Accepted`, `Partly accepted` or `Declined` with `reviewed`, and the new spool IDs as `"added": { "n1": ["FM-005", "FM-006", "FM-007"] }`. The file stays as the record of what was proposed.
- A file of a newer format than the app knows is shown as Needs a newer Filament Ctrl, and left alone.

## `snapshots/<date>-studio.json`

What Bambu Studio's saved AMS list said, written by `studio-ams.mjs`: `{ "format": 1, "from": "From Bambu Studio", "at": "2026-11-06", "slots": [ { "kind": "AMS", "unit": 1, "slot": 1, "lineId": "GFA00", "line": "PLA Basic" } ] }`. Line only: Studio's list has no colour, tag or grams.
