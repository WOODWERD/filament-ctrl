# Changelog

What changed in each version of Filament Ctrl, newest first. Versions are x-numbers while Filament Ctrl is a public beta.

## x0.0.1 — 2026-11-06

The first build, kept on this computer. Not yet published.

- **The app.** Printer, Shelf, Materials and Review views, with Add spools and Ask Claude. Your record lives in your own private GitHub repo; the app talks only to that repo. Undo after every change. On a phone: review-only, with Opened, Empty and Move to slot.
- **Materials.** Bambu Lab's lines and colours, built from Bambu Studio's own files, with plain guides to choosing a material. The guides are an aid only; Bambu Lab is the source.
- **The filament skill** for your own Claude: read your filament orders, read Bambu Studio's AMS list, plan a print and take off what it used, and update the materials list. It never edits your record; it writes proposals you review.
- **User guide** page.
- **Safe saving.** An order can't be added twice, even if Accept is pressed again while saving. And a page that's out of date can't write over a newer record: it reads the record again and says so.
