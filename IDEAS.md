# Lighting Design — Integration ideas

## Data this app can provide
- `projects.metadata.lighting_spec` — the confirmed lighting specification per
  project (picks with WQ SKUs, per-room counts + levels, LED totals, circuit
  summary, control system, scenes). Single writer: this app.
- `lighting_configs` — saved design boards per project (config jsonb).
- Per-fixture WQ SKU mapping (once the Library files `wq_product_skus`
  rows with `library_type='lighting'`) — quote-ready lines for Tender/WeQuote.

## Data this app could consume
- Takeoffs: `takeoffs_floors.content` (CONSUMING — symbols service 04, LED runs,
  areas). Ask: stable area ids (same ask as Cinema Aesthetic room tags).
- Engineering: `lighting_panels` + `lighting_circuits` — display the panel/module
  schedule beside the derived circuits; PUSH derived circuits into Engineering
  as a starting layout (the 2-way Bryn asked for — needs a single-writer
  agreement with the Engineering app before any write).
- Cinema Aesthetic `design_spec` — cinema-room lighting intent (downlight grade,
  LED zones, scenes) should prefill the cinema room's rows here.
- Leads/PM brief (`projects.metadata.brief`) — client lighting concept notes.

## Integration notes
- The WQ pricing seam is the same one Takeoffs LC mapping uses (`wq_sku_map`
  section='Lighting', `wq_product_skus` lc_module/lc_panel/led_strip types) —
  when the Library maps fixture models to WQ SKUs, quotes + takeoffs + this app
  all price from one place.
- Photometric files (`ies_url` on 82 items) enable an in-browser IES viewer
  (polar curves + cone diagrams) — v0.2 candidate, `iesna` npm lib assessed.

## Requests to other projects
- **Library:** curate `lighting_items` (all rows metadata.scraped=2026-08-20,
  effectively needs_review); import DuraGreen trade price list into
  `wq_product_skus`; add `library_type='lighting'` SKU rows for specified models.
- **Engineering:** agree the circuits handshake (lighting_spec → panels/circuits).
- **Takeoffs:** stable room/area ids; a `lighting_spec` chip on the lighting
  take-off PDF ("specified: DuraGreen BELLA · 2700K") once published.
- **Master Hub:** card added at birth (done).

## Feature research 2026-08-20 (Apify sweep)
Full report: `reports/LIGHTING-FEATURE-RESEARCH_2026-08-20.md`. Prioritised:
- **Quick (v0.5.x):** Part L 75 lm/circuit-watt efficacy check (data already in
  library) + one-line compliance statement in PDF; state MF 0.8/UF 0.5 to CIBSE
  guidance in the PDF; amber ≤2700K wildlife lint for exterior picks; warm-dim
  range headline on the LED page.
- **Medium (v0.6):** exterior/garden layer (in-grade, under-cap, moonlight,
  path, pergola-puck kinds + garden zones + dark-sky statement page); circadian
  evening-schedule diagram (scene CCT over time); false-colour room level bars
  vs lux target; shade/climate actions on house scenes.
- **Larger:** EN 1838 emergency lighting layer; scheduled Apify
  website-content-crawler refresh of the 3 supplier catalogues diffed against
  `lighting_items`; Google-Maps underlay for exterior (after garden layer).
- Research confirms existing asks: IES viewer (IES/LDT is the interchange
  format), Lutron Palladiom/Alisse/Aviena + Rako keypad ranges (finishes +
  engraving are the selling surface).
