/* Sonor Lighting Design — wizard UI (v0.1.0)
   LightingApp — clones the Cinema Aesthetic app pattern (AestheticApp):
   Intro → Plan → Fixtures → LED & Drivers → Circuits & Scenes → Summary.
   The PLAN derives live from Takeoffs (takeoffs_floors.content.symbols,
   service 04 + LED runs) — Takeoffs owns geometry; this app owns the lighting
   SPECIFICATION (products, levels, circuits, scenes) and publishes it as
   projects.metadata.lighting_spec (single writer, atomic RPC merge).
   Writes ONLY lighting_configs. Client-build gate: window.__LIGHTING_CLIENT__.
*/
(function (global) {
  'use strict';

  var CFG = global.__LIGHTING_CONFIG__ || {};
  var E = null;                      // SonorLightingLib
  var C = null;                      // SonorLightingCalc
  var STEPS = CFG.steps || ['Plan', 'Fixtures', 'LED & Drivers', 'Circuits & Scenes', 'Summary'];
  var CLIENT = !!global.__LIGHTING_CLIENT__;

  var cfg = {
    step: 1,
    rooms: [],                       // [{id,floorCode,name,type,area,ceilingH,counts:{},keypads,lcMix:{dimmed,switched},ledRuns:[{label,metres}],source}]
    picks: {},                       // fixtureKindId -> lighting_items id
    cct: 2700,                       // house CCT lead
    dimToWarm: false,
    scope: 'full',                   // v0.3.0 — 'full' (fittings by Sonor) | 'others' (fittings by others; circuits + control by Sonor)
    led: { stripId: null, profileId: null },
    control: { system: 'rako', notes: '' },
    keypads: { finishDefault: 'matt-white', rooms: {} },   // v0.3.0 — roomId -> {finish,buttons,engravings[],location}
    sceneNotes: {},                  // roomTypeId -> free text override note
    client: { name: '', project: '' },
    projectId: null,
    _savedId: null,
    _savedLabel: null,
    _lastRef: null,
    _planPulledAt: null
  };
  var ctx = { floors: null, areas: null, brief: null, spec: null };
  var _rid = 1;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function dbc() { try { return (global.__LIGHTING_DB__ && global.__LIGHTING_DB__.client) || (global.db && global.db.client) || null; } catch (e) { return null; } }
  function roomType(id) { return (CFG.roomTypes || []).find(function (t) { return t.id === id; }) || null; }
  function kindDef(id) { return (CFG.fixtureKinds || []).find(function (k) { return k.id === id; }) || null; }

  // ── boot ─────────────────────────────────────────────────────────────────
  async function boot() {
    E = global.SonorLightingLib;
    C = global.SonorLightingCalc;
    await E.load();
    var note = $('sourceNote');
    if (note) {
      var s = E.source;
      note.textContent = (s === 'supabase' ? 'Live library' : s === 'cache' ? 'Cached library' : s === 'seed' ? 'Offline snapshot' : 'No data') + ' · v' + (CFG.version || '?');
      note.className = 'src-note src-' + s;
    }
    seedDefaults();
    renderStep();
    if (!CLIENT) initProjectBar();
    bootDeepLink();
    try { global.SonorShell && global.SonorShell.selfTest && global.SonorShell.selfTest(); } catch (e) {}
  }

  function firstOf(cats, pref) {
    var items = E.byCategory(cats);
    if (pref) { var hit = items.find(function (it) { return it.supplier === pref; }); if (hit) return hit; }
    return items[0] || null;
  }
  function seedDefaults() {
    (CFG.fixtureKinds || []).forEach(function (k) {
      if (k.noSeed) return;   // v0.5.0 — garden kinds surface only once counted on the plan
      if (!cfg.picks[k.id] && k.cats && k.cats.length) {
        var it = firstOf(k.cats, k.id === 'downlight' ? 'duragreen' : null);
        if (it) cfg.picks[k.id] = it.id;
      }
    });
    if (!cfg.led.stripId) { var st = E.byGroup('strip').find(function (it) { return (it.cri || 0) >= 90 && String(it.voltage) === '24'; }) || E.byGroup('strip')[0]; if (st) cfg.led.stripId = st.id; }
    if (!cfg.led.profileId) { var pr = E.byGroup('profile')[0]; if (pr) cfg.led.profileId = pr.id; }
  }

  // ── wizard nav ───────────────────────────────────────────────────────────
  function enter() { $('intro').style.display = 'none'; $('wizard').style.display = 'flex'; cfg.step = 1; renderStep(); }
  function backToIntro() { $('wizard').style.display = 'none'; $('intro').style.display = 'block'; }
  function goBack() { if (cfg.step > 1) { cfg.step--; renderStep(); } }
  function goNext() { if (cfg.step < STEPS.length) { cfg.step++; renderStep(); } }
  function jumpTo(n) { if (n < cfg.step) { cfg.step = n; renderStep(); } }
  function jumpRefresh() { renderStep(); }

  function renderStep() {
    var pills = $('stepPills');
    if (pills) pills.innerHTML = STEPS.map(function (s, i) {
      var n = i + 1, cls = n === cfg.step ? 'pill active' : n < cfg.step ? 'pill done' : 'pill';
      return '<span class="' + cls + '" onclick="LightingApp.jumpTo(' + n + ')"><span class="pn">' + n + '</span>' + s + '</span>' + (n < STEPS.length ? '<span class="parr">›</span>' : '');
    }).join('');
    var back = $('btnBack'); if (back) back.style.visibility = cfg.step > 1 ? 'visible' : 'hidden';
    var next = $('btnNext');
    if (next) {
      next.disabled = false;
      next.textContent = cfg.step === STEPS.length ? 'Download proposal ↓' : 'Continue →';
      next.onclick = cfg.step === STEPS.length ? savePdf : goNext;
    }
    var body = $('stepBody'); if (!body) return;
    body.innerHTML = [renderPlan, renderFixtures, renderLed, renderCircuits, renderSummary][cfg.step - 1]();
  }

  // ── PLAN — derive rooms from the Takeoffs fixture plan ───────────────────
  function classifyBlock(sym) {
    var bc = String(sym.block_code || ''), lbl = String(sym.label || '');
    var kinds = CFG.fixtureKinds || [];
    for (var i = 0; i < kinds.length; i++) {
      if ((kinds[i].blockCodes || []).indexOf(bc) >= 0) return kinds[i].id;
    }
    for (var j = 0; j < kinds.length; j++) {
      if (kinds[j].blockMatch && (kinds[j].blockMatch.test(bc) || kinds[j].blockMatch.test(lbl))) return kinds[j].id;
    }
    return null;
  }
  function isKeypad(sym) {
    var kb = CFG.keypadBlocks || {};
    return (kb.codes || []).indexOf(sym.block_code) >= 0 || (kb.match && (kb.match.test(sym.block_code || '') || kb.match.test(sym.label || '')));
  }
  function isEst(sym) {
    var eb = CFG.estBlocks || {};
    return (eb.codes || []).indexOf(sym.block_code) >= 0 || (eb.match && eb.match.test(sym.block_code || ''));
  }
  function guessType(name) {
    var n = String(name || '').toLowerCase();
    var map = [
      [/kitchen|pantry/, 'kitchen'], [/lounge|living|snug|sitting|family/, 'living'],
      [/dining/, 'dining'], [/bed|master|guest/, 'bedroom'],
      [/en.?suite/, 'ensuite'], [/bath|shower/, 'bathroom'], [/wc|cloak|powder/, 'wc'],
      [/hall|entrance|lobby|boot/, 'hall'], [/landing/, 'landing'], [/stair/, 'stairs'],
      [/office|study/, 'office'], [/utility|laundry/, 'utility'],
      [/garage|plant|store/, 'garage'], [/cinema|media/, 'cinema'], [/gym/, 'gym'],
      [/dressing|wardrobe/, 'dressing'], [/wine|cellar/, 'wine'],
      [/garden|terrace|patio|drive|exterior|ext\b|outside/, 'exterior']
    ];
    for (var i = 0; i < map.length; i++) if (map[i][0].test(n)) return map[i][1];
    return 'living';
  }
  function newRoom(floorCode, name, type) {
    var t = roomType(type || guessType(name)) || {};
    return {
      id: 'r' + (_rid++), floorCode: floorCode || 'GF', name: name || 'Room',
      type: t.id || 'living', area: t.areaDefault || 15,
      ceilingH: (CFG.calc || {}).ceilingDefaultM || 2.4,
      counts: {}, keypads: 0, lcMix: { dimmed: 0, switched: 0 },
      ledRuns: [], source: 'manual'
    };
  }
  async function pullPlan() {
    var db = dbc();
    if (!db || !cfg.projectId) { renderStep(); return; }
    try {
      var res = await db.from('takeoffs_floors').select('floor_id,code,name,content').eq('project_id', cfg.projectId).order('seq');
      var floors = res.data || [];
      ctx.floors = floors.map(function (f) { return { code: f.code, name: f.name }; });
      var byKey = {};
      var areas = [];
      floors.forEach(function (f) {
        var content = f.content || {};
        (content.areas || []).forEach(function (a) { if (a && a.name) areas.push({ floorCode: f.code, name: a.name }); });
        var addTo = function (floorCode, roomName) {
          var key = floorCode + '|' + roomName;
          if (!byKey[key]) { byKey[key] = newRoom(floorCode, roomName); byKey[key].source = 'takeoff'; }
          return byKey[key];
        };
        (content.symbols || []).forEach(function (s) {
          var sym = (s && s.sonorSymbol) || {};
          if (String(sym.service_nn) !== '04') return;
          var ai = sym.autoId || {};
          var room = addTo(ai.floorCode || f.code || 'GF', ai.roomName || 'Unassigned');
          if (isKeypad(sym)) { room.keypads++; return; }
          if (isEst(sym)) {
            var mix = sym.lightMix || [];
            mix.forEach(function (mx) {
              if (/dim/i.test(mx.type)) room.lcMix.dimmed += Number(mx.count) || 0;
              else room.lcMix.switched += Number(mx.count) || 0;
            });
            if (!mix.length && sym.lightCount) room.lcMix.dimmed += Number(sym.lightCount) || 0;
            return;
          }
          var kind = classifyBlock(sym);
          if (kind) room.counts[kind] = (room.counts[kind] || 0) + 1;
        });
        var takeLed = function (m) {
          if (!m || m.kind !== 'led') return;
          var ai = m.autoId || {};
          var room = addTo(ai.floorCode || f.code || 'GF', ai.roomName || 'Unassigned');
          room.ledRuns.push({ label: ai.id || m.cableLabel || 'LED run', metres: Math.round((Number(m.metres) || 0) * 10) / 10 });
        };
        (content.lengths || []).forEach(takeLed);
        (content.leds || []).forEach(takeLed);
      });
      ctx.areas = areas;
      var pulled = Object.keys(byKey).map(function (k) { return byKey[k]; })
        .filter(function (r) { return Object.keys(r.counts).length || r.ledRuns.length || r.lcMix.dimmed || r.lcMix.switched || r.keypads; });
      if (pulled.length) {
        var manual = cfg.rooms.filter(function (r) { return r.source === 'manual'; });
        cfg.rooms = pulled.concat(manual);
        cfg._planPulledAt = new Date().toISOString();
      }
    } catch (e) { console.warn('[lighting] pullPlan failed', e); }
    renderStep();
  }

  function totalsAcross() {
    var t = { fixtures: 0, byKind: {}, ledM: 0, keypads: 0, dimmed: 0, switched: 0 };
    cfg.rooms.forEach(function (r) {
      Object.keys(r.counts || {}).forEach(function (k) {
        t.byKind[k] = (t.byKind[k] || 0) + r.counts[k];
        t.fixtures += r.counts[k];
      });
      (r.ledRuns || []).forEach(function (l) { t.ledM += Number(l.metres) || 0; });
      t.keypads += r.keypads || 0;
      t.dimmed += (r.lcMix || {}).dimmed || 0;
      t.switched += (r.lcMix || {}).switched || 0;
    });
    t.ledM = Math.round(t.ledM * 10) / 10;
    return t;
  }

  function floorsInUse() {
    var codes = {};
    cfg.rooms.forEach(function (r) { codes[r.floorCode || 'GF'] = 1; });
    return C.sortFloors(Object.keys(codes));
  }
  function roomsOfFloor(fc) { return cfg.rooms.filter(function (r) { return (r.floorCode || 'GF') === fc; }); }

  var PLAN_KINDS = ['downlight', 'pendant', 'wall', 'spot', 'picture', 'lamp5a', 'cabinet', 'lowlevel', 'exterior', 'path', 'ingrade', 'moonlight'];
  function renderPlan() {
    var t = totalsAcross();
    var h = '<div class="lead"><h2>The fixture plan.</h2><p>Pulled straight from the Takeoffs lighting layer for the active project — counts per room, LED runs and circuit estimates. Adjust anything; add rooms the plan does not cover yet. Takeoffs stays the owner of the drawing.</p></div>';
    // v0.3.0 — overall scope: who supplies + installs the fittings
    h += '<div class="panel" style="margin-bottom:14px"><div class="ptt">Scope <span class="opt-tag">· who supplies + installs the light fittings</span></div><div class="mat-grid">';
    (CFG.scopeModes || []).forEach(function (s) {
      var on = cfg.scope === s.id;
      h += '<button class="mcard' + (on ? ' on' : '') + '" onclick="LightingApp.setScope(\'' + s.id + '\')"><div class="mc-name">' + esc(s.label) + '</div><div class="mc-price" style="font-size:10.5px;line-height:1.45">' + esc(s.note) + '</div></button>';
    });
    h += '</div>' + (cfg.scope === 'others' ? '<div class="hint" style="margin-top:8px">Fittings-by-others: the proposal drops cut sheets, data sheets and fixture pricing — it delivers the room targets, circuit schedule, keypad specification and scenes.</div>' : '') + '</div>';
    h += '<div class="panel" style="margin-bottom:14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">' +
      '<button class="btn ghost" style="padding:10px 20px" onclick="LightingApp.pullPlan()">⟳ Pull from Takeoffs</button>' +
      '<span class="hint" style="margin:0">' + (cfg._planPulledAt
        ? 'Plan pulled ' + new Date(cfg._planPulledAt).toLocaleString('en-GB') + ' · ' + cfg.rooms.filter(function (r) { return r.source === 'takeoff'; }).length + ' rooms from the takeoff'
        : (cfg.projectId ? 'Not pulled yet — click to read the lighting layer from Takeoffs.' : (CLIENT ? '' : 'Select a project above to pull its fixture plan.'))) + '</span>' +
      '<span style="margin-left:auto" class="hint">' + t.fixtures + ' fittings · ' + t.ledM + ' m LED · ' + t.keypads + ' keypads</span></div>';

    floorsInUse().forEach(function (fc) {
      var rooms = roomsOfFloor(fc);
      if (!rooms.length) return;
      h += '<div class="panel" style="margin-bottom:14px"><div class="ptt">' + esc(fc) + ' <span class="opt-tag">· ' + rooms.length + ' rooms</span></div>';
      h += '<div style="overflow-x:auto"><table class="pln"><thead><tr><th style="text-align:left">Room</th><th style="text-align:left">Type</th><th>m²</th><th>Ceil m</th>';
      PLAN_KINDS.forEach(function (k) { var kd = kindDef(k); h += '<th title="' + esc(kd ? kd.label : k) + '">' + esc((kd ? kd.label : k).split(' ')[0].slice(0, 5)) + '</th>'; });
      h += '<th>LED m</th><th>LC dim</th><th>LC sw</th><th></th></tr></thead><tbody>';
      rooms.forEach(function (r) {
        var ledM = (r.ledRuns || []).reduce(function (s, l) { return s + (Number(l.metres) || 0); }, 0);
        h += '<tr><td style="text-align:left">' + esc(r.name) + (r.source === 'takeoff' ? ' <span class="tag-src">plan</span>' : '') + '</td>';
        h += '<td style="text-align:left"><select onchange="LightingApp.setRoom(\'' + r.id + '\',\'type\',this.value)">';
        (CFG.roomTypes || []).forEach(function (rt) { h += '<option value="' + rt.id + '"' + (r.type === rt.id ? ' selected' : '') + '>' + esc(rt.label) + '</option>'; });
        h += '</select></td>';
        h += '<td><input type="number" min="1" value="' + (r.area || '') + '" onchange="LightingApp.setRoom(\'' + r.id + '\',\'area\',Number(this.value))"></td>';
        h += '<td><input type="number" step="0.1" min="2" value="' + (r.ceilingH || 2.4) + '" onchange="LightingApp.setRoom(\'' + r.id + '\',\'ceilingH\',Number(this.value))"></td>';
        PLAN_KINDS.forEach(function (k) {
          h += '<td><input type="number" min="0" value="' + (r.counts[k] || 0) + '" onchange="LightingApp.setCount(\'' + r.id + '\',\'' + k + '\',Number(this.value))"></td>';
        });
        h += '<td><input type="number" step="0.5" min="0" value="' + (Math.round(ledM * 10) / 10) + '" onchange="LightingApp.setLed(\'' + r.id + '\',Number(this.value))"></td>';
        h += '<td><input type="number" min="0" value="' + ((r.lcMix || {}).dimmed || 0) + '" onchange="LightingApp.setMix(\'' + r.id + '\',\'dimmed\',Number(this.value))"></td>';
        h += '<td><input type="number" min="0" value="' + ((r.lcMix || {}).switched || 0) + '" onchange="LightingApp.setMix(\'' + r.id + '\',\'switched\',Number(this.value))"></td>';
        h += '<td><button class="ghost sm" onclick="LightingApp.removeRoom(\'' + r.id + '\')">✕</button></td></tr>';
      });
      h += '</tbody></table></div></div>';
    });
    if (!cfg.rooms.length) h += '<div class="panel" style="margin-bottom:14px"><div class="hint">No rooms yet — pull the Takeoffs plan or add rooms below.</div></div>';

    // add-room row (takeoff areas without lighting content offered first)
    var used = {};
    cfg.rooms.forEach(function (r) { used[(r.floorCode || '') + '|' + r.name] = 1; });
    var avail = (ctx.areas || []).filter(function (a) { return !used[a.floorCode + '|' + a.name]; });
    h += '<div class="panel"><div class="ptt">Add a room</div><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">';
    if (avail.length) {
      h += '<select id="addRoomSel">';
      avail.forEach(function (a, i) { h += '<option value="' + i + '">' + esc(a.floorCode + ' · ' + a.name) + '</option>'; });
      h += '</select><button class="ghost sm" onclick="LightingApp.addFromArea()">+ Add from takeoff rooms</button>';
    }
    h += '<input id="addRoomName" placeholder="Room name" style="min-width:180px">' +
      '<select id="addRoomFloor">' + floorsInUse().concat(['GF', '1F', '2F', 'BA', 'EXT']).filter(function (v, i, a) { return a.indexOf(v) === i; }).map(function (f) { return '<option>' + esc(f) + '</option>'; }).join('') + '</select>' +
      '<button class="ghost sm" onclick="LightingApp.addRoom()">+ Add room</button></div></div>';
    return h;
  }
  function setRoom(id, k, v) { var r = cfg.rooms.find(function (x) { return x.id === id; }); if (r) { r[k] = v; if (k === 'type') renderStep(); } }
  function setCount(id, kind, v) { var r = cfg.rooms.find(function (x) { return x.id === id; }); if (r) r.counts[kind] = Math.max(0, Number(v) || 0); }
  function setMix(id, k, v) { var r = cfg.rooms.find(function (x) { return x.id === id; }); if (r) { r.lcMix = r.lcMix || {}; r.lcMix[k] = Math.max(0, Number(v) || 0); } }
  function setLed(id, v) {
    var r = cfg.rooms.find(function (x) { return x.id === id; }); if (!r) return;
    r.ledRuns = (Number(v) > 0) ? [{ label: 'LED — ' + r.name, metres: Number(v) }] : [];
  }
  function removeRoom(id) { cfg.rooms = cfg.rooms.filter(function (r) { return r.id !== id; }); renderStep(); }
  function addRoom() {
    var nm = ($('addRoomName') || {}).value || 'Room';
    var fl = ($('addRoomFloor') || {}).value || 'GF';
    cfg.rooms.push(newRoom(fl, nm)); renderStep();
  }
  function addFromArea() {
    var sel = $('addRoomSel'); if (!sel) return;
    var used = {};
    cfg.rooms.forEach(function (r) { used[(r.floorCode || '') + '|' + r.name] = 1; });
    var avail = (ctx.areas || []).filter(function (a) { return !used[a.floorCode + '|' + a.name]; });
    var a = avail[Number(sel.value)]; if (!a) return;
    cfg.rooms.push(newRoom(a.floorCode, a.name)); renderStep();
  }

  // ── FIXTURES — product selection per kind + design helpers ───────────────
  function itemChips(it) {
    if (!it) return '';
    var bits = [];
    if (it.watts) bits.push(it.watts + ' W');
    if (it.lumens) bits.push(it.lumens + ' lm');
    if ((it.cct || []).length) bits.push(it.cct.join('/') + 'K');
    if (it.specs && it.specs.cct_tunable) bits.push('tunable');
    if (it.cri) bits.push('CRI ' + it.cri + '+');
    if ((it.beam || []).length) bits.push(it.beam.join('°/') + '°');
    if (it.ip) bits.push(it.ip);
    if ((it.dimming || []).length) bits.push(it.dimming.join(' · '));
    var pr = E.priceOf(it);
    if (pr) bits.push('£' + Math.round(pr.value) + (pr.src === 'wq' ? ' WQ' : ' RRP'));
    return bits.map(function (b) { return '<span class="spec-chip">' + esc(b) + '</span>'; }).join('');
  }
  function itemSelect(kindId, cats, current) {
    var items = E.byCategory(cats);
    if (!items.length) return '<div class="hint">No library entries for this kind yet — curate lighting_items in the Library.</div>';
    var bySup = {};
    items.forEach(function (it) { (bySup[it.manufacturer || 'Other'] = bySup[it.manufacturer || 'Other'] || []).push(it); });
    var h = '<select style="width:100%" onchange="LightingApp.pick(\'' + kindId + '\', this.value || null)">';
    h += '<option value=""' + (!current ? ' selected' : '') + '>— none / TBC —</option>';
    Object.keys(bySup).sort().forEach(function (mk) {
      h += '<optgroup label="' + esc(mk) + '">';
      bySup[mk].forEach(function (it) {
        h += '<option value="' + esc(it.id) + '"' + (current === it.id ? ' selected' : '') + '>' + esc(it.name) + (it.range ? ' · ' + esc(it.range) : '') + '</option>';
      });
      h += '</optgroup>';
    });
    return h + '</select>';
  }
  function kindsInUse() {
    var t = totalsAcross();
    return (CFG.fixtureKinds || []).filter(function (k) { return (t.byKind[k.id] || 0) > 0 || cfg.picks[k.id]; });
  }
  // usable lumens for the lux maths — direct lumens, or derived from the
  // published output-per-watt figure (DuraGreen publish lm/W, not lm)
  function itemLumens(it) {
    if (!it) return null;
    if (it.lumens) return it.lumens;
    var eff = (it.specs || {}).efficacy_lm_w;
    if (it.watts && eff) return Math.round(it.watts * eff);
    return null;
  }
  var ASSUMED_DL_LM = 450;   // conservative quality-downlight assumption when the library row has no output data yet
  // v0.2.0 — reference tags per fixture kind (schedule ↔ cut sheet ↔ key)
  var KIND_REFS = { downlight: 'D', spot: 'S', pendant: 'P', wall: 'W', picture: 'PL', lamp5a: 'LP', cabinet: 'C', lowlevel: 'LV', exterior: 'E', path: 'PA', ingrade: 'IG', moonlight: 'ML' };
  // v0.2.0 — assumed delivered lumens per kind for the whole-layer ambient
  // estimate (used only when the library row carries no output data)
  var KIND_ASSUMED_LM = { downlight: 450, pendant: 800, wall: 300, spot: 350, picture: 120, lamp5a: 800, cabinet: 400, lowlevel: 100, exterior: 300, path: 150, ingrade: 250, moonlight: 450 };
  function kindLumens(kindId) {
    var it = E.item(cfg.picks[kindId]);
    return itemLumens(it) || KIND_ASSUMED_LM[kindId] || 300;
  }
  // whole-layer maintained-lux estimate for a room (all counted fittings)
  function roomLuxEstimate(r) {
    var totalLm = 0, counted = 0;
    Object.keys(r.counts || {}).forEach(function (k) {
      var n = r.counts[k] || 0;
      if (!n || k === 'exterior' && r.type !== 'exterior') return;
      totalLm += n * kindLumens(k); counted += n;
    });
    if (!counted || !r.area) return null;
    return C.achievedLux({ area_m2: r.area, lumens: totalLm, count: 1 });
  }
  // ── v0.5.0 — Part L (dwellings) fixed-lighting check across the picks ────
  // 5A lamp points are plug-in, not fixed lighting — excluded. LED strip
  // included when the library row carries lm/m + W/m.
  function partLEntries() {
    var t = totalsAcross(), out = [];
    (CFG.fixtureKinds || []).forEach(function (k) {
      if (k.id === 'lamp5a') return;
      var n = t.byKind[k.id] || 0;
      if (!n) return;
      var it = E.item(cfg.picks[k.id]);
      if (!it) { out.push({ label: k.label, qty: n }); return; }
      out.push({ label: k.label + ' · ' + it.name, qty: n, lumens: itemLumens(it), watts: it.watts });
    });
    var strip = E.item(cfg.led.stripId);
    var ledM = t.ledM;
    if (ledM && strip) {
      var sp = strip.specs || {};
      out.push({ label: 'Linear LED · ' + strip.name, qty: Math.max(1, Math.round(ledM)), lumens: sp.lm_per_m || null, watts: sp.w_per_m || null });
    }
    return out;
  }
  function partL() { return (C && C.partLCheck) ? C.partLCheck(partLEntries()) : null; }
  function lints() {
    var out = [];
    // Part L fixed-lighting average (75 lm per circuit-watt, dwellings)
    var pl = partL();
    if (pl && !pl.pass) out.push('Part L: average ' + pl.avgLmw + ' lm per circuit-watt across the specified fittings — dwellings need ' + pl.min + ' lm/W for fixed lighting');
    if (pl && pl.low.length && pl.pass) out.push('Part L: ' + pl.low.map(function (l) { return l.label + ' (' + l.lmw + ' lm/W)'; }).join(', ') + ' below the 75 lm/W line — carried by the average');
    // IP lint per room type in use vs picked items
    cfg.rooms.forEach(function (r) {
      Object.keys(r.counts || {}).forEach(function (k) {
        if (!r.counts[k]) return;
        var it = E.item(cfg.picks[k]);
        var l = C.ipLint(it, r.type);
        if (l) out.push(l.msg);
      });
      if (r.type === 'exterior') {
        var itx = E.item(cfg.picks.exterior);
        if (itx && (itx.cct || []).length) { var ds = C.darkSkyLint(Math.max.apply(null, itx.cct)); if (ds) out.push(ds.msg); }
      }
    });
    // CCT mix lint across picked fittings
    var ccts = [cfg.cct];
    Object.keys(cfg.picks).forEach(function (k) {
      var it = E.item(cfg.picks[k]);
      if (it && (it.cct || []).length && it.cct.indexOf(cfg.cct) < 0 && !(it.specs || {}).cct_tunable) ccts.push(it.cct[0]);
    });
    var cl = C.cctLint(ccts);
    if (cl) out.push(cl.msg);
    return out.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }
  function luxTable() {
    var h = '<table class="lux"><thead><tr><th style="text-align:left">Room</th><th>Target</th><th>Estimate</th><th></th></tr></thead><tbody>';
    cfg.rooms.forEach(function (r) {
      var rt = roomType(r.type) || {};
      var got = roomLuxEstimate(r);
      var need = rt.ambient || null;
      var okc = got == null || need == null ? '' : (got >= need * 0.6 ? 'ok' : 'low');
      var dlm = kindLumens('downlight');
      h += '<tr><td style="text-align:left">' + esc(r.name) + '</td><td>' + (need ? need + ' lx' : '—') + '</td>' +
        '<td class="' + okc + '">' + (got != null ? Math.round(got) + ' lx' : '—') + '</td>' +
        '<td class="hint" style="font-size:10px">' + (got != null && need && got < need * 0.6 && dlm ? '+' + Math.max(0, (C.fittingsNeeded({ area_m2: r.area, lumens: dlm, targetLux: need - got }) || 0)) + ' DL' : '') + '</td></tr>';
    });
    return h + '</tbody></table><div class="hint" style="margin-top:8px">Lumen method · UF 0.5 · MF 0.8 — all counted fittings, published or typical outputs. Linear LED adds on top. Final levels are set at commissioning.</div>';
  }
  function renderFixtures() {
    var t = totalsAcross();
    var h = '<div class="lead"><h2>Choose the fittings.</h2><p>One specification per fixture kind, chosen from the Sonor lighting library — Lighting of London, DuraGreen and UltraLEDs, with data sheets and photometric files carried per product. The helpers on the right check levels and compliance as you go.</p></div>';
    h += '<div class="cfg-grid"><div class="cfg-left">';
    // house CCT
    h += '<div class="panel"><div class="ptt">Colour temperature <span class="opt-tag">· the house lead — task areas may sit warmer or cooler per room</span></div><div class="opts">';
    [2200, 2400, 2700, 3000].forEach(function (k) {
      h += '<button class="opt' + (cfg.cct === k ? ' on' : '') + '" onclick="LightingApp.setCct(' + k + ')">' + k + 'K</button>';
    });
    h += '</div><label class="fin" style="border:none;margin-top:6px"><input type="checkbox" ' + (cfg.dimToWarm ? 'checked' : '') + ' onchange="LightingApp.setDtw(this.checked)"><span class="fin-b"><span class="fin-n">Dim-to-warm</span><span class="fin-d">Fittings warm towards candlelight as they dim — the premium living/bedroom spec</span></span></label></div>';
    kindsInUse().forEach(function (k) {
      var qty = t.byKind[k.id] || 0;
      var it = E.item(cfg.picks[k.id]);
      h += '<div class="panel"><div class="ptt">' + esc(k.label) + ' <span class="opt-tag">· ' + qty + '× across the plan · ' + esc(k.layer) + ' layer</span></div>' +
        (it && it.img ? '<div style="display:flex;gap:14px;align-items:flex-start"><img src="' + esc(it.img) + '" alt="" style="width:74px;height:74px;object-fit:contain;background:#fff;border-radius:9px;border:1px solid var(--brd2);flex:0 0 auto"><div style="flex:1;min-width:0">' : '') +
        (k.cats.length ? itemSelect(k.id, k.cats, cfg.picks[k.id]) : '<div class="hint">Client-supplied or by others — carried as a wiring point.</div>') +
        (it && it.img ? '</div></div>' : '') +
        (it ? '<div class="chips">' + itemChips(it) + '</div>' +
          '<div class="linkrow">' + (it.product_url ? '<a href="' + esc(it.product_url) + '" target="_blank" rel="noopener">Product page ↗</a>' : '') +
          (it.datasheet_url ? '<a href="' + esc(it.datasheet_url) + '" target="_blank" rel="noopener">Datasheet ↗</a>' : '') +
          (it.ies_url ? '<a href="' + esc(it.ies_url) + '" target="_blank" rel="noopener">IES photometry ↗</a>' : '') + '</div>' : '') +
        '</div>';
    });
    h += '</div>';
    // helpers sidebar
    var dl = E.item(cfg.picks.downlight);
    var sp = C.spacing((cfg.rooms[0] || {}).ceilingH);
    var cone = dl && (dl.beam || []).length ? C.beamCone(dl.beam[Math.floor((dl.beam.length - 1) / 2)], ((cfg.rooms[0] || {}).ceilingH || 2.4) - 0.85, dl.lumens) : null;
    var warns = lints();
    h += '<div class="panel sticky"><div class="ptt">Design helpers</div>' + luxTable() +
      '<div class="lbl">Downlight spacing</div><div class="hint" style="margin:0">Grid ' + sp.min + '–' + sp.max + ' m (suggest ' + sp.suggested + ' m) · ' + sp.wallOffset + ' m from walls · half-spacing at edges</div>' +
      (cone ? '<div class="lbl">Beam at working plane</div><div class="hint" style="margin:0">' + esc(dl.name) + ': pool Ø ' + cone.diameter_m + ' m' + (cone.centre_lux ? ' · ~' + cone.centre_lux + ' lx centre beam' : '') + '</div>' : '') +
      '<div class="lbl">Checks</div>' + (warns.length ? warns.map(function (w) { return '<div class="warnline">⚠ ' + esc(w) + '</div>'; }).join('') : '<div class="hint" style="margin:0">No compliance flags on the current picks.</div>') +
      (function () {   // v0.5.0 — Part L status line (positive confirmation, not just failures)
        var pl = partL();
        if (!pl) return '';
        return '<div class="hint" style="margin:8px 0 0">Part L (dwellings): avg <b style="color:var(--gold)">' + pl.avgLmw + ' lm/W</b> ' + (pl.pass ? '✓' : '✗') + ' · ' + pl.min + ' required' + (pl.skipped ? ' · ' + pl.skipped + ' line' + (pl.skipped > 1 ? 's' : '') + ' without data' : '') + '</div>';
      })() +
      '</div>';
    h += '</div>';
    return h;
  }
  function pick(kind, id) { cfg.picks[kind] = id || null; renderStep(); }
  function setCct(k) { cfg.cct = k; renderStep(); }
  function setDtw(on) { cfg.dimToWarm = !!on; }

  // ── LED & DRIVERS ────────────────────────────────────────────────────────
  function ledRunsAll() {
    var out = [];
    cfg.rooms.forEach(function (r) {
      (r.ledRuns || []).forEach(function (l) { out.push({ floorCode: r.floorCode, room: r.name, label: l.label, metres: Number(l.metres) || 0 }); });
    });
    return out;
  }
  function renderLed() {
    var strip = E.item(cfg.led.stripId);
    var wpm = strip ? ((strip.specs || {}).w_per_m || 10) : 10;
    var runs = ledRunsAll();
    var h = '<div class="lead"><h2>Linear LED, engineered.</h2><p>Every concealed run gets a strip specification, a feed plan and a driver sized with 20% headroom — the engineering that keeps linear light flicker-free for a decade.</p></div>';
    h += '<div class="cfg-grid"><div class="cfg-left">';
    h += '<div class="panel"><div class="ptt">LED strip <span class="opt-tag">· one house specification — special runs noted per project</span></div>' + stripSelect() + '</div>';
    if (strip) h += '<div class="panel"><div class="ptt">Strip data</div><div class="chips">' + itemChips(strip) + '</div>' +
      '<div class="linkrow">' + (strip.product_url ? '<a href="' + esc(strip.product_url) + '" target="_blank" rel="noopener">Product page ↗</a>' : '') + (strip.datasheet_url ? '<a href="' + esc(strip.datasheet_url) + '" target="_blank" rel="noopener">Datasheet ↗</a>' : '') + '</div></div>';
    h += '<div class="panel"><div class="ptt">Aluminium profile <span class="opt-tag">· always in profile — straight lines + heat sink</span></div>' + profileSelect() + '</div>';
    h += '<div class="panel"><div class="ptt">Runs & drivers <span class="opt-tag">· 80% rule — driver ≥ load ÷ 0.8, next standard size up</span></div>';
    if (!runs.length) h += '<div class="hint">No LED runs on the plan yet — add metres per room on the Plan step.</div>';
    else {
      h += '<div style="overflow-x:auto"><table class="pln"><thead><tr><th style="text-align:left">Run</th><th>m</th><th>Load</th><th>Driver</th><th>Loaded</th><th style="text-align:left">Feed</th></tr></thead><tbody>';
      runs.forEach(function (r) {
        var eng = C.stripRun(r.metres, wpm);
        h += '<tr><td style="text-align:left">' + esc(r.floorCode + ' · ' + r.room) + '</td><td>' + r.metres + '</td>' +
          (eng ? '<td>' + eng.load_w + ' W</td><td>' + (eng.drivers > 1 ? eng.drivers + '× ' : '') + eng.driver_w + ' W</td><td>' + eng.loaded_pct + '%</td><td style="text-align:left" class="hint">' + esc(eng.feedNote) + '</td>' : '<td colspan="4">—</td>') + '</tr>';
      });
      var tot = C.stripTotals(runs, wpm);
      h += '</tbody></table></div><div class="hint" style="margin-top:8px">Total ' + tot.total_m + ' m · ' + tot.load_w + ' W strip load · 24V constant-voltage · drivers in accessible positions, never buried.</div>';
    }
    h += '</div></div>';
    h += '<div class="panel sticky"><div class="ptt">Strip rules of thumb</div>' +
      '<div class="hint" style="margin:0 0 10px">Cove/indirect ambient wants ~1000–1500 lm/m · accent + toe-kick 400–800 lm/m · task under-cabinet 1500 lm/m and up. CRI 90 minimum in living spaces.</div>' +
      '<div class="hint" style="margin:0 0 10px">Feed both ends past 6 m. 24V everywhere unless a fitting demands otherwise. Set strip 30–45 mm behind the cove lip so the source is never seen.</div>' +
      '<div class="hint" style="margin:0">Match strip CCT to the room downlights — a 2700K room with 4000K cove reads broken.</div></div>';
    h += '</div>';
    return h;
  }
  function stripSelect() {
    var items = E.byCategory(['strip', 'cob-strip', 'linear', 'neon-flex']);
    if (!items.length) return '<div class="hint">No strip entries in the library yet.</div>';
    var bySup = {};
    items.forEach(function (it) { (bySup[it.manufacturer || 'Other'] = bySup[it.manufacturer || 'Other'] || []).push(it); });
    var h = '<select style="width:100%" onchange="LightingApp.setStrip(this.value || null)">';
    h += '<option value=""' + (!cfg.led.stripId ? ' selected' : '') + '>— none / TBC —</option>';
    Object.keys(bySup).sort().forEach(function (mk) {
      h += '<optgroup label="' + esc(mk) + '">';
      bySup[mk].forEach(function (it) {
        h += '<option value="' + esc(it.id) + '"' + (cfg.led.stripId === it.id ? ' selected' : '') + '>' + esc(it.name) + '</option>';
      });
      h += '</optgroup>';
    });
    return h + '</select>';
  }
  function profileSelect() {
    var items = E.byGroup('profile');
    if (!items.length) return '<div class="hint">No profiles in the library yet.</div>';
    var h = '<select style="width:100%" onchange="LightingApp.setProfile(this.value || null)"><option value="">— chosen per detail —</option>';
    items.forEach(function (it) { h += '<option value="' + esc(it.id) + '"' + (cfg.led.profileId === it.id ? ' selected' : '') + '>' + esc(it.name) + '</option>'; });
    return h + '</select>';
  }
  function setStrip(id) { cfg.led.stripId = id || null; renderStep(); }
  function setProfile(id) { cfg.led.profileId = id || null; }

  // ── CIRCUITS & SCENES ────────────────────────────────────────────────────
  function deriveCircuits() {
    var out = [];
    var strip = E.item(cfg.led.stripId);
    var wpm = strip ? ((strip.specs || {}).w_per_m || 10) : 10;
    cfg.rooms.forEach(function (r) {
      var push = function (label, loadType, qty, watts, control) {
        out.push({ floorCode: r.floorCode || 'GF', room: r.name, label: label, loadType: loadType, qty: qty, watts: Math.round(watts), control: control });
      };
      var kn = r.counts || {};
      (CFG.fixtureKinds || []).forEach(function (k) {
        var n = kn[k.id] || 0;
        if (!n) return;
        var it = E.item(cfg.picks[k.id]);
        var w = (it && it.watts) || k.wDefault || 5;
        var sys = (cfg.control.system === 'lutron' ? 'Lutron' : cfg.control.system === 'control4' ? 'Control4' : 'Rako');
        if (k.id === 'lamp5a') push('5A lamp circuit', '5A socket', n, n * w, sys + ' dim / switched');
        else if (k.id === 'cabinet') push('Cabinet lighting spur', 'ELV spur', n, n * w, 'Dims with the room accents');
        else push(k.label, k.layer === 'ambient' ? 'Dim' : 'Dim · dec', n, n * w, 'Trailing-edge · ' + sys);
      });
      (r.ledRuns || []).forEach(function (l) {
        var eng = C.stripRun(Number(l.metres) || 0, wpm);
        if (eng) push('Linear LED — ' + r.name, 'ELV 24V', 1, eng.load_w, 'ELV dim · ' + (eng.drivers > 1 ? eng.drivers + '× ' : '') + eng.driver_w + ' W driver');
      });
      var extra = Math.max(0, ((r.lcMix || {}).dimmed || 0) - out.filter(function (c) { return c.room === r.name && /dim/i.test(c.loadType); }).length);
      if (extra) push('Dimmed circuit allowance', 'Dim', extra, extra * 50, 'From the Takeoffs LC estimate');
      var sw = (r.lcMix || {}).switched || 0;
      if (sw) push('Switched circuit allowance', 'Switched', sw, sw * 30, 'From the Takeoffs LC estimate');
    });
    return out;
  }
  // ── v0.3.0/v0.4.0 — keypad specification per room, range-aware per control
  //    system (Control4 → the official Lux by Control4 finish palette) ──
  function activeKpRange() {
    var r = (CFG.keypadRanges || {})[cfg.control.system];
    if (r && r.finishes && r.finishes.length) return r;
    return { label: null, note: null, finishes: CFG.keypadFinishes || [], buttons: CFG.keypadButtons || [2, 4, 6, 8] };
  }
  function finishOf(id) {
    var rng = activeKpRange();
    return rng.finishes.find(function (f) { return f.id === id; }) ||
      (CFG.keypadFinishes || []).find(function (f) { return f.id === id; }) ||   // saved design from another system
      rng.finishes[0] || { id: 'matt-white', label: 'Matt White', hex: '#f2f0ec', txt: '#5a544a' };
  }
  function validFinish(id) {
    var rng = activeKpRange();
    return rng.finishes.some(function (f) { return f.id === id; }) ? id : (rng.finishes[0] || {}).id;
  }
  function kpDefaults(room) {
    var rng = activeKpRange();
    var seeds = ((CFG.sceneSeeds || {})[room.type] || (CFG.sceneSeeds || {})._default || []);
    var maxB = rng.buttons[rng.buttons.length - 1] || 8;
    return {
      finish: validFinish((cfg.keypads && cfg.keypads.finishDefault) || (rng.finishes[0] || {}).id),
      buttons: Math.min(Math.max(seeds.length, 2), maxB),
      engravings: seeds.map(function (s) { return s.label; }),
      location: ''
    };
  }
  function kpFor(room) {
    var d = kpDefaults(room);
    var o = ((cfg.keypads || {}).rooms || {})[room.id] || {};
    var rng = activeKpRange();
    var maxB = rng.buttons[rng.buttons.length - 1] || 8;
    return {
      finish: o.finish ? validFinish(o.finish) : d.finish,
      buttons: Math.min(o.buttons || d.buttons, maxB),
      engravings: (o.engravings && o.engravings.length ? o.engravings : d.engravings).slice(0, Math.min(o.buttons || d.buttons, maxB)),
      location: o.location || d.location
    };
  }
  function setKpDefault(id) { cfg.keypads.finishDefault = id; renderStep(); }
  function setKp(roomId, key, val) {
    cfg.keypads.rooms = cfg.keypads.rooms || {};
    var o = cfg.keypads.rooms[roomId] = cfg.keypads.rooms[roomId] || {};
    o[key] = (key === 'buttons') ? Number(val) : val;
    if (key === 'finish' || key === 'buttons') renderStep();
  }
  function setKpEngr(roomId, csv) {
    cfg.keypads.rooms = cfg.keypads.rooms || {};
    var o = cfg.keypads.rooms[roomId] = cfg.keypads.rooms[roomId] || {};
    var mx = CFG.engravingMaxChars || 10;
    o.engravings = String(csv || '').split(/[,\n]/).map(function (s) { return s.trim().slice(0, mx); }).filter(Boolean);
  }
  function keypadRooms() { return cfg.rooms.filter(function (r) { return (r.keypads || 0) > 0; }); }
  function keypadEditorHtml() {
    var rooms = keypadRooms();
    var rng = activeKpRange();
    var h = '<div class="panel"><div class="ptt">Keypads by room' + (rng.label ? ' · ' + esc(rng.label) : '') + ' <span class="opt-tag">· finish, buttons + engravings — drawn on the proposal</span></div>';
    if (rng.note) h += '<div class="hint" style="margin:0 0 4px">' + esc(rng.note) + '</div>';
    var groups = [];
    rng.finishes.forEach(function (f) { if (groups.indexOf(f.group || '') < 0) groups.push(f.group || ''); });
    groups.forEach(function (g) {
      h += '<div class="lbl">' + (g ? esc(g) + ' · house finish' : 'House finish') + '</div><div class="opts">';
      rng.finishes.filter(function (f) { return (f.group || '') === g; }).forEach(function (f) {
        var on = validFinish(cfg.keypads.finishDefault || '') === f.id;
        h += '<button class="opt' + (on ? ' on' : '') + '" style="display:inline-flex;align-items:center;gap:7px" title="' + esc(f.label + (f.code ? ' (' + f.code + ')' : '')) + '" onclick="LightingApp.setKpDefault(\'' + f.id + '\')"><span style="width:13px;height:13px;border-radius:4px;background:' + f.hex + ';border:1px solid rgba(255,255,255,.25);display:inline-block"></span>' + esc(f.label) + '</button>';
      });
      h += '</div>';
    });
    if (!rooms.length) return h + '<div class="hint" style="margin-top:10px">No keypads on the plan yet — keypad symbols on the Takeoffs lighting layer land here.</div></div>';
    rooms.forEach(function (r) {
      var kp = kpFor(r);
      var fin = finishOf(kp.finish);
      h += '<div style="border-top:1px solid var(--brd2);padding:12px 0 4px;margin-top:12px">' +
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
        '<span class="fin-n" style="min-width:150px">' + esc(r.floorCode + ' · ' + r.name) + '</span>' +
        '<span class="hint" style="margin:0">' + r.keypads + '× keypad' + (r.keypads > 1 ? 's' : '') + '</span>' +
        '<select onchange="LightingApp.setKp(\'' + r.id + '\',\'finish\',this.value)">';
      var rng2 = activeKpRange();
      var lastG = null;
      rng2.finishes.forEach(function (f) {
        if ((f.group || '') !== lastG) { if (lastG !== null) h += '</optgroup>'; if (f.group) h += '<optgroup label="' + esc(f.group) + '">'; lastG = f.group || ''; }
        h += '<option value="' + f.id + '"' + (kp.finish === f.id ? ' selected' : '') + '>' + esc(f.label + (f.code ? ' (' + f.code + ')' : '')) + '</option>';
      });
      if (lastG) h += '</optgroup>';
      h += '</select><select onchange="LightingApp.setKp(\'' + r.id + '\',\'buttons\',this.value)">';
      (rng2.buttons || [2, 4, 6, 8]).forEach(function (b) { h += '<option value="' + b + '"' + (kp.buttons === b ? ' selected' : '') + '>' + b + ' button</option>'; });
      h += '</select>' +
        '<input style="flex:1;min-width:180px" placeholder="Location note — e.g. door side, bedside left" value="' + esc(kp.location) + '" onchange="LightingApp.setKp(\'' + r.id + '\',\'location\',this.value)">' +
        '</div>' +
        '<input style="width:100%;margin-top:8px" placeholder="Engravings, comma-separated (max ' + (CFG.engravingMaxChars || 10) + ' chars each)" value="' + esc(kp.engravings.join(', ')) + '" onchange="LightingApp.setKpEngr(\'' + r.id + '\',this.value)">' +
        '</div>';
    });
    return h + '</div>';
  }
  function sceneTypesInUse() {
    var seen = {};
    cfg.rooms.forEach(function (r) { seen[r.type] = 1; });
    return Object.keys(seen);
  }
  function renderCircuits() {
    var circuits = deriveCircuits();
    var totW = circuits.reduce(function (s, c) { return s + (c.watts || 0); }, 0);
    var h = '<div class="lead"><h2>Circuits & scenes.</h2><p>Circuits group by room and layer — never mixing load types on one dimmer. Keypads carry scene names, not circuit names; these are the seed levels, tuned in the room at handover.</p></div>';
    h += '<div class="cfg-grid"><div class="cfg-left">';
    h += '<div class="panel"><div class="ptt">Control system</div><div class="mat-grid">';
    (CFG.controlSystems || []).forEach(function (cs) {
      var on = cfg.control.system === cs.id;
      h += '<button class="mcard' + (on ? ' on' : '') + '" onclick="LightingApp.setControl(\'' + cs.id + '\')"><div class="mc-name">' + esc(cs.label) + '</div><div class="mc-price" style="font-size:10.5px;line-height:1.45">' + esc(cs.note) + '</div></button>';
    });
    h += '</div><div class="hint" style="margin-top:8px">' + totalsAcross().keypads + ' keypads on the plan · every circuit dimmable unless flagged switched.</div></div>';
    h += keypadEditorHtml();   // v0.3.0 — finish/buttons/engravings per room
    // circuits per floor
    C.sortFloors(circuits.map(function (c) { return c.floorCode; }).filter(function (v, i, a) { return a.indexOf(v) === i; })).forEach(function (fc) {
      var rows = circuits.filter(function (c) { return c.floorCode === fc; });
      h += '<div class="panel"><div class="ptt">' + esc(fc) + ' circuits <span class="opt-tag">· ' + rows.length + ' circuits</span></div><div style="overflow-x:auto"><table class="pln"><thead><tr><th style="text-align:left">Room</th><th style="text-align:left">Circuit</th><th>Qty</th><th>Load</th><th style="text-align:left">Control</th></tr></thead><tbody>';
      rows.forEach(function (c) {
        h += '<tr><td style="text-align:left">' + esc(c.room) + '</td><td style="text-align:left">' + esc(c.label) + ' <span class="hint" style="font-size:10px">' + esc(c.loadType) + '</span></td><td>' + c.qty + '</td><td>' + c.watts + ' W</td><td style="text-align:left" class="hint">' + esc(c.control) + '</td></tr>';
      });
      h += '</tbody></table></div></div>';
    });
    h += '</div>';
    // scenes sidebar
    h += '<div class="panel sticky"><div class="ptt">Scene seeds</div>';
    sceneTypesInUse().forEach(function (tid) {
      var rt = roomType(tid) || { label: tid };
      var seeds = (CFG.sceneSeeds || {})[tid] || (CFG.sceneSeeds || {})._default || [];
      h += '<div class="lbl">' + esc(rt.label) + '</div>';
      seeds.forEach(function (sc) { h += '<div style="padding:5px 0;border-bottom:1px solid var(--brd2)"><span class="fin-n" style="color:var(--gold);font-size:12px">' + esc(sc.label) + '</span> <span class="fin-d">' + esc(sc.note) + '</span></div>'; });
    });
    h += '<div class="lbl">Whole house <span class="opt-tag">· scenes can reach beyond lighting — shades, climate, locks</span></div>';
    (CFG.houseScenes || []).forEach(function (sc) {
      var act = ((cfg.control || {}).sceneActions || {})[sc.label] || '';
      h += '<div style="padding:5px 0;border-bottom:1px solid var(--brd2)"><span class="fin-n" style="color:var(--gold);font-size:12px">' + esc(sc.label) + '</span> <span class="fin-d">' + esc(sc.note) + '</span>' +
        '<input style="width:100%;margin-top:4px;font-size:10.5px" placeholder="Beyond lighting — e.g. shades close · heating setback · doors lock" value="' + esc(act) + '" onchange="LightingApp.setSceneAction(\'' + esc(sc.label) + '\',this.value)"></div>';
    });
    h += '<div class="hint" style="margin-top:8px">' + circuits.length + ' circuits · ~' + (Math.round(totW / 100) / 10) + ' kW connected lighting load</div></div>';
    h += '</div>';
    return h;
  }
  function setControl(id) { cfg.control.system = id; renderStep(); }
  function setSceneAction(label, v) {
    cfg.control.sceneActions = cfg.control.sceneActions || {};
    if (v) cfg.control.sceneActions[label] = v; else delete cfg.control.sceneActions[label];
  }

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  // v0.2.1 — EVERY specified line appears (Bryn: "pricing doesnt include all
  // lines"): priced lines carry WQ sell or public RRP; unpriced lines show as
  // 'at quotation' rows instead of vanishing. Drivers + control ride as
  // allowance rows so the budget reads as the whole package.
  function budget() {
    var t = totalsAcross();
    var lines = [], total = 0, poa = 0;
    // v0.3.0 — fittings by others: the budget carries the control package only
    if (cfg.scope === 'others') {
      var sys0 = (CFG.controlSystems || []).find(function (c) { return c.id === cfg.control.system; });
      if (sys0) { poa++; lines.push({ label: 'Lighting control · ' + sys0.label + ' — dimming, keypads + processing', qty: t.keypads || 1, unit: null, total: null, poa: true, note: (t.keypads || 0) + ' keypads on the plan · light fittings supplied + installed by others' }); }
      return { lines: lines, total: 0, poa: poa };
    }
    (CFG.fixtureKinds || []).forEach(function (k) {
      var n = t.byKind[k.id] || 0;
      if (!n) return;
      var it = E.item(cfg.picks[k.id]);
      var pr = it ? E.priceOf(it) : null;
      if (pr) {
        var v = pr.value * n;
        total += v;
        lines.push({ label: k.label + ' · ' + it.name, qty: n, unit: pr.value, total: v, src: pr.src, note: pr.src === 'rrp' ? 'public RRP — trade terms at quotation' : null });
      } else {
        poa++;
        lines.push({ label: k.label + ' · ' + (it ? it.name : 'TBC — chosen at design development'), qty: n, unit: null, total: null, poa: true, note: it ? 'trade pricing at quotation' : null });
      }
    });
    var strip = E.item(cfg.led.stripId);
    if (t.ledM) {
      if (strip) {
        var reel = (strip.specs || {}).reel_m || 5;
        var pr2 = E.priceOf(strip);
        var reels = Math.ceil(t.ledM / reel);
        if (pr2) { var v2 = reels * pr2.value; total += v2; lines.push({ label: 'LED strip · ' + strip.name, qty: reels, unit: pr2.value, total: v2, src: pr2.src, note: t.ledM + ' m as ' + reels + ' × ' + reel + ' m reels' }); }
        else { poa++; lines.push({ label: 'LED strip · ' + strip.name, qty: reels, unit: null, total: null, poa: true, note: t.ledM + ' m as ' + reels + ' × ' + reel + ' m reels' }); }
      } else { poa++; lines.push({ label: 'LED strip · specification TBC', qty: 1, unit: null, total: null, poa: true, note: t.ledM + ' m of runs on the plan' }); }
      // drivers — count from the engineered run schedule
      var wpm = strip ? ((strip.specs || {}).w_per_m || 10) : 10;
      var nDrivers = 0;
      ledRunsAll().forEach(function (r) { var eng = C.stripRun(r.metres, wpm); if (eng) nDrivers += eng.drivers; });
      if (nDrivers) { poa++; lines.push({ label: 'LED drivers · sized per the run schedule', qty: nDrivers, unit: null, total: null, poa: true }); }
    }
    var sys = (CFG.controlSystems || []).find(function (c) { return c.id === cfg.control.system; });
    if (sys) { poa++; lines.push({ label: 'Lighting control · ' + sys.label + ' — keypads, dimming + processing', qty: t.keypads || 1, unit: null, total: null, poa: true, note: (t.keypads || 0) + ' keypads on the plan' }); }
    return { lines: lines, total: total, poa: poa };
  }
  function renderSummary() {
    var t = totalsAcross(), b = budget();
    var circuits = deriveCircuits();
    var h = '<div class="summary">';
    h += '<div class="sm-head"><div><div class="sm-mfr">Lighting Design · ' + esc((CFG.controlSystems || []).filter(function (c) { return c.id === cfg.control.system; }).map(function (c) { return c.label; })[0] || '') + '</div><h2>' + esc(cfg.client.project || 'Lighting Design') + '</h2></div><div class="sm-date">' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) + '</div></div>';
    if (!CLIENT) {
      h += '<div class="client-row">' +
        '<div class="cfld"><span>Prepared for</span><input value="' + esc(cfg.client.name) + '" onchange="LightingApp.setClient(\'name\',this.value)"></div>' +
        '<div class="cfld"><span>Project</span><input value="' + esc(cfg.client.project) + '" onchange="LightingApp.setClient(\'project\',this.value)"></div></div>';
      h += '<div class="panel saved-panel" style="margin-bottom:18px"><div class="ptt">Saved designs</div><div id="savedList"><div class="hint">Loading…</div></div></div>';
    }
    h += '<div class="strip">' +
      '<div class="cellx"><div class="cl">Rooms</div><div class="cv">' + cfg.rooms.length + '</div></div>' +
      '<div class="cellx"><div class="cl">Fittings</div><div class="cv">' + t.fixtures + '</div></div>' +
      '<div class="cellx"><div class="cl">Linear LED</div><div class="cv">' + t.ledM + ' m</div></div>' +
      '<div class="cellx"><div class="cl">Circuits</div><div class="cv">' + circuits.length + '</div></div>' +
      '<div class="cellx"><div class="cl">Colour</div><div class="cv">' + cfg.cct + 'K' + (cfg.dimToWarm ? ' DTW' : '') + '</div></div>' +
      (b.total ? '<div class="cellx"><div class="cl">Indicative supply</div><div class="cv">£' + Math.round(b.total).toLocaleString('en-GB') + '</div><div class="cn">ex VAT · ' + (b.poa ? b.poa + ' lines at quotation' : 'library pricing') + '</div></div>' : '') +
      '</div>';
    // picks recap
    h += '<div class="panel" style="margin-bottom:18px"><div class="ptt">Specification</div><div style="font-size:12.5px;line-height:1.9">';
    kindsInUse().forEach(function (k) {
      var it = E.item(cfg.picks[k.id]);
      var n = t.byKind[k.id] || 0;
      if (!n && !it) return;
      h += '<div><span style="color:var(--muted)">' + esc(k.label) + ' · </span>' + (it ? esc(it.name + ' — ' + (it.manufacturer || '')) : 'TBC') + (n ? ' <span style="color:var(--muted)">× ' + n + '</span>' : '') + '</div>';
    });
    var strip = E.item(cfg.led.stripId);
    if (strip && t.ledM) h += '<div><span style="color:var(--muted)">LED strip · </span>' + esc(strip.name) + ' <span style="color:var(--muted)">× ' + t.ledM + ' m</span></div>';
    h += '</div></div>';
    h += '<div class="actions">' +
      (!CLIENT ? '<button class="btn ghost" onclick="LightingApp.saveConfig()">Save design</button>' : '') +
      '<button class="btn primary" onclick="LightingApp.savePdf()">Download Lighting Design Proposal</button></div>';
    h += '<div class="disc">' + (CFG.termsLines || []).map(esc).join(' ') + '</div>';
    h += '</div>';
    if (!CLIENT) setTimeout(loadSavedList, 50);
    return h;
  }
  function setClient(k, v) { cfg.client[k] = v; }

  // ── project bar + context (internal builds only) ─────────────────────────
  function initProjectBar(attempt) {
    attempt = attempt || 0;
    var bar = global.SonorProjectBar, db = dbc();
    if ((!bar || !db) && attempt < 5) { setTimeout(function () { initProjectBar(attempt + 1); }, 1200); return; }
    if (!bar || !db) return;
    try {
      bar.init({ supa: db, appKey: 'lighting-design', host: $('projectBarHost'), onChange: onProject });
      var pid = bar.getActiveId && bar.getActiveId();
      if (pid) onProject({ currentId: pid, project: bar.getProject && bar.getProject(pid) });
    } catch (e) {}
  }
  async function onProject(detail) {
    cfg.projectId = detail && detail.currentId || null;
    ctx.floors = null; ctx.areas = null; ctx.brief = null; ctx.spec = null;
    var p = detail && detail.project;
    if (p) {
      cfg.client.name = p.client_name || cfg.client.name;
      cfg.client.project = (p.address || p.name || '').split('\n')[0].split(',')[0] || cfg.client.project;
    }
    try {
      var db = dbc();
      if (db && cfg.projectId) {
        // direct project fetch — never rely on the bar handing the record over
        // (v0.2.1: the Sandiway export shipped 'Your Home / —' when the bar's
        // adopt path returned the id without the project row)
        var b = await db.from('projects').select('client_name,name,address,metadata').eq('id', cfg.projectId).maybeSingle();
        if (b.data) {
          if (!cfg.client.name && b.data.client_name) cfg.client.name = b.data.client_name;
          if (!cfg.client.project) cfg.client.project = String(b.data.address || b.data.name || '').split('\n')[0].split(',')[0] || '';
          var md = b.data.metadata || {};
          if (md.brief) ctx.brief = md.brief;
          ctx.spec = md.lighting_spec || null;
        }
      }
    } catch (e) {}
    await pullPlan();
    loadSavedList();
    loadOverview();   // v0.2.1 — landing overview (cine-aesthetic pattern)
  }

  // ── v0.2.1 — landing PROJECT OVERVIEW: saved designs, open from the front ──
  function fmtDate(s) { try { return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } catch (e) { return ''; } }
  async function loadOverview() {
    var sec = $('ovw');
    if (!sec) return;
    var db = dbc();
    if (CLIENT || !db || !cfg.projectId) { sec.style.display = 'none'; return; }
    var designs = [];
    try {
      var rb = await db.from('lighting_configs').select('id,label,app_version,updated_at,config').eq('project_id', cfg.projectId).eq('archived', false).order('updated_at', { ascending: false }).limit(20);
      designs = rb.data || [];
    } catch (e) {}
    renderOverview(designs);
  }
  function renderOverview(designs) {
    var sec = $('ovw');
    if (!sec) return;
    if (CLIENT || !cfg.projectId) { sec.style.display = 'none'; return; }
    sec.style.display = 'block';
    var tt = $('ovwTitle');
    if (tt) tt.innerHTML = esc(cfg.client.project || 'This project') + ' — <span class="lt">saved lighting designs</span>.';
    var sm = $('ovwSummary');
    if (sm) {
      var t = totalsAcross();
      var bits = [];
      if (cfg.rooms.length) bits.push(cfg.rooms.length + ' rooms · ' + t.fixtures + ' fittings on the current plan');
      if (ctx.spec && ctx.spec.updated_at) bits.push('Published spec: v' + (ctx.spec.app_version || '?') + ' · ' + fmtDate(ctx.spec.updated_at));
      else bits.push('No lighting spec published yet — save a design to publish it.');
      sm.textContent = bits.join('  ·  ');
    }
    var bo = $('ovwDesigns');
    if (bo) {
      bo.innerHTML = (designs && designs.length) ? designs.map(function (r) {
        var cur = r.id === cfg._savedId;
        var c = r.config || {};
        var nRooms = (c.rooms || []).length;
        return '<div class="ovw-row' + (cur ? ' cur' : '') + '">' +
          '<div class="ovw-b"><div class="ovw-n">' + esc(r.label || 'Design') + (cur ? ' <span class="ovw-badge">✓ Open</span>' : '') + '</div>' +
          '<div class="ovw-d">' + (nRooms ? nRooms + ' rooms · ' : '') + fmtDate(r.updated_at) + ' · v' + esc(r.app_version || '') + '</div></div>' +
          '<button class="ovw-btn gold" onclick="LightingApp.openFromOverview(\'' + r.id + '\')">Open</button>' +
          '</div>';
      }).join('') : '<div class="ovw-hint">No saved designs yet for this project — start one below.</div>';
    }
    var nt = $('ovwNote');
    if (nt) nt.textContent = 'Saving a design publishes it as the project’s confirmed lighting spec — other Sonor apps read the same source.';
  }
  function openFromOverview(id) { enter(); openSaved(id); }

  // ── saved designs (lighting_configs — this app's ONLY table writes) ──────
  async function saveConfig() {
    var db = dbc(); if (!db || CLIENT) return;
    var label = cfg.client.project || 'Lighting design';
    var body = { project_name: cfg.client.project || null, project_id: cfg.projectId, label: label, config: cfg, app_version: CFG.version, updated_at: new Date().toISOString() };
    try {
      var res;
      if (cfg._savedId) res = await db.from('lighting_configs').update(body).eq('id', cfg._savedId).select('id').single();
      else res = await db.from('lighting_configs').insert(body).select('id').single();
      if (res.data) { cfg._savedId = res.data.id; cfg._savedLabel = label; }
      loadSavedList();
      publishLightingSpec();   // ONE SOURCE: confirmed lighting → projects.metadata.lighting_spec
      loadOverview();          // v0.2.1 — landing list stays current
    } catch (e) { console.warn('[lighting] save failed', e); }
  }
  // ── ONE SOURCE — projects.metadata.lighting_spec (single writer, RPC merge)
  async function publishLightingSpec() {
    var db = dbc(); if (!db || CLIENT || !cfg.projectId) return;
    try {
      var pid = cfg.projectId;
      var t = totalsAcross();
      var strip = E.item(cfg.led.stripId);
      var resolve = function (id) { var it = E.item(id); return it ? { id: it.id, name: it.name, manufacturer: it.manufacturer, wq_sku: it.wq_sku || null } : null; };
      var spec = {
        source: 'lighting-design', app_version: CFG.version,
        config_id: cfg._savedId || null, updated_at: new Date().toISOString(),
        cct: cfg.cct, dim_to_warm: cfg.dimToWarm,
        scope: cfg.scope || 'full',
        control: cfg.control.system,
        keypad_range: (activeKpRange() || {}).label || null,
        keypads: keypadRooms().map(function (r) {
          var kp = kpFor(r);
          var fin = finishOf(kp.finish);
          return { floor: r.floorCode, room: r.name, qty: r.keypads, finish: kp.finish, finish_label: fin.label, finish_code: fin.code || null, buttons: kp.buttons, engravings: kp.engravings, location: kp.location || null };
        }),
        totals: { rooms: cfg.rooms.length, fixtures: t.fixtures, led_m: t.ledM, keypads: t.keypads, circuits: deriveCircuits().length },
        part_l: (function () { var pl = partL(); return pl ? { avg_lmw: pl.avgLmw, min_lmw: pl.min, pass: pl.pass } : null; })(),
        scene_actions: (cfg.control || {}).sceneActions || {},
        picks: Object.keys(cfg.picks).reduce(function (o, k) { o[k] = resolve(cfg.picks[k]); return o; }, {}),
        strip: strip ? { id: strip.id, name: strip.name, w_per_m: (strip.specs || {}).w_per_m || null } : null,
        rooms: cfg.rooms.map(function (r) {
          return { floor: r.floorCode, name: r.name, type: r.type, counts: r.counts, led_m: (r.ledRuns || []).reduce(function (s, l) { return s + (Number(l.metres) || 0); }, 0), lc_mix: r.lcMix };
        })
      };
      var res = await db.rpc('sonor_merge_project_metadata', { p_project_id: pid, p_patch: { lighting_spec: spec } });
      if (res.error) console.warn('[lighting] lighting_spec publish failed', res.error);
    } catch (e) { console.warn('[lighting] lighting_spec publish error', e); }
  }
  async function loadSavedList() {
    var el = $('savedList'), db = dbc(); if (!el || !db) return;
    try {
      var q = db.from('lighting_configs').select('id,label,app_version,updated_at').eq('archived', false).order('updated_at', { ascending: false }).limit(20);
      if (cfg.projectId) q = q.eq('project_id', cfg.projectId);
      var res = await q;
      var rows = res.data || [];
      el.innerHTML = rows.length ? rows.map(function (r) {
        return '<div class="saved-row' + (r.id === cfg._savedId ? ' cur' : '') + '"><div class="saved-b"><div class="saved-n">' + esc(r.label || 'Design') + '</div><div class="saved-d">' + new Date(r.updated_at).toLocaleDateString('en-GB') + ' · v' + esc(r.app_version || '') + '</div></div>' +
          '<button class="ghost sm" onclick="LightingApp.openSaved(\'' + r.id + '\')">Open</button></div>';
      }).join('') : '<div class="hint">No saved designs yet for this project.</div>';
    } catch (e) { el.innerHTML = '<div class="hint">Saved designs unavailable.</div>'; }
  }
  async function openSaved(id) {
    var db = dbc(); if (!db) return;
    try {
      var res = await db.from('lighting_configs').select('id,label,config').eq('id', id).single();
      if (res.data && res.data.config) {
        var c = res.data.config;
        ['rooms', 'picks', 'cct', 'dimToWarm', 'scope', 'led', 'control', 'keypads', 'sceneNotes', 'client', '_planPulledAt'].forEach(function (k) { if (c[k] != null) cfg[k] = c[k]; });
        cfg._savedId = res.data.id;
        cfg._savedLabel = res.data.label || null;
        cfg.step = STEPS.length; renderStep();
        loadOverview();
      }
    } catch (e) {}
  }
  function bootDeepLink() {
    try {
      var q = new URLSearchParams(location.search);
      if (q.get('config')) { enter(); openSaved(q.get('config')); }
      else if (q.get('project')) { cfg.client.project = q.get('project'); }
    } catch (e) {}
  }

  // ── PDF export ───────────────────────────────────────────────────────────
  function makeRef() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    var yymmdd = String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate());
    var chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', r = '';
    for (var i = 0; i < 4; i++) r += chars[Math.floor(Math.random() * chars.length)];
    return 'SNR-LD-' + yymmdd + '-' + r;
  }
  // Gilroy ff/ffl ligatures render broken in pdf-lib (cinema-pdf-luxury §4) —
  // dictionary rewrites first, then a last-resort 'ff' split so a broken glyph
  // can never ship (aesthetic-app v0.7.0 pattern).
  function caseKeep(to) { return function (mch) { return mch.charAt(0) === mch.charAt(0).toUpperCase() ? to.charAt(0).toUpperCase() + to.slice(1) : to; }; }
  var PDF_SAFE = [
    [/home\s+office/gi, caseKeep('study')],
    [/\boffice\b/gi, caseKeep('study')],
    [/\boffset\b/gi, caseKeep('set-back')],
    [/\bdiffusers?\b/gi, caseKeep('opal cover')],
    [/\bdiffused\b/gi, caseKeep('softened')],
    [/\bdiffuse\b/gi, caseKeep('soft')],
    [/\bdiffusion\b/gi, caseKeep('soft spread')],
    [/\bbaffles?\b/gi, caseKeep('louvres')],
    [/\befficacy\b/gi, caseKeep('output per watt')],
    [/\befficien(t|cy)\b/gi, caseKeep('economical')],
    [/\beffects?\b/gi, caseKeep('look')],
    [/\beffective(ly)?\b/gi, caseKeep('true')],
    [/\boffer(s|ed|ing)?\b/gi, caseKeep('provide')],
    [/\bcoffer(ed)?\b/gi, caseKeep('cove')],
    [/\bsoffits?\b/gi, caseKeep('eaves detail')],
    [/\bscaffold(ing)?\b/gi, caseKeep('access')],
    [/\bon\/off\b/gi, 'switched'],
    [/\boff\b/gi, caseKeep('out')],
    [/″/g, '"']
  ];
  function pdfSafe(s) {
    var out = String(s);
    PDF_SAFE.forEach(function (r) { out = out.replace(r[0], r[1]); });
    return out.replace(/ff/g, 'f f').replace(/FF/g, 'F F').replace(/Ff/g, 'F f');
  }
  var SAFE_SKIP_KEYS = /url|img|image|filename|hex|datasheet|swatch|ies|mirror/i;
  function deepSafe(o) {
    if (o == null) return o;
    if (typeof o === 'string') return pdfSafe(o);
    if (Array.isArray(o)) return o.map(deepSafe);
    if (typeof o === 'object') {
      Object.keys(o).forEach(function (k) {
        if (SAFE_SKIP_KEYS.test(k)) return;
        o[k] = deepSafe(o[k]);
      });
    }
    return o;
  }
  function pdfModel() {
    var t = totalsAcross(), b = budget();
    var circuits = deriveCircuits();
    var strip = E.item(cfg.led.stripId);
    var wpm = strip ? ((strip.specs || {}).w_per_m || 10) : 10;
    var dl = E.item(cfg.picks.downlight);
    var floors = floorsInUse();
    var m = {
      title: cfg.client.project || 'Your Home',
      client: cfg.client.name, project: cfg.client.project,
      quoteRef: cfg._lastRef,
      heroImage: CFG.heroImage || null,
      introText: 'A whole-home lighting design, engineered as one system — layered light, warm colour, considered circuits and scene control. This proposal sets out the fixture specification, the light levels behind it and the control intent; commercials follow on the formal quotation.',
      scope: cfg.scope || 'full',
      scopeLabel: ((CFG.scopeModes || []).find(function (s) { return s.id === cfg.scope; }) || {}).label || null,
      stats: [
        ['Rooms', String(cfg.rooms.length)],
        ['Fittings', String(t.fixtures) + (cfg.scope === 'others' ? ' (by others)' : '')],
        t.ledM ? ['Linear LED', t.ledM + ' m'] : null,
        ['Circuits', String(circuits.length)],
        ['Colour', cfg.cct + 'K' + (cfg.dimToWarm ? ' · dim-to-warm' : '')],
        ['Control', ((CFG.controlSystems || []).find(function (c) { return c.id === cfg.control.system; }) || {}).label || cfg.control.system],
        ['Keypads', String(t.keypads)]
      ].filter(Boolean),
      // v0.3.0 — per-room control schedule (keypads + circuits, PDF-drawn mockups)
      controlByRoom: floors.map(function (fc) {
        return {
          code: fc,
          rooms: roomsOfFloor(fc).map(function (r) {
            var rows = circuits.filter(function (c) { return c.floorCode === (r.floorCode || 'GF') && c.room === r.name; });
            var kp = (r.keypads || 0) > 0 ? kpFor(r) : null;
            var fin = kp ? finishOf(kp.finish) : null;
            var rng3 = activeKpRange();
            return {
              name: r.name,
              circuits: rows,
              keypads: kp ? { qty: r.keypads, buttons: kp.buttons, engravings: kp.engravings.slice(0, kp.buttons), location: kp.location || null, finishLabel: fin.label, finishCode: fin.code || null, finishHex: fin.hex, finishTxtHex: fin.txt, rangeLabel: rng3.label || null } : null
            };
          }).filter(function (r) { return r.circuits.length || r.keypads; })
        };
      }).filter(function (f) { return f.rooms.length; }),
      blurbs: CFG.sectionBlurbs || {},
      layers: CFG.layers || [],
      luxEstimated: true,
      // v0.5.0 — colour story + compliance + garden layer
      cct: cfg.cct,
      dimToWarm: !!cfg.dimToWarm,
      calcBasis: 'Lumen method to CIBSE residential guidance · utilisation 0.5 · maintenance 0.8 — levels quoted are maintained values',
      partL: (function () {
        if (cfg.scope === 'others') return null;   // fittings by others — their compliance
        var pl = partL();
        return pl ? { avg: pl.avgLmw, min: pl.min, pass: pl.pass, skipped: pl.skipped } : null;
      })(),
      exterior: (function () {
        var rooms = cfg.rooms.filter(function (r) { return r.type === 'exterior' || (r.floorCode || '') === 'EXT'; });
        var zones = rooms.map(function (r) {
          var bits = [];
          (CFG.fixtureKinds || []).forEach(function (k) {
            var c2 = (r.counts || {})[k.id];
            if (c2) bits.push(k.label + ' ×' + c2);
          });
          var ledM2 = (r.ledRuns || []).reduce(function (s, l) { return s + (Number(l.metres) || 0); }, 0);
          if (ledM2) bits.push('Linear LED ' + (Math.round(ledM2 * 10) / 10) + ' m');
          return { name: r.name, summary: bits.join('  ·  ') };
        }).filter(function (z) { return z.summary; });
        if (!zones.length) return null;
        var itx = E.item(cfg.picks.exterior);
        return { zones: zones, cct: itx && (itx.cct || []).length ? Math.min.apply(null, itx.cct) : null };
      })(),
      floors: floors.map(function (fc) {
        return {
          code: fc,
          rooms: roomsOfFloor(fc).map(function (r) {
            var rt = roomType(r.type) || {};
            var got = roomLuxEstimate(r);
            var fitBits = [];
            (CFG.fixtureKinds || []).forEach(function (k) {
              var c2 = (r.counts || {})[k.id];
              if (c2) fitBits.push((KIND_REFS[k.id] || '?') + ' ×' + c2);
            });
            var ledM = (r.ledRuns || []).reduce(function (s, l) { return s + (Number(l.metres) || 0); }, 0);
            if (ledM) fitBits.push('ST ×' + (Math.round(ledM * 10) / 10) + 'm');
            var w = 0;
            Object.keys(r.counts || {}).forEach(function (k) {
              var it2 = E.item(cfg.picks[k]);
              var kd = kindDef(k) || {};
              w += (r.counts[k] || 0) * ((it2 && it2.watts) || kd.wDefault || 5);
            });
            return {
              name: r.name, typeLabel: rt.label || r.type,
              target: rt.ambient || null, task: rt.task || null, taskNote: rt.taskNote || null,
              achieved: got != null ? Math.round(got) : null,
              watts: Math.round(w),
              count: Object.keys(r.counts || {}).reduce(function (s, k) { return s + (r.counts[k] || 0); }, 0),
              summary: fitBits.join('  ·  ') || 'wiring only'
            };
          })
        };
      }),
      fixtures: kindsInUse().map(function (k) {
        var it = E.item(cfg.picks[k.id]);
        var n = t.byKind[k.id] || 0;
        if (!it && !n) return null;
        var usedIn = [];
        cfg.rooms.forEach(function (r) {
          var c2 = (r.counts || {})[k.id];
          if (c2) usedIn.push({ room: r.name, qty: c2 });
        });
        var md = (it && it.metadata) || {};
        return {
          ref: KIND_REFS[k.id] || '?',
          // v0.5.0 — unpicked garden kinds skip the cut-sheet page (they are
          // summarised on the Exterior & garden page; a TBC page adds nothing)
          gardenTbc: !it && !!k.noSeed,
          kind: k.label, layer: k.layer, qty: n,
          name: it ? it.name : 'TBC — chosen at design development',
          manufacturer: it ? (it.manufacturer || '') : '',
          range: it ? (it.range || null) : null,
          description: it ? (it.description || null) : null,
          watts: it ? it.watts : null,
          lumens: it ? itemLumens(it) : null,
          cctText: it ? ((it.cct || []).length ? it.cct.join(' / ') + 'K' : ((it.specs || {}).cct_tunable ? String(it.specs.cct_tunable) : null)) : null,
          cri: it ? it.cri : null,
          beams: it ? (it.beam || []) : [],
          beamZoom: it ? ((it.specs || {}).beam_zoom || null) : null,
          ip: it ? it.ip : null,
          dimmingText: it ? ((it.dimming || []).length ? it.dimming.join(' / ') : null) : null,
          voltage: it ? it.voltage : null,
          finishes: it ? (((it.specs || {}).finishes) || []).slice(0, 6) : [],
          img: it ? it.img : null,
          dsMirror: md.datasheet_mirror || null,
          usedIn: usedIn,
          url: it ? it.product_url : null,
          datasheet: it ? it.datasheet_url : null,
          ies: it ? it.ies_url : null
        };
      }).filter(Boolean),
      includeDatasheets: true,
      led: t.ledM ? {
        totalM: t.ledM,
        strip: strip ? {
          name: strip.name, manufacturer: strip.manufacturer,
          spec: [
            (strip.specs || {}).lm_per_m ? strip.specs.lm_per_m + ' lm/m' : null,
            (strip.specs || {}).w_per_m ? strip.specs.w_per_m + ' W/m' : null,
            (strip.cct || []).length ? strip.cct.join('/') + 'K' : null,
            strip.cri ? 'CRI ' + strip.cri + '+' : null,
            strip.voltage ? strip.voltage + 'V' : null,
            strip.ip || null
          ].filter(Boolean).join('  ·  '),
          url: strip.product_url, datasheet: strip.datasheet_url, img: strip.img || null
        } : null,
        runs: ledRunsAll().map(function (r) {
          var eng = C.stripRun(r.metres, wpm);
          return { where: r.floorCode + ' · ' + r.room, metres: r.metres,
                   load: eng ? eng.load_w : null, driver: eng ? ((eng.drivers > 1 ? eng.drivers + '× ' : '') + eng.driver_w + ' W') : null,
                   loaded: eng ? eng.loaded_pct + '%' : null, feeds: eng ? eng.feeds : 1 };
        })
      } : null,
      circuits: floors.map(function (fc) {
        return { code: fc, rows: circuits.filter(function (c) { return c.floorCode === fc; }) };
      }).filter(function (f) { return f.rows.length; }),
      circuitTotalW: circuits.reduce(function (s, c) { return s + (c.watts || 0); }, 0),
      scenes: sceneTypesInUse().map(function (tid) {
        var rt = roomType(tid) || { label: tid };
        return { room: rt.label, seeds: ((CFG.sceneSeeds || {})[tid] || (CFG.sceneSeeds || {})._default || []) };
      }),
      houseScenes: (CFG.houseScenes || []).map(function (sc) {
        return { label: sc.label, note: sc.note, actions: ((cfg.control || {}).sceneActions || {})[sc.label] || null };
      }),
      budget: b.lines.length ? b : null,
      termsLines: (cfg.scope === 'others'
        ? ['Light fittings are supplied and installed by others — this document delivers the room design targets, circuit schedule, control specification, keypad engraving schedule and scenes.']
        : []).concat(CFG.termsLines || []),
      dateText: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    };
    deepSafe(m);
    m.filename = 'sonor-lighting-design-' + (m.quoteRef || 'draft') + '.pdf';
    return m;
  }
  async function savePdf() {
    cfg._lastRef = makeRef();
    var m = pdfModel();
    if (global.LightingPdf && global.LightingPdf.available()) {
      try { await global.LightingPdf.generate(m); return; } catch (e) { console.warn('[lighting] pdf failed', e); }
    }
    window.print();
  }

  global.LightingApp = {
    boot: boot, enter: enter, backToIntro: backToIntro, goBack: goBack, jumpTo: jumpTo, jumpRefresh: jumpRefresh,
    pullPlan: pullPlan, setRoom: setRoom, setCount: setCount, setMix: setMix, setLed: setLed,
    removeRoom: removeRoom, addRoom: addRoom, addFromArea: addFromArea,
    pick: pick, setCct: setCct, setDtw: setDtw, setStrip: setStrip, setProfile: setProfile,
    setControl: setControl, setSceneAction: setSceneAction, setClient: setClient, setScope: function (id) { cfg.scope = id; renderStep(); },
    setKpDefault: setKpDefault, setKp: setKp, setKpEngr: setKpEngr,
    saveConfig: saveConfig, openSaved: openSaved, savePdf: savePdf,
    openFromOverview: openFromOverview,
    _renderOverview: renderOverview,   // harness hook (headless overview render)
    _debug: function () { return { cfg: cfg, ctx: ctx }; }   // harness hook (headless render tests)
  };
})(window);
