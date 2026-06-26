;(function(){
  'use strict';
  window.__JOURNEY = window.__JOURNEY || {};

  /* ------------------------------------------------------------
     إيجنت 4 — الرفض ومساره (where it goes after reject)
     يعتمد على api.Reqs:
       saveAttachment(custId,attId,file) -> status 'pending'
       setStatus(custId,attId,status,note) -> 'approved'|'rejected'|'pending'
       check(custId) -> {ok, missingFields, missingAttachments, rejected[]}
       pendingReview() -> [{custId,attId,label,name,status,note,ts}]
       docs(custId) -> {fields, attachments}
     ملاحظة سلوكية مرصودة من req-core.js:
       - مرفق required بحالة 'rejected' => يدخل rejected[] ويكسر ok.
       - مرفق required بحالة 'pending' => ليس ناقصًا وليس مرفوضًا => لا يكسر ok.
         أي: إعادة الرفع (pending) كافية ليصبح ok=true (لا يلزم اعتماد) طالما الباقي تمام.
     ------------------------------------------------------------ */

  /* --- أدوات تأكيد بسيطة (ترمي عند الفشل) --- */
  function assert(cond, msg){ if (!cond) throw new Error(msg || 'assertion failed'); return true; }
  function eq(a, b, msg){ if (a !== b) throw new Error((msg||'eq') + ' :: expected ' + b + ' got ' + a); return true; }

  /* يملأ كل الحقول المطلوبة الافتراضية حتى لا تكون هي سبب فشل الفحص */
  function fillRequiredFields(api, custId){
    api.Reqs.saveField(custId, 'nationalId', '1099887766');
    api.Reqs.saveField(custId, 'licenseExpiry', '2030-01-01');
  }

  /* يرفع المرفقين المطلوبين الافتراضيين */
  function uploadBothAttachments(api, custId){
    api.Reqs.saveAttachment(custId, 'id_copy', api.file(8));
    api.Reqs.saveAttachment(custId, 'license_copy', api.file(8));
  }

  /* يجهّز عميلًا "جاهزًا تقريبًا": كل الحقول + المرفقين بحالة pending */
  function readyCustomer(api, custId){
    fillRequiredFields(api, custId);
    uploadBothAttachments(api, custId);
  }

  /* يبحث عن عنصر مرفوض داخل rejected[] حسب id */
  function findRejected(chk, attId){
    var r = chk.rejected || [];
    for (var i = 0; i < r.length; i++){ if (r[i].id === attId) return r[i]; }
    return null;
  }

  /* يبحث عن عنصر في pendingReview حسب custId+attId */
  function findReview(list, custId, attId){
    for (var i = 0; i < list.length; i++){
      if (list[i].custId === custId && list[i].attId === attId) return list[i];
    }
    return null;
  }

  window.__JOURNEY[4] = {
    title: 'الرفض ومساره',
    tests: [

      /* 1 — رفض مرفق مطلوب => check.ok يصير false */
      { name:'بعد الرفض: check().ok يصبح false', fn:function(api){
        api.reset();
        var c = 'cust_rej_1';
        readyCustomer(api, c);
        eq(api.Reqs.check(c).ok, true, 'قبل الرفض لازم ok');
        api.Reqs.setStatus(c, 'id_copy', 'rejected', 'الصورة غير واضحة');
        eq(api.Reqs.check(c).ok, false, 'بعد الرفض لازم !ok');
        return true;
      }},

      /* 2 — العنصر المرفوض يظهر في rejected[] */
      { name:'المرفوض يظهر داخل rejected[]', fn:function(api){
        api.reset();
        var c = 'cust_rej_2';
        readyCustomer(api, c);
        api.Reqs.setStatus(c, 'id_copy', 'rejected', 'غير مقروء');
        var chk = api.Reqs.check(c);
        eq(chk.rejected.length, 1, 'لازم عنصر واحد مرفوض');
        var item = findRejected(chk, 'id_copy');
        assert(item, 'id_copy لازم يكون في rejected[]');
        return true;
      }},

      /* 3 — العنصر المرفوض يحمل الملاحظة */
      { name:'rejected[] يحمل الملاحظة (note)', fn:function(api){
        api.reset();
        var c = 'cust_rej_3';
        readyCustomer(api, c);
        api.Reqs.setStatus(c, 'id_copy', 'rejected', 'الصورة مقصوصة');
        var item = findRejected(api.Reqs.check(c), 'id_copy');
        assert(item, 'موجود في rejected');
        eq(item.note, 'الصورة مقصوصة', 'الملاحظة لازم تتخزن في rejected');
        return true;
      }},

      /* 4 — العنصر المرفوض يحتفظ بـ {id,label} */
      { name:'rejected[] يحتفظ بـ id و label', fn:function(api){
        api.reset();
        var c = 'cust_rej_4';
        readyCustomer(api, c);
        api.Reqs.setStatus(c, 'id_copy', 'rejected', 'x');
        var item = findRejected(api.Reqs.check(c), 'id_copy');
        assert(item, 'موجود');
        eq(item.id, 'id_copy', 'id محفوظ');
        eq(item.label, 'صورة الهوية/الإقامة', 'label من الإعداد');
        return true;
      }},

      /* 5 — المرفوض يذهب إلى طابور مراجعة الأدمن pendingReview */
      { name:'المرفوض يذهب إلى pendingReview (status rejected)', fn:function(api){
        api.reset();
        var c = 'cust_rej_5';
        readyCustomer(api, c);
        api.Reqs.setStatus(c, 'id_copy', 'rejected', 'أعد الرفع');
        var rv = findReview(api.Reqs.pendingReview(), c, 'id_copy');
        assert(rv, 'لازم يظهر في طابور المراجعة');
        eq(rv.status, 'rejected', 'حالته في الطابور rejected');
        return true;
      }},

      /* 6 — شكل عنصر pendingReview للمرفوض */
      { name:'شكل عنصر pendingReview: {custId,attId,label,status,note}', fn:function(api){
        api.reset();
        var c = 'cust_rej_6';
        readyCustomer(api, c);
        api.Reqs.setStatus(c, 'license_copy', 'rejected', 'منتهية');
        var rv = findReview(api.Reqs.pendingReview(), c, 'license_copy');
        assert(rv, 'موجود في الطابور');
        eq(rv.custId, c, 'custId');
        eq(rv.attId, 'license_copy', 'attId');
        eq(rv.label, 'صورة رخصة القيادة', 'label');
        eq(rv.status, 'rejected', 'status');
        eq(rv.note, 'منتهية', 'note');
        return true;
      }},

      /* 7 — إعادة الرفع تعيد الحالة إلى pending */
      { name:'إعادة الرفع تُرجِع الحالة إلى pending', fn:function(api){
        api.reset();
        var c = 'cust_rej_7';
        readyCustomer(api, c);
        api.Reqs.setStatus(c, 'id_copy', 'rejected', 'ارفع تاني');
        eq(api.Reqs.docs(c).attachments.id_copy.status, 'rejected', 'مرفوض الآن');
        api.Reqs.saveAttachment(c, 'id_copy', api.file(9));
        eq(api.Reqs.docs(c).attachments.id_copy.status, 'pending', 'بعد إعادة الرفع pending');
        return true;
      }},

      /* 8 — إعادة الرفع تُخرِجه من rejected[] في check */
      { name:'إعادة الرفع تُخرجه من rejected[]', fn:function(api){
        api.reset();
        var c = 'cust_rej_8';
        readyCustomer(api, c);
        api.Reqs.setStatus(c, 'id_copy', 'rejected', 'بلاش');
        assert(findRejected(api.Reqs.check(c), 'id_copy'), 'كان مرفوض');
        api.Reqs.saveAttachment(c, 'id_copy', api.file(9));
        assert(!findRejected(api.Reqs.check(c), 'id_copy'), 'بعد الرفع مش مرفوض');
        return true;
      }},

      /* 9 — السلوك الفعلي: pending المطلوب لا يكسر ok => إعادة الرفع تكفي لـ ok=true */
      { name:'pending المطلوب لا يكسر ok => إعادة الرفع => ok=true (بدون اعتماد)', fn:function(api){
        api.reset();
        var c = 'cust_rej_9';
        readyCustomer(api, c);
        api.Reqs.setStatus(c, 'id_copy', 'rejected', 'x');
        eq(api.Reqs.check(c).ok, false, 'مرفوض => !ok');
        api.Reqs.saveAttachment(c, 'id_copy', api.file(9)); /* => pending */
        eq(api.Reqs.docs(c).attachments.id_copy.status, 'pending', 'pending');
        eq(api.Reqs.check(c).ok, true, 'pending لا يكسر ok => ok=true حتى قبل الاعتماد');
        return true;
      }},

      /* 10 — مع ذلك يظل في pendingReview بعد إعادة الرفع (pending) */
      { name:'بعد إعادة الرفع: لسه في pendingReview بحالة pending', fn:function(api){
        api.reset();
        var c = 'cust_rej_10';
        readyCustomer(api, c);
        api.Reqs.setStatus(c, 'id_copy', 'rejected', 'x');
        api.Reqs.saveAttachment(c, 'id_copy', api.file(9));
        var rv = findReview(api.Reqs.pendingReview(), c, 'id_copy');
        assert(rv, 'لسه في الطابور لأن pending');
        eq(rv.status, 'pending', 'حالته pending الآن');
        return true;
      }},

      /* 11 — الأدمن يعتمد بعد إعادة الرفع => check.ok true */
      { name:'الاعتماد بعد إعادة الرفع => check().ok=true', fn:function(api){
        api.reset();
        var c = 'cust_rej_11';
        readyCustomer(api, c);
        api.Reqs.setStatus(c, 'id_copy', 'rejected', 'x');
        api.Reqs.saveAttachment(c, 'id_copy', api.file(9));
        api.Reqs.setStatus(c, 'id_copy', 'approved', '');
        api.Reqs.setStatus(c, 'license_copy', 'approved', '');
        eq(api.Reqs.check(c).ok, true, 'بعد الاعتماد ok');
        return true;
      }},

      /* 12 — بعد الاعتماد لا يظهر في pendingReview */
      { name:'بعد اعتماد الكل: لا شيء في pendingReview لهذا العميل', fn:function(api){
        api.reset();
        var c = 'cust_rej_12';
        readyCustomer(api, c);
        api.Reqs.setStatus(c, 'id_copy', 'rejected', 'x');
        api.Reqs.saveAttachment(c, 'id_copy', api.file(9));
        api.Reqs.setStatus(c, 'id_copy', 'approved', '');
        api.Reqs.setStatus(c, 'license_copy', 'approved', '');
        assert(!findReview(api.Reqs.pendingReview(), c, 'id_copy'), 'id_copy مش في الطابور');
        assert(!findReview(api.Reqs.pendingReview(), c, 'license_copy'), 'license_copy مش في الطابور');
        return true;
      }},

      /* 13 — الاعتماد يمسح rejected من check */
      { name:'الاعتماد المباشر يمسح rejected من check', fn:function(api){
        api.reset();
        var c = 'cust_rej_13';
        readyCustomer(api, c);
        api.Reqs.setStatus(c, 'id_copy', 'rejected', 'x');
        eq(api.Reqs.check(c).rejected.length, 1, 'مرفوض');
        api.Reqs.setStatus(c, 'id_copy', 'approved', ''); /* اعتماد مباشر بدون إعادة رفع */
        eq(api.Reqs.check(c).rejected.length, 0, 'الاعتماد مسح rejected');
        eq(api.Reqs.check(c).ok, true, 'وأصبح ok');
        return true;
      }},

      /* 14 — رفض اثنين => اثنان في rejected[] */
      { name:'رفض مرفقين => اثنان في rejected[]', fn:function(api){
        api.reset();
        var c = 'cust_rej_14';
        readyCustomer(api, c);
        api.Reqs.setStatus(c, 'id_copy', 'rejected', 'صورة الهوية ضبابية');
        api.Reqs.setStatus(c, 'license_copy', 'rejected', 'الرخصة منتهية');
        var chk = api.Reqs.check(c);
        eq(chk.rejected.length, 2, 'الاثنان مرفوضان');
        eq(chk.ok, false, '!ok');
        return true;
      }},

      /* 15 — رفض متعدد: كل ملاحظة مع عنصرها الصحيح */
      { name:'رفض متعدد: كل ملاحظة مع مرفقها', fn:function(api){
        api.reset();
        var c = 'cust_rej_15';
        readyCustomer(api, c);
        api.Reqs.setStatus(c, 'id_copy', 'rejected', 'ملاحظة الهوية');
        api.Reqs.setStatus(c, 'license_copy', 'rejected', 'ملاحظة الرخصة');
        var chk = api.Reqs.check(c);
        eq(findRejected(chk, 'id_copy').note, 'ملاحظة الهوية', 'note الهوية');
        eq(findRejected(chk, 'license_copy').note, 'ملاحظة الرخصة', 'note الرخصة');
        return true;
      }},

      /* 16 — رفض واحد واعتماد الآخر => يكسر ok بسبب المرفوض فقط */
      { name:'رفض واحد + اعتماد الآخر => !ok (المرفوض هو السبب)', fn:function(api){
        api.reset();
        var c = 'cust_rej_16';
        readyCustomer(api, c);
        api.Reqs.setStatus(c, 'id_copy', 'approved', '');
        api.Reqs.setStatus(c, 'license_copy', 'rejected', 'منتهية');
        var chk = api.Reqs.check(c);
        eq(chk.ok, false, '!ok بسبب المرفوض');
        eq(chk.rejected.length, 1, 'مرفوض واحد فقط');
        eq(findRejected(chk, 'license_copy').id, 'license_copy', 'هو الرخصة');
        assert(!findRejected(chk, 'id_copy'), 'الهوية معتمدة مش مرفوضة');
        return true;
      }},

      /* 17 — إصلاح المرفوض وحده يكفي لـ ok (الآخر معتمد) */
      { name:'إصلاح المرفوض وحده يكفي لـ ok', fn:function(api){
        api.reset();
        var c = 'cust_rej_17';
        readyCustomer(api, c);
        api.Reqs.setStatus(c, 'id_copy', 'approved', '');
        api.Reqs.setStatus(c, 'license_copy', 'rejected', 'منتهية');
        eq(api.Reqs.check(c).ok, false, 'مكسور');
        api.Reqs.saveAttachment(c, 'license_copy', api.file(9)); /* => pending */
        eq(api.Reqs.check(c).ok, true, 'pending الجديد لا يكسر ok');
        return true;
      }},

      /* 18 — الملاحظة تُحفظ وتُسترجع عبر docs() */
      { name:'الملاحظة تُحفظ وتُسترجع عبر docs()', fn:function(api){
        api.reset();
        var c = 'cust_rej_18';
        readyCustomer(api, c);
        api.Reqs.setStatus(c, 'id_copy', 'rejected', 'تفاصيل الرفض هنا');
        eq(api.Reqs.docs(c).attachments.id_copy.note, 'تفاصيل الرفض هنا', 'note في docs');
        eq(api.Reqs.docs(c).attachments.id_copy.status, 'rejected', 'status في docs');
        return true;
      }},

      /* 19 — الملاحظة تُمسح عند الاعتماد بملاحظة فارغة */
      { name:'الاعتماد بملاحظة فارغة يمسح note', fn:function(api){
        api.reset();
        var c = 'cust_rej_19';
        readyCustomer(api, c);
        api.Reqs.setStatus(c, 'id_copy', 'rejected', 'ملاحظة قديمة');
        eq(api.Reqs.docs(c).attachments.id_copy.note, 'ملاحظة قديمة', 'كانت موجودة');
        api.Reqs.setStatus(c, 'id_copy', 'approved', '');
        eq(api.Reqs.docs(c).attachments.id_copy.note, '', 'انمسحت عند الاعتماد');
        return true;
      }},

      /* 20 — إعادة الرفع تمسح الملاحظة القديمة (note='') */
      { name:'إعادة الرفع تمسح note المرفوض', fn:function(api){
        api.reset();
        var c = 'cust_rej_20';
        readyCustomer(api, c);
        api.Reqs.setStatus(c, 'id_copy', 'rejected', 'ملاحظة سترُمى');
        api.Reqs.saveAttachment(c, 'id_copy', api.file(9));
        eq(api.Reqs.docs(c).attachments.id_copy.note, '', 'saveAttachment يبدأ بـ note فارغ');
        return true;
      }},

      /* 21 — دورة كاملة: رفض -> إعادة رفع -> اعتماد */
      { name:'دورة كاملة: رفض ⇒ إعادة رفع ⇒ اعتماد ⇒ ok', fn:function(api){
        api.reset();
        var c = 'cust_rej_21';
        readyCustomer(api, c);
        /* اعتماد الرخصة لتثبيت الباقي */
        api.Reqs.setStatus(c, 'license_copy', 'approved', '');
        api.Reqs.setStatus(c, 'id_copy', 'rejected', 'غير واضحة');
        eq(api.Reqs.check(c).ok, false, '1) مرفوض');
        api.Reqs.saveAttachment(c, 'id_copy', api.file(9));
        eq(api.Reqs.docs(c).attachments.id_copy.status, 'pending', '2) pending');
        assert(findReview(api.Reqs.pendingReview(), c, 'id_copy'), '2) في الطابور');
        api.Reqs.setStatus(c, 'id_copy', 'approved', '');
        eq(api.Reqs.check(c).ok, true, '3) معتمد => ok');
        assert(!findReview(api.Reqs.pendingReview(), c, 'id_copy'), '3) خرج من الطابور');
        return true;
      }},

      /* 22 — دورات رفض/إعادة رفع/اعتماد متعددة على نفس المرفق */
      { name:'دورات متعددة رفض⇄إعادة رفع⇄اعتماد على نفس المرفق', fn:function(api){
        api.reset();
        var c = 'cust_rej_22';
        readyCustomer(api, c);
        api.Reqs.setStatus(c, 'license_copy', 'approved', '');
        for (var i = 0; i < 3; i++){
          api.Reqs.setStatus(c, 'id_copy', 'rejected', 'محاولة ' + i);
          eq(api.Reqs.check(c).ok, false, 'مرفوض في الدورة ' + i);
          eq(findRejected(api.Reqs.check(c), 'id_copy').note, 'محاولة ' + i, 'note الدورة ' + i);
          api.Reqs.saveAttachment(c, 'id_copy', api.file(7));
          eq(api.Reqs.docs(c).attachments.id_copy.status, 'pending', 'pending الدورة ' + i);
        }
        api.Reqs.setStatus(c, 'id_copy', 'approved', '');
        eq(api.Reqs.check(c).ok, true, 'بعد الدورات اعتُمد => ok');
        return true;
      }},

      /* 23 — رفض مرفق غير موجود آمن ولا يكسر شيئًا */
      { name:'رفض مرفق غير موجود: آمن (ok:false من setStatus) ولا يلوّث check', fn:function(api){
        api.reset();
        var c = 'cust_rej_23';
        readyCustomer(api, c);
        var res = api.Reqs.setStatus(c, 'ghost_doc', 'rejected', 'لا وجود له');
        eq(res.ok, false, 'setStatus على مرفق غير موجود يرجّع ok:false');
        eq(api.Reqs.check(c).ok, true, 'check سليم — المرفق الوهمي لم يُسجَّل');
        eq(api.Reqs.check(c).rejected.length, 0, 'لا مرفوضات');
        assert(!findReview(api.Reqs.pendingReview(), c, 'ghost_doc'), 'لا يظهر في الطابور');
        return true;
      }},

      /* 24 — رفض على عميل غير موجود أصلًا آمن */
      { name:'رفض على عميل غير موجود: آمن', fn:function(api){
        api.reset();
        var res = api.Reqs.setStatus('no_such_cust', 'id_copy', 'rejected', 'x');
        eq(res.ok, false, 'ok:false لأن لا مستندات للعميل');
        eq(api.Reqs.pendingReview().length, 0, 'الطابور فاضي');
        return true;
      }},

      /* 25 — عميلان: رفض أحدهما لا يؤثر على الآخر */
      { name:'عزل العملاء: رفض عميل لا يؤثر على آخر', fn:function(api){
        api.reset();
        var a = 'cust_A', b = 'cust_B';
        readyCustomer(api, a);
        readyCustomer(api, b);
        api.Reqs.setStatus(a, 'id_copy', 'rejected', 'مشكلة A');
        eq(api.Reqs.check(a).ok, false, 'A مكسور');
        eq(api.Reqs.check(b).ok, true, 'B سليم');
        var rvB = findReview(api.Reqs.pendingReview(), b, 'id_copy');
        assert(rvB, 'B لسه في الطابور (pending)');
        eq(rvB.status, 'pending', 'B pending مش rejected');
        return true;
      }},

      /* 26 — pendingReview يجمع المرفوض من أكثر من عميل بشكله الصحيح */
      { name:'pendingReview يجمع مرفوضات عملاء متعددين بالشكل الصحيح', fn:function(api){
        api.reset();
        var a = 'multi_A', b = 'multi_B';
        readyCustomer(api, a);
        readyCustomer(api, b);
        /* اعتماد كل شيء ما عدا مرفوض واحد لكل عميل */
        api.Reqs.setStatus(a, 'license_copy', 'approved', '');
        api.Reqs.setStatus(b, 'license_copy', 'approved', '');
        api.Reqs.setStatus(a, 'id_copy', 'rejected', 'note-A');
        api.Reqs.setStatus(b, 'id_copy', 'rejected', 'note-B');
        var list = api.Reqs.pendingReview();
        var ra = findReview(list, a, 'id_copy');
        var rb = findReview(list, b, 'id_copy');
        assert(ra && rb, 'كلاهما في الطابور');
        eq(ra.status, 'rejected', 'A rejected');
        eq(rb.status, 'rejected', 'B rejected');
        eq(ra.note, 'note-A', 'note A');
        eq(rb.note, 'note-B', 'note B');
        eq(ra.label, 'صورة الهوية/الإقامة', 'label A');
        return true;
      }},

      /* 27 — حالة غير معروفة في setStatus تُعامَل كـ pending (حسب req-core) */
      { name:'حالة غير معروفة في setStatus تصبح pending', fn:function(api){
        api.reset();
        var c = 'cust_rej_27';
        readyCustomer(api, c);
        api.Reqs.setStatus(c, 'id_copy', 'weird_status', 'note');
        eq(api.Reqs.docs(c).attachments.id_copy.status, 'pending', 'أي حالة غريبة => pending');
        eq(api.Reqs.check(c).ok, true, 'pending لا يكسر ok');
        return true;
      }}

    ]
  };
})();
