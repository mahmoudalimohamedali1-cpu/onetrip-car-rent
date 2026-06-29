/* ============================================================
   One Trip — محرّك عقود الاشتراك الشهري (Monthly Subscription Contracts)
   ------------------------------------------------------------
   مصدر واحد لكل ما يخص عقود الاشتراك الشهري (تجريبي على localStorage):
     - الأدمن ينشئ عقدًا (اختيار سيارة لها سعر شهري + مدة + عميل) → ot_contracts.
     - الموقع (long-term.html) يرسل طلب اشتراك (status:'pending').
     - يربط التوفّر: سيارة على عقد نشط لا تُتاح للحجز اليومي المتداخل.

   الواجهة: window.OneTrip.Contracts (انظر CONTRACTS_CONTRACT.md §2).
   كل وصول إلى localStorage داخل try/catch — لا يرمي أبدًا. كل تعديل
   يبثّ 'change' عبر BroadcastChannel('ot_contracts') + حدث storage
   (نفس أسلوب offers-core.js).
   ترتيب التحميل: cars.js ← booking-core.js ← هذا الملف.
   ألوان الهوية: #1b2a7a / #2300d9 / #f5901e.
   ============================================================ */
;(function(){
  'use strict';

  var K_CONTRACTS = 'ot_contracts';
  var CH_NAME     = 'ot_contracts';
  var K_EXTRAS    = 'otb_extras';      // مصدر الإضافات الاحتياطي (booking-core seed)

  /* ---------- ثوابت (CONTRACTS_CONTRACT.md §2) ---------- */
  var DURATIONS = [12, 24, 36];
  var VAT = (function(){ try { return (window.OTB && window.OTB.VAT) || 0.15; } catch(e){ return 0.15; } })();
  var DEFAULT_KM = 3000;
  var EXTRA_KM = 0.5;
  var DEFAULT_DEPOSIT = 1000;

  /* ---------- أدوات صغيرة دفاعية (زي offers-core.js) ---------- */
  function isArr(a){ return Object.prototype.toString.call(a) === '[object Array]'; }
  function num(v){ var n = parseFloat(v); return isNaN(n) ? null : n; }
  function esc(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function nowTs(){ try { return Date.now(); } catch(e){ return +new Date(); } }
  function str(s){ return String(s == null ? '' : s); }

  /* ---------- التخزين ---------- */
  function readContracts(){
    try {
      var a = JSON.parse(localStorage.getItem(K_CONTRACTS));
      if (isArr(a)) return a;
    } catch(e){}
    return [];
  }
  function writeContracts(arr){
    try { localStorage.setItem(K_CONTRACTS, JSON.stringify(isArr(arr) ? arr : [])); return true; }
    catch(e){ return false; }
  }

  /* ---------- البثّ (change events) — زي offers-core.js ---------- */
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
  function emitChange(reason){
    fire('change', { reason: reason || 'change' });
    try { if (bc) bc.postMessage({ type:'change', reason: reason || 'change', ts: nowTs() }); } catch(e){}
  }

  /* استقبال من تبويبات أخرى */
  try {
    if (bc) bc.onmessage = function(m){
      try { if (m && m.data && m.data.type === 'change'){ fire('change', { reason:'remote' }); } } catch(e){}
    };
  } catch(e){}
  try {
    window.addEventListener('storage', function(ev){
      try { if (ev && ev.key === K_CONTRACTS){ fire('change', { reason:'storage' }); } } catch(e){}
    });
  } catch(e){}

  /* ============================================================
     الكتالوج الرئيسي (cars.js) + الإضافات (booking-core.js)
     ============================================================ */
  function masterCars(){
    try { var a = window.OneTrip && window.OneTrip.cars; if (isArr(a)) return a; } catch(e){}
    return [];
  }
  function masterCar(carId){
    if (carId == null) return null;
    var a = masterCars(), t = String(carId);
    for (var i = 0; i < a.length; i++){ if (a[i] && String(a[i].id) === t) return a[i]; }
    return null;
  }
  /* أسعار التأجير طويل الأجل (احتياطي): ltCars().priceByMonths */
  function ltCar(carId){
    try {
      if (window.OneTrip && typeof window.OneTrip.ltCars === 'function'){
        var a = window.OneTrip.ltCars(), t = String(carId);
        for (var i = 0; i < a.length; i++){ if (a[i] && String(a[i].id) === t) return a[i]; }
      }
    } catch(e){}
    return null;
  }

  /* قائمة الإضافات: OTB.extras() ثم localStorage 'otb_extras' */
  function allExtras(){
    try {
      if (window.OTB && typeof window.OTB.extras === 'function'){
        var e = window.OTB.extras();
        if (isArr(e)) return e;
      }
    } catch(e){}
    try {
      var s = JSON.parse(localStorage.getItem(K_EXTRAS));
      if (isArr(s)) return s;
    } catch(e){}
    return [];
  }
  function extraById(id){
    if (id == null) return null;
    var a = allExtras(), t = String(id);
    for (var i = 0; i < a.length; i++){ if (a[i] && String(a[i].id) === t) return a[i]; }
    return null;
  }

  /* ---------- التواريخ ---------- */
  function pad2(n){ n = String(n); return n.length < 2 ? '0' + n : n; }
  function fmtDate(d){
    try {
      if (!d || isNaN(d.getTime())) return '';
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    } catch(e){ return ''; }
  }
  function parseDate(v){
    try {
      var d;
      if (v instanceof Date){ d = new Date(v.getTime()); }
      else { d = new Date(v); }
      if (isNaN(d.getTime())) return null;
      d.setHours(0,0,0,0);
      return d;
    } catch(e){ return null; }
  }
  function todayDate(){ try { var d = new Date(); d.setHours(0,0,0,0); return d; } catch(e){ return null; } }
  /* أضف n شهرًا لتاريخ مع معالجة تجاوز الشهر (مثلًا 31 يناير + شهر ⇒ آخر فبراير) */
  function addMonths(d, n){
    var base = new Date(d.getTime());
    var day = base.getDate();
    base.setDate(1);                       // تجنّب القفز فوق الشهر
    base.setMonth(base.getMonth() + n);
    var last = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    base.setDate(Math.min(day, last));
    base.setHours(0,0,0,0);
    return base;
  }
  function dayStartOf(v){ var d = parseDate(v); return d ? d.getTime() : null; }

  /* ============================================================
     الاستعلام
     ============================================================ */
  function byCreatedDesc(a, b){ return ((b && b.createdAt) || 0) - ((a && a.createdAt) || 0); }

  function all(){
    return readContracts().slice().sort(byCreatedDesc);
  }
  function get(id){
    if (id == null) return null;
    var a = readContracts(), t = String(id);
    for (var i = 0; i < a.length; i++){ if (a[i] && String(a[i].id) === t) return a[i]; }
    return null;
  }
  function findByRef(ref){
    if (ref == null) return null;
    var a = readContracts(), t = String(ref);
    for (var i = 0; i < a.length; i++){ if (a[i] && String(a[i].ref) === t) return a[i]; }
    return null;
  }

  /* ---------- التسعير ---------- */
  function monthlyPrice(carId, duration){
    var dur = num(duration);
    if (dur == null) return 0;
    var c = masterCar(carId);
    if (c && c.monthly){
      var v = num(c.monthly[dur]);
      if (v != null) return v;
    }
    var lt = ltCar(carId);
    if (lt && lt.priceByMonths){
      var v2 = num(lt.priceByMonths[dur]);
      if (v2 != null) return v2;
    }
    return 0;
  }

  /* السيارات اللي ليها أسعار شهرية (للوحة): [{id,name,monthly:{12,24,36}}] */
  function carsWithMonthly(){
    var out = [], a = masterCars();
    for (var i = 0; i < a.length; i++){
      var c = a[i]; if (!c || !c.monthly) continue;
      var m = {}, has = false;
      for (var k = 0; k < DURATIONS.length; k++){
        var d = DURATIONS[k], v = num(c.monthly[d]);
        if (v != null){ m[d] = v; has = true; }
      }
      if (has) out.push({ id: c.id, name: c.name || '', monthly: m });
    }
    return out;
  }

  /* قيمة الإضافة شهريًا: يومي ⇒ price*30 ، غير كده ⇒ price */
  function addonMonthly(addon){
    if (!addon || typeof addon !== 'object') return 0;
    var p = num(addon.price); if (p == null) p = 0;
    return addon.unit === 'day' ? p * 30 : p;
  }

  /* مجموع شهري لقائمة معرّفات إضافات + سطورها */
  function resolveAddons(ids){
    var lines = [], total = 0;
    if (!isArr(ids)) return { lines: lines, total: total };
    for (var i = 0; i < ids.length; i++){
      var id = ids[i]; if (id == null) continue;
      var ad = extraById(id);
      var monthly = addonMonthly(ad);
      lines.push({ id: String(id), name: ad && ad.name ? String(ad.name) : String(id), monthly: monthly });
      total += monthly;
    }
    return { lines: lines, total: total };
  }

  function quote(data){
    data = data || {};
    var carId = data.carId;
    var dur = num(data.duration);
    if (dur == null) dur = 0;
    var c = masterCar(carId);
    var mp = monthlyPrice(carId, dur);
    var add = resolveAddons(data.addons);
    var addonsMonthly = add.total;
    var subtotal = (mp + addonsMonthly) * dur;
    var vat = subtotal * VAT;
    var total = subtotal + vat;
    var deposit = (c && num(c.deposit) != null) ? num(c.deposit) : DEFAULT_DEPOSIT;
    var kmPerMonth = num(data.kmPerMonth); if (kmPerMonth == null) kmPerMonth = DEFAULT_KM;
    return {
      carId:        carId != null ? String(carId) : '',
      carName:      c && c.name ? String(c.name) : '',
      duration:     dur,
      monthlyPrice: mp,
      addonsLines:  add.lines,
      addonsMonthly: addonsMonthly,
      subtotal:     subtotal,
      vat:          vat,
      total:        total,
      deposit:      deposit,
      kmPerMonth:   kmPerMonth,
      extraKmPrice: EXTRA_KM
    };
  }

  /* تاريخ النهاية = البداية + duration شهر − يوم */
  function endDate(startDate, duration){
    var s = parseDate(startDate);
    var dur = num(duration);
    if (!s || dur == null) return '';
    var e = addMonths(s, dur);
    e.setDate(e.getDate() - 1);
    return fmtDate(e);
  }

  /* جدول الدفعات: duration دفعة، الإجمالي مقسّم مع امتصاص الباقي في آخر دفعة */
  function schedule(startDate, duration, total){
    var s = parseDate(startDate);
    var dur = num(duration);
    var t = num(total); if (t == null) t = 0;
    var out = [];
    if (!s || dur == null || dur <= 0) return out;
    dur = Math.round(dur);
    var rounded = Math.round(t);
    var per = Math.round(t / dur);
    var acc = 0;
    for (var n = 1; n <= dur; n++){
      var amount;
      if (n < dur){ amount = per; acc += per; }
      else { amount = rounded - acc; }      // آخر دفعة تمتص فرق التقريب → المجموع = round(total)
      var due = addMonths(s, n - 1);
      out.push({ n: n, dueDate: fmtDate(due), amount: amount, status: 'due' });
    }
    return out;
  }

  /* مرجع: 'SUB-' + ٦ أرقام */
  function ref(){
    var r = '';
    for (var i = 0; i < 6; i++){ r += Math.floor(Math.random() * 10); }
    return 'SUB-' + r;
  }

  /* ============================================================
     بناء/تطبيع السجل
     ============================================================ */
  function normCustomer(cu){
    cu = cu || {};
    return {
      name:    str(cu.name),
      phone:   str(cu.phone),
      email:   str(cu.email),
      idNum:   str(cu.idNum),
      license: str(cu.license)
    };
  }

  /* يبني سجل عقد كامل من data (يحسب totals/endDate/schedule). لا يحفظ. */
  function buildRecord(data, existing){
    data = data || {};
    var carId = data.carId;
    var dur = num(data.duration); if (dur == null) dur = 0;
    var c = masterCar(carId);
    var q = quote({ carId: carId, duration: dur, kmPerMonth: data.kmPerMonth, addons: data.addons });

    var startDate = '';
    var sd = parseDate(data.startDate);
    if (sd) startDate = fmtDate(sd);
    else { var td = todayDate(); startDate = td ? fmtDate(td) : ''; }

    var kmPerMonth = num(data.kmPerMonth); if (kmPerMonth == null) kmPerMonth = DEFAULT_KM;
    var downPayment = num(data.downPayment); if (downPayment == null) downPayment = 0;
    var deposit = num(data.deposit); if (deposit == null) deposit = q.deposit;

    var addons = isArr(data.addons) ? data.addons.map(function(x){ return String(x); }) : [];

    var rec = {
      id:           (existing && existing.id) || data.id || ('ctr_' + nowTs()),
      ref:          (existing && existing.ref) || data.ref || ref(),
      customer:     normCustomer(data.customer),
      carId:        carId != null ? String(carId) : '',
      carName:      (c && c.name) ? String(c.name) : str(data.carName),
      carImage:     (c && c.image) ? String(c.image) : str(data.carImage),
      duration:     dur,
      monthlyPrice: q.monthlyPrice,
      kmPerMonth:   kmPerMonth,
      extraKmPrice: EXTRA_KM,
      addons:       addons,
      addonsMonthly: q.addonsMonthly,
      subtotal:     q.subtotal,
      vat:          q.vat,
      total:        q.total,
      deposit:      deposit,
      downPayment:  downPayment,
      startDate:    startDate,
      endDate:      endDate(startDate, dur),
      schedule:     schedule(startDate, dur, q.total),
      status:       data.status || (existing && existing.status) || 'pending',
      source:       data.source || (existing && existing.source) || 'admin',
      notes:        str(data.notes != null ? data.notes : (existing && existing.notes)),
      createdAt:    (existing && existing.createdAt) || data.createdAt || nowTs()
    };
    return rec;
  }

  /* إنشاء طلب اشتراك (من الويب أو اللوحة) مع تحقّق ⇒ العقد أو {error} */
  function createSubscription(data){
    try {
      data = data || {};
      var carId = data.carId;
      var dur = num(data.duration);

      if (dur == null || DURATIONS.indexOf(dur) === -1){
        return { error: 'مدة العقد غير صالحة (يجب أن تكون ١٢ أو ٢٤ أو ٣٦ شهرًا).' };
      }
      var c = masterCar(carId);
      if (!c){ return { error: 'السيارة غير موجودة.' }; }
      if (monthlyPrice(carId, dur) <= 0){
        return { error: 'لا يوجد سعر شهري لهذه السيارة بهذه المدة.' };
      }

      var source = data.source || 'website';
      if (source === 'website'){
        var cu = data.customer || {};
        if (!str(cu.name).replace(/\s+/g,'') || !str(cu.phone).replace(/\s+/g,'')){
          return { error: 'الاسم ورقم الجوال مطلوبان.' };
        }
      }

      var status = data.status || (source === 'website' ? 'pending' : 'pending');
      var rec = buildRecord({
        carId: carId, duration: dur, customer: data.customer,
        startDate: data.startDate, kmPerMonth: data.kmPerMonth, addons: data.addons,
        downPayment: data.downPayment, deposit: data.deposit,
        status: status, source: source, notes: data.notes
      });

      var arr = readContracts();
      arr.push(rec);
      writeContracts(arr);
      emitChange('create');
      return rec;
    } catch(e){
      return { error: 'تعذّر إنشاء العقد.' };
    }
  }

  /* upsert من اللوحة: يطبّع + يعيد حساب totals/endDate/schedule */
  function saveContract(c){
    try {
      if (!c || typeof c !== 'object') return null;
      var arr = readContracts();
      var existing = null;
      var id = c.id != null ? String(c.id) : '';
      if (id){
        for (var i = 0; i < arr.length; i++){ if (arr[i] && String(arr[i].id) === id){ existing = arr[i]; break; } }
      }
      var rec = buildRecord(c, existing);
      var found = false;
      for (var j = 0; j < arr.length; j++){
        if (arr[j] && String(arr[j].id) === String(rec.id)){ arr[j] = rec; found = true; break; }
      }
      if (!found) arr.push(rec);
      writeContracts(arr);
      emitChange('save');
      return rec;
    } catch(e){ return null; }
  }

  function deleteContract(id){
    try {
      if (id == null) return false;
      var arr = readContracts(), out = [], removed = false, t = String(id);
      for (var i = 0; i < arr.length; i++){
        if (arr[i] && String(arr[i].id) === t){ removed = true; continue; }
        out.push(arr[i]);
      }
      if (removed){ writeContracts(out); emitChange('delete'); }
      return removed;
    } catch(e){ return false; }
  }

  function setStatus(id, status){
    try {
      if (id == null) return null;
      var arr = readContracts(), t = String(id), rec = null;
      for (var i = 0; i < arr.length; i++){
        if (arr[i] && String(arr[i].id) === t){ arr[i].status = String(status || ''); rec = arr[i]; break; }
      }
      if (rec){ writeContracts(arr); emitChange('status'); }
      return rec;
    } catch(e){ return null; }
  }

  /* الحالة الفعّالة: cancelled→cancelled ؛ active وانتهى→completed ؛ غير كده المخزّنة */
  function effectiveStatus(c){
    try {
      if (!c) return '';
      var s = str(c.status);
      if (s === 'cancelled') return 'cancelled';
      if (s === 'active'){
        var e = dayStartOf(c.endDate);
        var today = todayDate();
        if (e != null && today && e < today.getTime()) return 'completed';
      }
      return s;
    } catch(e){ return c ? str(c.status) : ''; }
  }

  /* هل السيارة مشغولة بعقد active/pending يتداخل [from,to]؟ */
  function rangesOverlap(aFrom, aTo, bFrom, bTo){
    if (aFrom == null || aTo == null || bFrom == null || bTo == null) return false;
    return aFrom <= bTo && bFrom <= aTo;
  }
  function carBusy(carId, fromISO, toISO){
    try {
      if (carId == null) return false;
      var from = dayStartOf(fromISO), to = dayStartOf(toISO);
      if (from == null || to == null) return false;
      if (from > to){ var tmp = from; from = to; to = tmp; }
      var arr = readContracts(), t = String(carId);
      for (var i = 0; i < arr.length; i++){
        var c = arr[i];
        if (!c || String(c.carId) !== t) continue;
        var st = str(c.status);
        if (st !== 'active' && st !== 'pending') continue;
        var cs = dayStartOf(c.startDate), ce = dayStartOf(c.endDate);
        if (rangesOverlap(cs, ce, from, to)) return true;
      }
      return false;
    } catch(e){ return false; }
  }

  function activeForCar(carId){
    try {
      if (carId == null) return null;
      var arr = readContracts(), t = String(carId);
      for (var i = 0; i < arr.length; i++){
        var c = arr[i];
        if (c && String(c.carId) === t && str(c.status) === 'active') return c;
      }
      return null;
    } catch(e){ return null; }
  }

  function statusLabel(s){
    var map = {
      pending:   'قيد الانتظار',
      active:    'نشط',
      completed: 'منتهٍ',
      cancelled: 'ملغى',
      suspended: 'معلّق'
    };
    return map[s] || str(s);
  }

  /* ---------- التصدير ---------- */
  window.OneTrip = window.OneTrip || {};
  window.OneTrip.Contracts = {
    /* استعلام */
    all:                all,
    get:                get,
    findByRef:          findByRef,
    monthlyPrice:       monthlyPrice,
    carsWithMonthly:    carsWithMonthly,
    addonMonthly:       addonMonthly,
    quote:              quote,
    endDate:            endDate,
    schedule:           schedule,
    ref:                ref,
    /* كتابة */
    createSubscription: createSubscription,
    saveContract:       saveContract,
    deleteContract:     deleteContract,
    setStatus:          setStatus,
    /* حالة/توفّر */
    effectiveStatus:    effectiveStatus,
    carBusy:            carBusy,
    activeForCar:       activeForCar,
    statusLabel:        statusLabel,
    /* تفاعلية */
    on:                 on,
    off:                off,
    /* ثوابت */
    DURATIONS:          DURATIONS,
    VAT:                VAT,
    DEFAULT_KM:         DEFAULT_KM,
    EXTRA_KM:           EXTRA_KM,
    DEFAULT_DEPOSIT:    DEFAULT_DEPOSIT
  };
})();
