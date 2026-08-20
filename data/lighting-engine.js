/* Sonor Lighting Design — catalogue engine (v0.1.0)
   SonorLightingLib — SSOT load + item resolution. Mirrors the Cinema Aesthetic
   engine pattern: 4-tier load — Supabase view v_lighting_catalogue →
   localStorage cache → bundled seed → empty.
   Read-only consumer: the Library owns lighting_items; this app writes ONLY
   its own lighting_configs table (from lighting-app.js).
   The view carries the WeQuote join (wq_sku / wq_cost / wq_sell /
   wq_labour_mins from wq_product_skus, library_type='lighting') so pricing
   rides along without a second query.
*/
(function (global) {
  'use strict';

  var CFG = global.__LIGHTING_CONFIG__ || {};
  var CACHE = CFG.cacheKey || 'sonor_lighting_ssot_v1';

  var ITEMS = [];
  var source = 'inline';
  var idx = { byId: {}, byCat: {}, byGrp: {}, bySupplier: {} };

  function _index() {
    idx = { byId: {}, byCat: {}, byGrp: {}, bySupplier: {} };
    ITEMS.forEach(function (it) {
      idx.byId[it.id] = it;
      (idx.byCat[it.category] = idx.byCat[it.category] || []).push(it);
      (idx.byGrp[it.grp] = idx.byGrp[it.grp] || []).push(it);
      if (it.supplier) (idx.bySupplier[it.supplier] = idx.bySupplier[it.supplier] || []).push(it);
    });
    var srt = function (a, b) { return (a.sort_order || 100) - (b.sort_order || 100) || String(a.name).localeCompare(b.name); };
    Object.keys(idx.byCat).forEach(function (k) { idx.byCat[k].sort(srt); });
    Object.keys(idx.byGrp).forEach(function (k) { idx.byGrp[k].sort(srt); });
  }

  // view row → engine item (adapter — bump cacheKey when this shape changes)
  function adapt(rows) {
    return (rows || []).filter(function (r) { return r && r.enabled !== false; }).map(function (r) {
      return {
        id: r.id, category: r.category, grp: r.grp || 'fixture',
        name: r.name, manufacturer: r.manufacturer || null, supplier: r.supplier || null,
        range: r.range || null, description: r.description || null,
        watts: r.watts == null ? null : Number(r.watts),
        lumens: r.lumens == null ? null : Number(r.lumens),
        cct: Array.isArray(r.cct) ? r.cct : [],
        cri: r.cri == null ? null : Number(r.cri),
        beam: Array.isArray(r.beam) ? r.beam : [],
        ip: r.ip || null,
        dimming: Array.isArray(r.dimming) ? r.dimming : [],
        voltage: r.voltage || null,
        price_gbp: r.price_gbp == null ? null : Number(r.price_gbp),
        price_gbp_max: r.price_gbp_max == null ? null : Number(r.price_gbp_max),
        price_note: r.price_note || null,
        product_url: r.product_url || null,
        datasheet_url: r.datasheet_url || null,
        ies_url: r.ies_url || null,
        img: r.img || null,
        specs: r.specs || {},
        metadata: r.metadata || {},
        wq_sku: r.wq_sku || null,
        wq_cost: r.wq_cost == null ? null : Number(r.wq_cost),
        wq_sell: r.wq_sell == null ? null : Number(r.wq_sell),
        wq_labour_mins: r.wq_labour_mins == null ? null : Number(r.wq_labour_mins),
        sort_order: r.sort_order == null ? 100 : r.sort_order
      };
    });
  }

  async function load() {
    // Tier 1 — Supabase view
    try {
      var db = null;
      if (global.SonorDB) db = new global.SonorDB();
      else if (global.db) db = global.db;
      if (db && db.client) {
        global.__LIGHTING_DB__ = db;   // expose for the app (function-local clients strand consumers)
        var res = await db.client.from('v_lighting_catalogue').select('*');
        if (!res.error && res.data && res.data.length) {
          ITEMS = adapt(res.data);
          source = 'supabase';
          _index();
          try { localStorage.setItem(CACHE, JSON.stringify({ t: Date.now(), items: ITEMS })); } catch (e) {}
          return true;
        }
      }
    } catch (e) { /* fall through */ }

    // Tier 2 — cache (already-adapted shape)
    try {
      var raw = localStorage.getItem(CACHE);
      if (raw) {
        var c = JSON.parse(raw);
        if (c && c.items && c.items.length) { ITEMS = c.items; source = 'cache'; _index(); return true; }
      }
    } catch (e) {}

    // Tier 3 — bundled seed
    try {
      var seed = global.__LIGHTING_SEED__;
      if (seed && seed.items && seed.items.length) { ITEMS = adapt(seed.items); source = 'seed'; _index(); return true; }
    } catch (e) {}

    // Tier 4 — empty
    ITEMS = []; source = 'inline'; _index(); return false;
  }

  // best price for budget lines: WQ sell wins, then public RRP
  function priceOf(it) {
    if (!it) return null;
    if (it.wq_sell != null) return { value: it.wq_sell, src: 'wq' };
    if (it.price_gbp != null) return { value: it.price_gbp, src: 'rrp' };
    return null;
  }

  global.SonorLightingLib = {
    load: load,
    get source() { return source; },
    all: function () { return ITEMS.slice(); },
    item: function (id) { return idx.byId[id] || null; },
    byCategory: function (cat) {
      var cats = Array.isArray(cat) ? cat : [cat];
      var out = [];
      cats.forEach(function (c) { out = out.concat(idx.byCat[c] || []); });
      return out;
    },
    byGroup: function (g) { return (idx.byGrp[g] || []).slice(); },
    bySupplier: function (s) { return (idx.bySupplier[s] || []).slice(); },
    categories: function () { return Object.keys(idx.byCat); },
    priceOf: priceOf
  };
})(window);
