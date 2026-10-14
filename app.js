/* Mängdkollen – räkna åtgång för avjämning, fix och bruk */
(function () {
  'use strict';

  // ---- Inställningar för kontaktformuläret --------------------------------
  // formEndpoint: t.ex. en Formspree-adress (https://formspree.io/f/xxxx). Skickas som JSON.
  // email:        används som reserv (öppnar e-postprogrammet) om formEndpoint saknas.
  var CONFIG = {
    name: 'Björn',
    formEndpoint: '',
    email: 'bjorn.jkpg@gmail.com'
  };

  var D = window.ATGANG_DATA;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var nf0 = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });
  var nf2 = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 });
  var nf4 = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 4 });
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(el) {
    var v = parseFloat(String(el.value).replace(/\s/g, '').replace(',', '.'));
    return isFinite(v) ? v : NaN;
  }
  function range(fmt, a, b) {
    return b != null && b !== a ? fmt.format(a) + '–' + fmt.format(b) : fmt.format(a);
  }

  /* =========================================================
     Tema
     ========================================================= */
  var root = document.documentElement;
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  var themeToggle = $('#themeToggle');
  var themeAuto = $('#themeAuto');

  function effectiveDark() {
    var t = root.dataset.theme;
    return t ? t === 'dark' : mq.matches;
  }
  function syncTheme() {
    var dark = effectiveDark();
    themeToggle.setAttribute('aria-checked', String(dark));
    themeAuto.hidden = !root.dataset.theme;
    var bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) { m.setAttribute('content', bg); });
  }
  themeToggle.addEventListener('click', function () {
    var next = effectiveDark() ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
    syncTheme();
  });
  themeAuto.addEventListener('click', function () {
    delete root.dataset.theme;
    try { localStorage.removeItem('theme'); } catch (e) {}
    syncTheme();
  });
  (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(syncTheme);
  syncTheme();

  /* =========================================================
     Statistik
     ========================================================= */
  var enabledUsage = D.usage.filter(function (u) { return u.enabled; });
  var calcProducts = new Set(enabledUsage.map(function (u) { return u.productId; }));
  $('#stats').innerHTML = [
    ['Fabrikat', D.brands.length],
    ['Produkter', D.products.length],
    ['Med kalkyl', calcProducts.size],
    ['Verifierat', D.checked]
  ].map(function (s) { return '<div><dt>' + s[0] + '</dt><dd>' + esc(s[1]) + '</dd></div>'; }).join('');
  $('#footerMeta').textContent = 'Data kontrollerad mot tillverkarnas källor ' + D.checked + '. ' +
    D.usage.length + ' åtgångsrader, varav ' + enabledUsage.length + ' med aktiv kalkyl.';

  /* =========================================================
     Kalkylator
     ========================================================= */
  // Fog och silikon är generella räknare med var sin knapp
  var FOG_MODE = { 'Fog': 'joint', 'Silikon': 'seal' };
  function isFog(g) { return Object.prototype.hasOwnProperty.call(FOG_MODE, g === undefined ? state.group : g); }
  var GROUPS = ['Avjämningsmassa', 'Bruk', 'Fix', 'Primer, tätskikt & spackel', 'Betong', 'EPS-betong', 'Fog', 'Silikon'];
  var FOG_DEFAULT_RHO = 1.6; // snitt av Schönox cementfogar (1,45–1,88 kg/l)
  // Generella räknare för fog och silikon (ersätter enskilda fogprodukter i kalkylatorn)
  var GENERIC = {
    joint: {
      id: 'FOG', brand: 'Generell', product: 'Fog för kakel och klinker', model: 'JOINT', unit: 'kg/l fogvolym',
      enabled: true, joint: null, extras: [], packKg: 15, url: null, status: 'Uppskattning',
      packs: [{ kg: 5, label: '5 kg påse' }, { kg: 15, label: '15 kg säck' }, { kg: 20, label: '20 kg säck' }],
      ref: '((L+B)/(L×B)) × fogbredd × fogdjup × densitet',
      check: 'Densiteten avgör åtgången. Utan tillverkarens värde används ett snitt för cementbaserade fogbruk (Schönox: 1,45–1,88 kg/l)'
    },
    seal: {
      id: 'SIL', brand: 'Generell', product: 'Silikon / mjukfog', model: 'SEALANT', unit: 'ml', min: 1,
      enabled: true, joint: null, extras: [], packKg: 300, url: null, status: 'Geometrisk beräkning',
      packs: [{ kg: 290, label: '290 ml patron' }, { kg: 300, label: '300 ml patron' }, { kg: 600, label: '600 ml foliepåse' }],
      ref: 'Fogbredd × fogdjup × längd',
      check: 'Rektangulär fogprofil. Bottningslist och konkav fog minskar åtgången något'
    }
  };
  var MODEL_TEXT = {
    AREA_THICKNESS: 'Yta × skikt × faktor',
    AREA: 'Yta × faktor',
    AREA_TROWEL: 'Yta × tandspackelfaktor',
    VOLUME_YIELD: 'Volym ÷ utbyte per säck',
    JOINT: 'Fogvolym × faktor',
    SEALANT: 'Bredd × djup × längd',
    UNSUPPORTED: 'Kräver geometri'
  };
  var el = {
    chips: $('#groupChips'), brand: $('#brandSelect'), usage: $('#usageSelect'), info: $('#productInfo'),
    area: $('#area'), thickness: $('#thickness'), waste: $('#waste'), wasteOut: $('#wasteOut'), pack: $('#pack'),
    packSelect: $('#packSelect'), packCustom: $('#packCustom'),
    slopeToggle: $('#slopeToggle'), slopeBox: $('#slopeBox'), slopeMin: $('#slopeMin'), slopeMax: $('#slopeMax'),
    jointBox: $('#jointBox'), tileL: $('#tileL'), tileB: $('#tileB'), jointW: $('#jointW'), jointD: $('#jointD'),
    sealBox: $('#sealBox'), sealW: $('#sealW'), sealD: $('#sealD'), sealLen: $('#sealLen'), packUnit: $('#packUnit'),
    jointRho: $('#jointRho'), jointHint: $('#jointHint'), productPick: $('#productPick'),
    trowel: $('#trowelSelect'), trowelField: document.querySelector('[data-for="trowel"]'),
    result: $('#result'), calcForm: $('#calcForm')
  };
  var SAVED_INPUTS = ['area', 'thickness', 'waste', 'tileL', 'tileB', 'jointW', 'jointD', 'jointRho', 'sealW', 'sealD', 'sealLen'];
  var saved = store.get('calc') || {};
  var state = { group: saved.group || GROUPS[0], brand: saved.brand || null, usageId: saved.usageId || null, packTouched: false,
    perGroup: saved.perGroup || {} };  // senaste val per kategori: { grupp: { brand, usageId } }
  SAVED_INPUTS.forEach(function (k) { if (saved[k] != null) el[k].value = saved[k]; });
  if (num(el.jointRho) !== FOG_DEFAULT_RHO) el.jointHint.textContent = 'Sparad densitet från förra besöket. Snittvärdet för cementbaserade fogbruk är ' + nf2.format(FOG_DEFAULT_RHO) + ' kg/l.';

  function rowsIn(group) { return D.usage.filter(function (u) { return group === 'Alla' || u.group === group; }); }

  function renderChips() {
    el.chips.innerHTML = GROUPS.map(function (g) {
      // antal valbara produkter (fix med flera tandningar räknas en gång)
      var keys = {};
      rowsIn(g).forEach(function (u) { if (u.enabled) keys[u.model === 'AREA_TROWEL' ? u.productId : u.id] = 1; });
      var n = Object.keys(keys).length;
      return '<button type="button" class="chip" role="radio" aria-checked="' + (g === state.group) + '" data-g="' + esc(g) + '">' +
        esc(g) + (isFog(g) ? '' : '<small>' + n + '</small>') + '</button>';
    }).join('');
    var sel = el.chips.querySelector('[aria-checked="true"]');
    if (sel && el.chips.scrollWidth > el.chips.clientWidth) {
      el.chips.scrollLeft = sel.offsetLeft - el.chips.offsetLeft - (el.chips.clientWidth - sel.offsetWidth) / 2;
    }
  }
  el.chips.addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (!b) return;
    state.group = b.dataset.g;
    var mem = state.perGroup[state.group] || {};
    state.brand = mem.brand || null;
    state.usageId = mem.usageId || null;
    renderChips(); renderBrands(); renderUsage(); update();
  });
  el.jointRho.addEventListener('input', function () {
    el.jointHint.textContent = 'Egen densitet. Snittvärdet för cementbaserade fogbruk är ' + nf2.format(FOG_DEFAULT_RHO) + ' kg/l.';
    update();
  });

  function renderBrands() {
    if (isFog()) return;
    var rows = rowsIn(state.group);
    var brands = [];
    rows.forEach(function (u) { if (brands.indexOf(u.brand) < 0) brands.push(u.brand); });
    brands.sort(function (a, b) {
      // fabrikat med aktiv kalkyl först, sedan alfabetiskt
      var ea = rows.some(function (u) { return u.brand === a && u.enabled; });
      var eb = rows.some(function (u) { return u.brand === b && u.enabled; });
      return ea === eb ? a.localeCompare(b, 'sv') : (ea ? -1 : 1);
    });
    if (brands.indexOf(state.brand) < 0) state.brand = brands[0];
    el.brand.innerHTML = brands.map(function (b) {
      var n = rows.filter(function (u) { return u.brand === b && u.enabled; }).length;
      return '<option value="' + esc(b) + '"' + (b === state.brand ? ' selected' : '') + '>' + esc(b) + (n ? '' : ' (ingen kalkyl)') + '</option>';
    }).join('');
  }
  el.brand.addEventListener('change', function () {
    state.brand = el.brand.value; state.usageId = null; renderUsage(); update();
  });

  function usageLabel(u) {
    var ref = u.ref && u.ref.length > 44 ? u.ref.slice(0, 42) + '…' : u.ref;
    return u.product + (ref ? ' · ' + ref : '') + (u.enabled ? '' : ' (ingen kalkyl)');
  }
  // Fix: en rad per produkt i listan, tandningen väljs i en egen lista
  function isTrowel(u) { return u.model === 'AREA_TROWEL'; }
  function trowelLabel(u) { return (u.ref || '').replace(/\s*tandning$/i, ''); }
  function trowelSize(u) { var m = /(\d+(?:[.,]\d+)?)/.exec(u.ref || ''); return m ? parseFloat(m[1].replace(',', '.')) : 0; }
  function defaultTrowel(members) {
    // 8 mm är tillverkarnas vanligaste referens; annars första
    return members.find(function (u) { return u.enabled && trowelSize(u) === 8; }) ||
      members.find(function (u) { return u.enabled && /normal|plattsättning|golv \(/i.test(u.ref || ''); }) ||
      members.find(function (u) { return u.enabled; }) || members[0];
  }
  var entries = [];
  function entryOf(id) { return entries.find(function (e) { return e.members.some(function (u) { return u.id === id; }); }); }
  function renderUsage() {
    if (isFog()) { el.trowelField.dataset.hidden = 'true'; renderPacks(current()); return; }
    var rows = rowsIn(state.group).filter(function (u) { return u.brand === state.brand; });
    var byKey = {};
    entries = [];
    rows.forEach(function (u) {
      var key = isTrowel(u) ? 'P:' + u.productId : u.id;
      if (!byKey[key]) entries.push(byKey[key] = { key: key, members: [] });
      byKey[key].members.push(u);
    });
    entries.forEach(function (e) {
      e.members.sort(function (a, b) { return trowelSize(a) - trowelSize(b); });
      e.enabled = e.members.some(function (u) { return u.enabled; });
      // referenstext bara när produkten har flera varianter (t.ex. HA med KH resp. SPR)
      var u0 = e.members[0];
      var variants = rows.filter(function (u) { return u.productId === u0.productId; }).length;
      e.label = isTrowel(u0) || variants === 1 ? u0.product + (e.enabled ? '' : ' (ingen kalkyl)') : usageLabel(u0);
    });
    entries.sort(function (a, b) { return (a.enabled === b.enabled ? 0 : a.enabled ? -1 : 1) || a.label.localeCompare(b.label, 'sv'); });
    var sel = entryOf(state.usageId) || entries[0];
    if (sel && !sel.members.some(function (u) { return u.id === state.usageId; })) state.usageId = defaultTrowel(sel.members).id;
    if (!sel) state.usageId = null;
    el.usage.innerHTML = entries.map(function (e) {
      return '<option value="' + esc(e.key) + '"' + (e === sel ? ' selected' : '') + '>' + esc(e.label) + '</option>';
    }).join('');
    renderTrowel(sel);
    renderPacks(current());
  }
  function renderTrowel(entry) {
    var show = !!entry && isTrowel(entry.members[0]);
    el.trowelField.dataset.hidden = String(!show);
    if (!show) return;
    el.trowel.innerHTML = entry.members.map(function (u) {
      return '<option value="' + u.id + '"' + (u.id === state.usageId ? ' selected' : '') + '>' + esc(trowelLabel(u)) + (u.enabled ? '' : ' (ingen kalkyl)') + '</option>';
    }).join('');
  }
  el.usage.addEventListener('change', function () {
    var e = entries.find(function (x) { return x.key === el.usage.value; });
    state.usageId = e ? defaultTrowel(e.members).id : null;
    renderTrowel(e);
    renderPacks(current());
    update();
  });
  el.trowel.addEventListener('change', function () {
    state.usageId = el.trowel.value; // samma produkt: behåll vald förpackning
    update();
  });

  // Förpackningar: lista med tillverkarens storlekar + "Annan storlek"
  function renderPacks(u) {
    var packs = (u && u.packs) || [];
    var sel = packs.some(function (p) { return p.kg === (u && u.packKg); }) ? u.packKg : (packs[0] && packs[0].kg);
    el.packSelect.innerHTML = packs.map(function (p) {
      return '<option value="' + p.kg + '"' + (p.kg === sel ? ' selected' : '') + '>' + esc(p.label) + '</option>';
    }).join('') + '<option value="custom"' + (packs.length ? '' : ' selected') + '>' + (packs.length ? 'Annan storlek…' : 'Ange egen vikt…') + '</option>';
    el.pack.value = '';
    syncPackCustom();
  }
  function syncPackCustom() {
    var custom = el.packSelect.value === 'custom';
    el.packCustom.hidden = !custom;
    state.packTouched = custom;
  }
  function selectedPack() {
    if (el.packSelect.value === 'custom') {
      var v = num(el.pack);
      return v > 0 ? { kg: v, label: nf2.format(v) + (current() && current().model === 'SEALANT' ? ' ml' : ' kg') + ' (egen)' } : null;
    }
    var u = current(), kg = parseFloat(el.packSelect.value);
    return (u && u.packs.find(function (p) { return p.kg === kg; })) || null;
  }
  el.packSelect.addEventListener('change', function () {
    syncPackCustom();
    if (state.packTouched) el.pack.focus();
    update();
  });
  el.pack.addEventListener('input', update);

  // "SCHÖNOX" + "SCHÖNOX Q4" ska bli "SCHÖNOX Q4"
  function fullName(u) {
    return u.product.toLowerCase().indexOf(u.brand.toLowerCase()) === 0 ? u.product : u.brand + ' ' + u.product;
  }
  function current() {
    if (isFog()) {
      var g = GENERIC[FOG_MODE[state.group]];
      if (FOG_MODE[state.group] === 'joint') g.min = num(el.jointRho) > 0 ? num(el.jointRho) : FOG_DEFAULT_RHO;
      return g;
    }
    return D.usage.find(function (u) { return u.id === state.usageId; }) || null;
  }

  // Lutande yta
  el.slopeToggle.addEventListener('click', function () {
    el.slopeBox.hidden = !el.slopeBox.hidden;
    el.slopeToggle.textContent = el.slopeBox.hidden ? 'Lutande yta? Räkna medeltjocklek' : 'Ange medeltjocklek direkt';
    el.thickness.readOnly = !el.slopeBox.hidden;
    syncSlope(); update();
  });
  function syncSlope() {
    if (el.slopeBox.hidden) return;
    var a = num(el.slopeMin), b = num(el.slopeMax);
    if (isFinite(a) && isFinite(b)) el.thickness.value = String(Math.round(((a + b) / 2) * 10) / 10).replace('.', ',');
  }
  [el.slopeMin, el.slopeMax].forEach(function (i) { i.addEventListener('input', function () { syncSlope(); update(); }); });
  [el.area, el.thickness, el.tileL, el.tileB, el.jointW, el.jointD, el.sealW, el.sealD, el.sealLen].forEach(function (i) { i.addEventListener('input', update); });
  el.waste.addEventListener('input', update);

  function infoTags(u) {
    var t = [];
    t.push('<span class="tag">' + esc(MODEL_TEXT[u.model]) + '</span>');
    if (u.min != null) t.push('<span class="tag">' + range(nf4, u.min, u.max) + ' ' + esc(u.unit) + '</span>');
    if (u.joint) t.push('<span class="tag">Fogbredd ' + nf1.format(u.joint[0]) + '–' + nf1.format(u.joint[1]) + ' mm</span>');
    if (u.layerMin != null || u.layerMax != null) {
      t.push('<span class="tag">Skikt ' + (u.layerMin == null ? 'max ' + nf1.format(u.layerMax) : u.layerMax == null ? 'från ' + nf1.format(u.layerMin) :
        nf1.format(u.layerMin) + '–' + nf1.format(u.layerMax)) + ' mm</span>');
    }
    var ok = /verifierat/i.test(u.status || '');
    t.push('<span class="tag ' + (ok ? 'tag--ok' : 'tag--warn') + '">' + esc(u.status || 'Status saknas') + '</span>');
    if (u.corrected) t.push('<span class="tag tag--fixed" title="Värdet korrigerat efter kontroll ' + esc(D.checked) + '">Korrigerad ' + esc(D.checked) + '</span>');
    return t.join('');
  }

  var bagIcon = '<svg class="bags__icon" viewBox="0 0 40 40" aria-hidden="true"><path d="M9 8h22l3 6-2 20H8L6 14z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M6 14h28M14 21h12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

  function sourceLink(u) {
    return u.url ? '<a class="source" href="' + esc(u.url) + '" target="_blank" rel="noopener">Öppna tillverkarens källa ↗</a>' : '';
  }
  function checkNote(u) {
    var parts = [];
    if (u.ref) parts.push('Referens: ' + u.ref + '.');
    if (u.check) parts.push(u.check + '.');
    if (u.original) parts.push('Originaluppgift: ”' + u.original + '”.');
    return parts.length ? '<div class="note"><strong>Kontrollera</strong><p>' + esc(parts.join(' ')) + '</p></div>' : '';
  }

  function renderResult() {
    el.wasteOut.textContent = el.waste.value + ' %';
    var u = current();
    var isFogGroup = isFog();
    el.productPick.dataset.hidden = String(isFogGroup);
    if (!isFog() && state.usageId) state.perGroup[state.group] = { brand: state.brand, usageId: state.usageId };
    var snapshot = { group: state.group, brand: state.brand, usageId: state.usageId, perGroup: state.perGroup };
    SAVED_INPUTS.forEach(function (k) { snapshot[k] = el[k].value; });
    store.set('calc', snapshot);

    if (!u) {
      el.info.innerHTML = '';
      el.result.innerHTML = '<p class="result__title">Resultat</p><p class="empty">Inga produkter i den här gruppen ännu.</p>';
      return;
    }
    el.info.innerHTML = infoTags(u);
    var needsT = u.model === 'AREA_THICKNESS' || u.model === 'VOLUME_YIELD';
    document.querySelector('[data-for="thickness"]').dataset.hidden = String(!needsT);
    el.slopeBox.dataset.hidden = String(!needsT);
    var isJoint = u.model === 'JOINT', isSeal = u.model === 'SEALANT';
    el.jointBox.dataset.hidden = String(!(isJoint && u.enabled));
    el.sealBox.dataset.hidden = String(!(isSeal && u.enabled));
    document.querySelector('[data-for="area"]').dataset.hidden = String(isSeal);
    document.querySelector('[data-for="pack"]').dataset.hidden = String(!u.enabled);
    var unit = isSeal ? 'ml' : 'kg';
    el.packUnit.textContent = unit;

    var head = '<p class="result__title">Resultat</p><p class="result__product">' + esc(isFogGroup ? u.product : fullName(u)) + '</p>';

    if (!u.enabled) {
      el.result.innerHTML = head +
        '<div class="note note--block"><strong>Ingen automatisk mängd</strong><p>' + esc(u.blockReason || 'Villkor saknas') +
        '. Registrerat värde: ' + (u.min != null ? range(nf2, u.min, u.max) + ' ' + esc(u.unit) : 'saknas') + '.</p></div>' +
        checkNote(u) + sourceLink(u);
      return;
    }

    var A = num(el.area), T = num(el.thickness), W = num(el.waste) / 100;
    var pk = selectedPack(), P = pk ? pk.kg : NaN;
    var err = null;
    var tl = num(el.tileL) * 10, tb = num(el.tileB) * 10, jw = num(el.jointW), jd = num(el.jointD);
    var sw = num(el.sealW), sd = num(el.sealD), sl = num(el.sealLen);
    el.area.setAttribute('aria-invalid', String(!isSeal && !(A > 0)));
    el.thickness.setAttribute('aria-invalid', String(needsT && !(T > 0)));
    el.jointW.setAttribute('aria-invalid', String(isJoint && u.joint && !(jw >= u.joint[0] && jw <= u.joint[1])));
    if (!isSeal && !(A > 0)) err = 'Ange en yta större än noll.';
    else if (needsT && !(T > 0)) err = 'Ange en medeltjocklek större än noll.';
    else if (isJoint && !(tl > 0 && tb > 0 && jw > 0 && jd > 0)) err = 'Ange plattans mått, fogbredd och fogdjup.';
    else if (isJoint && u.joint && (jw < u.joint[0] || jw > u.joint[1])) {
      err = 'Fogbredden ' + nf1.format(jw) + ' mm ligger utanför produktens intervall ' + nf1.format(u.joint[0]) + '–' + nf1.format(u.joint[1]) + ' mm.';
    }
    else if (isSeal && !(sw > 0 && sd > 0 && sl > 0)) err = 'Ange fogbredd, fogdjup och foglängd.';
    else if (needsT && ((u.layerMin != null && T < u.layerMin) || (u.layerMax != null && T > u.layerMax))) {
      var span = u.layerMin == null ? 'högst ' + nf1.format(u.layerMax) : u.layerMax == null ? 'minst ' + nf1.format(u.layerMin) :
        nf1.format(u.layerMin) + '–' + nf1.format(u.layerMax);
      err = 'Skikttjockleken ' + nf1.format(T) + ' mm passar inte produkten (' + span + ' mm). Välj en annan produkt eller justera skiktet.';
    }
    if (err) {
      el.result.innerHTML = head + '<div class="note note--warn"><strong>Kan inte räkna ännu</strong><p>' + esc(err) + '</p></div>' + checkNote(u) + sourceLink(u);
      return;
    }

    var html = head;
    if (u.model === 'VOLUME_YIELD') {
      var liters = A * T * (1 + W); // m² × mm = liter
      if (!(P > 0)) P = u.packKg, pk = { label: nf1.format(u.packKg) + ' kg säck' };
      // utbytet (l/säck) skalas med förpackningens vikt; intervall ger antal säckar min–max
      var yMin = u.min / u.packKg * P, yMax = (u.max != null ? u.max : u.min) / u.packKg * P;
      var bagsMin = Math.ceil(liters / yMax - 1e-9), bagsMax = Math.ceil(liters / yMin - 1e-9);
      html += '<div class="big"><span class="big__num">' + nf0.format(liters) + '</span><span class="big__unit">liter färdig massa</span></div>' +
        '<div class="bags">' + bagIcon + '<div><div class="bags__num">' + (bagsMin === bagsMax ? nf0.format(bagsMax) : nf0.format(bagsMin) + '–' + nf0.format(bagsMax)) +
        ' st</div><div class="bags__txt">' + esc(pk.label) + ' · ca ' + range(nf1, yMin, yMax !== yMin ? yMax : null) + ' l per st</div></div></div>' +
        '<dl class="kv"><dt>Volym utan spill</dt><dd>' + nf1.format(A * T) + ' l (' + nf2.format(A * T / 1000) + ' m³)</dd>' +
        '<dt>Utbyte enligt källa</dt><dd>' + range(nf1, u.min, u.max) + ' l / ' + nf0.format(u.packKg) + ' kg</dd>' +
        '<dt>Torrvikt</dt><dd>' + nf0.format(bagsMax * P) + ' kg</dd>';
      if (u.waterMin != null) {
        var wPer = P / u.packKg;
        html += '<dt>Blandningsvatten</dt><dd class="hl">ca ' + nf0.format(bagsMin * u.waterMin * wPer) +
          (bagsMax * (u.waterMax || u.waterMin) !== bagsMin * u.waterMin ? '–' + nf0.format(bagsMax * (u.waterMax || u.waterMin) * wPer) : '') + ' l</dd>' +
          '<dt>Vatten per säck</dt><dd>' + range(nf1, u.waterMin, u.waterMax) + ' l / ' + nf0.format(u.packKg) + ' kg</dd>';
      }
      html += '<dt>Spill</dt><dd>' + nf0.format(W * 100) + ' %</dd></dl>';
    } else {
      // Bas: m² (yta), m²·mm (skikt), liter fogvolym (fog) eller ml (mjukfog)
      var jointLpm2 = isJoint ? (tl + tb) / (tl * tb) * jw * jd : 0; // mm-mått ger liter per m²
      var base = u.model === 'AREA_THICKNESS' ? A * T : isJoint ? A * jointLpm2 : isSeal ? sw * sd * sl : A;
      var kgMin = base * u.min * (1 + W);
      var kgMax = base * (u.max != null ? u.max : u.min) * (1 + W);
      var hasRange = Math.abs(kgMax - kgMin) > 0.05;
      var fmtBig = isSeal ? nf0 : nf1;
      html += '<div class="big"><span class="big__num">' + (hasRange ? nf0.format(kgMin) + '–' + nf0.format(kgMax) : fmtBig.format(kgMin)) + '</span><span class="big__unit">' + unit + ' inkl. spill</span></div>';
      if (P > 0) {
        var bMin = Math.ceil(kgMin / P - 1e-9), bMax = Math.ceil(kgMax / P - 1e-9);
        html += '<div class="bags">' + bagIcon + '<div><div class="bags__num">' + (bMin === bMax ? nf0.format(bMin) : nf0.format(bMin) + '–' + nf0.format(bMax)) +
          ' st</div><div class="bags__txt">' + esc(pk.label) + ', avrundat uppåt</div></div></div>';
      } else {
        html += '<div class="note note--warn"><strong>Förpackning saknas</strong><p>' + (u.packs.length ? 'Fyll i förpackningens storlek för att få antal.' :
          'Källan anger ingen förpackningsstorlek för produkten. Fyll i vikten för att få antal.') + '</p></div>';
      }
      (u.extras || []).forEach(function (x) {
        var xkg = base * x.factor * (1 + W);
        html += '<div class="bags bags--extra">' + bagIcon + '<div><div class="bags__num">+ ' + nf0.format(Math.ceil(xkg / x.packKg - 1e-9)) + ' st</div><div class="bags__txt">' +
          esc(x.name) + ' · ' + nf1.format(xkg) + ' kg, ' + nf0.format(x.packKg) + ' kg säck</div></div></div>';
      });
      html += '<dl class="kv">';
      if (!isSeal) html += '<dt>Faktor</dt><dd>' + range(nf4, u.min, u.max) + ' ' + esc(u.unit) + '</dd>';
      if (isJoint) html += '<dt>Fogvolym</dt><dd>' + nf2.format(jointLpm2) + ' l/m² · ' + nf1.format(base) + ' l</dd>' +
        '<dt>Per m² fogad yta</dt><dd>' + nf2.format(jointLpm2 * u.min) + ' kg/m²</dd>';
      if (isSeal) html += '<dt>Per meter fog</dt><dd>' + nf0.format(sw * sd) + ' ml/m</dd>';
      html += '<dt>Utan spill</dt><dd>' + (hasRange ? nf1.format(kgMin / (1 + W)) + '–' + nf1.format(kgMax / (1 + W)) : fmtBig.format(kgMin / (1 + W))) + ' ' + unit + '</dd>';
      if (u.model === 'AREA_THICKNESS') html += '<dt>Färdig volym (geometri)</dt><dd>' + nf0.format(A * T * (1 + W)) + ' l</dd>';
      if (u.waterMin != null && u.packKg) {
        var wMin = kgMin / u.packKg * u.waterMin, wMax = kgMax / u.packKg * (u.waterMax != null ? u.waterMax : u.waterMin);
        html += '<dt>Blandningsvatten</dt><dd class="hl">ca ' + (Math.round(wMin) === Math.round(wMax) ? nf0.format(wMin) : nf0.format(wMin) + '–' + nf0.format(wMax)) + ' l</dd>';
        html += '<dt>Vatten per säck</dt><dd>' + range(nf1, u.waterMin, u.waterMax) + ' l / ' + nf0.format(u.packKg) + ' kg</dd>';
      }
      html += '<dt>Spill</dt><dd>' + nf0.format(W * 100) + ' %</dd></dl>';
    }
    html += checkNote(u) + sourceLink(u);
    el.result.innerHTML = html;
  }

  function update() {
    renderResult();
    syncBar();
  }

  // ---- Fast resultatrad på mobil: visar svaret medan man fyller i fälten ----
  var bar = $('#resultBar'), barMain = $('#resultBarMain'), barSub = $('#resultBarSub');
  var mqMobile = window.matchMedia('(max-width: 920px)');
  function syncBar() {
    var big = el.result.querySelector('.big__num'), unit = el.result.querySelector('.big__unit');
    var bags = el.result.querySelector('.bags__num'), bagsTxt = el.result.querySelector('.bags__txt');
    var note = el.result.querySelector('.note--warn strong, .note--block strong');
    if (big) {
      barMain.textContent = big.textContent + ' ' + (unit ? unit.textContent.replace(' inkl. spill', '') : '');
      barSub.textContent = bags ? bags.textContent + ' · ' + (bagsTxt ? bagsTxt.textContent.split(',')[0].split(' · ')[0] : '') : 'Visa detaljer';
    } else {
      barMain.textContent = note ? note.textContent : 'Resultat';
      barSub.textContent = 'Visa detaljer';
    }
    // Visa raden när man arbetar i formuläret och resultatkortet inte syns
    var vh = window.innerHeight, f = el.calcForm.getBoundingClientRect(), r = el.result.getBoundingClientRect();
    var calcInView = f.top < vh * 0.6 && f.bottom > 120;
    var resultInView = r.top < vh - 120 && r.bottom > 120;
    var show = mqMobile.matches && calcInView && !resultInView;
    bar.classList.toggle('is-visible', show);
    document.body.classList.toggle('has-resultbar', show);
  }
  bar.addEventListener('click', function () { el.result.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  window.addEventListener('scroll', syncBar, { passive: true });
  window.addEventListener('resize', syncBar);
  (mqMobile.addEventListener ? mqMobile.addEventListener.bind(mqMobile, 'change') : mqMobile.addListener.bind(mqMobile))(syncBar);

  // ---- Markera vilken del av sidan man är i (flikrad i appen och menyn i sidhuvudet) ----
  var SECTIONS = ['kalkyl', 'register', 'kontakt'];
  var navLinks = document.querySelectorAll('.tabbar a, .nav a');
  function syncNav() {
    var vh = window.innerHeight, active = SECTIONS[0];
    SECTIONS.forEach(function (id) {
      var sec = document.getElementById(id);
      if (sec && sec.getBoundingClientRect().top < vh * 0.45) active = id;
    });
    // längst ner på sidan: sista sektionen
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) active = SECTIONS[SECTIONS.length - 1];
    navLinks.forEach(function (a) {
      if (a.getAttribute('href') === '#' + active) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }
  window.addEventListener('scroll', syncNav, { passive: true });
  window.addEventListener('resize', syncNav);
  syncNav();

  function selectUsage(id) {
    var u = D.usage.find(function (x) { return x.id === id; });
    if (!u) return;
    if (u.model === 'JOINT' || u.model === 'SEALANT') {
      state.group = u.model === 'JOINT' ? 'Fog' : 'Silikon';
      if (u.model === 'JOINT') {
        el.jointRho.value = String(u.min).replace('.', ',');
        el.jointHint.textContent = 'Densitet för ' + fullName(u) + ' enligt tillverkarens kalkylator' +
          (u.joint ? ' (fogbredd ' + nf1.format(u.joint[0]) + '–' + nf1.format(u.joint[1]) + ' mm)' : '') + '.';
      }
      renderChips(); renderUsage(); update();
      document.getElementById('kalkyl').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    state.group = u.group; state.brand = u.brand; state.usageId = u.id;
    renderChips(); renderBrands(); renderUsage(); update();
    document.getElementById('kalkyl').scrollIntoView({ behavior: 'smooth' });
  }

  if (!GROUPS.includes(state.group)) state.group = GROUPS[0];
  renderChips(); renderBrands(); renderUsage(); update();

  /* =========================================================
     Produktregister
     ========================================================= */
  var reg = { q: '', brand: '', onlyCalc: false, limit: 48 };
  var regList = $('#regList'), regCount = $('#regCount'), regMore = $('#regMore');
  var brandNames = D.brands.map(function (b) { return b.name; }).sort(function (a, b) { return a.localeCompare(b, 'sv'); });
  $('#regBrand').innerHTML = '<option value="">Alla fabrikat</option>' + brandNames.map(function (b) { return '<option>' + esc(b) + '</option>'; }).join('');
  $('#brandList').innerHTML = brandNames.map(function (b) { return '<option value="' + esc(b) + '">'; }).join('');

  var firstEnabled = {};
  enabledUsage.forEach(function (u) {
    // för fix: välj 8 mm-raden om den finns
    var isEight = u.model === 'AREA_TROWEL' && trowelSize(u) === 8;
    if (!firstEnabled[u.productId] || isEight) firstEnabled[u.productId] = u.id;
  });

  function renderReg() {
    var q = reg.q.trim().toLowerCase();
    var list = D.products.filter(function (p) {
      if (reg.brand && p.brand.toLowerCase() !== reg.brand.toLowerCase()) return false;
      if (reg.onlyCalc && !firstEnabled[p.id]) return false;
      if (q && (p.brand + ' ' + p.name + ' ' + p.category).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) {
      return (firstEnabled[a.id] ? 0 : 1) - (firstEnabled[b.id] ? 0 : 1) || a.brand.localeCompare(b.brand, 'sv') || a.name.localeCompare(b.name, 'sv');
    });
    regCount.textContent = list.length + ' av ' + D.products.length + ' poster';
    regList.innerHTML = list.slice(0, reg.limit).map(function (p) {
      var calc = firstEnabled[p.id];
      var gone = /utg/i.test(p.status || '');
      var tags = '<span class="tag">' + esc(p.category) + '</span>' +
        (calc ? '<button class="reg__use" type="button" data-u="' + calc + '">Räkna</button>' :
          '<span class="tag ' + (gone ? 'tag--warn' : '') + '">' + (gone ? 'Utgången' : p.usageRows ? 'Kalkyl blockerad' : 'Åtgång saknas') + '</span>');
      return '<li><span class="reg__brand">' + esc(p.brand) + '</span><span class="reg__name">' + esc(p.name) + '</span>' +
        '<div class="reg__meta">' + tags + (p.url ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener">Källa ↗</a>' : '') + '</div></li>';
    }).join('');
    regMore.hidden = list.length <= reg.limit;
  }
  $('#regSearch').addEventListener('input', function (e) { reg.q = e.target.value; reg.limit = 48; renderReg(); });
  $('#regBrand').addEventListener('change', function (e) { reg.brand = e.target.value; reg.limit = 48; renderReg(); });
  $('#regOnlyCalc').addEventListener('change', function (e) { reg.onlyCalc = e.target.checked; reg.limit = 48; renderReg(); });
  regMore.addEventListener('click', function () { reg.limit += 48; renderReg(); });
  regList.addEventListener('click', function (e) {
    var b = e.target.closest('[data-u]');
    if (b) selectUsage(b.dataset.u);
  });
  renderReg();

  /* =========================================================
     Kontakt
     ========================================================= */
  var photo = $('#contactPhoto');
  photo.alt = 'Porträtt av ' + CONFIG.name;
  photo.addEventListener('error', function () { photo.src = 'img/profil.svg'; }, { once: true });
  $('#contactName').textContent = '/ ' + CONFIG.name;

  var form = $('#contactForm'), msg = $('#formMsg');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    msg.className = 'form-msg'; msg.textContent = '';
    var fd = new FormData(form);
    if (fd.get('_gotcha')) return; // bot
    var bad = null;
    ['namn', 'epost'].forEach(function (n) {
      var i = form.elements[n], ok = i.value.trim() && i.checkValidity();
      i.setAttribute('aria-invalid', String(!ok));
      if (!ok && !bad) bad = i;
    });
    if (!fd.get('fabrikat') && !fd.get('produkt') && !fd.get('meddelande')) {
      msg.className = 'form-msg err'; msg.textContent = 'Skriv vilken produkt du saknar.'; return;
    }
    if (bad) { bad.focus(); msg.className = 'form-msg err'; msg.textContent = 'Fyll i namn och en giltig e-postadress.'; return; }

    var payload = {
      namn: fd.get('namn'), epost: fd.get('epost'), fabrikat: fd.get('fabrikat'),
      produkt: fd.get('produkt'), meddelande: fd.get('meddelande'),
      _subject: 'Produktönskemål: ' + [fd.get('fabrikat'), fd.get('produkt')].filter(Boolean).join(' ')
    };

    if (CONFIG.formEndpoint) {
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      fetch(CONFIG.formEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        form.reset();
        msg.className = 'form-msg ok'; msg.textContent = 'Tack! Ditt önskemål är skickat.';
      }).catch(function () {
        msg.className = 'form-msg err'; msg.textContent = 'Kunde inte skicka just nu. Försök igen senare.';
      }).finally(function () { btn.disabled = false; });
    } else if (CONFIG.email) {
      var body = 'Fabrikat: ' + payload.fabrikat + '\nProdukt: ' + payload.produkt + '\n\n' + payload.meddelande + '\n\n/ ' + payload.namn + ' (' + payload.epost + ')';
      location.href = 'mailto:' + CONFIG.email + '?subject=' + encodeURIComponent(payload._subject) + '&body=' + encodeURIComponent(body);
      msg.className = 'form-msg ok'; msg.textContent = 'Ditt e-postprogram öppnas med meddelandet ifyllt.';
    } else {
      msg.className = 'form-msg err'; msg.textContent = 'Formuläret är inte kopplat ännu. Ange formEndpoint eller email i app.js.';
    }
  });

  /* =========================================================
     PWA: service worker och installation
     ========================================================= */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  var toast = $('#installToast'), installBtn = $('#installBtn'), deferred = null;
  var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  var dismissed = store.get('installDismissed');
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e;
    if (!dismissed) toast.hidden = false;
  });
  installBtn.addEventListener('click', function () {
    if (!deferred) return;
    deferred.prompt();
    deferred.userChoice.finally(function () { deferred = null; toast.hidden = true; });
  });
  $('#installClose').addEventListener('click', function () { toast.hidden = true; store.set('installDismissed', true); });
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  if (isIOS && !standalone && !dismissed) {
    toast.querySelector('span').textContent = 'Installera: tryck Dela och sedan ”Lägg till på hemskärmen”';
    installBtn.hidden = true;
    setTimeout(function () { toast.hidden = false; }, 2500);
  }
  window.addEventListener('appinstalled', function () { toast.hidden = true; });
})();
