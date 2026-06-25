/* ============================================================
   One Trip — booking requirements & customer documents data layer
   ------------------------------------------------------------
   طبقة بيانات «متطلبات الحجز» والمستندات الإلزامية — RTL، عربي.
   مصدر وحيد للحقيقة لكل من يبني الواجهات:
     - الداشبورد (admin.html)  → saveConfig / pendingReview / setStatus
     - البروفايل (profile.html) → docs / saveField / saveAttachment / check
     - الـcheckout (checkout.html) → check / snapshot قبل الدفع

   الأدمن يحدّد الحقول والمرفقات المطلوبة (ot_booking_reqs)، والعملاء
   يملؤونها/يرفعونها (ot_customer_docs)، وتُفحَص قبل الدفع وتُراجَع من
   الداشبورد (اعتماد/رفض + ملاحظة ⇒ يعيد العميل الإرفاق).

   المخزن الآن تجريبي عبر localStorage (نفس نمط cars.js / auth-core.js)
   ويتبدّل إلى Supabase + Storage لاحقًا بنفس الأشكال (انظر REQS_CONTRACT.md).
   كل وصول لـlocalStorage داخل try/catch ولا يُرمى أي خطأ للمستدعي.

   ⚠️ المرفقات تُخزَّن كـ dataURL (base64) داخل localStorage — تجريبي فقط؛
   احرص على ضغط/حدّ الحجم قبل الرفع، والكتابة محروسة ضد امتلاء المخزن.

   Realtime: كل تعديل يبثّ {type:'change'} عبر BroadcastChannel('ot_reqs')
   ومستمع window 'storage' على 'ot_customer_docs'/'ot_booking_reqs' كاحتياطي
   عبر التبويبات.
   ============================================================ */
;(function(){
  'use strict';

  /* ---- مفاتيح التخزين ---- */
  var K_REQS = 'ot_booking_reqs';   /* إعداد الأدمن: الحقول + المرفقات المطلوبة */
  var K_DOCS = 'ot_customer_docs';  /* مستندات العملاء: { [custId]: {fields,attachments} } */

  /* ---- الإعداد الافتراضي (§2) ---- */
  var DEFAULT_CONFIG = {
    fields: [
      { id:'nationalId',    label:'رقم الهوية/الإقامة',     type:'text', required:true },
      { id:'licenseExpiry', label:'تاريخ انتهاء الرخصة',   type:'date', required:true }
    ],
    attachments: [
      { id:'id_copy',      label:'صورة الهوية/الإقامة', required:true },
      { id:'license_copy', label:'صورة رخصة القيادة',   required:true }
    ]
  };

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

  /* ------------------------------------------------------------
     البث (Realtime) — BroadcastChannel + window 'storage'
     ------------------------------------------------------------ */
  var listeners = { change: [] };
  var bc = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('ot_reqs');
      bc.onmessage = function(ev){
        if (ev && ev.data && ev.data.type === 'change') fire('change');
      };
    }
  } catch(e){ bc = null; }

  try {
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('storage', function(ev){
        if (ev && (ev.key === K_DOCS || ev.key === K_REQS)) fire('change');
      });
    }
  } catch(e){}

  var firing = false;
  function fire(event){
    var cbs = listeners[event];
    if (!cbs) return;
    if (firing) return;            /* حماية من التكرار المتداخل (re-entrancy) */
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
  /* نسخة عميقة بسيطة عبر JSON — محروسة (لا ترمي) */
  function clone(v){
    try { return JSON.parse(JSON.stringify(v)); } catch(e){ return v; }
  }

  /* قائمة آمنة: نُرجّع مصفوفة فقط */
  function asArray(v){ return Array.isArray(v) ? v : []; }

  /* ------------------------------------------------------------
     الإعداد (ot_booking_reqs) — مدموج فوق الافتراضي
     ------------------------------------------------------------ */
  function config(){
    var saved = readJSON(K_REQS, null);
    if (!saved || typeof saved !== 'object') return clone(DEFAULT_CONFIG);
    /* لو المحفوظ موجود نستخدمه؛ نضمن وجود المصفوفتين بالشكل الصحيح */
    var fields = Array.isArray(saved.fields) ? saved.fields : DEFAULT_CONFIG.fields;
    var attachments = Array.isArray(saved.attachments) ? saved.attachments : DEFAULT_CONFIG.attachments;
    return clone({ fields: fields, attachments: attachments });
  }

  function saveConfig(cfg){
    cfg = cfg || {};
    var out = {
      fields: Array.isArray(cfg.fields) ? cfg.fields : DEFAULT_CONFIG.fields,
      attachments: Array.isArray(cfg.attachments) ? cfg.attachments : DEFAULT_CONFIG.attachments
    };
    var okWrite = writeJSON(K_REQS, out);
    if (!okWrite) return { ok:false, error:'تعذّر حفظ الإعداد.' };
    emit();
    return { ok:true, config: clone(out) };
  }

  /* ------------------------------------------------------------
     مستندات العملاء (ot_customer_docs)
     ------------------------------------------------------------ */
  function loadAllDocs(){
    var all = readJSON(K_DOCS, {});
    return (all && typeof all === 'object' && !Array.isArray(all)) ? all : {};
  }

  /* docs(custId) — نسخة من مستندات العميل {fields,attachments} (أو فاضي) */
  function docs(custId){
    var all = loadAllDocs();
    var d = (custId != null) ? all[custId] : null;
    if (!d || typeof d !== 'object') return { fields:{}, attachments:{} };
    return {
      fields: (d.fields && typeof d.fields === 'object') ? clone(d.fields) : {},
      attachments: (d.attachments && typeof d.attachments === 'object') ? clone(d.attachments) : {}
    };
  }

  /* داخلي: يضمن وجود سجلّ العميل بشكله الصحيح داخل الخريطة */
  function ensureDoc(all, custId){
    var d = all[custId];
    if (!d || typeof d !== 'object'){ d = { fields:{}, attachments:{} }; all[custId] = d; }
    if (!d.fields || typeof d.fields !== 'object') d.fields = {};
    if (!d.attachments || typeof d.attachments !== 'object') d.attachments = {};
    return d;
  }

  function saveField(custId, fieldId, value){
    if (custId == null || fieldId == null) return { ok:false, error:'بيانات ناقصة.' };
    var all = loadAllDocs();
    var d = ensureDoc(all, custId);
    d.fields[fieldId] = (value == null) ? '' : value;
    var okWrite = writeJSON(K_DOCS, all);
    if (!okWrite) return { ok:false, error:'تعذّر الحفظ.' };
    emit();
    return { ok:true };
  }

  /* saveAttachment — يخزّن المرفق كـ dataURL بحالة 'pending'.
     يحرس ضد امتلاء localStorage (quota) ويُرجّع خطأ واضح بدل الرمي. */
  function saveAttachment(custId, attId, file){
    if (custId == null || attId == null) return { ok:false, error:'بيانات ناقصة.' };
    file = file || {};
    var rec = {
      name: (file.name == null) ? '' : String(file.name),
      dataURL: (file.dataURL == null) ? '' : String(file.dataURL),
      status: 'pending',
      note: '',
      ts: Date.now()
    };
    var all = loadAllDocs();
    var d = ensureDoc(all, custId);
    d.attachments[attId] = rec;
    var okWrite = writeJSON(K_DOCS, all);
    if (!okWrite) return { ok:false, error:'الملف كبير جدًا' };   /* امتلاء المخزن / quota */
    emit();
    return { ok:true };
  }

  /* setStatus — اعتماد/رفض مرفق + ملاحظة (الأدمن) */
  function setStatus(custId, attId, status, note){
    if (custId == null || attId == null) return { ok:false, error:'بيانات ناقصة.' };
    var all = loadAllDocs();
    var d = all[custId];
    if (!d || !d.attachments || !d.attachments[attId]) return { ok:false, error:'المرفق غير موجود.' };
    var st = (status === 'approved' || status === 'rejected') ? status : 'pending';
    d.attachments[attId].status = st;
    d.attachments[attId].note = (note == null) ? '' : String(note);
    var okWrite = writeJSON(K_DOCS, all);
    if (!okWrite) return { ok:false, error:'تعذّر الحفظ.' };
    emit();
    return { ok:true };
  }

  /* ------------------------------------------------------------
     الفحص قبل الدفع — المطلوب فقط
     ------------------------------------------------------------ */
  function check(custId){
    var cfg = config();
    var d = docs(custId);
    var missingFields = [];
    var missingAttachments = [];
    var rejected = [];

    var reqFields = asArray(cfg.fields).filter(function(f){ return f && f.required; });
    for (var i = 0; i < reqFields.length; i++){
      var f = reqFields[i];
      var v = d.fields[f.id];
      /* ناقص = لا قيمة (غير موجود / فارغ بعد التشذيب) */
      if (v == null || String(v).trim() === ''){
        missingFields.push({ id:f.id, label:f.label || f.id });
      }
    }

    var reqAtt = asArray(cfg.attachments).filter(function(a){ return a && a.required; });
    for (var j = 0; j < reqAtt.length; j++){
      var a = reqAtt[j];
      var rec = d.attachments[a.id];
      if (!rec){
        /* ناقص = لم يُرفع مرفق أصلًا */
        missingAttachments.push({ id:a.id, label:a.label || a.id });
      } else if (rec.status === 'rejected'){
        /* مرفوض = موجود لكن مرفوض ⇒ يلزم إعادة إرفاق */
        rejected.push({ id:a.id, label:a.label || a.id, note: rec.note || '' });
      }
    }

    var ok = (missingFields.length === 0 && missingAttachments.length === 0 && rejected.length === 0);
    return { ok:ok, missingFields:missingFields, missingAttachments:missingAttachments, rejected:rejected };
  }

  /* ------------------------------------------------------------
     لقطة مبسّطة للحجز (بدون dataURL الثقيل)
     ------------------------------------------------------------ */
  function snapshot(custId){
    var d = docs(custId);
    var atts = {};
    for (var k in d.attachments){
      if (d.attachments.hasOwnProperty(k)){
        var rec = d.attachments[k] || {};
        atts[k] = { name: rec.name || '', status: rec.status || 'pending' };
      }
    }
    return { fields: clone(d.fields), attachments: atts };
  }

  /* ------------------------------------------------------------
     قائمة المراجعة للأدمن — كل مرفق pending أو rejected
     ------------------------------------------------------------ */
  function pendingReview(){
    var out = [];
    var all = loadAllDocs();
    var cfg = config();
    /* خريطة label لكل مرفق من الإعداد */
    var labelById = {};
    var attCfg = asArray(cfg.attachments);
    for (var c = 0; c < attCfg.length; c++){
      if (attCfg[c] && attCfg[c].id != null) labelById[attCfg[c].id] = attCfg[c].label || attCfg[c].id;
    }
    for (var custId in all){
      if (!all.hasOwnProperty(custId)) continue;
      var d = all[custId];
      if (!d || !d.attachments || typeof d.attachments !== 'object') continue;
      for (var attId in d.attachments){
        if (!d.attachments.hasOwnProperty(attId)) continue;
        var rec = d.attachments[attId] || {};
        if (rec.status === 'pending' || rec.status === 'rejected'){
          out.push({
            custId: custId,
            attId: attId,
            label: (labelById[attId] != null) ? labelById[attId] : attId,
            name: rec.name || '',
            status: rec.status,
            note: rec.note || '',
            ts: rec.ts || 0
          });
        }
      }
    }
    return out;
  }

  /* ------------------------------------------------------------
     نشر الواجهة على window.OneTrip.Reqs
     ------------------------------------------------------------ */
  window.OneTrip = window.OneTrip || {};
  window.OneTrip.Reqs = {
    /* الإعداد (الأدمن) */
    config:        config,
    saveConfig:    saveConfig,
    /* مستندات العميل */
    docs:          docs,
    saveField:     saveField,
    saveAttachment:saveAttachment,
    setStatus:     setStatus,
    /* الفحص واللقطة */
    check:         check,
    snapshot:      snapshot,
    /* مراجعة الأدمن */
    pendingReview: pendingReview,
    /* أحداث */
    on:  on,
    off: off
  };
})();
