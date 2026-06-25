/* ============================================================
   One Trip — customer auth data layer (SINGLE SOURCE OF TRUTH)
   ------------------------------------------------------------
   طبقة بيانات حسابات العملاء (زوّار الموقع) — RTL، عربي.
   كل من يبني واجهة الحساب يقرأ/يكتب من هنا فقط:
     - ودجة الحساب (auth-widget.js)  → signup / login / logout / current
     - صفحة البروفايل (profile.html)  → update / changePassword / bookings / conversations
     - لوحة التحكم (admin.html)       → ot_customers (قسم العملاء)

   ده حساب العميل — مختلف تمامًا عن ot_users (موظفي اللوحة، لا تُلمس).

   المخزن الآن تجريبي عبر localStorage (نفس نمط cars.js / chat.js) ويتبدّل
   إلى Supabase Auth لاحقًا بنفس الأشكال (انظر AUTH_CONTRACT.md). كل وصول
   لـlocalStorage داخل try/catch ولا يُرمى أي خطأ للمستدعي.

   ⚠️ ملاحظة أمنية: كلمات المرور تُخزَّن كهاش بسيط (djb2) غير آمن إطلاقًا —
   للتجربة فقط. لا تخزّن أسرارًا حقيقية. الإنتاج يستخدم Supabase Auth.

   Realtime: كل تعديل يبثّ {type:'change'} عبر BroadcastChannel('ot_auth')
   ومستمع window 'storage' على 'ot_customers'/'ot_customer_session' كاحتياطي
   عبر التبويبات.
   ============================================================ */
;(function(){
  'use strict';

  /* ---- مفاتيح التخزين ---- */
  var K_CUSTOMERS = 'ot_customers';        /* مصفوفة حسابات العملاء */
  var K_SESSION   = 'ot_customer_session'; /* معرّف العميل المسجّل حاليًا */
  var K_LEADS     = 'ot_leads';            /* طلبات/استفسارات (قراءة فقط) */

  /* عدّاد داخلي لتفادي تصادم نفس الميلّي-ثانية في المعرّفات */
  var seq = 0;
  function uid(prefix){ seq++; return prefix + Date.now() + '_' + seq; }

  /* ------------------------------------------------------------
     طبقة التخزين (محروسة بالكامل — لا ترمي أبدًا)
     ------------------------------------------------------------ */
  function readJSON(key, fallback){
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var val = JSON.parse(raw);
      return (val == null) ? fallback : val;
    } catch(e){ return fallback; }
  }
  function writeJSON(key, val){
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch(e){ return false; }
  }
  function readStr(key, fallback){
    try { var v = localStorage.getItem(key); return (v == null) ? fallback : v; }
    catch(e){ return fallback; }
  }
  function writeStr(key, val){
    try { localStorage.setItem(key, val); return true; } catch(e){ return false; }
  }
  function removeKey(key){
    try { localStorage.removeItem(key); return true; } catch(e){ return false; }
  }

  function loadCustomers(){
    var arr = readJSON(K_CUSTOMERS, []);
    return Array.isArray(arr) ? arr : [];
  }
  function saveCustomers(arr){ writeJSON(K_CUSTOMERS, arr || []); }

  /* ------------------------------------------------------------
     البث (Realtime) — BroadcastChannel + window 'storage'
     ------------------------------------------------------------ */
  var listeners = { change: [] };
  var bc = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('ot_auth');
      bc.onmessage = function(ev){
        if (ev && ev.data && ev.data.type === 'change') fire('change');
      };
    }
  } catch(e){ bc = null; }

  try {
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('storage', function(ev){
        if (ev && (ev.key === K_CUSTOMERS || ev.key === K_SESSION)) fire('change');
      });
    }
  } catch(e){}

  var firing = false;
  function fire(event){
    var cbs = listeners[event];
    if (!cbs) return;
    if (firing) return;            // حماية من التكرار المتداخل (re-entrancy) — يكسر أي حلقة بثّ لا نهائية
    firing = true;
    try {
      for (var i = 0; i < cbs.length; i++){
        try { cbs[i](); } catch(e){}
      }
    } finally { firing = false; }
  }

  /* emit: يُستدعى بعد أي تعديل — يبثّ للتبويبات الأخرى ثم يطلق محليًا */
  function emit(){
    try { if (bc) bc.postMessage({ type:'change' }); } catch(e){}
    fire('change');
  }

  function on(event, cb){
    if (!listeners[event]) listeners[event] = [];
    if (typeof cb === 'function') listeners[event].push(cb);
  }
  function off(event, cb){
    var cbs = listeners[event];
    if (!cbs) return;
    for (var i = cbs.length - 1; i >= 0; i--){
      if (cbs[i] === cb) cbs.splice(i, 1);
    }
  }

  /* ------------------------------------------------------------
     أدوات مساعدة
     ------------------------------------------------------------ */
  function digitsOnly(s){ return String(s == null ? '' : s).replace(/\D/g, ''); }
  function tail9(s){ return digitsOnly(s).slice(-9); }
  function normEmail(s){ return String(s == null ? '' : s).trim().toLowerCase(); }
  function isEmail(s){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '')); }

  /* hashPass — هاش بسيط (djb2) للعرض فقط.
     ⚠️ غير آمن إطلاقًا (غير تشفيري، بلا salt) — لا يصلح للإنتاج.
     الإنتاج يستخدم Supabase Auth. مُصدَّر للاختبار فقط. لا يرمي أبدًا. */
  function hashPass(s){
    try {
      var str = String(s == null ? '' : s);
      var h = 5381;
      for (var i = 0; i < str.length; i++){
        h = ((h << 5) + h) + str.charCodeAt(i);   /* h * 33 + c */
        h = h & 0xffffffff;                         /* أبقِه ضمن 32-bit */
      }
      return 'h' + (h >>> 0).toString(36);          /* unsigned + base36 */
    } catch(e){ return 'h0'; }
  }

  /* نسخة عامة آمنة من العميل (نُعيدها للمستدعي — بدون تسريب أي شيء حسّاس
     زيادة، لكن نُبقي على نفس الشكل في §2). نُرجّع نسخة حتى لا يُعدّل الخارج المخزن. */
  function publicCustomer(c){
    if (!c) return null;
    return {
      id: c.id,
      name: c.name || '',
      email: c.email || '',
      phone: c.phone || '',
      city: c.city || '',
      pass: c.pass || '',
      createdAt: c.createdAt || 0,
      updatedAt: c.updatedAt || 0,
      meta: c.meta || {}
    };
  }

  function findIndexById(arr, id){
    for (var i = 0; i < arr.length; i++){ if (arr[i].id === id) return i; }
    return -1;
  }

  /* البحث عن عميل بالإيميل (lowercased) — حساس لحالة الأحرف؟ لا، نخزّنه lowercased */
  function findByEmail(arr, email){
    var e = normEmail(email);
    if (!e) return -1;
    for (var i = 0; i < arr.length; i++){
      if (normEmail(arr[i].email) === e) return i;
    }
    return -1;
  }

  /* البحث بالجوال (آخر 9 أرقام) */
  function findByPhone(arr, phone){
    var t = tail9(phone);
    if (!t) return -1;
    for (var i = 0; i < arr.length; i++){
      if (tail9(arr[i].phone) === t) return i;
    }
    return -1;
  }

  /* ------------------------------------------------------------
     الجلسة
     ------------------------------------------------------------ */
  function currentRaw(){
    var sid = readStr(K_SESSION, '');
    if (!sid) return null;
    var arr = loadCustomers();
    var i = findIndexById(arr, sid);
    return i === -1 ? null : arr[i];
  }

  function current(){ return publicCustomer(currentRaw()); }
  function isLoggedIn(){ return !!currentRaw(); }

  /* ------------------------------------------------------------
     التسجيل / الدخول / الخروج
     ------------------------------------------------------------ */
  function signup(opts){
    opts = opts || {};
    var name  = String(opts.name == null ? '' : opts.name).trim();
    var email = normEmail(opts.email);
    var phone = String(opts.phone == null ? '' : opts.phone).trim();
    var city  = String(opts.city == null ? '' : opts.city).trim();
    var password = String(opts.password == null ? '' : opts.password);

    if (!name)             return { ok:false, error:'الرجاء إدخال الاسم.' };
    if (!isEmail(email))   return { ok:false, error:'البريد الإلكتروني غير صحيح.' };
    if (digitsOnly(phone).length < 9) return { ok:false, error:'رقم الجوال غير صحيح (9 أرقام على الأقل).' };
    if (password.length < 6) return { ok:false, error:'كلمة المرور يجب ألا تقل عن 6 أحرف.' };

    var arr = loadCustomers();
    if (findByEmail(arr, email) !== -1) return { ok:false, error:'هذا البريد الإلكتروني مُسجَّل بالفعل.' };

    var now = Date.now();
    var cust = {
      id: uid('cust_'),
      name: name,
      email: email,
      phone: phone,
      city: city,
      pass: hashPass(password),
      createdAt: now,
      updatedAt: now,
      meta: {}
    };
    arr.push(cust);
    saveCustomers(arr);
    writeStr(K_SESSION, cust.id);   /* تسجيل الدخول تلقائيًا بعد إنشاء الحساب */
    emit();
    return { ok:true, customer: publicCustomer(cust) };
  }

  function login(opts){
    opts = opts || {};
    var id = String(opts.id == null ? '' : opts.id).trim();
    var password = String(opts.password == null ? '' : opts.password);
    if (!id)       return { ok:false, error:'الرجاء إدخال البريد الإلكتروني أو الجوال.' };
    if (!password) return { ok:false, error:'الرجاء إدخال كلمة المرور.' };

    var arr = loadCustomers();
    var i = -1;
    if (isEmail(id)) {
      i = findByEmail(arr, id);
    } else {
      i = findByPhone(arr, id);
      if (i === -1) i = findByEmail(arr, id);   /* احتياطي: ربما أدخل إيميل بدون @ صالح */
    }
    if (i === -1) return { ok:false, error:'لا يوجد حساب بهذه البيانات.' };

    if (arr[i].pass !== hashPass(password)) {
      return { ok:false, error:'كلمة المرور غير صحيحة.' };
    }

    writeStr(K_SESSION, arr[i].id);
    emit();
    return { ok:true, customer: publicCustomer(arr[i]) };
  }

  function logout(){
    removeKey(K_SESSION);
    emit();
    return { ok:true };
  }

  /* ------------------------------------------------------------
     تعديل البروفايل
     ------------------------------------------------------------ */
  function update(partial){
    partial = partial || {};
    var arr = loadCustomers();
    var sid = readStr(K_SESSION, '');
    var i = sid ? findIndexById(arr, sid) : -1;
    if (i === -1) return { ok:false, error:'لست مسجّل الدخول.' };
    var cust = arr[i];

    /* الإيميل يظل فريدًا (lowercased) */
    if (partial.email != null) {
      var newEmail = normEmail(partial.email);
      if (!isEmail(newEmail)) return { ok:false, error:'البريد الإلكتروني غير صحيح.' };
      var j = findByEmail(arr, newEmail);
      if (j !== -1 && j !== i) return { ok:false, error:'هذا البريد الإلكتروني مُسجَّل بالفعل.' };
      cust.email = newEmail;
    }
    if (partial.name != null) {
      var nm = String(partial.name).trim();
      if (!nm) return { ok:false, error:'الرجاء إدخال الاسم.' };
      cust.name = nm;
    }
    if (partial.phone != null) {
      var ph = String(partial.phone).trim();
      if (digitsOnly(ph).length < 9) return { ok:false, error:'رقم الجوال غير صحيح (9 أرقام على الأقل).' };
      cust.phone = ph;
    }
    if (partial.city != null) cust.city = String(partial.city).trim();
    if (partial.meta != null && typeof partial.meta === 'object') {
      cust.meta = cust.meta || {};
      for (var k in partial.meta){ if (partial.meta.hasOwnProperty(k)) cust.meta[k] = partial.meta[k]; }
    }

    cust.updatedAt = Date.now();
    saveCustomers(arr);
    emit();
    return { ok:true, customer: publicCustomer(cust) };
  }

  function changePassword(oldP, newP){
    var arr = loadCustomers();
    var sid = readStr(K_SESSION, '');
    var i = sid ? findIndexById(arr, sid) : -1;
    if (i === -1) return { ok:false, error:'لست مسجّل الدخول.' };

    var newPass = String(newP == null ? '' : newP);
    if (arr[i].pass !== hashPass(String(oldP == null ? '' : oldP))) {
      return { ok:false, error:'كلمة المرور الحالية غير صحيحة.' };
    }
    if (newPass.length < 6) return { ok:false, error:'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف.' };

    arr[i].pass = hashPass(newPass);
    arr[i].updatedAt = Date.now();
    saveCustomers(arr);
    emit();
    return { ok:true };
  }

  function deleteAccount(){
    var arr = loadCustomers();
    var sid = readStr(K_SESSION, '');
    var i = sid ? findIndexById(arr, sid) : -1;
    if (i === -1) return { ok:false, error:'لست مسجّل الدخول.' };
    arr.splice(i, 1);
    saveCustomers(arr);
    removeKey(K_SESSION);
    emit();
    return { ok:true };
  }

  /* ------------------------------------------------------------
     روابط بباقي الموقع (قراءة فقط — لا نعدّل booking-core/الشات)
     ------------------------------------------------------------ */
  /* هل يطابق هذا العنصر العميل الحالي بالجوال (آخر 9) أو الإيميل؟ */
  function matchesCustomer(cust, phoneFields, emailFields){
    if (!cust) return false;
    var ct = tail9(cust.phone);
    var ce = normEmail(cust.email);
    var i;
    if (ct) {
      for (i = 0; i < phoneFields.length; i++){
        if (phoneFields[i] && tail9(phoneFields[i]) === ct) return true;
      }
    }
    if (ce) {
      for (i = 0; i < emailFields.length; i++){
        if (emailFields[i] && normEmail(emailFields[i]) === ce) return true;
      }
    }
    return false;
  }

  /* حجوزات العميل: لو window.OTB موجود، نفلتر OTB.bookings() بالجوال/الإيميل — وإلا [] */
  function bookings(){
    try {
      var cust = currentRaw();
      if (!cust) return [];
      if (!(window.OTB && typeof window.OTB.bookings === 'function')) return [];
      var all = window.OTB.bookings() || [];
      if (!Array.isArray(all)) return [];
      return all.filter(function(b){
        b = b || {};
        return matchesCustomer(
          cust,
          [b.phone, b.mobile, b.tel, b.customerPhone, (b.customer && b.customer.phone)],
          [b.email, b.customerEmail, (b.customer && b.customer.email)]
        );
      });
    } catch(e){ return []; }
  }

  /* محادثات الشات للعميل: نفلتر OneTrip.Chat.listConversations() بالجوال (آخر 9) — وإلا [] */
  function conversations(){
    try {
      var cust = currentRaw();
      if (!cust) return [];
      if (!(window.OneTrip && window.OneTrip.Chat && typeof window.OneTrip.Chat.listConversations === 'function')) return [];
      var all = window.OneTrip.Chat.listConversations() || [];
      if (!Array.isArray(all)) return [];
      var ct = tail9(cust.phone);
      if (!ct) return [];
      return all.filter(function(c){
        return c && tail9(c.phone) === ct;
      });
    } catch(e){ return []; }
  }

  /* طلبات ot_leads المطابقة للعميل بالجوال/الإيميل */
  function leads(){
    try {
      var cust = currentRaw();
      if (!cust) return [];
      var all = readJSON(K_LEADS, []);
      if (!Array.isArray(all)) return [];
      return all.filter(function(L){
        L = L || {};
        return matchesCustomer(
          cust,
          [L.phone, L.mobile, L.tel],
          [L.email]
        );
      });
    } catch(e){ return []; }
  }

  /* ------------------------------------------------------------
     نشر الواجهة على window.OneTrip.Auth
     ------------------------------------------------------------ */
  window.OneTrip = window.OneTrip || {};
  window.OneTrip.Auth = {
    /* حساب */
    signup:         signup,
    login:          login,
    logout:         logout,
    current:        current,
    isLoggedIn:     isLoggedIn,
    /* بروفايل */
    update:         update,
    changePassword: changePassword,
    deleteAccount:  deleteAccount,
    /* روابط (قراءة فقط) */
    bookings:       bookings,
    conversations:  conversations,
    leads:          leads,
    /* أحداث */
    on:  on,
    off: off,
    /* للاختبار فقط */
    hashPass: hashPass
  };
})();
