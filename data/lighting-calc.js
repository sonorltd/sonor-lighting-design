/* Sonor Lighting Design — engineering helpers (v0.1.0)
   window.SonorLightingCalc — pure functions, no DOM, no state. Encodes the
   lighting-design methods researched 2026-08-20 (lumen method, downlight
   spacing, beam geometry, LED strip + driver engineering, BS 7671 bathroom
   zones, CCT-mix lint). All inputs SI: metres, m², lumens, watts, kelvin.
   Every function is defensive — null in, null out, never throws.
*/
(function (global) {
  'use strict';

  var CFG = function () { return (global.__LIGHTING_CONFIG__ || {}).calc || {}; };

  // ── Lumen method — average maintained illuminance ────────────────────────
  // E = (F × N × UF × MF) / A     N = fittings, F = lumens per fitting
  function achievedLux(o) {
    if (!o || !o.area_m2 || !o.lumens || !o.count) return null;
    var uf = o.uf != null ? o.uf : (CFG().ufDefault || 0.5);
    var mf = o.mf != null ? o.mf : (CFG().mfDefault || 0.8);
    return (o.lumens * o.count * uf * mf) / o.area_m2;
  }
  function fittingsNeeded(o) {
    if (!o || !o.area_m2 || !o.lumens || !o.targetLux) return null;
    var uf = o.uf != null ? o.uf : (CFG().ufDefault || 0.5);
    var mf = o.mf != null ? o.mf : (CFG().mfDefault || 0.8);
    return Math.ceil((o.targetLux * o.area_m2) / (o.lumens * uf * mf));
  }

  // ── Downlight spacing — spacing = ceiling height × 0.5–1.0 ───────────────
  function spacing(ceilingH) {
    var h = ceilingH || CFG().ceilingDefaultM || 2.4;
    var r = CFG().spacingRatio || [0.5, 1.0];
    return { min: +(h * r[0]).toFixed(2), max: +(h * r[1]).toFixed(2),
             suggested: +(h * 0.65).toFixed(2), wallOffset: CFG().wallOffsetM || 0.5 };
  }

  // ── Beam geometry — pool diameter + centre-beam lux at distance ──────────
  // I0 approximated from total lumens over the beam solid angle:
  // I0 ≈ F / (2π(1 − cos(θ/2)))  ·  E = I0 / d²  ·  Ø = 2·d·tan(θ/2)
  function beamCone(beamDeg, distM, lumens) {
    if (!beamDeg || !distM) return null;
    var half = (beamDeg / 2) * Math.PI / 180;
    var dia = 2 * distM * Math.tan(half);
    var out = { diameter_m: +dia.toFixed(2) };
    if (lumens) {
      var omega = 2 * Math.PI * (1 - Math.cos(half));
      var i0 = lumens / omega;
      out.centre_lux = Math.round(i0 / (distM * distM));
      out.avg_lux = Math.round(out.centre_lux * 0.5);
    }
    return out;
  }

  // ── LED strip + driver engineering ───────────────────────────────────────
  // 80% rule: driver ≥ load / 0.8, rounded up to the next standard size.
  // Feed plan: single-end feed to stripFeedMaxM; beyond → both ends / split.
  function stripRun(lengthM, wPerM) {
    if (!lengthM || !wPerM) return null;
    var c = CFG();
    var load = lengthM * wPerM;
    var minW = load / (c.driverHeadroom || 0.8);
    var sizes = c.driverSizes || [30, 60, 100, 150, 200, 320];
    var driver = null;
    for (var i = 0; i < sizes.length; i++) { if (sizes[i] >= minW) { driver = sizes[i]; break; } }
    var drivers = 1;
    if (!driver) {           // beyond the biggest driver → split across several
      var big = sizes[sizes.length - 1];
      drivers = Math.ceil(minW / big);
      driver = big;
    }
    var feedMax = c.stripFeedMaxM || 6;
    return {
      load_w: +load.toFixed(1),
      driver_w: driver,
      drivers: drivers,
      loaded_pct: Math.round((load / (driver * drivers)) * 100),
      feeds: lengthM > feedMax ? 2 : 1,
      feedNote: lengthM > feedMax
        ? 'Run over ' + feedMax + ' m — feed both ends (or split the run) to keep voltage drop inside 5%'
        : 'Single-end feed OK at this length'
    };
  }
  function stripTotals(runs, wPerM) {
    var m = 0; (runs || []).forEach(function (r) { m += Number(r.metres) || 0; });
    var eng = m ? stripRun(m, wPerM || 10) : null;
    return { total_m: +m.toFixed(1), load_w: eng ? eng.load_w : 0 };
  }

  // ── IP requirement lint (BS 7671 bathroom zones + exterior practice) ─────
  function ipRequired(roomType, zone) {
    if (roomType === 'exterior') {
      if (zone === 'ground')   return { ip: 'IP67', note: 'Ground-recessed / drive-over' };
      if (zone === 'covered')  return { ip: 'IP44', note: 'Under eaves / covered' };
      return { ip: 'IP65', note: 'Open exterior — facade, garden, terrace' };
    }
    if (roomType === 'bathroom' || roomType === 'ensuite') {
      if (zone === '0') return { ip: 'IP67', note: 'Zone 0 — inside bath / shower tray, SELV only' };
      if (zone === '1') return { ip: 'IP65', note: 'Zone 1 — over bath / shower to 2.25 m' };
      if (zone === '2') return { ip: 'IP44', note: 'Zone 2 — 0.6 m beyond zone 1, around basins' };
      return { ip: 'IP44', note: 'Outside zones — IP44 good practice in a steamy room' };
    }
    return null;
  }
  // lint a picked item against its usage room type
  function ipLint(item, roomType) {
    var req = ipRequired(roomType, null);
    if (!req || !item) return null;
    var have = parseInt(String(item.ip || '').replace(/\D/g, ''), 10) || 0;
    var need = parseInt(req.ip.replace(/\D/g, ''), 10);
    if (have >= need) return null;
    return { level: 'warn', msg: (item.name || 'Fitting') + ' is ' + (item.ip || 'unrated') + ' — ' + roomType + ' needs ' + req.ip + ' (' + req.note + ')' };
  }

  // ── CCT-mix lint — flag rooms mixing CCTs in one visual field ────────────
  function cctLint(ccts) {
    var vals = (ccts || []).filter(function (c) { return typeof c === 'number' && c > 0; });
    if (vals.length < 2) return null;
    var span = Math.max.apply(null, vals) - Math.min.apply(null, vals);
    var warn = CFG().cctMixWarnK || 300;
    if (span <= warn) return null;
    return { level: 'warn', msg: 'Colour temperatures ' + vals.join('K / ') + 'K mix in one space (' + span + 'K apart) — keep layers within ' + warn + 'K or make the contrast deliberate' };
  }

  // ── Dimming compatibility lint — circuit vs fitting driver ───────────────
  function dimmingLint(circuitControl, itemDimming) {
    var dims = (itemDimming || []).map(function (d) { return String(d).toLowerCase(); });
    if (!circuitControl || !dims.length) return null;
    var c = String(circuitControl).toLowerCase();
    var ok =
      (c.indexOf('dali') >= 0 && dims.some(function (d) { return d.indexOf('dali') >= 0; })) ||
      (c.indexOf('0-10') >= 0 && dims.some(function (d) { return d.indexOf('0-10') >= 0; })) ||
      ((c.indexOf('phase') >= 0 || c.indexOf('trailing') >= 0 || c.indexOf('rako') >= 0 || c.indexOf('lutron') >= 0) &&
        dims.some(function (d) { return d.indexOf('phase') >= 0 || d.indexOf('trailing') >= 0 || d.indexOf('leading') >= 0 || d === 'dimmable'; }));
    if (ok || dims.indexOf('non-dim') >= 0 === false && dims.length === 0) return null;
    if (ok) return null;
    return { level: 'warn', msg: 'Check dimming: circuit control "' + circuitControl + '" vs fitting protocols [' + dims.join(', ') + ']' };
  }

  // ── Dark-sky lint (exterior fixtures) ────────────────────────────────────
  function darkSkyLint(cctK) {
    if (!cctK) return null;
    if (cctK > 3000) return { level: 'warn', msg: 'Exterior at ' + cctK + 'K — keep exterior at 3000K or below (2700K or warmer preferred, dark-sky principles)' };
    return null;
  }

  // ── Canonical floor sort (GF → 1F → 2F… → BA → EXT) ─────────────────────
  // Prefers the workspace-shared helper (data/sonor-app.js); local fallback
  // implements the same Bryn-directed order so the PDF never ships unsorted.
  var FLOOR_RANK = { GF: 0, '1F': 1, '2F': 2, '3F': 3, '4F': 4, BA: 90, B: 90, LG: 89, EXT: 99 };
  function floorRank(code) {
    var c = String(code || '').toUpperCase();
    if (FLOOR_RANK[c] != null) return FLOOR_RANK[c];
    var m = /^(\d)F$/.exec(c);
    if (m) return Number(m[1]);
    return 50;
  }
  function sortFloors(codes) {
    if (typeof global.sonorSortFloors === 'function') {
      try { return global.sonorSortFloors(codes); } catch (e) {}
    }
    return (codes || []).slice().sort(function (a, b) {
      var ka = floorRank(a && a.code != null ? a.code : a);
      var kb = floorRank(b && b.code != null ? b.code : b);
      return ka - kb;
    });
  }

  global.SonorLightingCalc = {
    __version: '0.1.0',
    achievedLux: achievedLux,
    fittingsNeeded: fittingsNeeded,
    spacing: spacing,
    beamCone: beamCone,
    stripRun: stripRun,
    stripTotals: stripTotals,
    ipRequired: ipRequired,
    ipLint: ipLint,
    cctLint: cctLint,
    dimmingLint: dimmingLint,
    darkSkyLint: darkSkyLint,
    floorRank: floorRank,
    sortFloors: sortFloors
  };
})(window);
