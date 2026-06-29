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
      order:         num(o.order) != null ? num(o.order) : 0
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

      '.ot-offers{background:#f3ecdb;padding:64px 20px;direction:rtl;font-family:inherit;}' +
      '.ot-offers-inner{max-width:1180px;margin:0 auto;}' +
      '.ot-offers-head{text-align:center;margin-bottom:38px;}' +
      '.ot-offers-eyebrow{display:inline-flex;align-items:center;gap:8px;color:#f5901e;font-weight:800;' +
        'font-size:15px;letter-spacing:.3px;margin-bottom:12px;}' +
      '.ot-offers-title{margin:0 0 10px;font-weight:900;font-size:clamp(28px,3vw,42px);color:#1b2a7a;line-height:1.15;}' +
      '.ot-offers-title em{font-style:normal;color:#f5901e;}' +
      '.ot-offers-sub{margin:0;color:#5a6488;font-weight:500;font-size:16px;}' +
      '.ot-offers-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(252px,1fr));gap:24px;}' +

      '.ot-offer-card{position:relative;display:flex;flex-direction:column;align-items:center;background:#faf7f1;' +
        'border:1px solid #d8def0;border-radius:24px 24px 16px 16px;padding:22px 14px 20px;' +
        'box-shadow:0 18px 40px rgba(27,42,122,.1);transition:transform .18s ease,box-shadow .18s ease;}' +
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

      '@media(max-width:560px){.ot-offers{padding:48px 14px;}.ot-offers-grid{gap:16px;}}';

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
        if (!d.hasOffer) continue;
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
      cardsHTML +=
        '<article class="ot-offer-card">' +
          '<div class="ot-offer-cat">' + esc(c.category || '') + '</div>' +
          '<h3 class="ot-offer-name">' + esc(c.name || '') + '</h3>' +
          '<div class="ot-offer-photo">' +
            badgeHTML(it.offer) +
            '<img src="' + esc(c.image || '') + '" alt="' + esc(c.name || '') + '" loading="lazy">' +
          '</div>' +
          '<div class="ot-offer-band">' +
            '<span class="ot-offer-old">' + esc(d.oldPrice) + ' ريال</span>' +
            '<div class="ot-offer-new">' + esc(d.newPrice) + ' <small>ريال / يوم</small></div>' +
            '<span class="ot-offer-save">' + esc(d.label) + '</span>' +
          '</div>' +
          '<a class="ot-offer-book" href="create-booking.html?id=' + encodeURIComponent(c.id) + '">احجز الآن' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>' +
          '</a>' +
        '</article>';
    }

    sec.innerHTML =
      '<div class="ot-offers-inner">' +
        '<div class="ot-offers-head">' +
          '<div class="ot-offers-eyebrow">🔥 <span>وفّر أكثر</span></div>' +
          '<h2 class="ot-offers-title">عروض<em> ‫حصرية‬</em></h2>' +
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
