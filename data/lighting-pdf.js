/* Sonor Lighting Design — LIGHTING DESIGN PROPOSAL (v0.2.0)
   LightingPdf.generate(model) — the client-facing lighting design document,
   built ENTIRELY on the shared SonorPdfLuxury chrome (data/sonor-pdf-luxury.js,
   root master). v0.2.0 rebuilds the pack to luxury lighting-studio standard
   (2026-08-20 research pass: John Cullen / LDI / Roxburghe-spec conventions):
   Cover · Introduction + luminaire key · Design approach + layers-of-light
   diagram · Room by room (grouped schedule, level bars) · CUT SHEETS (one page
   per fixture: product photo, spec grid, generated polar intensity curve, beam
   cone, finishes, used-in) · Linear LED · Circuits & control · Scenes (dim-level
   bars) · Indicative budget · The detail · APPENDIX: manufacturer data sheets
   (mirrored PDFs appended inline, stamped + capped).
   Table law (research pass): horizontal hairlines only, header rule heavier,
   numbers right-aligned, group headers per room/floor with summaries, no zebra.
   cinema-pdf-luxury rules honoured: frame-edge, divider discipline,
   truncate-vs-wrap, Gilroy ff-ligature ban (model deepSafe'd upstream; every
   static string here is written ligature-safe).
*/
(function (global) {
  'use strict';

  function L() { return global.SonorPdfLuxury; }
  var DOC_LABEL = 'LIGHTING DESIGN PROPOSAL';

  function selfDir() {
    try { var s = document.currentScript; if (s && s.src) return s.src.replace(/[^/]*$/, ''); } catch (e) {}
    try { var arr = document.getElementsByTagName('script'); for (var i = arr.length - 1; i >= 0; i--) { if (/lighting-pdf\.js/.test(arr[i].src)) return arr[i].src.replace(/[^/]*$/, ''); } } catch (e) {}
    return '../data/';
  }
  var BASE = selfDir();

  function trunc(F, s, size, w) {
    var out = String(s == null ? '' : s);
    if (F.widthOfTextAtSize(out, size) <= w) return out;
    while (out.length > 3 && F.widthOfTextAtSize(out + '…', size) > w) out = out.slice(0, -2).replace(/\s+$/, '');
    return out + '…';
  }
  function lineLinks(P, F, lx, x, y, links) {
    var cx = x, drawn = 0;
    if (links && links.url) { cx += P.link('Product page', cx, y, 7.5, F.r, lx.COL.GDEEP, links.url) + 16; drawn++; }
    if (links && links.datasheet) { cx += P.link('Data sheet', cx, y, 7.5, F.r, lx.COL.GDEEP, links.datasheet) + 16; drawn++; }
    if (links && links.ies) { cx += P.link('Photometry (IES)', cx, y, 7.5, F.r, lx.COL.GDEEP, links.ies) + 16; drawn++; }
    return drawn;
  }
  function blurb(m, key) { return (m.blurbs || {})[key] || ''; }

  // ── shared drawn elements ─────────────────────────────────────────────────
  // reference tag — filled gold roundel with the ref code (schedule ↔ cut sheet)
  function refTag(P, F, lx, x, yTop, ref, d) {
    d = d || 15;
    P.dot(x + d / 2, yTop + d / 2, d / 2, lx.COL.GOLD);
    P.center(String(ref), x + d / 2, yTop + (d - 7) / 2 - 0.5, 7, F.b, [255, 255, 255], 0.5);
    return d;
  }
  // horizontal level bar (scene levels + room lux) — track + proportional fill
  function levelBar(P, lx, x, yTop, w, h, pct) {
    P.rect(x, yTop, w, h, [232, 226, 214], 1);
    if (pct > 0) P.rect(x, yTop, Math.max(2, w * Math.min(1, pct)), h, lx.COL.GOLD, 1);
  }
  // generated polar intensity curve from beam angle(s) — cos^m lobe model,
  // nadir-down convention, rings at 25/50/75/100%
  function polarPlot(P, F, lx, cx, cyTop, R, beams) {
    var COL = lx.COL;
    var A4h = lx.A4.h;
    var cy = cyTop + 6;                     // centre (fixture) point, lobe drawn downward
    // grid rings (semicircle, below centre)
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      var r = R * f;
      var path = 'M ' + (-r) + ',0 A ' + r + ',' + r + ' 0 0 0 ' + r + ',0';
      P.page.drawSvgPath(path, { x: cx, y: A4h - cy, borderColor: lx.col(COL.LINE), borderWidth: f === 1 ? 0.7 : 0.35, borderOpacity: 0.8 });
    });
    // radial spokes every 30°
    for (var a = 0; a <= 180; a += 30) {
      var rad = a * Math.PI / 180;
      var sx = -Math.cos(rad) * R, sy = Math.sin(rad) * R;
      P.page.drawSvgPath('M 0,0 L ' + sx + ',' + sy, { x: cx, y: A4h - cy, borderColor: lx.col(COL.LINE), borderWidth: 0.3, borderOpacity: 0.6 });
    }
    // angle labels
    P.center('90°', cx - R - 11, cy - 3, 5.5, F.r, COL.MUT, 0.5);
    P.center('90°', cx + R + 11, cy - 3, 5.5, F.r, COL.MUT, 0.5);
    P.center('0°', cx, cy + R + 5, 5.5, F.r, COL.MUT, 0.5);
    // lobes — widest first (lightest), narrowest last
    var bs = (beams || []).filter(function (b) { return b > 3 && b < 180; }).sort(function (a, b) { return b - a; }).slice(0, 3);
    if (!bs.length) bs = [60];
    bs.forEach(function (beam, i) {
      var m = Math.log(0.5) / Math.log(Math.cos((beam / 2) * Math.PI / 180));
      var pts = [];
      for (var g = -88; g <= 88; g += 4) {
        var I = Math.pow(Math.max(0, Math.cos(g * Math.PI / 180)), m);
        var rr = R * I;
        var rad2 = g * Math.PI / 180;
        pts.push([Math.sin(rad2) * rr, Math.cos(rad2) * rr]);
      }
      var path2 = 'M 0,0 ';
      pts.forEach(function (p) { path2 += 'L ' + p[0].toFixed(1) + ',' + p[1].toFixed(1) + ' '; });
      path2 += 'Z';
      var last = i === bs.length - 1;
      P.page.drawSvgPath(path2, { x: cx, y: A4h - cy, color: lx.col(COL.GOLD), opacity: last ? 0.22 : 0.10, borderColor: lx.col(last ? COL.GDEEP : COL.GOLD), borderWidth: last ? 1 : 0.6, borderOpacity: last ? 0.9 : 0.5 });
    });
    P.tracked('POLAR INTENSITY', cx - F.r.widthOfTextAtSize('POLAR INTENSITY', 5.5) / 2 - 4, cy + R + 14, 5.5, F.r, COL.MUT, 1.2);
    return cy + R + 24 - cyTop;
  }
  // beam cone diagram — fixture at ceiling, cone to working plane, Ø + lux note
  function coneDiagram(P, F, lx, x, yTop, w, h, beamDeg, lumens, mountH) {
    var COL = lx.COL, A4h = lx.A4.h;
    mountH = mountH || 2.4;
    var planeH = 0.85;
    var drop = mountH - planeH;
    var half = ((beamDeg || 60) / 2) * Math.PI / 180;
    var dia = 2 * drop * Math.tan(half);
    // ceiling + floor lines
    P.hline(x, x + w, yTop + 6, COL.INK2, 0.8);
    P.hline(x, x + w, yTop + h - 12, COL.LINE, 0.6);
    var fx = x + w / 2;
    var spread = Math.min(w * 0.44, (h - 24) * Math.tan(half));
    var path = 'M 0,0 L ' + (-spread) + ',' + (h - 20) + ' L ' + spread + ',' + (h - 20) + ' Z';
    P.page.drawSvgPath(path, { x: fx, y: A4h - (yTop + 8), color: lx.col(COL.GOLD), opacity: 0.16, borderColor: lx.col(COL.GOLD), borderWidth: 0.5, borderOpacity: 0.5 });
    P.rect(fx - 5, yTop + 3, 10, 5, COL.INK2, 1);   // fixture body
    var cl = lumens ? Math.round((lumens / (2 * Math.PI * (1 - Math.cos(half)))) / (drop * drop)) : null;
    P.center('Ø ' + dia.toFixed(1) + ' m at the working plane', fx, yTop + h - 8, 6.5, F.r, COL.MUT, 0.5);
    if (cl) P.center('~' + cl + ' lx centre beam · ' + mountH + ' m ceiling', fx, yTop + h + 1, 6, F.r, COL.MUT, 0.5);
    return h + 10;
  }
  // layers-of-light room section — ambient / task / accent cones on one section
  function layersDiagram(P, F, lx, x, yTop, w, h) {
    var COL = lx.COL, A4h = lx.A4.h;
    P.hline(x, x + w, yTop, COL.INK2, 1);            // ceiling
    P.hline(x, x + w, yTop + h, COL.INK2, 1);        // floor
    P.vline(x, yTop, yTop + h, COL.LINE, 0.7);
    P.vline(x + w, yTop, yTop + h, COL.LINE, 0.7);
    var cone = function (fx, half, hh, op) {
      var s = hh * Math.tan(half * Math.PI / 180);
      P.page.drawSvgPath('M 0,0 L ' + (-s) + ',' + hh + ' L ' + s + ',' + hh + ' Z',
        { x: fx, y: A4h - (yTop + 4), color: lx.col(COL.GOLD), opacity: op, borderColor: lx.col(COL.GOLD), borderWidth: 0.4, borderOpacity: 0.35 });
      P.rect(fx - 4, yTop - 1, 8, 4, COL.INK2, 1);
    };
    // AMBIENT — two wide downlights
    cone(x + w * 0.14, 30, h - 8, 0.14);
    cone(x + w * 0.30, 30, h - 8, 0.14);
    // TASK — pendant over a table
    P.vline(x + w * 0.52, yTop, yTop + 22, COL.INK2, 0.8);
    P.rect(x + w * 0.52 - 5, yTop + 22, 10, 6, COL.GDEEP, 1);
    P.page.drawSvgPath('M 0,0 L -16,' + (h - 46) + ' L 16,' + (h - 46) + ' Z',
      { x: x + w * 0.52, y: A4h - (yTop + 28), color: lx.col(COL.GOLD), opacity: 0.22, borderColor: lx.col(COL.GOLD), borderWidth: 0.4, borderOpacity: 0.4 });
    P.rect(x + w * 0.44, yTop + h - 16, w * 0.16, 3, COL.LINE, 1);   // table
    // ACCENT — narrow spot onto art on the right wall
    cone(x + w * 0.80, 9, h - 26, 0.30);
    P.rect(x + w * 0.80 - 9, yTop + h - 34, 18, 22, COL.LINE, 0.9); // artwork
    P.rectB(x + w * 0.80 - 9, yTop + h - 34, 18, 22, COL.GDEEP, 0.7);
    // labels
    P.tracked('AMBIENT', x + w * 0.14, yTop + h + 8, 6.5, F.r, COL.GDEEP, 1.6);
    P.tracked('TASK', x + w * 0.49, yTop + h + 8, 6.5, F.r, COL.GDEEP, 1.6);
    P.tracked('ACCENT', x + w * 0.75, yTop + h + 8, 6.5, F.r, COL.GDEEP, 1.6);
    return h + 22;
  }

  // ── Introduction + luminaire key ──────────────────────────────────────────
  function secIntro(m) {
    var lx = L();
    return function (P, F, pageNo, TOTAL) {
      lx.pageHead(P, F, 'INTRODUCTION', pageNo, TOTAL, DOC_LABEL);
      var y = lx.sectionHead(P, F, 'WHOLE-HOME LIGHTING', m.title || 'Your home', m.introText);
      y = Math.max(y, 186);
      var colW = 236;
      var stats = (m.stats || []);
      var half = Math.ceil(stats.length / 2);
      var b1 = lx.specRows(P, F, stats.slice(0, half), lx.M, y, colW);
      var b2 = lx.specRows(P, F, stats.slice(half), lx.M + colW + 28, y, colW);
      var dy = Math.max(b1, b2) + 22;
      // luminaire key — the pack's index of fixture references
      P.tracked('LUMINAIRE KEY', lx.M, dy, 6.5, F.r, lx.COL.MUT, 1.5);
      P.hline(lx.M, lx.A4.w - lx.M, dy + 11, lx.COL.GOLD, 0.8, 0.75);
      var ky = dy + 24;
      (m.fixtures || []).forEach(function (f) {
        refTag(P, F, lx, lx.M, ky - 4, f.ref);
        P.text(trunc(F.b, f.kind, 9.5, 130), lx.M + 24, ky - 6, 9.5, F.b, lx.COL.INK);
        P.text(trunc(F.r, f.name + (f.manufacturer ? '  ·  ' + f.manufacturer : ''), 8.5, 250), lx.M + 165, ky - 5.5, 8.5, F.r, lx.COL.INK2);
        P.right(f.qty ? f.qty + ' ×' : '—', lx.A4.w - lx.M, ky - 6, 9, F.b, lx.COL.GDEEP);
        ky += 19;
      });
      if (m.led && m.led.totalM) {
        refTag(P, F, lx, lx.M, ky - 4, 'ST');
        P.text('Linear LED', lx.M + 24, ky - 6, 9.5, F.b, lx.COL.INK);
        P.text(trunc(F.r, (m.led.strip ? m.led.strip.name : 'Strip TBC'), 8.5, 250), lx.M + 165, ky - 5.5, 8.5, F.r, lx.COL.INK2);
        P.right(m.led.totalM + ' m', lx.A4.w - lx.M, ky - 6, 9, F.b, lx.COL.GDEEP);
        ky += 19;
      }
      ky += 8;
      P.tracked('IN THIS PROPOSAL', lx.M, ky, 6.5, F.r, lx.COL.MUT, 1.5);
      P.hline(lx.M, lx.A4.w - lx.M, ky + 11, lx.COL.GOLD, 0.8, 0.75);
      var iy = ky + 25;
      var items = m.sectionList || [];
      var colN = Math.ceil(items.length / 2), colWx = (lx.A4.w - lx.M * 2 - 24) / 2;
      items.forEach(function (s, i) {
        var cxx = lx.M + (i >= colN ? colWx + 24 : 0);
        var cyy = iy + (i % colN) * 17;
        P.dot(cxx + 3, cyy - 4, 2.2, lx.COL.GOLD);
        P.text(s, cxx + 14, cyy - 9, 10, F.r, lx.COL.INK);
      });
      lx.pageFoot(P, F);
    };
  }

  // ── Design approach + layers diagram ──────────────────────────────────────
  function secApproach(m) {
    var lx = L();
    return function (P, F, pageNo, TOTAL) {
      var M = lx.M, A4 = lx.A4, COL = lx.COL;
      lx.pageHead(P, F, 'DESIGN APPROACH', pageNo, TOTAL, DOC_LABEL);
      var y = lx.sectionHead(P, F, 'LAYERED · WARM · DIMMABLE', 'The design approach', blurb(m, 'approach'));
      y = Math.max(y, 188);
      P.tracked('THE THREE LAYERS OF LIGHT', M, y, 6.5, F.r, COL.MUT, 1.5);
      P.hline(M, A4.w - M, y + 11, COL.GOLD, 0.8, 0.75);
      y += 26;
      y += layersDiagram(P, F, lx, M + 8, y, A4.w - M * 2 - 16, 120) + 6;
      (m.layers || []).forEach(function (l, i, arr) {
        P.text(l.label, M, y - 9, 10.5, F.b, COL.INK);
        P.text(l.note || '', M + 92, y - 8, 9.5, F.r, COL.INK2, { maxWidth: A4.w - M * 2 - 100 });
        if (i < arr.length - 1) P.hline(M, A4.w - M, y + 7, COL.LINE, 0.4, 0.5);
        y += 22;
      });
      y += 14;
      var statMap = {};
      (m.stats || []).forEach(function (s) { statMap[s[0]] = s[1]; });
      var rows = [
        ['Colour temperature', statMap['Colour'] || null],
        ['Control system', statMap['Control'] || null],
        ['Dimming', 'Every circuit dims — trailing-edge or ELV as the load demands; scenes replace switch banks'],
        ['Exterior', 'Warm, shielded and aimed down — dark-sky principles, timers on a curfew'],
        ['Colour quality', 'CRI 90 minimum in living spaces — skin, timber and art rendered true']
      ];
      lx.specRows(P, F, rows, M, y, A4.w - M * 2 - 40);
      lx.pageFoot(P, F);
    };
  }

  // ── Room by room — grouped schedule, level bars, fixed columns ────────────
  function roomPages(m) {
    var lx = L();
    var rows = [];
    (m.floors || []).forEach(function (f) {
      if (!f.rooms || !f.rooms.length) return;
      var sumC = 0, sumW = 0;
      f.rooms.forEach(function (r) { sumC += r.count || 0; sumW += r.watts || 0; });
      rows.push({ hdr: f.code, rooms: f.rooms.length, count: sumC, watts: sumW });
      f.rooms.forEach(function (r) { rows.push({ r: r }); });
    });
    if (!rows.length) return [];
    var pages = [], chunk = [], budgetH = 0;
    rows.forEach(function (row) {
      var need = row.hdr ? 40 : 30;
      if (budgetH + need > 500 && chunk.length) { pages.push(chunk); chunk = []; budgetH = 0; }
      chunk.push(row); budgetH += need;
    });
    if (chunk.length) pages.push(chunk);
    return pages.map(function (pg, pi) {
      return function (P, F, pageNo, TOTAL) {
        var M = lx.M, A4 = lx.A4, COL = lx.COL;
        lx.pageHead(P, F, 'ROOM BY ROOM', pageNo, TOTAL, DOC_LABEL);
        var y;
        if (pi === 0) { y = lx.sectionHead(P, F, 'DESIGN TARGETS', 'Room by room', blurb(m, 'rooms')); y = Math.max(y, 186); }
        else { P.tracked('ROOM BY ROOM — CONTINUED', M, 92, 8.5, F.r, COL.GOLD, 2.6); y = 118; }
        // column geometry — fixed, collision-proof
        var xRoom = M, wRoom = 148;
        var xFix = M + 158, wFix = 190;
        var xTgt = A4.w - M - 132;   // right block
        pg.forEach(function (row) {
          if (row.hdr) {
            y += 6;
            P.tracked(String(row.hdr).toUpperCase(), xRoom, y, 8, F.b, COL.GDEEP, 2.2);
            P.trackedRight(row.rooms + (row.rooms === 1 ? ' ROOM' : ' ROOMS') + '  ·  ' + row.count + (row.count === 1 ? ' FITTING' : ' FITTINGS') + '  ·  ' + row.watts + ' W', A4.w - M, y + 1, 6.5, F.r, COL.MUT, 1.2);
            P.hline(M, A4.w - M, y + 13, COL.GOLD, 0.9, 0.85);
            y += 28;
            return;
          }
          var r = row.r;
          P.text(trunc(F.b, r.name, 10, wRoom), xRoom, y - 9, 10, F.b, COL.INK);
          P.text(trunc(F.r, r.typeLabel || '', 7, wRoom), xRoom, y + 3.5, 7, F.r, COL.MUT);
          // fixture refs — up to 2 lines
          var fitLines = lx.wrap(r.summary || '', F.r, 8.5, wFix).slice(0, 2);
          fitLines.forEach(function (ln, li) { P.text(ln, xFix, y - 8 + li * 11, 8.5, F.r, COL.INK2); });
          // levels block: target text + estimate bar, fixed right columns
          if (r.target) {
            P.right(r.target + ' lx target', A4.w - M, y - 8.5, 7.5, F.r, COL.MUT);
            if (r.achieved != null) {
              var pct = r.achieved / r.target;
              levelBar(P, lx, xTgt, y + 3, 86, 4.5, pct);
              P.right('~' + r.achieved + ' lx', A4.w - M, y + 1.5, 7.5, F.b, pct >= 0.6 ? COL.GDEEP : [176, 108, 60]);
            }
          } else if (r.achieved != null) {
            P.right('~' + r.achieved + ' lx', A4.w - M, y - 8, 7.5, F.b, COL.GDEEP);
          }
          P.hline(M, A4.w - M, y + 13, COL.LINE, 0.35, 0.55);
          y += 30;
        });
        P.text('Estimates: lumen method across all counted fittings (published or typical outputs) — linear LED adds on top. Final levels set at commissioning.', M, lx.A4.h - 98, 7.5, F.r, COL.MUT, { maxWidth: lx.A4.w - M * 2, lineHeight: 10 });
        lx.pageFoot(P, F);
      };
    });
  }

  // ── CUT SHEETS — one page per specified fixture ───────────────────────────
  function cutSheetPages(m, imgs) {
    var lx = L();
    var items = (m.fixtures || []).filter(function (f) { return f.qty || f.name; });
    return items.map(function (f, fi) {
      return function (P, F, pageNo, TOTAL) {
        var M = lx.M, A4 = lx.A4, COL = lx.COL;
        lx.pageHead(P, F, 'FIXTURE CUT SHEETS', pageNo, TOTAL, DOC_LABEL);
        // header band — ref tag + kind + name
        refTag(P, F, lx, M, 90, f.ref, 24);
        P.tracked(String(f.kind).toUpperCase() + '   ·   ' + String(f.layer || '').toUpperCase() + ' LAYER', M + 36, 92, 7, F.r, COL.MUT, 1.6);
        P.text(trunc(F.b, f.name, 19, A4.w - M * 2 - 90), M + 36, 102, 19, F.b, COL.INK);
        if (f.qty) P.trackedRight(f.qty + ' ×', A4.w - M, 100, 14, F.b, COL.GDEEP, 1);
        var sub = [f.manufacturer, f.range].filter(Boolean).join('  ·  ');
        if (sub) P.text(trunc(F.r, sub, 10, A4.w - M * 2 - 40), M + 36, 128, 10, F.r, COL.INK2);
        var y = 152;
        var isTbc = /^TBC/i.test(f.name);
        // photo box left
        var boxW = 205, boxH = 205;
        var img = imgs[fi];
        if (img) {
          var dw = boxW - 14, dh = img.height * (dw / img.width);
          if (dh > boxH - 14) { dh = boxH - 14; dw = img.width * (dh / img.height); }
          P.rect(M, y, boxW, boxH, [255, 255, 255], 1);
          P.image(img, M + (boxW - dw) / 2, y + (boxH - dh) / 2, dw, dh, 1);
          P.rectB(M, y, boxW, boxH, COL.LINE, 0.8);
        } else {
          P.rect(M, y, boxW, boxH, [238, 234, 226], 1);
          P.rectB(M, y, boxW, boxH, COL.LINE, 0.8);
          P.center(isTbc ? 'SELECTION AT' : (String(f.manufacturer || 'PRODUCT').toUpperCase()), M + boxW / 2, y + boxH / 2 - 12, 9, F.b, COL.MUT, 2);
          P.center(isTbc ? 'DESIGN DEVELOPMENT' : 'IMAGE TO FOLLOW', M + boxW / 2, y + boxH / 2 + 4, 6.5, F.r, COL.MUT, 1.4);
        }
        // spec grid right
        var gx = M + boxW + 24, gw = A4.w - M - gx;
        var rows = [
          ['Output', f.lumens ? f.lumens + ' lm' : null],
          ['Wattage', f.watts ? f.watts + ' W' : null],
          ['Colour temperature', f.cctText],
          ['Colour quality', f.cri ? 'CRI ' + f.cri + '+' : null],
          ['Beam', (f.beams || []).length ? f.beams.join('° / ') + '°' + (f.beamZoom ? '  ·  ' + f.beamZoom : '') : (f.beamZoom || null)],
          ['Ingress protection', f.ip],
          ['Dimming', f.dimmingText],
          ['Voltage', f.voltage ? f.voltage + (String(f.voltage).length < 4 ? ' V' : '') : null],
          ['Finish options', (f.finishes || []).length ? f.finishes.join(' · ') : null]
        ];
        var gb = lx.specRows(P, F, rows, gx, y + 2, gw);
        y += Math.max(boxH, gb - y) + 18;
        // description
        if (f.description && !isTbc) {
          lx.wrap(f.description, F.r, 9, A4.w - M * 2).slice(0, 3).forEach(function (ln) {
            P.text(ln, M, y - 9, 9, F.r, COL.INK2); y += 13;
          });
          y += 8;
        }
        // polar + cone, side by side
        var diagTop = Math.max(y, 420);
        if (!isTbc) {
          polarPlot(P, F, lx, M + 88, diagTop + 8, 74, f.beams);
          coneDiagram(P, F, lx, M + 220, diagTop, 190, 96, (f.beams || [])[Math.floor(((f.beams || []).length - 1) / 2)] || 60, f.lumens, 2.4);
        }
        // used-in strip near the foot
        var uy = A4.h - 158;
        P.tracked('USED IN', M, uy, 6.5, F.r, COL.MUT, 1.5);
        P.hline(M, A4.w - M, uy + 11, COL.GOLD, 0.8, 0.75);
        var usedTxt = (f.usedIn || []).map(function (u) { return u.room + ' ×' + u.qty; }).join('   ·   ') || 'Carried as an allowance';
        lx.wrap(usedTxt, F.r, 8.5, A4.w - M * 2).slice(0, 2).forEach(function (ln, li) {
          P.text(ln, M, uy + 20 + li * 12, 8.5, F.r, COL.INK2);
        });
        if (f.qty) P.trackedRight('TOTAL ' + f.qty, A4.w - M, uy, 6.5, F.b, COL.GDEEP, 1.2);
        // links + appendix note
        var ly = A4.h - 106;
        if (f.url || f.datasheet || f.ies) lineLinks(P, F, lx, M, ly, f);
        if (f.dsMirror) P.right('Manufacturer data sheet appended at the back of this document', A4.w - M, ly, 7.5, F.r, COL.MUT);
        lx.pageFoot(P, F);
      };
    });
  }

  // ── Linear LED ────────────────────────────────────────────────────────────
  function secLed(m, stripImg) {
    if (!m.led || !m.led.totalM) return null;
    var lx = L();
    return function (P, F, pageNo, TOTAL) {
      var M = lx.M, A4 = lx.A4, COL = lx.COL;
      lx.pageHead(P, F, 'LINEAR LED', pageNo, TOTAL, DOC_LABEL);
      var y = lx.sectionHead(P, F, 'CONCEALED LINEAR LIGHT', 'Linear LED, engineered', blurb(m, 'led'));
      y = Math.max(y, 190);
      var s = m.led.strip;
      if (s) {
        refTag(P, F, lx, M, y - 2, 'ST', 18);
        P.text(trunc(F.b, s.name + (s.manufacturer ? '  —  ' + s.manufacturer : ''), 11.5, A4.w - M * 2 - 100), M + 26, y - 6, 11.5, F.b, COL.INK);
        y += 18;
        if (s.spec) { P.text(trunc(F.r, s.spec, 9, A4.w - M * 2 - 26), M + 26, y - 9, 9, F.r, COL.INK2); y += 13; }
        if (s.url || s.datasheet) { lineLinks(P, F, lx, M + 26, y - 6, s); y += 15; }
        if (stripImg) {
          var iw = 120, ih = stripImg.height * (iw / stripImg.width);
          if (ih > 66) { ih = 66; iw = stripImg.width * (ih / stripImg.height); }
          P.rect(A4.w - M - 132, y - 74, 132, 74, [255, 255, 255], 1);
          P.image(stripImg, A4.w - M - 132 + (132 - iw) / 2, y - 74 + (74 - ih) / 2, iw, ih, 1);
          P.rectB(A4.w - M - 132, y - 74, 132, 74, COL.LINE, 0.7);
        }
        y += 10;
      }
      P.tracked('RUNS + DRIVERS', M, y, 6.5, F.r, COL.MUT, 1.5);
      P.trackedRight('DRIVERS SIZED WITH 20% HEADROOM', A4.w - M, y, 6.5, F.r, COL.MUT, 1.2);
      P.hline(M, A4.w - M, y + 11, COL.GOLD, 0.8, 0.75);
      y += 27;
      (m.led.runs || []).slice(0, 16).forEach(function (r, i, arr) {
        P.text(trunc(F.r, r.where, 9.5, 185), M, y - 9, 9.5, F.r, COL.INK2);
        P.right(r.metres + ' m', M + 245, y - 9, 9.5, F.b, COL.INK);
        if (r.load != null) P.right(r.load + ' W', M + 305, y - 9, 9, F.r, COL.INK2);
        if (r.driver) P.text(r.driver + ' driver · ' + (r.loaded || ''), M + 322, y - 9, 9, F.r, COL.INK2);
        P.right(r.feeds > 1 ? 'feed both ends' : 'single feed', A4.w - M, y - 8.5, 7.5, F.r, COL.MUT);
        if (i < arr.length - 1) P.hline(M, A4.w - M, y + 6, COL.LINE, 0.35, 0.5);
        y += 21;
      });
      y += 12;
      P.text('Total ' + m.led.totalM + ' m · 24V constant-voltage · aluminium profile throughout · drivers in accessible positions.', M, y - 4, 9, F.r, COL.MUT);
      lx.pageFoot(P, F);
    };
  }

  // ── Circuits & control — room shown once, short types, orphan-proof ───────
  function circuitPages(m) {
    var lx = L();
    var rows = [];
    (m.circuits || []).forEach(function (f) {
      rows.push({ hdr: f.code, watts: f.rows.reduce(function (s, c) { return s + (c.watts || 0); }, 0), n: f.rows.length });
      var lastRoom = null;
      f.rows.forEach(function (c) {
        rows.push({ c: c, first: c.room !== lastRoom });
        lastRoom = c.room;
      });
    });
    if (!rows.length) return [];
    var pages = [], chunk = [], h = 0;
    rows.forEach(function (row) {
      var need = row.hdr ? 36 : 20;
      if (h + need > 520 && chunk.length) { pages.push(chunk); chunk = []; h = 0; }
      chunk.push(row); h += need;
    });
    if (chunk.length) pages.push(chunk);
    // orphan control — last page keeps at least 5 rows (pull from previous)
    if (pages.length > 1) {
      var last = pages[pages.length - 1], prev = pages[pages.length - 2];
      while (last.length < 5 && prev.length > 8) last.unshift(prev.pop());
    }
    return pages.map(function (pg, pi) {
      return function (P, F, pageNo, TOTAL) {
        var M = lx.M, A4 = lx.A4, COL = lx.COL;
        lx.pageHead(P, F, 'CIRCUITS & CONTROL', pageNo, TOTAL, DOC_LABEL);
        var y;
        if (pi === 0) { y = lx.sectionHead(P, F, 'GROUPED BY ROOM + LAYER', 'Circuits & control', blurb(m, 'circuits')); y = Math.max(y, 184); }
        else { P.tracked('CIRCUITS — CONTINUED', M, 92, 8.5, F.r, COL.GOLD, 2.6); y = 118; }
        // columns: room 108 | circuit 150 | type 66 | control 118 | qty | W
        var xRoom = M, xCct = M + 112, xType = M + 268, xCtl = M + 330, xQty = A4.w - M - 44;
        if (pi === 0) {
          P.tracked('ROOM', xRoom, y, 6, F.r, COL.MUT, 1.2);
          P.tracked('CIRCUIT', xCct, y, 6, F.r, COL.MUT, 1.2);
          P.tracked('TYPE', xType, y, 6, F.r, COL.MUT, 1.2);
          P.tracked('CONTROL', xCtl, y, 6, F.r, COL.MUT, 1.2);
          P.trackedRight('QTY      LOAD', A4.w - M, y, 6, F.r, COL.MUT, 1.2);
          y += 14;
        }
        pg.forEach(function (row) {
          if (row.hdr) {
            y += 6;
            P.tracked(String(row.hdr).toUpperCase(), M, y, 8, F.b, COL.GDEEP, 2.2);
            P.trackedRight(row.n + (row.n === 1 ? ' CIRCUIT' : ' CIRCUITS') + '  ·  ' + row.watts + ' W', A4.w - M, y + 1, 6.5, F.r, COL.MUT, 1.2);
            P.hline(M, A4.w - M, y + 13, COL.GOLD, 0.9, 0.85);
            y += 26;
            return;
          }
          var c = row.c;
          if (row.first) P.text(trunc(F.b, c.room, 8.5, 102), xRoom, y - 8.5, 8.5, F.b, COL.INK);
          P.text(trunc(F.r, c.label, 9, 148), xCct, y - 9, 9, F.r, COL.INK2);
          P.text(trunc(F.r, c.loadType, 7.5, 58), xType, y - 8, 7.5, F.r, COL.MUT);
          P.text(trunc(F.r, c.control, 7.5, 112), xCtl, y - 8, 7.5, F.r, COL.MUT);
          P.right(String(c.qty), xQty, y - 9, 8.5, F.r, COL.INK2);
          P.right(c.watts + ' W', A4.w - M, y - 9, 8.5, F.b, COL.INK);
          P.hline(M, A4.w - M, y + 5.5, COL.LINE, 0.3, 0.5);
          y += 20;
        });
        if (pi === pages.length - 1 && m.circuitTotalW) {
          y += 8;
          P.hline(M, A4.w - M, y - 2, COL.GOLD, 0.9, 0.9);
          P.text('Connected lighting load', M, y + 6, 9.5, F.r, COL.INK2);
          P.right('~' + (Math.round(m.circuitTotalW / 100) / 10) + ' kW', A4.w - M, y + 6, 11, F.b, COL.INK);
        }
        lx.pageFoot(P, F);
      };
    });
  }

  // ── Scenes — dim-level bars per scene ────────────────────────────────────
  function scenePct(sc) {
    var lbl = String(sc.label || '').toLowerCase();
    if (/out|blackout/.test(lbl)) return 0;
    var note = String(sc.note || '');
    var ms = note.match(/(\d{1,3})\s?%/g);
    if (ms && ms.length) return Math.min(100, Math.max.apply(null, ms.map(function (v) { return parseInt(v, 10); }))) / 100;
    if (/bright|clean|100/.test(lbl)) return 1;
    return null;
  }
  function secScenes(m) {
    if ((!m.scenes || !m.scenes.length) && (!m.houseScenes || !m.houseScenes.length)) return null;
    var lx = L();
    return function (P, F, pageNo, TOTAL) {
      var M = lx.M, A4 = lx.A4, COL = lx.COL;
      lx.pageHead(P, F, 'SCENES', pageNo, TOTAL, DOC_LABEL);
      var y = lx.sectionHead(P, F, 'ONE PRESS, THE RIGHT LIGHT', 'Scenes', blurb(m, 'scenes'));
      y = Math.max(y, 186);
      var colW = (A4.w - M * 2 - 28) / 2;
      var houseH = ((m.houseScenes || []).length * 17 + 46);
      var y0 = y, maxY = A4.h - 96 - houseH;
      var colY = [y0, y0];
      (m.scenes || []).slice(0, 8).forEach(function (grp) {
        var need = 25 + grp.seeds.length * 17 + 12;
        var ci = colY[0] <= colY[1] ? 0 : 1;
        if (colY[ci] + need > maxY) { ci = colY[0] <= colY[1] ? 0 : 1; if (colY[ci] + need > maxY) return; }
        var x = M + ci * (colW + 28);
        var gy = colY[ci];
        P.tracked(String(grp.room).toUpperCase(), x, gy, 6.5, F.r, COL.MUT, 1.5);
        P.hline(x, x + colW, gy + 11, COL.GOLD, 0.8, 0.75);
        gy += 26;
        grp.seeds.forEach(function (sc) {
          P.text(sc.label, x, gy - 9, 9, F.b, COL.GDEEP);
          var pct = scenePct(sc);
          if (pct != null) levelBar(P, lx, x + 62, gy - 6.5, 42, 4, pct);
          P.text(trunc(F.r, sc.note || '', 7.5, colW - 118), x + 112, gy - 8, 7.5, F.r, COL.INK2);
          gy += 17;
        });
        colY[ci] = gy + 12;
      });
      var hy = Math.max(colY[0], colY[1]) + 8;
      P.tracked('WHOLE HOUSE', M, hy, 6.5, F.r, COL.MUT, 1.5);
      P.hline(M, A4.w - M, hy + 11, COL.GOLD, 0.8, 0.75);
      hy += 26;
      (m.houseScenes || []).forEach(function (sc) {
        P.text(sc.label, M, hy - 9, 9.5, F.b, COL.GDEEP);
        P.text(trunc(F.r, sc.note || '', 8.5, A4.w - M * 2 - 110), M + 105, hy - 8, 8.5, F.r, COL.INK2);
        hy += 17;
      });
      lx.pageFoot(P, F);
    };
  }

  // ── Indicative budget ─────────────────────────────────────────────────────
  function secBudget(m) {
    if (!m.budget || !m.budget.lines || !m.budget.lines.length) return null;
    var lx = L();
    return function (P, F, pageNo, TOTAL) {
      var M = lx.M, A4 = lx.A4, COL = lx.COL;
      lx.pageHead(P, F, 'INDICATIVE BUDGET', pageNo, TOTAL, DOC_LABEL);
      var y = lx.sectionHead(P, F, 'SUPPLY GUIDE · EX VAT', 'Indicative budget', blurb(m, 'budget'));
      y = Math.max(y, 192);
      P.tracked('ITEM', M, y, 6.5, F.r, COL.MUT, 1.5);
      P.trackedRight('QTY        UNIT        TOTAL', A4.w - M, y, 6.5, F.r, COL.MUT, 1.5);
      P.hline(M, A4.w - M, y + 11, COL.GOLD, 0.8, 0.75);
      y += 27;
      m.budget.lines.forEach(function (l) {
        P.text(trunc(F.r, l.label, 9.5, 290), M, y - 9, 9.5, F.r, COL.INK2);
        P.right(String(l.qty), A4.w - M - 128, y - 9, 9.5, F.r, COL.INK2);
        P.right(lx.money(l.unit), A4.w - M - 64, y - 9, 9.5, F.r, COL.INK2);
        P.right(lx.money(l.total), A4.w - M, y - 9, 9.5, F.b, COL.INK);
        if (l.note) { y += 12; P.text(trunc(F.r, l.note, 7.5, 290), M + 10, y - 9, 7.5, F.r, COL.MUT); }
        P.hline(M, A4.w - M, y + 6, COL.LINE, 0.35, 0.5);
        y += 21;
      });
      y += 6;
      P.hline(M, A4.w - M, y, COL.GOLD, 0.9, 0.9);
      y += 14;
      P.text('Indicative supply total, ex VAT', M, y - 9, 10, F.r, COL.INK2);
      P.right(lx.money(Math.round(m.budget.total)), A4.w - M, y - 10, 13, F.b, COL.INK);
      y += 22;
      if (m.budget.poa) P.text(m.budget.poa + ' specification line(s) priced at quotation. Drivers, control hardware and installation follow on the formal quotation.', M, y - 6, 8.5, F.r, COL.MUT, { maxWidth: A4.w - M * 2 });
      else P.text('Drivers, control hardware and installation follow on the formal quotation.', M, y - 6, 8.5, F.r, COL.MUT);
      lx.pageFoot(P, F);
    };
  }

  // ── The detail ────────────────────────────────────────────────────────────
  function secDetail(m) {
    var lx = L();
    return function (P, F, pageNo, TOTAL) {
      var M = lx.M, A4 = lx.A4, COL = lx.COL;
      lx.pageHead(P, F, 'THE DETAIL', pageNo, TOTAL, DOC_LABEL);
      P.tracked('THE DETAIL', M, 92, 8.5, F.r, COL.GOLD, 2.6);
      var y = 118;
      (m.termsLines || []).forEach(function (t) {
        P.dot(M + 3, y - 3, 2.2, COL.GOLD);
        var lines = lx.wrap(t, F.r, 10.5, A4.w - M * 2 - 18);
        lines.forEach(function (ln, li) { P.text(ln, M + 14, y - 9 + li * 14.5, 10.5, F.r, COL.INK2); });
        y += lines.length * 14.5 + 12;
      });
      if (m.dsAppended) {
        P.dot(M + 3, y - 3, 2.2, COL.GOLD);
        P.text('Manufacturer data sheets for the specified fittings are appended at the back of this document.', M + 14, y - 9, 10.5, F.r, COL.INK2);
        y += 22;
      }
      if (m.quoteRef) {
        P.hline(M, A4.w - M, A4.h - 130, COL.LINE, 0.8);
        P.tracked('PROPOSAL REFERENCE', M, A4.h - 116, 6.5, F.r, COL.MUT, 1.5);
        P.text(m.quoteRef, M, A4.h - 106, 14, F.b, COL.INK);
        P.text('Please quote this reference in any correspondence about this proposal.', M, A4.h - 86, 8.5, F.r, COL.MUT);
        if (m.dateText) P.right(m.dateText, A4.w - M, A4.h - 112, 9.5, F.r, COL.MUT);
      }
      lx.pageFoot(P, F);
    };
  }

  async function generate(m) {
    var lx = L();
    if (!lx) throw new Error('SonorPdfLuxury master not loaded');
    var PL = global.PDFLib;
    var doc = await PL.PDFDocument.create();
    var F = await lx.makeFonts(doc, BASE);

    // cover assets
    var hero = null, cedia = null, fadeImg = null;
    if (m.heroImage) { try { hero = await lx.loadImage(doc, m.heroImage); } catch (e) {} }
    try { cedia = await lx.loadImage(doc, BASE + 'cedia-member-stacked.png'); } catch (e) {}
    try { var fd = lx.fadePngDataUrl(); if (fd) fadeImg = await doc.embedPng(await lx.fetchBytes(fd)); } catch (e) {}

    // product photos (mirrored to the lighting-assets bucket — CORS-open)
    var cutItems = (m.fixtures || []).filter(function (f) { return f.qty || f.name; });
    var cutImgs = [];
    for (var ci = 0; ci < cutItems.length; ci++) {
      var im = null;
      if (cutItems[ci].img) { try { im = await lx.loadImage(doc, cutItems[ci].img); } catch (e) {} }
      cutImgs.push(im);
    }
    var stripImg = null;
    if (m.led && m.led.strip && m.led.strip.img) { try { stripImg = await lx.loadImage(doc, m.led.strip.img); } catch (e) {} }

    // manufacturer data sheets — fetched from the mirror, appended after the pack
    var DS_PAGE_CAP = 3;
    var dsDocs = [];
    if (m.includeDatasheets !== false) {
      for (var di = 0; di < cutItems.length; di++) {
        var f2 = cutItems[di];
        if (!f2.dsMirror) continue;
        try {
          var bytes = await lx.fetchBytes(f2.dsMirror);
          var src = await PL.PDFDocument.load(bytes, { ignoreEncryption: true });
          dsDocs.push({ f: f2, src: src, pages: Math.min(DS_PAGE_CAP, src.getPageCount()) });
        } catch (e) { console.warn('[LightingPdf] data sheet fetch failed for', f2.name, e && e.message); }
      }
    }
    m.dsAppended = dsDocs.length > 0;

    var sections = [{ label: 'Introduction', draw: secIntro(m) },
                    { label: 'Design approach', draw: secApproach(m) }];
    roomPages(m).forEach(function (d, i) { sections.push({ label: i === 0 ? 'Room by room' : null, draw: d }); });
    cutSheetPages(m, cutImgs).forEach(function (d, i) { sections.push({ label: i === 0 ? 'Fixture cut sheets' : null, draw: d }); });
    var led = secLed(m, stripImg); if (led) sections.push({ label: 'Linear LED', draw: led });
    circuitPages(m).forEach(function (d, i) { sections.push({ label: i === 0 ? 'Circuits & control' : null, draw: d }); });
    var sc = secScenes(m); if (sc) sections.push({ label: 'Scenes', draw: sc });
    var bu = secBudget(m); if (bu) sections.push({ label: 'Indicative budget', draw: bu });
    sections.push({ label: 'The detail', draw: secDetail(m) });
    m.sectionList = sections.map(function (s) { return s.label; }).filter(Boolean);
    if (m.dsAppended) m.sectionList.push('Manufacturer data sheets');

    var dsPageCount = dsDocs.reduce(function (s, d) { return s + d.pages; }, 0);
    var TOTAL = sections.length + 1 + dsPageCount;
    var p1 = doc.addPage([lx.A4.w, lx.A4.h]);
    lx.cover(lx.mk(p1, doc), F, {
      hero: hero, fadeImg: fadeImg, cediaImg: cedia,
      eyebrow: DOC_LABEL,
      title: m.title || 'Your Home',
      subtitle: 'by Sonor',
      info: [['PREPARED FOR', m.client || '—'], ['PROJECT', m.project || '—'], ['REFERENCE', m.quoteRef || '—']]
    });
    var failures = 0;
    sections.forEach(function (s, idx) {
      var pg = doc.addPage([lx.A4.w, lx.A4.h]);
      try {
        s.draw(lx.mk(pg, doc), F, idx + 2, TOTAL);
      } catch (e) {
        failures++;
        console.error('[LightingPdf] page ' + (idx + 2) + ' failed:', e);
        try {
          var P = lx.mk(pg, doc);
          P.text('Page render issue — see console. The rest of the document is unharmed.', lx.M, 120, 11, F.r, lx.COL.MUT);
        } catch (e2) {}
      }
    });
    // appendix — manufacturer data sheets, stamped per page
    var pageNo = sections.length + 2;
    for (var dd = 0; dd < dsDocs.length; dd++) {
      var d = dsDocs[dd];
      try {
        var idxs = [];
        for (var pi2 = 0; pi2 < d.pages; pi2++) idxs.push(pi2);
        var copied = await doc.copyPages(d.src, idxs);
        for (var cp = 0; cp < copied.length; cp++) {
          var apg = doc.addPage(copied[cp]);
          try {
            var sz = apg.getSize();
            apg.drawRectangle({ x: 0, y: 0, width: sz.width, height: 16, color: lx.col([20, 17, 12]), opacity: 0.92 });
            apg.drawText('APPENDIX  ·  ' + String(d.f.ref) + '  ' + String(d.f.name).toUpperCase().slice(0, 48) + '  ·  MANUFACTURER DATA SHEET', { x: 12, y: 5, size: 6.5, font: F.r, color: lx.col([200, 180, 142]) });
            var pnTxt = pageNo + ' / ' + TOTAL;
            apg.drawText(pnTxt, { x: sz.width - 12 - F.r.widthOfTextAtSize(pnTxt, 6.5), y: 5, size: 6.5, font: F.r, color: lx.col([170, 160, 140]) });
          } catch (e3) {}
          pageNo++;
        }
      } catch (e) { console.warn('[LightingPdf] append failed for', d.f.name, e && e.message); }
    }
    if (failures) console.warn('[LightingPdf] ' + failures + ' page(s) failed — placeholders rendered');

    var bytes2 = await doc.save();
    var blob = new Blob([bytes2], { type: 'application/pdf' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = m.filename || 'sonor-lighting-design-proposal.pdf';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    return true;
  }

  global.LightingPdf = {
    generate: generate,
    available: function () { return !!(global.PDFLib && global.PDFLib.PDFDocument && global.SonorPdfLuxury); }
  };
})(window);
