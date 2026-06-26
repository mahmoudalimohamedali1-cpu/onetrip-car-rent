;(function(){
  'use strict';

  /* ------------------------------------------------------------
     إيجنت 2 — اكتمال المتطلبات والبوابة (check)
     سيناريوهات حية على window.OneTrip.Reqs عبر api.Reqs.
     كل اختبار يبدأ بـ api.reset() ثم يبني حالته بنفسه.
     ES5-ish، بدون اعتماديات.
     ------------------------------------------------------------ */

  /* --- أدوات تأكيد بسيطة (لا اعتماديات) --- */
  function assert(cond, msg){
    if (!cond) throw new Error(msg || 'فشل التأكيد');
    return true;
  }
  function find(arr, id){
    arr = arr || [];
    for (var i = 0; i < arr.length; i++){
      if (arr[i] && arr[i].id === id) return arr[i];
    }
    return null;
  }
  function has(arr, id){ return !!find(arr, id); }
  function len(arr){ return (arr && arr.length) || 0; }

  /* عميل افتراضي للاختبارات */
  var CID  = 'cust_1';
  var CID2 = 'cust_2';

  /* يملأ كل الحقول المطلوبة الافتراضية لعميل */
  function fillDefaultFields(api, id){
    api.Reqs.saveField(id, 'nationalId', '1098765432');
    api.Reqs.saveField(id, 'licenseExpiry', '2030-01-01');
  }
  /* يرفع كل المرفقات المطلوبة الافتراضية لعميل */
  function uploadDefaultAttachments(api, id){
    api.Reqs.saveAttachment(id, 'id_copy', api.file(8));
    api.Reqs.saveAttachment(id, 'license_copy', api.file(8));
  }

  window.__JOURNEY = window.__JOURNEY || {};
  window.__JOURNEY[2] = {
    title: 'اكتمال المتطلبات والبوابة',
    tests: [

      /* 1 — عميل جديد تمامًا: ok=false مع نقص الحقول والمرفقات معًا */
      { name:'عميل جديد تمامًا ⇒ ok=false ونقص في الحقول والمرفقات معًا', fn:function(api){
        api.reset();
        var r = api.Reqs.check(CID);
        assert(r.ok === false, 'يجب أن يكون الفحص فاشلًا للعميل الجديد');
        assert(len(r.missingFields) === 2, 'يجب أن ينقص حقلان');
        assert(len(r.missingAttachments) === 2, 'يجب أن ينقص مرفقان');
        assert(len(r.rejected) === 0, 'لا يوجد مرفوض بعد');
        assert(has(r.missingFields, 'nationalId'), 'nationalId ناقص');
        assert(has(r.missingFields, 'licenseExpiry'), 'licenseExpiry ناقص');
        assert(has(r.missingAttachments, 'id_copy'), 'id_copy ناقص');
        assert(has(r.missingAttachments, 'license_copy'), 'license_copy ناقص');
        return true;
      }},

      /* 2 — نسي صورة الهوية فقط: missingAttachments فيها id_copy فقط */
      { name:'نسي صورة الهوية فقط ⇒ missingAttachments تحتوي id_copy فقط', fn:function(api){
        api.reset();
        fillDefaultFields(api, CID);
        api.Reqs.saveAttachment(CID, 'license_copy', api.file(8));
        var r = api.Reqs.check(CID);
        assert(r.ok === false, 'ناقص الهوية ⇒ فاشل');
        assert(len(r.missingFields) === 0, 'الحقول مكتملة');
        assert(len(r.missingAttachments) === 1, 'مرفق واحد ناقص فقط');
        assert(has(r.missingAttachments, 'id_copy'), 'الناقص هو id_copy');
        assert(!has(r.missingAttachments, 'license_copy'), 'الرخصة مرفوعة');
        return true;
      }},

      /* 3 — نسي صورة الرخصة فقط */
      { name:'نسي صورة الرخصة فقط ⇒ missingAttachments تحتوي license_copy فقط', fn:function(api){
        api.reset();
        fillDefaultFields(api, CID);
        api.Reqs.saveAttachment(CID, 'id_copy', api.file(8));
        var r = api.Reqs.check(CID);
        assert(r.ok === false, 'ناقص الرخصة ⇒ فاشل');
        assert(len(r.missingAttachments) === 1, 'مرفق واحد ناقص');
        assert(has(r.missingAttachments, 'license_copy'), 'الناقص هو license_copy');
        assert(!has(r.missingAttachments, 'id_copy'), 'الهوية مرفوعة');
        return true;
      }},

      /* 4 — نسي حقل nationalId فقط ⇒ missingFields فيه */
      { name:'نسي حقل nationalId فقط ⇒ missingFields تحتوي nationalId', fn:function(api){
        api.reset();
        api.Reqs.saveField(CID, 'licenseExpiry', '2030-01-01');
        uploadDefaultAttachments(api, CID);
        var r = api.Reqs.check(CID);
        assert(r.ok === false, 'ناقص حقل ⇒ فاشل');
        assert(len(r.missingFields) === 1, 'حقل واحد ناقص');
        assert(has(r.missingFields, 'nationalId'), 'الناقص nationalId');
        assert(!has(r.missingFields, 'licenseExpiry'), 'licenseExpiry مكتمل');
        assert(len(r.missingAttachments) === 0, 'المرفقات مكتملة');
        return true;
      }},

      /* 5 — نسي حقل licenseExpiry فقط */
      { name:'نسي حقل licenseExpiry فقط ⇒ missingFields تحتوي licenseExpiry', fn:function(api){
        api.reset();
        api.Reqs.saveField(CID, 'nationalId', '1098765432');
        uploadDefaultAttachments(api, CID);
        var r = api.Reqs.check(CID);
        assert(r.ok === false, 'ناقص حقل ⇒ فاشل');
        assert(len(r.missingFields) === 1, 'حقل واحد ناقص');
        assert(has(r.missingFields, 'licenseExpiry'), 'الناقص licenseExpiry');
        return true;
      }},

      /* 6 — ملأ حقلًا واحدًا فقط من الحقلين ⇒ لا يزال ناقصًا */
      { name:'ملأ حقلًا واحدًا فقط من المطلوبين ⇒ لا يزال غير مكتمل', fn:function(api){
        api.reset();
        api.Reqs.saveField(CID, 'nationalId', '1098765432');
        var r = api.Reqs.check(CID);
        assert(r.ok === false, 'حقل واحد لا يكفي');
        assert(len(r.missingFields) === 1, 'يبقى حقل واحد ناقصًا');
        assert(has(r.missingFields, 'licenseExpiry'), 'الباقي licenseExpiry');
        return true;
      }},

      /* 7 — ملأ كل الحقول لكن بلا مرفقات ⇒ غير مكتمل */
      { name:'ملأ كل الحقول بلا أي مرفقات ⇒ غير مكتمل (نقص المرفقات)', fn:function(api){
        api.reset();
        fillDefaultFields(api, CID);
        var r = api.Reqs.check(CID);
        assert(r.ok === false, 'بلا مرفقات ⇒ فاشل');
        assert(len(r.missingFields) === 0, 'الحقول مكتملة');
        assert(len(r.missingAttachments) === 2, 'كل المرفقات ناقصة');
        return true;
      }},

      /* 8 — رفع كل المرفقات بلا أي حقول ⇒ غير مكتمل */
      { name:'رفع كل المرفقات بلا أي حقول ⇒ غير مكتمل (نقص الحقول)', fn:function(api){
        api.reset();
        uploadDefaultAttachments(api, CID);
        var r = api.Reqs.check(CID);
        assert(r.ok === false, 'بلا حقول ⇒ فاشل');
        assert(len(r.missingAttachments) === 0, 'المرفقات مكتملة');
        assert(len(r.missingFields) === 2, 'كل الحقول ناقصة');
        return true;
      }},

      /* 9 — كل الحقول + كل المرفقات ⇒ ok=true */
      { name:'كل الحقول وكل المرفقات ⇒ ok=true', fn:function(api){
        api.reset();
        fillDefaultFields(api, CID);
        uploadDefaultAttachments(api, CID);
        var r = api.Reqs.check(CID);
        assert(r.ok === true, 'يجب أن ينجح الفحص');
        assert(len(r.missingFields) === 0, 'لا حقول ناقصة');
        assert(len(r.missingAttachments) === 0, 'لا مرفقات ناقصة');
        assert(len(r.rejected) === 0, 'لا مرفوض');
        return true;
      }},

      /* 10 — عناصر missingFields لها {id,label} صحيحة */
      { name:'عناصر missingFields تحمل {id,label} بالقيم الصحيحة', fn:function(api){
        api.reset();
        var r = api.Reqs.check(CID);
        var nf = find(r.missingFields, 'nationalId');
        var lf = find(r.missingFields, 'licenseExpiry');
        assert(nf && nf.id === 'nationalId', 'id الهوية صحيح');
        assert(nf.label === 'رقم الهوية/الإقامة', 'label الهوية صحيح');
        assert(lf && lf.id === 'licenseExpiry', 'id الرخصة صحيح');
        assert(lf.label === 'تاريخ انتهاء الرخصة', 'label الرخصة صحيح');
        return true;
      }},

      /* 11 — عناصر missingAttachments لها {id,label} صحيحة */
      { name:'عناصر missingAttachments تحمل {id,label} بالقيم الصحيحة', fn:function(api){
        api.reset();
        var r = api.Reqs.check(CID);
        var ai = find(r.missingAttachments, 'id_copy');
        var al = find(r.missingAttachments, 'license_copy');
        assert(ai && ai.label === 'صورة الهوية/الإقامة', 'label صورة الهوية صحيح');
        assert(al && al.label === 'صورة رخصة القيادة', 'label صورة الرخصة صحيح');
        return true;
      }},

      /* 12 — الأدمن يضيف حقلًا مطلوبًا جديدًا ⇒ عميل كان مكتملًا صار ناقصًا */
      { name:'الأدمن يضيف حقلًا مطلوبًا جديدًا ⇒ العميل المكتمل سابقًا صار ناقصًا', fn:function(api){
        api.reset();
        fillDefaultFields(api, CID);
        uploadDefaultAttachments(api, CID);
        assert(api.Reqs.check(CID).ok === true, 'مكتمل قبل التعديل');
        var cfg = api.Reqs.config();
        cfg.fields.push({ id:'phone2', label:'رقم جوال إضافي', type:'text', required:true });
        api.Reqs.saveConfig(cfg);
        var r = api.Reqs.check(CID);
        assert(r.ok === false, 'صار ناقصًا بعد إضافة الحقل');
        assert(has(r.missingFields, 'phone2'), 'الحقل الجديد phone2 في الناقص');
        var pf = find(r.missingFields, 'phone2');
        assert(pf.label === 'رقم جوال إضافي', 'label الحقل الجديد صحيح');
        return true;
      }},

      /* 13 — الأدمن يجعل حقلًا غير مطلوب ⇒ لم يعد يحجب */
      { name:'الأدمن يجعل حقلًا غير مطلوب ⇒ لم يعد يحجب الفحص', fn:function(api){
        api.reset();
        /* املأ licenseExpiry فقط واترك nationalId فارغًا */
        api.Reqs.saveField(CID, 'licenseExpiry', '2030-01-01');
        uploadDefaultAttachments(api, CID);
        assert(api.Reqs.check(CID).ok === false, 'محجوب بسبب nationalId');
        var cfg = api.Reqs.config();
        var f = find(cfg.fields, 'nationalId');
        f.required = false;
        api.Reqs.saveConfig(cfg);
        var r = api.Reqs.check(CID);
        assert(r.ok === true, 'بعد جعله غير مطلوب يكتمل');
        assert(!has(r.missingFields, 'nationalId'), 'nationalId لم يعد في الناقص');
        return true;
      }},

      /* 14 — الأدمن يضيف مرفقًا مطلوبًا جديدًا ⇒ يحجب حتى يُرفع */
      { name:'الأدمن يضيف مرفقًا مطلوبًا جديدًا ⇒ يحجب حتى يُرفع', fn:function(api){
        api.reset();
        fillDefaultFields(api, CID);
        uploadDefaultAttachments(api, CID);
        assert(api.Reqs.check(CID).ok === true, 'مكتمل قبل');
        var cfg = api.Reqs.config();
        cfg.attachments.push({ id:'selfie', label:'صورة شخصية', required:true });
        api.Reqs.saveConfig(cfg);
        var r1 = api.Reqs.check(CID);
        assert(r1.ok === false, 'محجوب بانتظار المرفق الجديد');
        assert(has(r1.missingAttachments, 'selfie'), 'selfie في الناقص');
        /* العميل يرفع المرفق الجديد */
        api.Reqs.saveAttachment(CID, 'selfie', api.file(8));
        var r2 = api.Reqs.check(CID);
        assert(r2.ok === true, 'اكتمل بعد رفع المرفق الجديد');
        return true;
      }},

      /* 15 — الأدمن يزيل مرفقًا مطلوبًا ⇒ لم يعد يحجب */
      { name:'الأدمن يجعل مرفقًا غير مطلوب ⇒ لم يعد يحجب', fn:function(api){
        api.reset();
        fillDefaultFields(api, CID);
        /* ارفع id_copy فقط */
        api.Reqs.saveAttachment(CID, 'id_copy', api.file(8));
        assert(api.Reqs.check(CID).ok === false, 'محجوب بسبب license_copy');
        var cfg = api.Reqs.config();
        var a = find(cfg.attachments, 'license_copy');
        a.required = false;
        api.Reqs.saveConfig(cfg);
        var r = api.Reqs.check(CID);
        assert(r.ok === true, 'اكتمل بعد جعل license_copy غير مطلوب');
        assert(!has(r.missingAttachments, 'license_copy'), 'لم يعد في الناقص');
        return true;
      }},

      /* 16 — حقل غير مطلوب متروك فارغًا لا يكسر ok */
      { name:'حقل غير مطلوب متروك فارغًا لا يكسر ok=true', fn:function(api){
        api.reset();
        var cfg = api.Reqs.config();
        cfg.fields.push({ id:'notes', label:'ملاحظات', type:'text', required:false });
        api.Reqs.saveConfig(cfg);
        fillDefaultFields(api, CID);
        uploadDefaultAttachments(api, CID);
        var r = api.Reqs.check(CID);
        assert(r.ok === true, 'الحقل غير المطلوب لا يحجب');
        assert(!has(r.missingFields, 'notes'), 'notes ليس في الناقص');
        return true;
      }},

      /* 17 — مرفق غير مطلوب غير مرفوع لا يكسر ok */
      { name:'مرفق غير مطلوب غير مرفوع لا يكسر ok=true', fn:function(api){
        api.reset();
        var cfg = api.Reqs.config();
        cfg.attachments.push({ id:'extra_doc', label:'مستند إضافي', required:false });
        api.Reqs.saveConfig(cfg);
        fillDefaultFields(api, CID);
        uploadDefaultAttachments(api, CID);
        var r = api.Reqs.check(CID);
        assert(r.ok === true, 'المرفق غير المطلوب لا يحجب');
        assert(!has(r.missingAttachments, 'extra_doc'), 'extra_doc ليس في الناقص');
        return true;
      }},

      /* 18 — الفحص لكل custId مستقل (عميلان منفصلان) */
      { name:'الفحص لكل عميل مستقل ⇒ عميلان لا يتداخلان', fn:function(api){
        api.reset();
        fillDefaultFields(api, CID);
        uploadDefaultAttachments(api, CID);
        /* العميل الثاني لا شيء */
        var r1 = api.Reqs.check(CID);
        var r2 = api.Reqs.check(CID2);
        assert(r1.ok === true, 'العميل الأول مكتمل');
        assert(r2.ok === false, 'العميل الثاني ناقص');
        assert(len(r2.missingFields) === 2 && len(r2.missingAttachments) === 2, 'العميل الثاني ناقص بالكامل');
        return true;
      }},

      /* 19 — إعادة الفحص بعد حفظ الحقل تزيله من الناقص */
      { name:'حفظ حقل ناقص ⇒ إعادة الفحص تزيله من missingFields', fn:function(api){
        api.reset();
        api.Reqs.saveField(CID, 'licenseExpiry', '2030-01-01');
        uploadDefaultAttachments(api, CID);
        var before = api.Reqs.check(CID);
        assert(has(before.missingFields, 'nationalId'), 'nationalId ناقص قبل');
        api.Reqs.saveField(CID, 'nationalId', '1098765432');
        var after = api.Reqs.check(CID);
        assert(!has(after.missingFields, 'nationalId'), 'اختفى بعد الحفظ');
        assert(after.ok === true, 'اكتمل الفحص');
        return true;
      }},

      /* 20 — إعادة الفحص بعد رفع المرفق تزيله من الناقص */
      { name:'رفع مرفق ناقص ⇒ إعادة الفحص تزيله من missingAttachments', fn:function(api){
        api.reset();
        fillDefaultFields(api, CID);
        api.Reqs.saveAttachment(CID, 'license_copy', api.file(8));
        var before = api.Reqs.check(CID);
        assert(has(before.missingAttachments, 'id_copy'), 'id_copy ناقص قبل');
        api.Reqs.saveAttachment(CID, 'id_copy', api.file(8));
        var after = api.Reqs.check(CID);
        assert(!has(after.missingAttachments, 'id_copy'), 'اختفى بعد الرفع');
        assert(after.ok === true, 'اكتمل');
        return true;
      }},

      /* 21 — حقل بقيمة مسافات فقط يُعد ناقصًا (trim) */
      { name:'حقل بقيمة مسافات فقط يُعد ناقصًا (يُشذَّب)', fn:function(api){
        api.reset();
        api.Reqs.saveField(CID, 'nationalId', '   ');
        api.Reqs.saveField(CID, 'licenseExpiry', '2030-01-01');
        uploadDefaultAttachments(api, CID);
        var r = api.Reqs.check(CID);
        assert(r.ok === false, 'المسافات لا تُحتسب قيمة');
        assert(has(r.missingFields, 'nationalId'), 'nationalId يبقى ناقصًا');
        return true;
      }},

      /* 22 — حقل بقيمة صفر "0" يُعد مكتملًا (قيمة صالحة) */
      { name:'حقل بقيمة "0" نصية يُعد مكتملًا', fn:function(api){
        api.reset();
        api.Reqs.saveField(CID, 'nationalId', '0');
        api.Reqs.saveField(CID, 'licenseExpiry', '2030-01-01');
        uploadDefaultAttachments(api, CID);
        var r = api.Reqs.check(CID);
        assert(!has(r.missingFields, 'nationalId'), 'القيمة "0" تُحتسب');
        assert(r.ok === true, 'مكتمل');
        return true;
      }},

      /* 23 — مرفق مرفوض يحجب الفحص ويظهر في rejected بالملاحظة */
      { name:'مرفق مرفوض ⇒ الفحص يفشل ويظهر في rejected بالملاحظة', fn:function(api){
        api.reset();
        fillDefaultFields(api, CID);
        uploadDefaultAttachments(api, CID);
        assert(api.Reqs.check(CID).ok === true, 'مكتمل قبل الرفض');
        api.Reqs.setStatus(CID, 'id_copy', 'rejected', 'الصورة غير واضحة');
        var r = api.Reqs.check(CID);
        assert(r.ok === false, 'الرفض يحجب');
        assert(len(r.rejected) === 1, 'مرفوض واحد');
        var rj = find(r.rejected, 'id_copy');
        assert(rj && rj.note === 'الصورة غير واضحة', 'الملاحظة محفوظة في rejected');
        /* مرفوض لكنه موجود ⇒ ليس في missingAttachments */
        assert(!has(r.missingAttachments, 'id_copy'), 'المرفوض ليس ضمن missingAttachments');
        return true;
      }},

      /* 24 — إعادة رفع مرفق مرفوض ⇒ يعود pending ويزول من rejected */
      { name:'إعادة رفع مرفق مرفوض ⇒ يعود pending ويكتمل الفحص', fn:function(api){
        api.reset();
        fillDefaultFields(api, CID);
        uploadDefaultAttachments(api, CID);
        api.Reqs.setStatus(CID, 'license_copy', 'rejected', 'منتهية');
        assert(api.Reqs.check(CID).ok === false, 'محجوب بالرفض');
        api.Reqs.saveAttachment(CID, 'license_copy', api.file(8));
        var r = api.Reqs.check(CID);
        assert(len(r.rejected) === 0, 'لم يعد مرفوضًا بعد إعادة الرفع');
        assert(r.ok === true, 'اكتمل بعد إعادة الرفع');
        return true;
      }},

      /* 25 — اعتماد كل المرفقات ⇒ ok=true (approved لا يحجب) */
      { name:'اعتماد كل المرفقات ⇒ ok=true (approved لا يحجب)', fn:function(api){
        api.reset();
        fillDefaultFields(api, CID);
        uploadDefaultAttachments(api, CID);
        api.Reqs.setStatus(CID, 'id_copy', 'approved', '');
        api.Reqs.setStatus(CID, 'license_copy', 'approved', '');
        var r = api.Reqs.check(CID);
        assert(r.ok === true, 'المعتمد لا يحجب');
        assert(len(r.rejected) === 0, 'لا مرفوض');
        return true;
      }},

      /* 26 — تعدد المرفوض: مرفقان مرفوضان كلاهما في rejected */
      { name:'تعدد الرفض ⇒ المرفقان المرفوضان كلاهما في rejected', fn:function(api){
        api.reset();
        fillDefaultFields(api, CID);
        uploadDefaultAttachments(api, CID);
        api.Reqs.setStatus(CID, 'id_copy', 'rejected', 'أ');
        api.Reqs.setStatus(CID, 'license_copy', 'rejected', 'ب');
        var r = api.Reqs.check(CID);
        assert(r.ok === false, 'محجوب');
        assert(len(r.rejected) === 2, 'مرفوضان');
        assert(has(r.rejected, 'id_copy') && has(r.rejected, 'license_copy'), 'كلاهما مرفوض');
        return true;
      }},

      /* 27 — إعداد فارغ تمامًا (لا حقول ولا مرفقات مطلوبة) ⇒ ok=true لعميل جديد */
      { name:'إعداد بلا متطلبات مطلوبة ⇒ ok=true لعميل جديد فارغ', fn:function(api){
        api.reset();
        api.Reqs.saveConfig({ fields: [], attachments: [] });
        var r = api.Reqs.check(CID);
        assert(r.ok === true, 'بلا متطلبات ⇒ ينجح');
        assert(len(r.missingFields) === 0 && len(r.missingAttachments) === 0, 'لا شيء ناقص');
        return true;
      }},

      /* 28 — مسح قيمة حقل (سلسلة فارغة) يعيده إلى الناقص */
      { name:'مسح قيمة حقل بسلسلة فارغة ⇒ يعود إلى missingFields', fn:function(api){
        api.reset();
        fillDefaultFields(api, CID);
        uploadDefaultAttachments(api, CID);
        assert(api.Reqs.check(CID).ok === true, 'مكتمل قبل المسح');
        api.Reqs.saveField(CID, 'nationalId', '');
        var r = api.Reqs.check(CID);
        assert(r.ok === false, 'صار ناقصًا بعد المسح');
        assert(has(r.missingFields, 'nationalId'), 'nationalId عاد للناقص');
        return true;
      }},

      /* 29 — الترتيب: missingFields تتبع ترتيب الإعداد */
      { name:'missingFields تتبع ترتيب الحقول في الإعداد', fn:function(api){
        api.reset();
        var r = api.Reqs.check(CID);
        assert(r.missingFields[0].id === 'nationalId', 'الأول nationalId');
        assert(r.missingFields[1].id === 'licenseExpiry', 'الثاني licenseExpiry');
        return true;
      }},

      /* 30 — حقل مطلوب بلا label يستخدم id كـ label احتياطيًا */
      { name:'حقل مطلوب بلا label ⇒ يستخدم id كـ label', fn:function(api){
        api.reset();
        api.Reqs.saveConfig({
          fields: [{ id:'taxId', required:true }],
          attachments: []
        });
        var r = api.Reqs.check(CID);
        var f = find(r.missingFields, 'taxId');
        assert(f && f.label === 'taxId', 'label احتياطي = id');
        return true;
      }}

    ]
  };
})();
