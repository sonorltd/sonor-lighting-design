/* Sonor Lighting Design — LIGHTING DESIGN PROPOSAL (v0.1.0)
   LightingPdf.generate(model) — the client-facing lighting design document,
   built ENTIRELY on the shared SonorPdfLuxury chrome (data/sonor-pdf-luxury.js,
   root master — the exact seating/cinema proposal system, so every Sonor
   client document stays in sync when the style evolves).
   Sections (data-driven, empty sections dropped):
   Cover · Introduction · Design approach · Room-by-room · Fixture specification ·
   Linear LED · Circuits & control · Scenes · Indicative budget · The detail.
   cinema-pdf-luxury rules honoured: frame-edge, divider discipline,
   truncate-vs-wrap, Gilroy ff-ligature ban (model is deepSafe'd upstream;
   every static string in this file is written ligature-safe).
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
    if (links && links.datasheet) { cx += P.link('Datasheet', cx, y, 7.5, F.r, lx.COL.GDEEP, links.datasheet) + 16; drawn++; }
    if (links && links.ies) { cx += P.link('Photometry (IES)', cx, y, 7.5, F.r, lx.COL.GDEEP, links.ies) + 16; drawn++; }
    return drawn;
  }
  function blurb(m, key) { return (m.blurbs || {})[key] || ''; }

  // ── Introduction ──────────────────────────────────────────────────────────
  function secIntro(m) {
    var lx = L();
    return function (P, F, pageNo, TOTAL) {
      lx.pageHead(P, F, 'INTRODUCTION', pageNo, TOTAL, DOC_LABEL);
      var y = lx.sectionHead(P, F, 'WHOLE-HOME LIGHTING', m.title || 'Your home', m.introText);
      y = Math.max(y, 186);
      var colW = 236;
      var stats = (m.stats || []);
      var rows1 = stats.slice(0, 3), rows2 = stats.slice(3, 6);
      var b1 = lx.specRows(P, F, rows1, lx.M, y, colW);
      var b2 = lx.specRows(P, F, rows2, lx.M + colW + 28, y, colW);
      var dy = Math.max(b1, b2) + 26;
      P.tracked('IN THIS PROPOSAL', lx.M, dy, 6.5, F.r, lx.COL.MUT, 1.5);
      P.hline(lx.M, lx.A4.w - lx.M, dy + 11, lx.COL.GOLD, 0.8, 0.75);
      var iy = dy + 27;
      (m.sectionList || []).forEach(function (s) {
        P.dot(lx.M + 3, iy - 4, 2.2, lx.COL.GOLD);
        P.text(s, lx.M + 14, iy - 9, 10.5, F.r, lx.COL.INK);
        iy += 19;
      });
      lx.pageFoot(P, F);
    };
  }

  // ── Design approach — layered light + colour strategy ─────────────────────
  function secApproach(m) {
    var lx = L();
    return function (P, F, pageNo, TOTAL) {
      var M = lx.M, A4 = lx.A4, COL = lx.COL;
      lx.pageHead(P, F, 'DESIGN APPROACH', pageNo, TOTAL, DOC_LABEL);
      var y = lx.sectionHead(P, F, 'LAYERED · WARM · DIMMABLE', 'The design approach', blurb(m, 'approach'));
      y = Math.max(y, 190);
      P.tracked('THE THREE LAYERS', M, y, 6.5, F.r, COL.MUT, 1.5);
      P.hline(M, A4.w - M, y + 11, COL.GOLD, 0.8, 0.75);
      y += 27;
      (m.layers || []).forEach(function (l, i, arr) {
        P.dot(M + 3, y - 4, 2.2, COL.GOLD);
        P.text(l.label, M + 14, y - 9, 11.5, F.b, COL.INK);
        P.text(l.note || '', M + 110, y - 8, 10, F.r, COL.INK2, { maxWidth: A4.w - M * 2 - 118 });
        if (i < arr.length - 1) P.hline(M, A4.w - M, y + 8, COL.LINE, 0.5, 0.6);
        y += 24;
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

  // ── Room-by-room — per floor, chunked across pages ────────────────────────
  function roomPages(m) {
    var lx = L();
    // flatten to drawable row groups: floor headers + room rows
    var rows = [];
    (m.floors || []).forEach(function (f) {
      if (!f.rooms || !f.rooms.length) return;
      rows.push({ hdr: f.code });
      f.rooms.forEach(function (r) { rows.push({ r: r }); });
    });
    if (!rows.length) return [];
    var pages = [], chunk = [];
    var budgetH = 0;
    rows.forEach(function (row) {
      var need = row.hdr ? 34 : 26;
      if (budgetH + need > 520 && chunk.length) { pages.push(chunk); chunk = []; budgetH = 0; }
      chunk.push(row); budgetH += need;
    });
    if (chunk.length) pages.push(chunk);
    return pages.map(function (pg, pi) {
      return function (P, F, pageNo, TOTAL) {
        var M = lx.M, A4 = lx.A4, COL = lx.COL;
        lx.pageHead(P, F, 'ROOM BY ROOM', pageNo, TOTAL, DOC_LABEL);
        var y;
        if (pi === 0) { y = lx.sectionHead(P, F, 'DESIGN TARGETS', 'Room by room', blurb(m, 'rooms')); y = Math.max(y, 188); }
        else { P.tracked('ROOM BY ROOM — CONTINUED', M, 92, 8.5, F.r, COL.GOLD, 2.6); y = 118; }
        pg.forEach(function (row) {
          if (row.hdr) {
            y += 8;
            P.tracked(String(row.hdr).toUpperCase(), M, y, 7.5, F.b, COL.GDEEP, 2);
            P.hline(M, A4.w - M, y + 12, COL.GOLD, 0.8, 0.75);
            y += 26;
            return;
          }
          var r = row.r;
          P.text(trunc(F.b, r.name, 10.5, 150), M, y - 9, 10.5, F.b, COL.INK);
          P.text(trunc(F.r, r.typeLabel || '', 8, 78), M + 158, y - 7, 8, F.r, COL.MUT);
          P.text(trunc(F.r, r.summary || '', 8.5, 180), M + 240, y - 7.5, 8.5, F.r, COL.INK2);
          var lvl = (r.target ? r.target + ' lx target' : '—') + (r.achieved != null ? '  ·  ~' + r.achieved + ' lx' : '');
          P.right(lvl, A4.w - M, y - 8, 8.5, F.r, r.achieved != null && r.target && r.achieved < r.target * 0.85 ? [176, 108, 60] : COL.MUT);
          P.hline(M, A4.w - M, y + 8, COL.LINE, 0.4, 0.5);
          y += 26;
        });
        P.text('Achieved levels: lumen-method estimate, downlight layer only — linear + accent layers add on top.' + (m.luxAssumed ? ' Output assumed 450 lm until library data lands.' : ''), M, lx.A4.h - 100, 8, F.r, COL.MUT, { maxWidth: lx.A4.w - M * 2, lineHeight: 11 });
        lx.pageFoot(P, F);
      };
    });
  }

  // ── Fixture specification — WeQuote-style lines with links ────────────────
  function fixturePages(m) {
    var lx = L();
    var items = (m.fixtures || []).filter(function (f) { return f.qty || f.name; });
    if (!items.length) return [];
    var per = 6, pages = [];
    for (var i = 0; i < items.length; i += per) pages.push(items.slice(i, i + per));
    return pages.map(function (pg, pi) {
      return function (P, F, pageNo, TOTAL) {
        var M = lx.M, A4 = lx.A4, COL = lx.COL;
        lx.pageHead(P, F, 'FIXTURE SPECIFICATION', pageNo, TOTAL, DOC_LABEL);
        var y;
        if (pi === 0) { y = lx.sectionHead(P, F, 'THE SPECIFIED FITTINGS', 'Fixture specification', blurb(m, 'fixtures')); y = Math.max(y, 190); }
        else { P.tracked('FIXTURE SPECIFICATION — CONTINUED', M, 92, 8.5, F.r, COL.GOLD, 2.6); y = 122; }
        pg.forEach(function (f, i, arr) {
          P.tracked(String(f.kind).toUpperCase() + '  ·  ' + String(f.layer || '').toUpperCase() + ' LAYER', M, y, 6.5, F.r, COL.MUT, 1.5);
          if (f.qty) P.trackedRight(f.qty + ' ×', A4.w - M, y - 1, 8.5, F.b, COL.GDEEP, 1);
          y += 13;
          P.text(trunc(F.b, f.name + (f.manufacturer ? '  —  ' + f.manufacturer : ''), 12, A4.w - M * 2 - 20), M, y - 9, 12, F.b, COL.INK);
          y += 16;
          if (f.spec) { P.text(trunc(F.r, f.spec, 9, A4.w - M * 2 - 10), M, y - 9, 9, F.r, COL.INK2); y += 13; }
          if (f.url || f.datasheet || f.ies) { lineLinks(P, F, lx, M, y - 6, f); y += 13; }
          if (i < arr.length - 1) { P.hline(M, A4.w - M, y + 2, COL.LINE, 0.5, 0.6); y += 18; }
        });
        lx.pageFoot(P, F);
      };
    });
  }

  // ── Linear LED — strip spec + engineered runs + drivers ───────────────────
  function secLed(m) {
    if (!m.led || !m.led.totalM) return null;
    var lx = L();
    return function (P, F, pageNo, TOTAL) {
      var M = lx.M, A4 = lx.A4, COL = lx.COL;
      lx.pageHead(P, F, 'LINEAR LED', pageNo, TOTAL, DOC_LABEL);
      var y = lx.sectionHead(P, F, 'CONCEALED LINEAR LIGHT', 'Linear LED, engineered', blurb(m, 'led'));
      y = Math.max(y, 190);
      var s = m.led.strip;
      if (s) {
        P.tracked('HOUSE STRIP SPECIFICATION', M, y, 6.5, F.r, COL.MUT, 1.5);
        P.hline(M, A4.w - M, y + 11, COL.GOLD, 0.8, 0.75);
        y += 26;
        P.text(trunc(F.b, s.name + (s.manufacturer ? '  —  ' + s.manufacturer : ''), 12, A4.w - M * 2), M, y - 9, 12, F.b, COL.INK);
        y += 16;
        if (s.spec) { P.text(trunc(F.r, s.spec, 9, A4.w - M * 2), M, y - 9, 9, F.r, COL.INK2); y += 13; }
        if (s.url || s.datasheet) { lineLinks(P, F, lx, M, y - 6, s); y += 15; }
        y += 8;
      }
      P.tracked('RUNS + DRIVERS  ·  80% HEADROOM RULE', M, y, 6.5, F.r, COL.MUT, 1.5);
      P.hline(M, A4.w - M, y + 11, COL.GOLD, 0.8, 0.75);
      y += 27;
      (m.led.runs || []).slice(0, 16).forEach(function (r, i, arr) {
        P.text(trunc(F.r, r.where, 9.5, 190), M, y - 9, 9.5, F.r, COL.INK2);
        P.text(r.metres + ' m', M + 205, y - 9, 9.5, F.b, COL.INK);
        if (r.load != null) P.text(r.load + ' W', M + 260, y - 9, 9.5, F.r, COL.INK2);
        if (r.driver) P.text(r.driver + ' driver · ' + (r.loaded || ''), M + 320, y - 9, 9.5, F.r, COL.INK2);
        P.right(r.feeds > 1 ? 'feed both ends' : 'single feed', A4.w - M, y - 9, 8, F.r, COL.MUT);
        if (i < arr.length - 1) P.hline(M, A4.w - M, y + 6, COL.LINE, 0.4, 0.5);
        y += 21;
      });
      y += 12;
      P.text('Total ' + m.led.totalM + ' m · 24V constant-voltage · aluminium profile throughout · drivers in accessible positions.', M, y - 4, 9, F.r, COL.MUT);
      lx.pageFoot(P, F);
    };
  }

  // ── Circuits & control — per floor, chunked ───────────────────────────────
  function circuitPages(m) {
    var lx = L();
    var rows = [];
    (m.circuits || []).forEach(function (f) {
      rows.push({ hdr: f.code });
      f.rows.forEach(function (c) { rows.push({ c: c }); });
    });
    if (!rows.length) return [];
    var pages = [], chunk = [], h = 0;
    rows.forEach(function (row) {
      var need = row.hdr ? 34 : 22;
      if (h + need > 520 && chunk.length) { pages.push(chunk); chunk = []; h = 0; }
      chunk.push(row); h += need;
    });
    if (chunk.length) pages.push(chunk);
    return pages.map(function (pg, pi) {
      return function (P, F, pageNo, TOTAL) {
        var M = lx.M, A4 = lx.A4, COL = lx.COL;
        lx.pageHead(P, F, 'CIRCUITS & CONTROL', pageNo, TOTAL, DOC_LABEL);
        var y;
        if (pi === 0) { y = lx.sectionHead(P, F, 'GROUPED BY ROOM + LAYER', 'Circuits & control', blurb(m, 'circuits')); y = Math.max(y, 188); }
        else { P.tracked('CIRCUITS — CONTINUED', M, 92, 8.5, F.r, COL.GOLD, 2.6); y = 118; }
        pg.forEach(function (row) {
          if (row.hdr) {
            y += 8;
            P.tracked(String(row.hdr).toUpperCase(), M, y, 7.5, F.b, COL.GDEEP, 2);
            P.hline(M, A4.w - M, y + 12, COL.GOLD, 0.8, 0.75);
            y += 26;
            return;
          }
          var c = row.c;
          P.text(trunc(F.r, c.room, 9, 105), M, y - 9, 9, F.r, COL.MUT);
          P.text(trunc(F.b, c.label, 9.5, 165), M + 112, y - 9, 9.5, F.b, COL.INK);
          P.text(trunc(F.r, c.loadType, 8, 92), M + 285, y - 8, 8, F.r, COL.MUT);
          P.text(c.qty + ' ×', M + 382, y - 9, 9, F.r, COL.INK2);
          P.right(c.watts + ' W', A4.w - M - 0, y - 9, 9, F.r, COL.INK2);
          P.hline(M, A4.w - M, y + 6, COL.LINE, 0.4, 0.5);
          y += 22;
        });
        if (pi === pages.length - 1 && m.circuitTotalW) {
          y += 8;
          P.hline(M, A4.w - M, y - 2, COL.GOLD, 0.8, 0.8);
          P.text('Connected lighting load', M, y + 6, 9.5, F.r, COL.INK2);
          P.right('~' + (Math.round(m.circuitTotalW / 100) / 10) + ' kW', A4.w - M, y + 6, 10.5, F.b, COL.INK);
        }
        lx.pageFoot(P, F);
      };
    });
  }

  // ── Scenes ────────────────────────────────────────────────────────────────
  function secScenes(m) {
    if ((!m.scenes || !m.scenes.length) && (!m.houseScenes || !m.houseScenes.length)) return null;
    var lx = L();
    return function (P, F, pageNo, TOTAL) {
      var M = lx.M, A4 = lx.A4, COL = lx.COL;
      lx.pageHead(P, F, 'SCENES', pageNo, TOTAL, DOC_LABEL);
      var y = lx.sectionHead(P, F, 'ONE PRESS, THE RIGHT LIGHT', 'Scenes', blurb(m, 'scenes'));
      y = Math.max(y, 188);
      var colW = (A4.w - M * 2 - 28) / 2;
      var houseH = ((m.houseScenes || []).length * 16 + 44);
      var y0 = y, maxY = A4.h - 96 - houseH;   // keep clear space for the whole-house block
      var colY = [y0, y0];                     // per-column cursors — overlap-proof
      (m.scenes || []).slice(0, 8).forEach(function (grp) {
        var need = 25 + grp.seeds.length * 15 + 12;
        var ci = colY[0] <= colY[1] ? 0 : 1;   // shortest column takes the next group
        if (colY[ci] + need > maxY) { ci = colY[0] <= colY[1] ? 0 : 1; if (colY[ci] + need > maxY) return; }
        var x = M + ci * (colW + 28);
        var gy = colY[ci];
        P.tracked(String(grp.room).toUpperCase(), x, gy, 6.5, F.r, COL.MUT, 1.5);
        P.hline(x, x + colW, gy + 11, COL.GOLD, 0.8, 0.75);
        gy += 25;
        grp.seeds.forEach(function (sc) {
          P.text(sc.label, x, gy - 9, 9.5, F.b, COL.GDEEP);
          P.text(trunc(F.r, sc.note || '', 8, colW - 78), x + 74, gy - 8, 8, F.r, COL.INK2);
          gy += 15;
        });
        colY[ci] = gy + 12;
      });
      // whole house — full width BELOW both columns, never overlapping
      var hy = Math.max(colY[0], colY[1]) + 8;
      P.tracked('WHOLE HOUSE', M, hy, 6.5, F.r, COL.MUT, 1.5);
      P.hline(M, A4.w - M, hy + 11, COL.GOLD, 0.8, 0.75);
      hy += 26;
      (m.houseScenes || []).forEach(function (sc) {
        P.text(sc.label, M, hy - 9, 9.5, F.b, COL.GDEEP);
        P.text(trunc(F.r, sc.note || '', 8.5, A4.w - M * 2 - 110), M + 105, hy - 8, 8.5, F.r, COL.INK2);
        hy += 16;
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
      P.trackedRight('QTY   ·   UNIT   ·   TOTAL', A4.w - M, y, 6.5, F.r, COL.MUT, 1.5);
      P.hline(M, A4.w - M, y + 11, COL.GOLD, 0.8, 0.75);
      y += 27;
      m.budget.lines.forEach(function (l) {
        P.text(trunc(F.r, l.label, 9.5, 300), M, y - 9, 9.5, F.r, COL.INK2);
        P.right(l.qty + '  ×  ' + lx.money(l.unit) + '     ' + lx.money(l.total), A4.w - M, y - 9, 9.5, F.b, COL.INK);
        if (l.note) { y += 12; P.text(trunc(F.r, l.note, 7.5, 300), M + 10, y - 9, 7.5, F.r, COL.MUT); }
        P.hline(M, A4.w - M, y + 6, COL.LINE, 0.4, 0.5);
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

    // cover assets — hero optional (no lighting hero curated yet → dark cover)
    var hero = null, cedia = null, fadeImg = null;
    if (m.heroImage) { try { hero = await lx.loadImage(doc, m.heroImage); } catch (e) {} }
    try { cedia = await lx.loadImage(doc, BASE + 'cedia-member-stacked.png'); } catch (e) {}
    try { var fd = lx.fadePngDataUrl(); if (fd) fadeImg = await doc.embedPng(await lx.fetchBytes(fd)); } catch (e) {}

    var sections = [{ label: 'Introduction', draw: secIntro(m) },
                    { label: 'Design approach', draw: secApproach(m) }];
    roomPages(m).forEach(function (d, i) { sections.push({ label: i === 0 ? 'Room by room' : null, draw: d }); });
    fixturePages(m).forEach(function (d, i) { sections.push({ label: i === 0 ? 'Fixture specification' : null, draw: d }); });
    var led = secLed(m); if (led) sections.push({ label: 'Linear LED', draw: led });
    circuitPages(m).forEach(function (d, i) { sections.push({ label: i === 0 ? 'Circuits & control' : null, draw: d }); });
    var sc = secScenes(m); if (sc) sections.push({ label: 'Scenes', draw: sc });
    var bu = secBudget(m); if (bu) sections.push({ label: 'Indicative budget', draw: bu });
    sections.push({ label: 'The detail', draw: secDetail(m) });
    m.sectionList = sections.map(function (s) { return s.label; }).filter(Boolean);

    var TOTAL = sections.length + 1;
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
    if (failures) console.warn('[LightingPdf] ' + failures + ' page(s) failed — placeholders rendered');

    var bytes = await doc.save();
    var blob = new Blob([bytes], { type: 'application/pdf' });
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
