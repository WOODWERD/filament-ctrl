# Changelog

What changed in each version of Filament Ctrl, newest first. Versions are x-numbers while Filament Ctrl is a public beta.

## x0.0.2 — 2026-11-06

From the first real-use check on Drew's shelf.

- **Reading the printer places more spools.** When no spool of a line is open, Bambu Studio's AMS list now offers a sealed one, as a Guess for you to tick, if all your sealed spools of that line are the same colour. If they're different colours, it says which and leaves the slot to you.
- **Orders before the printer.** The skill now reads the printer only after your orders are reviewed, since there's nothing to place until then. It stops and says so.
- **No more blank page on opening.** The app shows Reading your repo, or your shelf as last seen, while it reads. Changes wait until the read is done.

## x0.0.1 — 2026-11-06

The first build, kept on this computer. Not yet published.

- **The app.** Printer, Shelf, Materials and Review views, with Add spools and Ask Claude. Your record lives in your own private GitHub repo; the app talks only to that repo. Undo after every change. On a phone: review-only, with Opened, Empty and Move to slot.
- **Materials.** Bambu Lab's lines and colours, built from Bambu Studio's own files, with plain guides to choosing a material. The guides are an aid only; Bambu Lab is the source.
- **The filament skill** for your own Claude: read your filament orders, read Bambu Studio's AMS list, plan a print and take off what it used, and update the materials list. It never edits your record; it writes proposals you review.
- **User guide** page.
- **Safe saving.** An order can't be added twice, even if Accept is pressed again while saving. And a page that's out of date can't write over a newer record: it reads the record again and says so.
