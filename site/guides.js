// Made by tools/guides.mjs from the approved guides. Don't edit by hand; edit guides.md and run it again.
export const STATEMENT = "These guides are an aid to choosing, not advice for any particular use. Bambu Lab is the source: check their product page and wiki before relying on anything here. You use this information at your own risk.";
export const CHOOSE = [
 {
  "part": "Sits in a car, a sunny window, or outdoors",
  "lookAt": "PETG HF, then ASA",
  "why": "PLA softens around 45 °C; PETG holds to about 70 °C; ASA to about 100 °C and stands up to sun"
 },
 {
  "part": "Has to bend, grip or absorb a knock",
  "lookAt": "TPU",
  "why": "It's rubbery. Softer grades need the external holder, not the AMS"
 },
 {
  "part": "Takes a hit or gets dropped",
  "lookAt": "PLA Tough+, or PETG",
  "why": "Less brittle than PLA Basic"
 },
 {
  "part": "Has to be stiff and light",
  "lookAt": "PLA-CF or PETG-CF",
  "why": "Carbon fibre adds stiffness; needs a hardened nozzle"
 },
 {
  "part": "Sits near heat or under load for years",
  "lookAt": "PA6-CF, PAHT-CF or PC",
  "why": "Engineering lines: dry them, print enclosed"
 },
 {
  "part": "Is mostly about how it looks",
  "lookAt": "PLA Matte, Silk+, Marble, Wood, Sparkle, Galaxy, Metal, Translucent",
  "why": "Same easy printing as PLA, different finish"
 },
 {
  "part": "Needs supports that come away cleanly",
  "lookAt": "The support line matched to your material",
  "why": "See Support"
 }
];
export const GUIDES = {
 "PLA": {
  "what": "The everyday material. Easy to print, little warping, cheap, and the widest range of colours and finishes.",
  "goodFor": [
   "Models, prototypes, organisers, decor, anything indoors.",
   "Detail and a clean surface.",
   "Learning: it's the most forgiving."
  ],
  "watchFor": [
   "Softens around 45 °C. Not for cars, dashboards, sunny sills or hot water.",
   "Brittle compared with PETG or TPU; it snaps rather than bends.",
   "Fades and weakens outdoors over time."
  ],
  "needs": "Nothing special. Runs from the AMS. An open door or lid helps on a hot day.",
  "lines": {
   "PLA Basic": "The default. Most colours, the reference every other PLA is compared with.",
   "PLA Lite": "Now sold as PLA Basic Kept so spools already on hand still match; for new spools, pick PLA Basic.",
   "PLA Matte": "A flat, chalky finish that hides layer lines well. A little more brittle than Basic.",
   "PLA Silk": "A glossy, metallic-looking sheen. Studio says dry it first and print the outer wall at 40 to 60 mm/s for the most gloss. Layers bond less well than Basic, so keep it for looks. Bambu now sells only Silk+; Silk stays in the catalog so spools already on hand still match.",
   "PLA Silk+": "A glossy, metallic-looking sheen. Studio says dry it first and print the outer wall at 40 to 60 mm/s for the most gloss. Layers bond less well than Basic, so keep it for looks. Bambu now sells only Silk+; Silk stays in the catalog so spools already on hand still match.",
   "PLA Metal": "A metallic look. Studio gives the same gloss advice as Silk.",
   "PLA Tough": "Made to take knocks better than Basic. Tough+ prints hotter (from 220 °C). Good for brackets, clips and tools.",
   "PLA Tough+": "Made to take knocks better than Basic. Tough+ prints hotter (from 220 °C). Good for brackets, clips and tools.",
   "PLA-CF": "PLA with carbon fibre: stiffer, matte, lighter. Needs a hardened nozzle.",
   "PLA Glow": "Glows after light. Studio asks for a hardened nozzle, so the glow pigment wears brass.",
   "PLA Translucent": "Lets light through. For lamp shades and light pipes. Thin walls and fewer of them show it best.",
   "PLA Wood": "Wood-filled, looks and sands like wood. Not for the 0.2 mm nozzle; 0.4 mm and up.",
   "PLA Sparkle": "Metal flake in the plastic, so the surface catches the light and sparkles. Hides layer lines.",
   "PLA Galaxy": "A speckled finish with more depth than shine: it reads deeper, without Sparkle's metal flake. Hides layer lines.",
   "PLA Marble": "A stone-like speckle that hides layer lines.",
   "PLA Aero": "A foaming PLA for very light parts such as RC planes. Studio says it needs special settings and links its own guide. Not for everyday parts.",
   "PLA Pure": "Bambu's food-contact PLA. Bambu says each of its five ingredients (the PLA, an acrylic copolymer, the pigments, a wax called EBS and asbestos-free talc) passed EU food-contact testing on its own, not just the finished spool. That covers the filament, not your print: a printed part also picks up whatever is in the nozzle and hotend, and its layer lines can hold food and bacteria. Studio lists a narrower nozzle range, 190 to 220 °C.",
   "PLA Dynamic": "Likely no longer sold; it may have given way to PLA Aero for light, low-density parts Kept so spools already on hand still match; the app shows it as No longer listed once Bambu drops it from Studio."
  }
 },
 "PETG": {
  "what": "The step up from PLA when a part has to cope with warmth, water or a bit of flex. Nearly as easy to print.",
  "goodFor": [
   "Parts in a warm car, a sunny window or outdoors in mild weather.",
   "Clips, hinges and brackets that need a little give.",
   "Things that get wet."
  ],
  "watchFor": [
   "Strings more than PLA, more so when damp. Dry it.",
   "Sticks very hard to smooth PEI and can tear the surface. Use the textured plate.",
   "Softens around 70 °C. For hotter places, look at ASA."
  ],
  "needs": "Nothing special. Runs from the AMS. Print with the door closed or just ajar.",
  "lines": {
   "PETG HF": "Made for high flow, so it prints fast. The everyday PETG.",
   "PETG Basic": "Standard PETG. Studio links Bambu's tips for clear and translucent prints.",
   "PETG Matte": "PETG with a flat finish that hides layer lines.",
   "PETG Translucent": "Clear-ish PETG. Slower, hotter printing and fewer walls give clearer results; Studio links Bambu's tips.",
   "PETG-CF": "Carbon-fibre PETG: stiffer, matte, steady in size. Needs a hardened nozzle."
  }
 },
 "ABS and ASA": {
  "what": "Tougher, heat-resistant plastics for real-world parts. ASA is ABS's outdoor cousin: it stands up to sun and weather.",
  "goodFor": [
   "Parts near heat, up to about 100 °C.",
   "Outdoor parts: ASA keeps its colour and strength in sun.",
   "Car interiors, enclosures, mounts."
  ],
  "watchFor": [
   "Warps and splits between layers if the air around the print is cool. Studio says so for both.",
   "Gives off fumes and smell while printing. Print enclosed, and keep the room aired.",
   "Needs the hotter plate: 90 to 100 °C."
  ],
  "needs": "An enclosed printer with the door and lid shut. Runs from the AMS.",
  "lines": {
   "ABS": "The classic tough plastic. Easy to sand and finish.",
   "ASA": "Choose it over ABS for anything that lives outside.",
   "ABS-GF": "Glass-filled ABS: stiffer and steadier in size. Studio adds a risk of clogging and oozing. Studio doesn't ask for a hardened nozzle, and the guide follows Studio.",
   "ASA-CF": "Carbon-fibre ASA. Studio doesn't ask for a hardened nozzle, and the guide follows Studio.",
   "ASA-Aero": "A foaming ASA for very light parts. Studio says it needs special settings."
  }
 },
 "TPU": {
  "what": "Flexible, rubbery filament. The number is its hardness: 85A is soft like a pencil eraser, 95A firmer like a shoe sole.",
  "goodFor": [
   "Bumpers, feet, grips, gaskets, phone cases, straps.",
   "Parts that have to bend, squash or absorb a knock and come back."
  ],
  "watchFor": [
   "Soft grades don't feed through the AMS. Studio says 85A, 90A, 95A and 95A HF are too soft for it; load them on the external holder.",
   "Prints slowly, and strings.",
   "Takes on moisture. Dry it before printing."
  ],
  "needs": "The external holder for most grades. Only TPU for AMS runs from the AMS.",
  "lines": {
   "TPU for AMS": "Firm enough for the AMS. Studio says use its profile only for TPU at 55D or harder. The pick if you want flexible parts in a multi-colour job.",
   "TPU 95A HF": "The firmest of the soft grades, made for faster printing. A good first TPU.",
   "TPU 95A": "Firm and flexible.",
   "TPU 90A": "Softer, for grips and squashy parts. Slower to print; take more care.",
   "TPU 85A": "Softer, for grips and squashy parts. Slower to print; take more care."
  }
 },
 "Engineering": {
  "what": "High-performance lines for parts that work hard: nylon (PA), polycarbonate (PC), and lines filled with carbon (CF) or glass (GF) fibre.",
  "goodFor": [
   "Functional parts under load, heat, or wear for years.",
   "Jigs, fixtures, gears, brackets, tool parts."
  ],
  "watchFor": [
   "Must be dry. Nylon takes on water within hours of opening and prints badly wet. Dry it before every print and keep it sealed.",
   "Studio warns of clogging, oozing, warping and weak layers on all of them. Print slow and enclosed.",
   "Fibre-filled lines need a hardened nozzle and wear parts faster.",
   "Some need more heat than a printer can give. PPS-CF needs 310 °C, more than the X1 Carbon's 300 °C."
  ],
  "needs": "An enclosed printer, a hardened nozzle for the CF and GF lines, and a dryer. Filament Ctrl checks the top temperature against your printer.",
  "lines": {
   "PAHT-CF": "Nylon with carbon fibre, made for higher heat. A strong first choice for tough functional parts.",
   "PA6-CF": "Carbon-fibre nylon: stiff, strong, matte. PA-CF has no colours listed in the catalog.",
   "PA-CF": "Carbon-fibre nylon: stiff, strong, matte. PA-CF has no colours listed in the catalog.",
   "PA6-GF": "Glass-fibre nylon: tough and cheaper than CF, with more colours.",
   "PC": "Polycarbonate: tough, clear-ish, heat-resistant to about 120 °C. Warps easily; needs the hottest plate (110 °C).",
   "PC FR": "Flame-retardant PC. Bambu says it's tested to UL 94 V-0 (the 2023 standard), the top UL 94 vertical rating: in that test a standing sample stops burning within 10 seconds, and any drips don't catch light. Bambu points it at electronics, car and mechanical parts. The rating is for the material as tested; how your print behaves in a fire also depends on its wall thickness and infill, so confirm with Bambu Lab for any use that matters.",
   "PET-CF": "Carbon-fibre PET: very steady in size and holds shape in heat.",
   "PPA-CF": "The top end, for heat and chemicals. PPA-CF prints at 280 to 320 °C, so on a 300 °C printer only the bottom of its range; PPS-CF needs 310 °C or more.",
   "PPS-CF": "The top end, for heat and chemicals. PPA-CF prints at 280 to 320 °C, so on a 300 °C printer only the bottom of its range; PPS-CF needs 310 °C or more."
  }
 },
 "Support": {
  "what": "Lines made to hold up overhangs and then come away, rather than to be the part. Used as a second filament, or just for the layers that touch the part.",
  "goodFor": [
   "Clean undersides on overhangs and bridges.",
   "Shapes that can't be printed without support."
  ],
  "watchFor": [
   "Each one is matched to a material. Use the one made for what you're printing.",
   "PVA dissolves in water, so it must be kept very dry, sealed between uses.",
   "They swap filament on every support layer: slower prints and more waste."
  ],
  "needs": "An AMS or a second nozzle to switch between part and support filament.",
  "lines": {
   "PVA": "Dissolves in water. For supports you can't reach to break off. Studio says it has many requirements and links its guide.",
   "Support For PLA": "Breaks away cleanly from PLA.",
   "Support For PLA/PETG": "Works as the support layer for both PLA and PETG.",
   "Support for ABS": "Matched to ABS.",
   "Support For PA/PET": "Matched to nylon and PET.",
   "Support W": "Support lines with no colours in the catalog. Whether Bambu still sells them isn't known; they're kept so spools on hand still match. Support W is set up like PLA, Support G like nylon.",
   "Support G": "Support lines with no colours in the catalog. Whether Bambu still sells them isn't known; they're kept so spools on hand still match. Support W is set up like PLA, Support G like nylon."
  }
 }
};
