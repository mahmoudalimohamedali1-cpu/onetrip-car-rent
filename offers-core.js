/* ============================================================
   One Trip — محرّك العروض والتخفيضات (Offers / Promotions)
   ------------------------------------------------------------
   مصدر واحد لكل ما يخص العروض في الموقع (تجريبي على localStorage):
     - الأدمن يعمل عرضًا ويختار سيارات → يُخزَّن في ot_offers.
     - تظهر شارة/ريبون على صورة السيارة + السعر المخفّض.
     - يُحقن سكشن «عروضنا» في الرئيسية تلقائيًا (بلا تعديل index.html).
     - تُحقن ريبونات على كروت الأسطول/الحجز (auto-wire آمن).

   الواجهة: window.OneTrip.Offers (انظر OFFERS_CONTRACT.md §3).
   كل وصول إلى localStorage داخل try/catch — لا يرمي أبدًا. كل تعديل
   يبثّ 'change' عبر BroadcastChannel('ot_offers') + حدث storage.
   ترتيب التحميل: cars.js ← ثم هذا الملف. ألوان الهوية:
   #1b2a7a / #141d5c / #f5901e.
   ============================================================ */
;(function(){
  'use strict';

  var K_OFFERS = 'ot_offers';
  var CH_NAME  = 'ot_offers';

  /* أيقونات ثابتة: مفتاح → إيموجي (OFFERS_CONTRACT.md §2) */
  var ICONS = {
    school:'🎒', national:'🇸🇦', tag:'🏷️', flash:'⚡', snow:'❄️',
    sun:'☀️', percent:'٪', gift:'🎁', star:'⭐', fire:'🔥'
  };

  /* ---------- أدوات صغيرة دفاعية ---------- */
  function isArr(a){ return Object.prototype.toString.call(a) === '[object Array]'; }
  function num(v){ var n = parseFloat(v); return isNaN(n) ? null : n; }
  /* استخراج رقم من نص قد يحوي أرقامًا عربية-هندية ٠-٩ وفواصل */
  function numFromText(s){
    try {
      var t = String(s == null ? '' : s).replace(/[٠-٩]/g, function(d){
        return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d));
      });
      t = t.replace(/[٬,]/g, '');                 // فواصل آلاف
      var m = t.match(/\d+(?:\.\d+)?/);
      return m ? num(m[0]) : null;
    } catch(e){ return null; }
  }
  function esc(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function nowTs(){ try { return Date.now(); } catch(e){ return +new Date(); } }

  /* تحويل 'YYYY-MM-DD' (أو أي تاريخ) إلى منتصف الليل محليًا للمقارنة */
  function dayStart(v){
    if (!v) return null;
    try {
      var d = new Date(v);
      if (isNaN(d.getTime())) return null;
      d.setHours(0,0,0,0);
      return d.getTime();
    } catch(e){ return null; }
  }
  function todayStart(){
    try { var d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }
    catch(e){ return null; }
  }

  /* ---------- التخزين ---------- */
  function readOffers(){
    try {
      var a = JSON.parse(localStorage.getItem(K_OFFERS));
      if (isArr(a)) return a;
    } catch(e){}
    return [];
  }
  function writeOffers(arr){
    try { localStorage.setItem(K_OFFERS, JSON.stringify(isArr(arr) ? arr : [])); return true; }
    catch(e){ return false; }
  }

  /* v4: تطبيع مصفوفة extraOffers ⇒ [{id,mode,value}] دفاعيًا */
  function normExtraOffers(list){
    if (!isArr(list)) return [];
    var out = [];
    for (var i = 0; i < list.length; i++){
      var x = list[i];
      if (!x || typeof x !== 'object') continue;
      var id = x.id != null ? String(x.id) : '';
      if (!id) continue;
      var mode = (x.mode === 'percent' || x.mode === 'amount') ? x.mode : 'free';
      var val = mode === 'free' ? 0 : (num(x.value) != null ? num(x.value) : 0);
      out.push({ id: id, mode: mode, value: val });
    }
    return out;
  }

  function byOrder(a,b){ return ((a && a.order)||0) - ((b && b.order)||0); }

  /* كل العروض مرتبة حسب order */
  function offers(){
    return readOffers().slice().sort(byOrder);
  }

  /* ---------- البثّ (change events) ---------- */
  var bc = null;
  try { if (typeof BroadcastChannel === 'function') bc = new BroadcastChannel(CH_NAME); } catch(e){ bc = null; }

  var listeners = []; // {ev:'change', cb:fn}

  function on(ev, cb){
    if (typeof cb !== 'function') return;
    listeners.push({ ev: ev || 'change', cb: cb });
  }
  function off(ev, cb){
    for (var i = listeners.length - 1; i >= 0; i--){
      var L = listeners[i];
      if ((cb == null || L.cb === cb) && (ev == null || L.ev === ev)) listeners.splice(i, 1);
    }
  }
  function fire(ev, detail){
    for (var i = 0; i < listeners.length; i++){
      var L = listeners[i];
      if (L.ev === ev){ try { L.cb(detail); } catch(e){} }
    }
  }

  /* بثّ تغيّر داخلي + عبر القنوات لباقي التبويبات */
  function emitChange(reason){
    fire('change', { reason: reason || 'change' });
    try { if (bc) bc.postMessage({ type:'change', reason: reason || 'change', ts: nowTs() }); } catch(e){}
  }

  /* استقبال من تبويبات أخرى */
  try {
    if (bc) bc.onmessage = function(m){
      try {
        if (m && m.data && m.data.type === 'change'){ fire('change', { reason:'remote' }); rerender(); }
      } catch(e){}
    };
  } catch(e){}
  try {
    window.addEventListener('storage', function(ev){
      try {
        if (ev && ev.key === K_OFFERS){ fire('change', { reason:'storage' }); rerender(); }
      } catch(e){}
    });
  } catch(e){}

  /* ---------- الكتابة (save / delete) ---------- */
  function saveOffer(o){
    if (!o || typeof o !== 'object') return null;
    var arr = readOffers();
    var rec = {
      id:            o.id || ('offer_' + nowTs()),
      title:         o.title != null ? String(o.title) : '',
      carIds:        isArr(o.carIds) ? o.carIds.slice() : [],
      discountType:  (o.discountType === 'amount') ? 'amount' : 'percent',
      discountValue: num(o.discountValue) != null ? num(o.discountValue) : 0,
      icon:          o.icon || 'tag',
      color:         o.color || '#e0322b',
      active:        o.active !== false,
      startsAt:      o.startsAt || '',
      endsAt:        o.endsAt || '',
      order:         num(o.order) != null ? num(o.order) : 0,
      /* v2: مزايا/مشتملات مجانية (نصوص) — افتراضي [] */
      perks:         isArr(o.perks) ? o.perks.map(function(p){ return String(p == null ? '' : p); })
                                          .filter(function(p){ return p.replace(/\s+/g,'') !== ''; })
                                    : [],
      /* v3: صورة بوستر للعرض (dataURL) — اختياري */
      image:         o.image != null ? String(o.image) : '',
      /* v4: إضافات حقيقية مربوطة بالعرض — [{id,mode,value}] (value يُتجاهل لو free) */
      extraOffers:   normExtraOffers(o.extraOffers)
    };
    var found = false;
    for (var i = 0; i < arr.length; i++){
      if (arr[i] && arr[i].id === rec.id){ arr[i] = rec; found = true; break; }
    }
    if (!found) arr.push(rec);
    writeOffers(arr);
    emitChange('save');
    rerender();
    return rec;
  }

  function deleteOffer(id){
    if (!id) return false;
    var arr = readOffers(), out = [], removed = false;
    for (var i = 0; i < arr.length; i++){
      if (arr[i] && arr[i].id === id){ removed = true; continue; }
      out.push(arr[i]);
    }
    if (removed){ writeOffers(out); emitChange('delete'); rerender(); }
    return removed;
  }

  /* ---------- الاستعلام ---------- */
  function isWithinWindow(o){
    var today = todayStart();
    if (today == null) return true; // لو فشل التاريخ لا نخفي العروض
    var s = dayStart(o.startsAt), e = dayStart(o.endsAt);
    if (s != null && today < s) return false;
    if (e != null && today > e) return false;
    return true;
  }

  function activeOffers(){
    return offers().filter(function(o){
      return o && o.active === true && isWithinWindow(o);
    });
  }

  function offerForCar(carId){
    if (carId == null) return null;
    var act = activeOffers();
    for (var i = 0; i < act.length; i++){
      var o = act[i];
      if (o && isArr(o.carIds)){
        for (var j = 0; j < o.carIds.length; j++){
          if (String(o.carIds[j]) === String(carId)) return o;
        }
      }
    }
    return null;
  }

  /* مزايا نصّية حرة قديمة (legacy perks) للعرض الفعّال — توافق رجعي */
  function legacyPerksForCar(carId){
    var o = offerForCar(carId);
    if (o && isArr(o.perks)) return o.perks.slice();
    return [];
  }

  /* ---------- v4: المزايا من نظام الإضافات (extras) ---------- */
  /* اسم الإضافة من OTB.extra(id) لو متاح، وإلا الـid نفسه */
  function extraNameById(id){
    try {
      if (window.OTB && typeof window.OTB.extra === 'function'){
        var e = window.OTB.extra(id);
        if (e && e.name) return String(e.name);
      }
    } catch(e){}
    return String(id);
  }

  /* تركيب نص الـlabel حسب الوضع */
  function extraLabel(mode, value, name){
    if (mode === 'percent') return 'خصم ' + toAr(value) + '٪: ' + name;
    if (mode === 'amount')  return 'خصم ' + toAr(value) + ' ريال: ' + name;
    return name + ' مجانًا';
  }

  /* من أول عرض فعّال للسيارة يحتوي extraId ⇒ {mode,value} أو null */
  function extraModifierForCar(carId, extraId){
    if (carId == null || extraId == null) return null;
    var o = offerForCar(carId);
    if (!o || !isArr(o.extraOffers)) return null;
    var target = String(extraId);
    for (var i = 0; i < o.extraOffers.length; i++){
      var x = o.extraOffers[i];
      if (x && String(x.id) === target){
        var mode = (x.mode === 'percent' || x.mode === 'amount') ? x.mode : 'free';
        var val = mode === 'free' ? 0 : (num(x.value) != null ? num(x.value) : 0);
        return { mode: mode, value: val };
      }
    }
    return null;
  }

  /* للعرض الفعّال على السيارة ⇒ [{id,name,mode,value,label}] */
  function offerExtrasForCar(carId){
    var o = offerForCar(carId);
    if (!o || !isArr(o.extraOffers)) return [];
    var out = [];
    for (var i = 0; i < o.extraOffers.length; i++){
      var x = o.extraOffers[i];
      if (!x || x.id == null) continue;
      var id = String(x.id);
      var mode = (x.mode === 'percent' || x.mode === 'amount') ? x.mode : 'free';
      var val = mode === 'free' ? 0 : (num(x.value) != null ? num(x.value) : 0);
      var name = extraNameById(id);
      out.push({ id: id, name: name, mode: mode, value: val, label: extraLabel(mode, val, name) });
    }
    return out;
  }

  /* v2/v4: قائمة نصوص المزايا (labels) للسيارة = إضافات العرض + المزايا النصّية القديمة */
  function perksForCar(carId){
    var out = [];
    var ex = offerExtrasForCar(carId);
    for (var i = 0; i < ex.length; i++){ if (ex[i] && ex[i].label) out.push(ex[i].label); }
    var legacy = legacyPerksForCar(carId);
    for (var j = 0; j < legacy.length; j++){ var p = String(legacy[j] || ''); if (p) out.push(p); }
    return out;
  }

  /* تحويل عدد لأرقام عربية (٠١٢...) للعرض في الـlabel */
  function toAr(n){
    try {
      var map = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
      return String(n).replace(/\d/g, function(d){ return map[+d]; });
    } catch(e){ return String(n); }
  }

  function computeNew(o, base){
    var b = num(base); if (b == null) b = 0;
    var v = num(o.discountValue); if (v == null) v = 0;
    if (o.discountType === 'amount'){
      var r = b - v; return r < 0 ? 0 : r;
    }
    // percent
    var p = b * (1 - v / 100);
    return p < 0 ? 0 : p;
  }

  function labelFor(o){
    var v = num(o.discountValue); if (v == null) v = 0;
    return 'خصم ' + (o.discountType === 'amount' ? (toAr(v) + ' ريال') : (toAr(v) + '٪'));
  }

  function discounted(carId, basePrice){
    var o = offerForCar(carId);
    if (!o) return { hasOffer:false };
    /* v2: العرض صالح بلا خصم سعري — لكن discounted لا يحسب سعرًا حينها */
    var dv = num(o.discountValue);
    if (dv == null || dv <= 0) return { hasOffer:false };
    var oldP = num(basePrice); if (oldP == null) oldP = 0;
    var newP = computeNew(o, oldP);
    var save = oldP - newP; if (save < 0) save = 0;
    return {
      hasOffer:true,
      oldPrice: oldP,
      newPrice: Math.round(newP * 100) / 100,
      save: Math.round(save * 100) / 100,
      label: labelFor(o),
      offer: o
    };
  }

  function iconFor(key){ return ICONS[key] || ICONS.tag; }

  /* ريبون HTML لوضعه فوق صورة السيارة */
  function badgeHTML(offer){
    if (!offer) return '';
    var color = /^#[0-9a-fA-F]{3,8}$/.test(offer.color || '') ? offer.color : '#e0322b';
    return '<span class="ot-ribbon" style="background:' + esc(color) + '">' +
             '<span class="ot-ribbon-ic">' + esc(iconFor(offer.icon)) + '</span>' +
             '<span class="ot-ribbon-tx">' + esc(offer.title || 'عرض') + '</span>' +
           '</span>';
  }

  /* ============================================================
     الستايل الذاتي (يُحقن مرة واحدة) — ببادئة .ot-offers / .ot-ribbon
     ============================================================ */
  var STYLE_ID = 'ot-offers-style';
  function injectStyle(){
    try {
      if (document.getElementById(STYLE_ID)) return;
      var css =
      '.ot-ribbon{position:absolute;top:12px;right:12px;z-index:6;display:inline-flex;align-items:center;gap:6px;' +
        'max-width:calc(100% - 24px);background:#e0322b;color:#fff;font-weight:800;font-size:12.5px;' +
        'padding:6px 11px;border-radius:10px;box-shadow:0 8px 20px rgba(0,0,0,.22);line-height:1.1;' +
        "font-family:inherit;direction:rtl;pointer-events:none;}" +
      '.ot-ribbon-ic{font-size:14px;line-height:1;}' +
      '.ot-ribbon-tx{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +

      /* خلفية كريمي فاتحة (مش أزرق) لفصلها عن الفوتر الأزرق */
      '.ot-offers{position:relative;overflow:hidden;color:#1b2440;padding:64px 20px;direction:rtl;font-family:inherit;' +
        'background:linear-gradient(180deg,#f8f2e7 0%, #f1e9d8 100%);border-top:1px solid #ece3d2;}' +
      /* v3: طبقات زينة خفيفة خلف الكروت (سكايلاين + سيارات) */
      '.ot-offers-sky{position:absolute;left:0;right:0;bottom:0;width:100%;height:auto;opacity:.10;z-index:0;pointer-events:none;}' +
      '.ot-offers-cars{position:absolute;left:0;bottom:0;width:min(42%,520px);height:auto;opacity:.10;z-index:0;pointer-events:none;}' +
      '.ot-offers-inner{position:relative;z-index:1;max-width:1180px;margin:0 auto;}' +
      '.ot-offers-head{text-align:center;margin-bottom:38px;}' +
      '.ot-offers-eyebrow{display:inline-flex;align-items:center;gap:8px;color:#f7a23e;font-weight:800;' +
        'font-size:15px;letter-spacing:.3px;margin-bottom:12px;}' +
      '.ot-offers-title{margin:0 0 10px;font-weight:900;font-size:clamp(28px,3vw,42px);color:#1b2a7a;line-height:1.15;}' +
      '.ot-offers-title em{font-style:normal;color:#f5901e;}' +
      '.ot-offers-sub{margin:0;color:#5a6488;font-weight:500;font-size:16px;}' +
      '.ot-offers-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(252px,1fr));gap:24px;}' +

      '.ot-offer-card{position:relative;display:flex;flex-direction:column;align-items:center;background:#fff;' +
        'border:1px solid #ece3d2;border-radius:24px 24px 16px 16px;padding:22px 14px 20px;' +
        'box-shadow:0 18px 40px rgba(27,42,122,.13);transition:transform .18s ease,box-shadow .18s ease;}' +
      /* v3: كرت العرض بصورة (بوستر) */
      '.ot-offer-imgcard{position:relative;display:block;background:#fff;border:1px solid #ece3d2;' +
        'border-radius:20px;overflow:hidden;box-shadow:0 18px 40px rgba(27,42,122,.13);text-decoration:none;' +
        'transition:transform .18s ease,box-shadow .18s ease;}' +
      '.ot-offer-imgcard:hover{transform:translateY(-4px);box-shadow:0 30px 60px rgba(8,12,46,.5);}' +
      '.ot-offer-img{display:block;width:100%;height:300px;object-fit:cover;}' +
      '.ot-offer-imgcard .ot-offer-band{margin:0;width:100%;}' +
      '.ot-offer-imgcard .ot-offer-perks{margin:10px 12px 12px;}' +
      '.ot-offer-card:hover{transform:translateY(-4px);box-shadow:0 26px 54px rgba(27,42,122,.16);}' +
      '.ot-offer-photo{position:relative;width:100%;height:158px;display:flex;align-items:center;justify-content:center;margin:6px 0 14px;}' +
      '.ot-offer-photo img{height:100%;width:auto;max-width:100%;object-fit:contain;}' +
      '.ot-offer-cat{font-weight:700;font-size:13px;color:#9488b6;margin-bottom:3px;}' +
      '.ot-offer-name{margin:0 0 4px;font-weight:900;font-size:18px;color:#1b2a7a;text-align:center;}' +
      '.ot-offer-band{width:calc(100% + 28px);margin:6px -14px 0;background:#18256b;color:#f3ecdb;' +
        'padding:13px 10px;text-align:center;}' +
      '.ot-offer-old{display:block;color:#c98f8f;text-decoration:line-through;font-weight:700;font-size:14px;margin-bottom:2px;}' +
      '.ot-offer-new{font-weight:900;font-size:20px;}' +
      '.ot-offer-new small{font-weight:700;font-size:13px;color:#f7a23e;}' +
      '.ot-offer-save{display:inline-block;margin-top:6px;background:#1f8a4c;color:#fff;font-weight:800;' +
        'font-size:12px;padding:3px 9px;border-radius:8px;}' +
      '.ot-offer-book{margin-top:15px;width:100%;display:inline-flex;align-items:center;justify-content:center;gap:8px;' +
        'background:linear-gradient(180deg,#ffb04a,#f5901e);color:#1b2a7a;border:1.5px solid #f5901e;' +
        'font-family:inherit;font-weight:800;font-size:15px;padding:11px;border-radius:12px;cursor:pointer;' +
        'text-decoration:none;transition:filter .15s,transform .12s;}' +
      '.ot-offer-book:hover{filter:brightness(1.08);}' +
      '.ot-offer-book:active{transform:scale(.97);}' +

      /* v2: شرائح المزايا داخل المواصفات (auto-wire) + سعر الكرت المخفّض */
      '.ot-perk{display:inline-flex;align-items:center;gap:5px;background:#e8f5ee;color:#1f8a4c;' +
        'border:1px solid #bfe6cf;border-radius:999px;font-weight:800;font-size:12px;line-height:1.1;' +
        'padding:4px 10px;font-family:inherit;direction:rtl;}' +
      '.ot-perk-ic{font-size:12px;line-height:1;}' +
      '.ot-price-old{text-decoration:line-through;color:#9aa0b5;font-weight:700;opacity:.85;margin-inline-end:6px;}' +
      '.ot-price-new{color:#1f8a4c;font-weight:900;}' +
      /* شرائح المزايا داخل كرت سكشن عروضنا */
      '.ot-offer-perks{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:10px 2px 0;}' +
      '.ot-offer-band .ot-offer-noprice{font-weight:900;font-size:20px;}' +
      '.ot-offer-band .ot-offer-noprice small{font-weight:700;font-size:13px;color:#f7a23e;}' +

      '@media(max-width:560px){.ot-offers{padding:48px 14px;}.ot-offers-grid{gap:16px;}' +
        '.ot-offers-cars{width:62%;opacity:.1;}.ot-offer-img{height:220px;}}';

      var st = document.createElement('style');
      st.id = STYLE_ID;
      st.type = 'text/css';
      st.appendChild(document.createTextNode(css));
      (document.head || document.documentElement).appendChild(st);
    } catch(e){}
  }

  /* ============================================================
     سكشن «عروضنا» في الرئيسية (§4) — حقن تلقائي idempotent
     ============================================================ */
  var SECTION_ID = 'ot-offers-section';

  function getBookingCars(){
    try {
      if (window.OneTrip && typeof window.OneTrip.bookingCars === 'function'){
        var c = window.OneTrip.bookingCars();
        return isArr(c) ? c : [];
      }
    } catch(e){}
    return [];
  }

  function carById(cars, id){
    for (var i = 0; i < cars.length; i++){ if (cars[i] && String(cars[i].id) === String(id)) return cars[i]; }
    return null;
  }

  /* قائمة (سيارة + بيانات الخصم) لكل سيارة عليها عرض فعّال */
  function offerCars(){
    var cars = getBookingCars();
    var act = activeOffers();
    var seen = {}, out = [];
    for (var i = 0; i < act.length; i++){
      var o = act[i];
      if (!o || !isArr(o.carIds)) continue;
      for (var j = 0; j < o.carIds.length; j++){
        var cid = o.carIds[j];
        if (seen[cid]) continue;
        var car = carById(cars, cid);
        if (!car) continue;
        var d = discounted(cid, car.price);
        var perks = perksForCar(cid); // v4: إضافات العرض + المزايا النصّية القديمة (labels)
        // v2/v3/v4: اعرض الكرت لو فيه خصم سعري أو مزايا أو صورة بوستر (العرض صالح بأيٍّ منها)
        if (!d.hasOffer && !perks.length && !o.image) continue;
        seen[cid] = true;
        out.push({ car: car, disc: d, offer: o });
      }
    }
    return out;
  }

  function buildSection(items){
    var sec = document.createElement('section');
    sec.className = 'ot-offers';
    sec.id = SECTION_ID;

    var cardsHTML = '';
    for (var i = 0; i < items.length; i++){
      var it = items[i], c = it.car, d = it.disc;
      var perks = perksForCar(c.id); // v4: labels من إضافات العرض + المزايا القديمة

      // شريط السعر: خصم سعري (قديم مشطوب + جديد) أو السعر العادي بلا شطب
      var bandHTML;
      if (d && d.hasOffer){
        bandHTML =
          '<span class="ot-offer-old">' + esc(toAr(d.oldPrice)) + ' ريال</span>' +
          '<div class="ot-offer-new">' + esc(toAr(d.newPrice)) + ' <small>ريال / يوم</small></div>' +
          '<span class="ot-offer-save">' + esc(d.label) + '</span>';
      } else {
        bandHTML =
          '<div class="ot-offer-noprice">' + esc(toAr(num(c.price) != null ? num(c.price) : c.price)) +
            ' <small>ريال / يوم</small></div>';
      }

      // شرائح المزايا
      var perksHTML = '';
      if (perks.length){
        perksHTML = '<div class="ot-offer-perks">';
        for (var p = 0; p < perks.length; p++){
          var pt = String(perks[p] || ''); if (!pt) continue;
          perksHTML += '<span class="ot-perk"><span class="ot-perk-ic">✓</span>' + esc(pt) + '</span>';
        }
        perksHTML += '</div>';
      }

      // v3: عرض بصورة (بوستر) — الكرت كله صورة مربوطة بصفحة الحجز للسيارة
      var img = (it.offer && it.offer.image) ? String(it.offer.image) : '';
      if (img){
        cardsHTML +=
          '<a class="ot-offer-imgcard" href="create-booking.html?id=' + encodeURIComponent(c.id) + '">' +
            '<img class="ot-offer-img" src="' + esc(img) + '" alt="' + esc((it.offer && it.offer.title) || c.name || 'عرض') + '" loading="lazy">' +
            perksHTML +
            ((d && d.hasOffer) ? '<div class="ot-offer-band">' + bandHTML + '</div>' : '') +
          '</a>';
        continue;
      }

      cardsHTML +=
        '<article class="ot-offer-card">' +
          '<div class="ot-offer-cat">' + esc(c.category || '') + '</div>' +
          '<h3 class="ot-offer-name">' + esc(c.name || '') + '</h3>' +
          '<div class="ot-offer-photo">' +
            badgeHTML(it.offer) +
            '<img src="' + esc(c.image || '') + '" alt="' + esc(c.name || '') + '" loading="lazy">' +
          '</div>' +
          perksHTML +
          '<div class="ot-offer-band">' + bandHTML + '</div>' +
          '<a class="ot-offer-book" href="create-booking.html?id=' + encodeURIComponent(c.id) + '">احجز الآن' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>' +
          '</a>' +
        '</article>';
    }

    sec.innerHTML =
      '<img class="ot-offers-sky" src="booking-skyline.png" alt="" aria-hidden="true" loading="lazy">' +
      '<img class="ot-offers-cars" src="assets/contact-cars.png" alt="" aria-hidden="true" loading="lazy">' +
      '<div class="ot-offers-inner">' +
        '<div class="ot-offers-head">' +
          '<div class="ot-offers-eyebrow">🇸🇦 <span>عروض المملكة الحصرية</span> 🔥</div>' +
          '<h2 class="ot-offers-title">العروض<em> الحصرية</em></h2>' +
          '<p class="ot-offers-sub">عروضنا الحالية بأسعار مخفّضة — احجز قبل انتهاء العرض</p>' +
        '</div>' +
        '<div class="ot-offers-grid">' + cardsHTML + '</div>' +
      '</div>';
    return sec;
  }

  function removeSection(){
    try { var ex = document.getElementById(SECTION_ID); if (ex && ex.parentNode) ex.parentNode.removeChild(ex); } catch(e){}
  }

  function mountHomeOffers(){
    try {
      injectStyle();
      var items = offerCars();
      // أعد الحقن من الصفر ليبقى متزامنًا مع التغييرات
      removeSection();
      if (!items.length) return;            // لا عروض فعّالة ⇒ لا يحقن شيئًا
      if (!getBookingCars().length) return; // bookingCars غير متاح

      var sec = buildSection(items);
      var footer = document.querySelector('.site-footer') || document.querySelector('footer');
      if (footer && footer.parentNode){ footer.parentNode.insertBefore(sec, footer); }
      else { document.body.appendChild(sec); }
    } catch(e){}
  }

  /* هل هذه صفحة فيها سكشن أسطول/رئيسية يستحق سكشن «عروضنا»؟ */
  function isHomeLike(){
    try {
      return !!(document.getElementById('fleet') || document.querySelector('.fleet') ||
                document.getElementById('fleetTrack'));
    } catch(e){ return false; }
  }

  /* ============================================================
     §5 — ريبونات على كروت الأسطول/الحجز (auto-wire آمن)
     المطابقة: نص اسم السيارة داخل الكرت ⇒ سيارة لها عرض فعّال.
     ============================================================ */
  function normName(s){ return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  function carsWithOfferByName(){
    var cars = getBookingCars(), map = {};
    for (var i = 0; i < cars.length; i++){
      var c = cars[i]; if (!c) continue;
      var o = offerForCar(c.id);
      if (o) map[normName(c.name)] = { car:c, offer:o };
    }
    return map;
  }

  function imageContainerOf(card){
    // حاوية الصورة المعروفة، وإلا أول صورة، وإلا الكرت نفسه
    var cont = card.querySelector('.car-photo, .car-img, .car-image, .car-thumb, figure');
    if (cont) return cont;
    var img = card.querySelector('img');
    if (img && img.parentNode) return img.parentNode;
    return card;
  }

  /* عنصر السعر داخل الكرت — جرّب محدّدات بالترتيب */
  function priceNodeOf(card){
    return card.querySelector('.price') ||
           card.querySelector('.car-price') ||
           card.querySelector('[class*="price"]') ||
           null;
  }
  /* حاوية المواصفات داخل الكرت */
  function specsNodeOf(card){
    return card.querySelector('.car-specs') ||
           card.querySelector('.otb-specs') ||
           card.querySelector('.specs') ||
           null;
  }

  /* أعد كتابة عنصر السعر: القديم مشطوب + الجديد (idempotent عبر data-otoff-base) */
  function applyPriceRewrite(card, hit){
    try {
      var pnode = priceNodeOf(card);
      if (!pnode) return;

      // السعر الأساسي: من السيارة المطابقة إن وُجد، وإلا من نص العنصر
      var base = (hit.car && num(hit.car.price) != null) ? num(hit.car.price) : null;
      var stored = pnode.getAttribute('data-otoff-base');

      if (stored != null){
        base = num(stored);                         // تطبيق سابق → استخدم الأصل المخزَّن
      } else {
        if (base == null) base = numFromText(pnode.textContent);
        if (base == null) return;
        pnode.setAttribute('data-otoff-base', String(base));
      }

      var d = discounted(hit.car ? hit.car.id : null, base);
      if (!d.hasOffer) return;                       // لا خصم سعري → الريبون/المزايا فقط

      if (pnode.getAttribute('data-otoff-priced') === '1') return; // مطبّق

      // ابحث عن عقدة الرقم الأساسية (b) للحفاظ على العملة/«يوميًا»
      var bEl = pnode.querySelector('b');
      if (bEl){
        bEl.innerHTML = '<span class="ot-price-old">' + esc(toAr(d.oldPrice)) + '</span>' +
                        '<span class="ot-price-new">' + esc(toAr(d.newPrice)) + '</span>';
      } else {
        // لا يوجد <b>: أعِد بناء النص مع الإبقاء على أي لاحقة عملة بسيطة
        pnode.innerHTML = '<span class="ot-price-old">' + esc(toAr(d.oldPrice)) + '</span> ' +
                          '<span class="ot-price-new">' + esc(toAr(d.newPrice)) + '</span> ' +
                          '<span class="cur">ريال</span>';
      }
      pnode.setAttribute('data-otoff-priced', '1');
    } catch(e){}
  }

  /* أضِف شرائح المزايا داخل المواصفات (idempotent عبر data-otoff-perks) */
  function applyPerkChips(card, hit){
    try {
      var perks = (hit.car) ? perksForCar(hit.car.id) : []; // v4: إضافات العرض + المزايا القديمة
      if (!perks.length) return;
      var sn = specsNodeOf(card);
      if (!sn) return;
      if (sn.getAttribute('data-otoff-perks') === '1') return; // مضافة مسبقًا

      for (var i = 0; i < perks.length; i++){
        var p = String(perks[i] || '');
        if (!p) continue;
        var chip = document.createElement('span');
        chip.className = 'ot-perk';
        chip.setAttribute('data-otoff-perk', '1');
        chip.innerHTML = '<span class="ot-perk-ic">✓</span>' + esc(p);
        sn.appendChild(chip);
      }
      sn.setAttribute('data-otoff-perks', '1');
    } catch(e){}
  }

  function wireCardRibbons(){
    try {
      injectStyle();
      var map = carsWithOfferByName();
      var hasAny = false; for (var k in map){ if (map.hasOwnProperty(k)){ hasAny = true; break; } }
      if (!hasAny) return;

      var cards = document.querySelectorAll('.car, .car-card');
      for (var i = 0; i < cards.length; i++){
        var card = cards[i];
        if (!card || !card.querySelector || !card.querySelector('img')) continue;

        // اسم السيارة من الكرت
        var nameEl = card.querySelector('.car-name, .car-title, h3, h2');
        var nm = normName(nameEl ? nameEl.textContent : card.getAttribute('data-name'));
        var hit = nm && map[nm] ? map[nm] : null;

        // مطابقة احتياطية بالـid لو متاح
        if (!hit){
          var did = card.getAttribute('data-id') || (card.dataset && card.dataset.id);
          if (did){ var o = offerForCar(did); if (o){ var cc = carById(getBookingCars(), did); if (cc) hit = { car:cc, offer:o }; } }
        }
        if (!hit) continue;

        var cont = imageContainerOf(card);
        try { if (getComputedStyle(cont).position === 'static') cont.style.position = 'relative'; }
        catch(e){ cont.style.position = 'relative'; }

        var old = cont.querySelector(':scope > .ot-ribbon');
        if (old && old.parentNode) old.parentNode.removeChild(old);

        var tmp = document.createElement('div');
        tmp.innerHTML = badgeHTML(hit.offer);
        var rib = tmp.firstChild;
        if (rib) cont.appendChild(rib);

        // v2: السعر المخفّض + شرائح المزايا (idempotent)
        applyPriceRewrite(card, hit);
        applyPerkChips(card, hit);
      }
    } catch(e){}
  }

  /* ============================================================
     إعادة التصيير عند أي تغيير
     ============================================================ */
  function rerender(){
    try {
      if (isHomeLike()) mountHomeOffers();
      wireCardRibbons();
    } catch(e){}
  }

  /* محاولات متكررة لحين ظهور الكروت/الأسطول (مثل branch-map) */
  function startAuto(){
    try {
      injectStyle();
      var tries = 0;
      rerender();
      var t = setInterval(function(){
        tries++;
        rerender();
        if (tries > 24) clearInterval(t);
      }, 250);
    } catch(e){}
  }

  try {
    if (document.readyState !== 'loading') startAuto();
    else document.addEventListener('DOMContentLoaded', startAuto);
  } catch(e){}

  /* ---------- التصدير ---------- */
  window.OneTrip = window.OneTrip || {};
  window.OneTrip.Offers = {
    offers:         offers,
    saveOffer:      saveOffer,
    deleteOffer:    deleteOffer,
    activeOffers:   activeOffers,
    offerForCar:    offerForCar,
    perksForCar:    perksForCar,
    extraModifierForCar: extraModifierForCar,
    offerExtrasForCar:   offerExtrasForCar,
    discounted:     discounted,
    iconFor:        iconFor,
    badgeHTML:      badgeHTML,
    on:             on,
    off:            off,
    mountHomeOffers:mountHomeOffers,
    wireCardRibbons:wireCardRibbons,
    ICONS:          ICONS
  };
})();
