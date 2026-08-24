/* Sonor Lighting Design — static flow config (v0.1.0)
   window.__LIGHTING_CONFIG__ — UI rules + labels + design-method reference data.
   Catalogue = Library SSOT (lighting_items via v_lighting_catalogue, WQ join).
   Flow mirrors the Cinema Aesthetic / Seating Configurator pattern:
   Intro (landing) → Plan → Fixtures → LED & Drivers → Circuits & Scenes → Summary.
   The fixture plan derives LIVE from Takeoffs (takeoffs_floors.content.symbols,
   service 04) — this app never redraws the plan; Takeoffs owns geometry.

   Reference data below encodes the 2026-08-20 lighting-design research pass
   (CIBSE-derived residential lux targets, John Cullen layering, strip/driver
   engineering rules, BS 7671 bathroom zones, scene conventions). Numbers are
   design guidance, not statute — the app presents them as helpers.
*/
(function () {
  window.__LIGHTING_CONFIG__ = {
    version: '0.5.0',
    buildDate: '2026-08-20',
    steps: ['Plan', 'Fixtures', 'LED & Drivers', 'Circuits & Scenes', 'Summary'],

    // ── Room types — lux targets + CCT guidance (per-room design method) ──
    // ambient = average lux on the working plane (floor unless noted);
    // task = localised task-plane target; areaDefault m² used until edited.
    roomTypes: [
      { id: 'living',   label: 'Living Room',   ambient: 200, task: 300, taskNote: 'reading',          cct: 2700, areaDefault: 25 },
      { id: 'kitchen',  label: 'Kitchen',       ambient: 300, task: 500, taskNote: 'worktop 0.85 m',   cct: 3000, areaDefault: 20 },
      { id: 'dining',   label: 'Dining',        ambient: 200, task: 300, taskNote: 'table',            cct: 2700, areaDefault: 15 },
      { id: 'bedroom',  label: 'Bedroom',       ambient: 150, task: 300, taskNote: 'bedhead reading',  cct: 2700, areaDefault: 15 },
      { id: 'bathroom', label: 'Bathroom',      ambient: 200, task: 400, taskNote: 'mirror (vertical)',cct: 3000, areaDefault: 8,  zones: true },
      { id: 'ensuite',  label: 'En-suite',      ambient: 200, task: 400, taskNote: 'mirror (vertical)',cct: 3000, areaDefault: 5,  zones: true },
      { id: 'wc',       label: 'WC / Powder',   ambient: 150, task: null, taskNote: null,              cct: 2700, areaDefault: 3 },
      { id: 'hall',     label: 'Hall',          ambient: 150, task: null, taskNote: null,              cct: 2700, areaDefault: 12 },
      { id: 'landing',  label: 'Landing',       ambient: 150, task: null, taskNote: null,              cct: 2700, areaDefault: 8 },
      { id: 'stairs',   label: 'Stairs',        ambient: 150, task: null, taskNote: 'contrast on nosings matters more than lux', cct: 2700, areaDefault: 6 },
      { id: 'office',   label: 'Study',         ambient: 400, task: 500, taskNote: 'desk',             cct: 3500, areaDefault: 12 },
      { id: 'utility',  label: 'Utility',       ambient: 300, task: null, taskNote: null,              cct: 3000, areaDefault: 8 },
      { id: 'garage',   label: 'Garage / Plant',ambient: 300, task: null, taskNote: null,              cct: 4000, areaDefault: 20 },
      { id: 'cinema',   label: 'Cinema',        ambient: 100, task: null, taskNote: 'scene-led — designed to black out', cct: 2700, areaDefault: 25 },
      { id: 'gym',      label: 'Gym',           ambient: 300, task: null, taskNote: null,              cct: 3500, areaDefault: 20 },
      { id: 'dressing', label: 'Dressing Room', ambient: 200, task: 300, taskNote: 'mirror + rails — high CRI', cct: 3000, areaDefault: 8 },
      { id: 'wine',     label: 'Wine Room',     ambient: 100, task: null, taskNote: 'accent-led',      cct: 2700, areaDefault: 6 },
      { id: 'exterior', label: 'Exterior',      ambient: 30,  task: null, taskNote: 'paths + terraces at ground level', cct: 2700, areaDefault: 40, darkSky: true }
    ],

    // ── Layered light (John Cullen method) — every room wants ≥2 layers ──
    layers: [
      { id: 'ambient', label: 'Ambient', note: 'General light — downlights, concealed linear' },
      { id: 'task',    label: 'Task',    note: 'Reading, grooming, cooking — where the work happens' },
      { id: 'accent',  label: 'Accent',  note: 'Art, architecture, texture — the layer that makes it' }
    ],

    // ── Fixture kinds — the join between Takeoffs blocks and library picks ──
    // blockCodes match sonorSymbol.block_code (exact) · blockMatch is the
    // resilient fallback regex on block_code/label. layer feeds circuit grouping.
    fixtureKinds: [
      { id: 'downlight', label: 'Downlights',        cats: ['downlight'],                 layer: 'ambient', wDefault: 7,
        blockCodes: ['CL-SON-04-20-DL-FIXED', 'SON-TO-04-DL'], blockMatch: /-DL\b|-DL-|downlight/i },
      { id: 'spot',      label: 'Pinspots / Accent', cats: ['spotlight', 'uplight'],      layer: 'accent',  wDefault: 4,
        blockCodes: ['CL-SON-04-6-PINSPOT'], blockMatch: /PINSPOT|SPOT\b/i },
      { id: 'pendant',   label: 'Pendants',          cats: ['suspension', 'pendant'],     layer: 'task',    wDefault: 12,
        blockCodes: ['CL-SON-04-24-PEND', 'CL-SON-04-6-PEND-SM'], blockMatch: /PEND/i },
      { id: 'wall',      label: 'Wall Lights',       cats: ['wall'],                      layer: 'accent',  wDefault: 6,
        blockCodes: ['CL-SON-04-6-WALL'], blockMatch: /WALL/i },
      { id: 'picture',   label: 'Picture Lights',    cats: ['reading', 'shelf-joinery'],  layer: 'accent',  wDefault: 5,
        blockCodes: ['CL-SON-04-6-PICTURE'], blockMatch: /PICTURE/i },
      { id: 'lamp5a',    label: '5A Lamp Points',    cats: [],                            layer: 'accent',  wDefault: 40,
        blockCodes: ['CL-SON-04-6-LAMP5A'], blockMatch: /LAMP5A|5A/i },
      { id: 'cabinet',   label: 'Cabinet / Joinery', cats: ['shelf-joinery', 'low-level'],layer: 'accent',  wDefault: 15,
        blockCodes: ['CL-SON-04-6-CABSPUR'], blockMatch: /CABSPUR|CABINET/i },
      { id: 'lowlevel',  label: 'Low-level / Step',  cats: ['low-level', 'step'],         layer: 'accent',  wDefault: 3,
        blockCodes: [], blockMatch: /STEP|NICHE|LOWLEVEL/i },
      { id: 'exterior',  label: 'Exterior Fittings', cats: ['exterior'],                  layer: 'accent',  wDefault: 8,
        blockCodes: [], blockMatch: /EXT|EXTERIOR|GARDEN/i },
      // v0.5.0 — garden layer (2026 exterior research: invisible integration,
      // moonlighting, dark-sky). noSeed: only surface once counted on the plan.
      { id: 'path',      label: 'Path / Bollard',    cats: ['exterior'],                  layer: 'ambient', wDefault: 4, noSeed: true,
        blockCodes: [], blockMatch: /PATH|BOLLARD/i },
      { id: 'ingrade',   label: 'In-grade Uplights', cats: ['exterior'],                  layer: 'accent',  wDefault: 6, noSeed: true,
        blockCodes: [], blockMatch: /INGRADE|IN-?GROUND|BURIED|DRIVE-?OVER/i },
      { id: 'moonlight', label: 'Tree / Moonlight',  cats: ['exterior'],                  layer: 'accent',  wDefault: 9, noSeed: true,
        blockCodes: [], blockMatch: /MOONLIGHT|TREE/i }
    ],
    // keypads counted for context (control system sizing) — not a light load
    keypadBlocks: { codes: ['CL-SON-04-LKP-WIRED', 'CL-C4-04-KP-LUXB'], match: /LKP|KEYPAD|KP-/i },
    // LC estimation blocks carry the per-room dimmed/switched circuit mix
    estBlocks: { codes: ['CL-SON-04-EST-GEN', 'CL-SON-04-EST-DIM'], match: /-EST-/i },

    // ── Supplier grade ladder (downlight-class fittings) ──
    supplierTiers: [
      { id: 'duragreen', label: 'DuraGreen',          tier: 'Premium', note: 'British-built modular miniature luminaires — tunable, CRI 92+, repairable.' },
      { id: 'lighting-of-london', label: 'Lighting of London', tier: 'Bespoke', note: 'Top-tier miniature architectural fittings — CRI 95+, IP67 options, IES data.' }
    ],

    // ── Scene seeds per room type (keypads carry scenes, not circuits) ──
    sceneSeeds: {
      kitchen:  [ { label: 'Day',       note: 'Ambient 80% · worktops 100%' },
                  { label: 'Cook',      note: 'Worktops 100% · ambient 50%' },
                  { label: 'Dinner',    note: 'Pendants 60% · linear 30% · downlights 20%' },
                  { label: 'Clean',     note: 'Everything 100%' },
                  { label: 'Night',     note: 'Low-level 10% — path light only' } ],
      living:   [ { label: 'Bright',    note: 'All layers 100%' },
                  { label: 'Relax',     note: 'Downlights 30% · accents 40% · linear 25%' },
                  { label: 'Entertain', note: 'Accents lead 60% · ambient 40%' },
                  { label: 'TV',        note: 'Accent only 15–25% · main lights out' } ],
      bedroom:  [ { label: 'Bright',    note: 'All layers 100%' },
                  { label: 'Relax',     note: 'Bedside + accents 30%' },
                  { label: 'Reading',   note: 'Bedhead task 100% · ambient 10%' },
                  { label: 'Night',     note: 'Low-level 5% — safe path, no glare' } ],
      bathroom: [ { label: 'Day',       note: 'Mirror 100% · ambient 80%' },
                  { label: 'Evening',   note: 'Ambient 30% — night friendly' },
                  { label: 'Spa',       note: 'Linear + niche accents only, warm + low' } ],
      cinema:   [ { label: 'Welcome',   note: 'Perimeter 70% · downlights 40%' },
                  { label: 'Film',      note: 'Main lights out · riser + step 5–10%' },
                  { label: 'Break',     note: 'Perimeter 30% · shelf accents on' },
                  { label: 'Clean',     note: 'Everything 100%' } ],
      exterior: [ { label: 'Evening',   note: 'Facade + path 40% — warm, shielded, aimed down' },
                  { label: 'Entertain', note: 'Terrace layers 60%' },
                  { label: 'Late',      note: 'Path minimum 10% · timers curfew the rest' } ],
      _default: [ { label: 'Bright',    note: 'All layers 100%' },
                  { label: 'Relax',     note: 'Ambient 30% · accents 40%' },
                  { label: 'Night',     note: 'Low-level 10%' } ]
    },
    // whole-house scenes (control processor level)
    houseScenes: [
      { label: 'Welcome',   note: 'Entry + hall + kitchen to evening levels on arrival' },
      { label: 'Away',      note: 'Presence simulation · exterior on curfew timers' },
      { label: 'Path',      note: 'Low-level circulation 10–20% — bedroom to kitchen without glare' },
      { label: 'Goodnight', note: 'Everything out · exterior to security levels · one press' }
    ],

    // ── Scope (v0.3.0) — who supplies + installs the light fittings ──
    scopeModes: [
      { id: 'full',   label: 'Fittings by Sonor',  note: 'Full package — fittings specified, supplied and installed by Sonor with the control system.' },
      { id: 'others', label: 'Fittings by others', note: 'Fittings supplied + installed by others — Sonor delivers the circuit design, control system, keypads and scenes.' }
    ],

    // ── Keypad finishes (v0.3.0) — generic architectural ladder, used when the
    //    control system has no dedicated range below (hex = plate, txt = engraving) ──
    keypadFinishes: [
      { id: 'matt-white',    label: 'Matt White',      hex: '#f2f0ec', txt: '#5a544a' },
      { id: 'matt-black',    label: 'Matt Black',      hex: '#2b2a28', txt: '#d8d4cc' },
      { id: 'brushed-brass', label: 'Brushed Brass',   hex: '#a8894f', txt: '#241f0e' },
      { id: 'antique-bronze',label: 'Antique Bronze',  hex: '#6b5138', txt: '#e8e0d2' },
      { id: 'brushed-nickel',label: 'Brushed Nickel',  hex: '#b9b6ae', txt: '#33312c' },
      { id: 'polished-chrome',label: 'Polished Chrome', hex: '#c9cdd1', txt: '#3a3d40' },
      { id: 'custom-ral',    label: 'Custom RAL',      hex: '#8f8574', txt: '#f4f1ec' }
    ],
    keypadButtons: [2, 4, 6, 8, 10],
    engravingMaxChars: 10,   // typical per-button engraving limit (Rako/Lutron class)

    // ── v0.4.0 — keypad RANGES per control system. Control4 = the official
    //    Lux by Control4 palette: 19 finishes in three groups (Gloss / Matte /
    //    Metallic), names + codes verbatim from the Control4 Lux Spec Guide
    //    (FINISHES & COLORS page); plate hexes sampled from the guide's swatch
    //    page (matte/gloss) with metallics set editorially against the same
    //    photography — studio lighting skews raw pixel medians (cinema-palette
    //    precedent). Laser-engraved backlit buttons; magnetic faceplates. ──
    keypadRanges: {
      control4: {
        label: 'Lux by Control4',
        note: '19 finishes · laser-engraved backlit buttons · magnetic faceplates',
        buttons: [1, 2, 3, 4, 5, 6],
        finishes: [
          { id: 'c4-wh', code: 'WH', group: 'Gloss',    label: 'White',           hex: '#f4f4f4', txt: '#5a544a' },
          { id: 'c4-la', code: 'LA', group: 'Gloss',    label: 'Light Almond',    hex: '#e9e2d9', txt: '#5f584c' },
          { id: 'c4-bl', code: 'BL', group: 'Gloss',    label: 'Black',           hex: '#1d1d1f', txt: '#d8d4cc' },
          { id: 'c4-sw', code: 'SW', group: 'Matte',    label: 'Snow White',      hex: '#ececec', txt: '#5a544a' },
          { id: 'c4-bi', code: 'BI', group: 'Matte',    label: 'Biscuit',         hex: '#eae5de', txt: '#5f584c' },
          { id: 'c4-tp', code: 'TP', group: 'Matte',    label: 'Taupe',           hex: '#d9d0cb', txt: '#54493f' },
          { id: 'c4-lg', code: 'LG', group: 'Matte',    label: 'Light Gray',      hex: '#dfdee2', txt: '#4d4c50' },
          { id: 'c4-sg', code: 'SG', group: 'Matte',    label: 'Stone Gray',      hex: '#c6c5ca', txt: '#3f3e44' },
          { id: 'c4-au', code: 'AU', group: 'Matte',    label: 'Aluminum',        hex: '#cfd0d2', txt: '#3c3d40' },
          { id: 'c4-cf', code: 'CF', group: 'Matte',    label: 'Coffee',          hex: '#352b29', txt: '#e3d9d0' },
          { id: 'c4-mb', code: 'MB', group: 'Matte',    label: 'Midnight Black',  hex: '#262526', txt: '#d6d4d0' },
          { id: 'c4-bs', code: 'BS', group: 'Metallic', label: 'Antique Brass',   hex: '#9b8563', txt: '#2b2113' },
          { id: 'c4-bz', code: 'BZ', group: 'Metallic', label: 'Antique Bronze',  hex: '#8a6f4d', txt: '#f0e6d4' },
          { id: 'c4-ag', code: 'AG', group: 'Metallic', label: 'Ash Gray',        hex: '#5c5a58', txt: '#e2e0dc' },
          { id: 'c4-ch', code: 'CH', group: 'Metallic', label: 'Chrome',          hex: '#c3c7cb', txt: '#33383d' },
          { id: 'c4-ms', code: 'MS', group: 'Metallic', label: 'Matte Stainless', hex: '#b6b7b5', txt: '#2f302e' },
          { id: 'c4-sb', code: 'SB', group: 'Metallic', label: 'Satin Bronze',    hex: '#a8875f', txt: '#241a0c' },
          { id: 'c4-sn', code: 'SN', group: 'Metallic', label: 'Satin Nickel',    hex: '#b5b0a6', txt: '#2f2b24' },
          { id: 'c4-vb', code: 'VB', group: 'Metallic', label: 'Venetian Bronze', hex: '#3a3230', txt: '#e6ddd2' }
        ]
      }
    },

    // ── Control systems ──
    controlSystems: [
      { id: 'rako',     label: 'Rako',              note: 'Wireless or wired dimming — the Sonor staple for retrofit + new build.' },
      { id: 'lutron',   label: 'Lutron',            note: 'Reference-grade dimming and keypads — the high-end benchmark.' },
      { id: 'control4', label: 'Control4 Lighting', note: 'Lighting native to the Control4 automation platform.' }
    ],

    // ── Engineering constants (research-derived, used by SonorLightingCalc) ──
    calc: {
      ufDefault: 0.5,          // utilisation factor — typical residential room, light finishes
      mfDefault: 0.8,          // maintenance factor — clean interior LED
      driverHeadroom: 0.8,     // load drivers to ≤80% of rating
      driverSizes: [30, 60, 100, 150, 200, 320],
      stripFeedMaxM: 6,        // single-end feed beyond this → feed both ends / split
      spacingRatio: [0.5, 1.0],// downlight spacing = ceiling height × 0.5–1.0
      wallOffsetM: 0.5,        // general downlights off the wall
      ceilingDefaultM: 2.4,
      cctMixWarnK: 300,        // flag rooms mixing CCTs further apart than this
      // v0.5.0 — compliance + exterior guidance thresholds
      partLMinLmw: 75,         // Approved Document L (dwellings): fixed lighting ≥75 luminaire-lm per circuit-watt
      extAmberMaxK: 2700       // exterior advisory ceiling — warmer is kinder to wildlife (dark-sky)
    },

    // ── Section blurbs (PDF-rendered — every word must be ff/ffl-ligature safe) ──
    sectionBlurbs: {
      approach: 'Light is layered — ambient, task and accent — so every room moves from bright and practical to calm and cinematic in one press. Warm white leads the home; every circuit dims.',
      rooms: 'Room-by-room design targets from CIBSE-derived residential guidance. Achieved levels use the lumen method with maintained-output assumptions — final levels are set at commissioning.',
      fixtures: 'The specified fittings, with the technical data that matters: output, colour quality, beam and ingress protection. Product and data sheet links are carried per line.',
      led: 'Concealed linear LED provides the glow that gives a home its depth. Every run is engineered: output per metre, feed plan and driver sizing with headroom.',
      circuits: 'Circuits are grouped by room and layer, never mixing load types on one dimmer. Each circuit lists its load and control method for the electrician and the programmer.',
      scenes: 'Keypads carry scene names, not circuit names. These are the starting levels — every scene is tuned in the room, at night, at handover.',
      exterior: 'Outside, the design lights the garden as a set of zones — terrace, path, planting and trees — never as a floodlit whole. Fittings are shielded and aimed down, warm amber leads, and timers bring a curfew so the garden goes properly dark late at night.',
      budget: 'Indicative supply budget from the Sonor library, ex VAT. A formal quotation follows the agreed specification.'
    },

    termsLines: [
      'Lighting design proposal for the fixture and control specification only — construction and wiring detail is carried on the electrical drawings.',
      'Light-level calculations are design guidance using maintained-output assumptions; final scene levels are set in the room at commissioning.',
      'Indicative budget figures are ex VAT and subject to formal quotation. Trade terms apply to supply-only items where agreed.',
      'Fitting availability and finishes are confirmed at order. E&OE.'
    ],

    // Landing + PDF cover hero — none yet (branded gradient fallback).
    // Drop a lighting hero image at the app root and set the path here.
    heroImage: null,

    cacheKey: 'sonor_lighting_ssot_v1'
  };
})();
