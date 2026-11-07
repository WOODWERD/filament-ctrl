---
name: woodwerd-filament
description: Keep the person's Filament Ctrl record fed from their filament orders, Bambu Studio and their printer, and plan which spools to load for a print. Use when the person asks to read their filament orders, read their printer or AMS, plan a print, say a print ran, or update their materials list in Filament Ctrl.
---

# WOODWERD filament skill

You work for [Filament Ctrl](https://woodwerd.github.io/filament-ctrl/), which keeps count of a person's filament and which spools are in their printer. Their record sits in their own **private** GitHub data repo. You write to it only where this skill says; the person makes every other change, in Filament Ctrl.

This skill holds no one's data. It runs in the person's own Claude, with their own access to their own repo.

Five jobs: Read my orders, Read the printer, Plan a print, After a print, and Update the materials list. Each script here says what it needs with `--help` or no arguments. For every job, work in a fresh clone of the data repo, commit once, push, and say what you did in plain words.

## What you need

- The **data repo**, as `owner/name`. If the person hasn't said, look for a private repo whose `README.md` says "Filament Ctrl", or ask.
- GitHub access through the `gh` command, signed in. Work in a fresh clone in a temporary folder. Check `gh repo view <repo> --json isPrivate` first; **refuse to work on a public data repo** and tell the person to make it private.
- Node 18 or later, for the scripts in this folder.
- The file formats in `record-format.md`: the record you read and never edit, and the proposals you write.

## Read my orders

1. **Find them.** Read the person's filament order confirmations from the date they gave, through their mail connector, or from a PDF or text they give you. Any seller. Skip anything that isn't filament.
2. **Write what you read** to a temporary `order.json`, one per order, as the top of `order.mjs` shows: seller, order number, order date, and each filament line's text as written, how many spools it is, and the net weight. Split packs into spools: a 4-pack is `"spools": 4`; a refill sold with its hub is one spool (FM-R16). For another maker, add `brand`, `line`, `material` and `colour` as written. Mark a cancelled or refunded line with `"skip": "Refunded"` (FM-E03). **Never write an address, payment details or a price** (FM-R52).
3. **Match and propose.** For each: `node order.mjs --order order.json --catalog <clone>/catalog.json --record <clone>/filament-ctrl.json --proposals <clone>/proposals`. It skips an order already in the record or waiting (FM-R14), matches Bambu lines and colours to the catalog (Sure from a Bambu order), and writes the proposal.
4. **Commit once**, such as "Proposals from 3 orders", and push. Delete the temporary `order.json` files.
5. **Report**: orders read, spools proposed, how many Sure, Likely and Guess, and anything skipped and why. Then: open Filament Ctrl's Review on a computer or iPad.

## Read the printer

Reading the printer itself on the network is parked: the printer doesn't answer in its normal mode. Until that's settled, use Bambu Studio's saved AMS list (FM-R28).

1. **Ask first.** Tell the person this reads one entry, the AMS list, from Bambu Studio's settings file, which also holds printer access codes that are never read. Go ahead only on their yes.
2. **Find the printer.** `node studio-ams.mjs` lists the printers Studio has a list for, by serial. Ask which, if there's more than one.
3. **Read it.** `node studio-ams.mjs --serial <serial> --units <AMS units> --catalog <clone>/catalog.json --record <clone>/filament-ctrl.json --data <clone>`. It writes a snapshot and a proposal. The list is as current as the person's last "Sync filaments with AMS" in Studio, and gives each slot's line, not its colour or what's left.
4. **Commit once**, such as "AMS from Bambu Studio", and push.
5. **Report** each slot's line, the moves proposed, and the slots to settle by hand, and say how old the list is.

Never open, print or copy anything else from `BambuStudio.conf`, and never run any other command on it.

## Plan a print

1. Get the job: a `.3mf` sliced in Bambu Studio, or its `.gcode`. An unsliced `.3mf` has no grams; ask the person to slice it first. With only words, match on material and colour, and say the grams are unknown.
2. `node plan.mjs --job <file> --record <clone>/filament-ctrl.json --catalog <clone>/catalog.json` (add `--plate <n>` for one plate).
3. Give its answer in your own plain words: which slot or spool for each filament, what to load or swap, what wants drying, and what to buy if nothing covers it. Never edit the job file, never say how to slice it, and never order anything (FM-R33).

## After a print

When the person says the print ran: `node plan.mjs --job <file> --record <clone>/filament-ctrl.json --ran --data <clone>`. It proposes taking the job's grams off the spools that were loaded for it, except those the AMS reads (FM-R34). Commit once, such as "Used: bracket.3mf", and push. Then: review it in Filament Ctrl.

## Update the materials list

1. **Build it.** Run `node catalog.mjs --out <clone>/catalog.json` from this skill's folder. It reads Bambu Studio on this computer. Where Studio isn't installed, it reads the latest Studio release in Bambu Lab's public BambuStudio repo on GitHub, and says so. Use `--studio <folder>` if Studio's profiles are somewhere unusual, or `--github` if the person asks for the latest release.
2. **Check it.** The script says how many lines and colours it found, and from which Studio version. If it found no lines, or says a file is missing, stop and tell the person; don't commit a half catalog.
3. **Compare.** If the data repo already had a `catalog.json`, say what changed in plain words: lines and colours added or gone, and the Studio version before and after. Don't remove a line or colour that a spool in `filament-ctrl.json` points at; that's for Filament Ctrl to mark No longer listed.
4. **Commit once.** One commit to the data repo, such as "Materials list from Bambu Studio 02.08.02.61", and push.
5. **Report.** Lines, colours, where from, and what changed. Then: open Filament Ctrl's Materials to see it.

## Never

- Never copy Bambu Studio's files into any repo. Only the built `catalog.json` goes in the person's own data repo.
- Never read the Bambu store or any other site to fill the catalog. Prices are not kept.
- Never edit `filament-ctrl.json`. Write only `proposals/`, `snapshots/` and `catalog.json`.
- Never give a spool an ID; Filament Ctrl does that when the person accepts a proposal (FM-R05).
- Never read `BambuStudio.conf` except through `studio-ams.mjs`, and only after the person says yes. It holds printer access codes.
- Never order or buy anything.
