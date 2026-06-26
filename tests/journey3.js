/* ============================================================
   One Trip — Journey Tests / إيجنت 3: المرفقات ودورتها
   ------------------------------------------------------------
   سيناريوهات حية على طبقة المرفقات الفعلية (window.OneTrip.Reqs)
   عبر الـapi المُمرّر من المنسّق. كل اختبار يبدأ بـapi.reset().
   ES5-ish، بدون اعتماديات. التركيز: رفع/إعادة رفع/تعدد/ملف كبير/
   snapshot خفيف/عزل العملاء/عدم كسر الحالة.
   ============================================================ */
;(function(){
  window.__JOURNEY = window.__JOURNEY || {};

  /* ---- أدوات تأكيد بسيطة (ترمي عند الفشل) ---- */
  function assert(cond, msg){ if(!cond){ throw new Error(msg || 'فشل التأكيد'); } return true; }
  function eq(a, b, msg){ if(a !== b){ throw new Error((msg||'قيمتان غير متساويتين')+' — متوقع '+b+' وجد '+a); } return true; }
  function has(obj, key){ return obj && Object.prototype.hasOwnProperty.call(obj, key); }
  function count(obj){ var n=0,k; for(k in obj){ if(has(obj,k)) n++; } return n; }

  var CUST = 'cust_3001';

  window.__JOURNEY[3] = {
    title: 'المرفقات ودورتها',
    tests: [

      /* 1 — رفع مرفق ⇒ الحالة pending */
      { name:'رفع مرفق جديد يضبط الحالة pending', fn:function(api){
        api.reset();
        var r = api.Reqs.saveAttachment(CUST, 'id_copy', api.file());
        assert(r && r.ok === true, 'الرفع يجب أن ينجح');
        var d = api.Reqs.docs(CUST);
        assert(has(d.attachments, 'id_copy'), 'المرفق غير محفوظ');
        eq(d.attachments.id_copy.status, 'pending', 'الحالة الافتراضية يجب pending');
        return true;
      }},

      /* 2 — الاسم يُحفظ */
      { name:'اسم الملف يُحفظ مع المرفق', fn:function(api){
        api.reset();
        var f = api.file();
        api.Reqs.saveAttachment(CUST, 'id_copy', f);
        var d = api.Reqs.docs(CUST);
        eq(d.attachments.id_copy.name, f.name, 'الاسم المحفوظ يخالف اسم الملف');
        return true;
      }},

      /* 3 — ts يُضبط (رقم > 0) */
      { name:'الطابع الزمني ts يُضبط عند الرفع', fn:function(api){
        api.reset();
        var before = Date.now();
        api.Reqs.saveAttachment(CUST, 'id_copy', api.file());
        var d = api.Reqs.docs(CUST);
        assert(typeof d.attachments.id_copy.ts === 'number', 'ts ليس رقمًا');
        assert(d.attachments.id_copy.ts > 0, 'ts يجب أن يكون موجبًا');
        assert(d.attachments.id_copy.ts >= before - 1000, 'ts قديم جدًا');
        return true;
      }},

      /* 4 — note فارغة على الرفع الأول */
      { name:'الملاحظة note فارغة عند الرفع الأول', fn:function(api){
        api.reset();
        api.Reqs.saveAttachment(CUST, 'id_copy', api.file());
        var d = api.Reqs.docs(CUST);
        eq(d.attachments.id_copy.note, '', 'note يجب أن تكون فارغة');
        return true;
      }},

      /* 5 — dataURL محفوظ وقابل للقراءة للمراجعة */
      { name:'dataURL محفوظ وقابل للقراءة للمراجعة', fn:function(api){
        api.reset();
        var f = api.file();
        api.Reqs.saveAttachment(CUST, 'id_copy', f);
        var d = api.Reqs.docs(CUST);
        assert(typeof d.attachments.id_copy.dataURL === 'string', 'dataURL ليس نصًا');
        assert(d.attachments.id_copy.dataURL.length > 0, 'dataURL فارغ');
        eq(d.attachments.id_copy.dataURL, String(f.dataURL), 'dataURL يخالف الأصل');
        return true;
      }},

      /* 6 — إعادة رفع نفس attId تستبدل السجل */
      { name:'إعادة رفع نفس attId تستبدل السجل', fn:function(api){
        api.reset();
        var f1 = api.file(); var f2 = api.file();
        api.Reqs.saveAttachment(CUST, 'id_copy', f1);
        var first = api.Reqs.docs(CUST).attachments.id_copy.ts;
        api.Reqs.saveAttachment(CUST, 'id_copy', { name:'new.jpg', dataURL:f2.dataURL });
        var d = api.Reqs.docs(CUST);
        eq(count(d.attachments), 1, 'يجب أن يبقى مرفق واحد بعد الاستبدال');
        eq(d.attachments.id_copy.name, 'new.jpg', 'الاسم لم يُستبدل');
        assert(d.attachments.id_copy.ts >= first, 'ts لم يُحدّث عند الاستبدال');
        return true;
      }},

      /* 7 — إعادة رفع بعد الرفض ترجع pending */
      { name:'إعادة رفع بعد الرفض ترجع الحالة pending', fn:function(api){
        api.reset();
        api.Reqs.saveAttachment(CUST, 'license_copy', api.file());
        api.Reqs.setStatus(CUST, 'license_copy', 'rejected', 'صورة غير واضحة');
        eq(api.Reqs.docs(CUST).attachments.license_copy.status, 'rejected', 'لم يُرفض');
        api.Reqs.saveAttachment(CUST, 'license_copy', api.file());
        eq(api.Reqs.docs(CUST).attachments.license_copy.status, 'pending', 'إعادة الرفع يجب أن ترجع pending');
        return true;
      }},

      /* 8 — إعادة الرفع تمسح ملاحظة الرفض */
      { name:'إعادة الرفع تمسح ملاحظة الرفض', fn:function(api){
        api.reset();
        api.Reqs.saveAttachment(CUST, 'license_copy', api.file());
        api.Reqs.setStatus(CUST, 'license_copy', 'rejected', 'مرفوضة');
        api.Reqs.saveAttachment(CUST, 'license_copy', api.file());
        eq(api.Reqs.docs(CUST).attachments.license_copy.note, '', 'الملاحظة يجب أن تُمسح بعد إعادة الرفع');
        return true;
      }},

      /* 9 — إعادة رفع بعد الاعتماد ترجع pending */
      { name:'إعادة رفع بعد الاعتماد ترجع الحالة pending', fn:function(api){
        api.reset();
        api.Reqs.saveAttachment(CUST, 'id_copy', api.file());
        api.Reqs.setStatus(CUST, 'id_copy', 'approved');
        eq(api.Reqs.docs(CUST).attachments.id_copy.status, 'approved', 'لم يُعتمد');
        api.Reqs.saveAttachment(CUST, 'id_copy', api.file());
        eq(api.Reqs.docs(CUST).attachments.id_copy.status, 'pending', 'إعادة الرفع بعد الاعتماد يجب pending');
        return true;
      }},

      /* 10 — رفع متعدد: مرفقات مختلفة تتعايش */
      { name:'رفع مرفقات مختلفة يتعايش معًا', fn:function(api){
        api.reset();
        api.Reqs.saveAttachment(CUST, 'id_copy', api.file());
        api.Reqs.saveAttachment(CUST, 'license_copy', api.file());
        var d = api.Reqs.docs(CUST);
        eq(count(d.attachments), 2, 'يجب وجود مرفقين');
        assert(has(d.attachments,'id_copy') && has(d.attachments,'license_copy'), 'أحد المرفقين مفقود');
        return true;
      }},

      /* 11 — رفع متعدد ثلاثة attIds */
      { name:'رفع ثلاثة مرفقات مختلفة كلها محفوظة', fn:function(api){
        api.reset();
        api.Reqs.saveAttachment(CUST, 'id_copy', api.file());
        api.Reqs.saveAttachment(CUST, 'license_copy', api.file());
        api.Reqs.saveAttachment(CUST, 'extra_doc', api.file());
        var d = api.Reqs.docs(CUST);
        eq(count(d.attachments), 3, 'يجب وجود ثلاثة مرفقات');
        eq(d.attachments.extra_doc.status, 'pending', 'المرفق الإضافي يجب pending');
        return true;
      }},

      /* 12 — استبدال أحد المرفقات لا يؤثر على الآخر */
      { name:'استبدال مرفق لا يؤثر على المرفق الآخر', fn:function(api){
        api.reset();
        api.Reqs.saveAttachment(CUST, 'id_copy', { name:'a.jpg', dataURL:api.file().dataURL });
        api.Reqs.saveAttachment(CUST, 'license_copy', { name:'b.jpg', dataURL:api.file().dataURL });
        api.Reqs.setStatus(CUST, 'license_copy', 'approved');
        api.Reqs.saveAttachment(CUST, 'id_copy', { name:'a2.jpg', dataURL:api.file().dataURL });
        var d = api.Reqs.docs(CUST);
        eq(d.attachments.id_copy.name, 'a2.jpg', 'لم يُستبدل id_copy');
        eq(d.attachments.license_copy.name, 'b.jpg', 'license_copy تأثّر بالخطأ');
        eq(d.attachments.license_copy.status, 'approved', 'حالة license_copy تغيّرت بالخطأ');
        return true;
      }},

      /* 13 — ملف كبير: لا يرمي استثناء (يُعالَج بنتيجة) */
      { name:'الملف الكبير لا يرمي استثناء', fn:function(api){
        api.reset();
        var r = api.Reqs.saveAttachment(CUST, 'id_copy', api.bigFile());
        assert(r && typeof r.ok === 'boolean', 'يجب أن يعيد نتيجة فيها ok');
        return true;
      }},

      /* 14 — ملف كبير: نتيجة ok=false أو نجاح، لكن لا يفسد الحالة */
      { name:'الملف الكبير لا يفسد الحالة', fn:function(api){
        api.reset();
        var r = api.Reqs.saveAttachment(CUST, 'id_copy', api.bigFile());
        var d = api.Reqs.docs(CUST);
        if (r.ok === false){
          /* لم يُكتب ⇒ لا مرفق فاسد */
          assert(!has(d.attachments,'id_copy'), 'فشل الكتابة يجب ألا يترك سجلًا');
        } else {
          /* نجح ⇒ سجل سليم بحالة pending */
          eq(d.attachments.id_copy.status, 'pending', 'لو نجح يجب pending');
        }
        return true;
      }},

      /* 15 — ملف كبير لا يهدم مرفقًا سليمًا سابقًا */
      { name:'الملف الكبير لا يهدم مرفقًا سليمًا سابقًا', fn:function(api){
        api.reset();
        api.Reqs.saveAttachment(CUST, 'license_copy', api.file());
        var r = api.Reqs.saveAttachment(CUST, 'id_copy', api.bigFile());
        var d = api.Reqs.docs(CUST);
        /* المرفق السليم السابق يبقى مهما كانت نتيجة الكبير */
        assert(has(d.attachments,'license_copy'), 'المرفق السليم اختفى');
        eq(d.attachments.license_copy.status, 'pending', 'حالة المرفق السليم تغيّرت');
        if (r.ok === false){ assert(true); }
        return true;
      }},

      /* 16 — snapshot يحمل الاسم + الحالة بدون dataURL */
      { name:'snapshot يحمل الاسم والحالة بدون dataURL', fn:function(api){
        api.reset();
        var f = api.file();
        api.Reqs.saveAttachment(CUST, 'id_copy', f);
        var s = api.Reqs.snapshot(CUST);
        assert(has(s.attachments,'id_copy'), 'snapshot يفتقد المرفق');
        eq(s.attachments.id_copy.name, f.name, 'snapshot يفتقد الاسم');
        eq(s.attachments.id_copy.status, 'pending', 'snapshot يفتقد الحالة');
        assert(!has(s.attachments.id_copy,'dataURL'), 'snapshot يجب ألا يحوي dataURL');
        return true;
      }},

      /* 17 — snapshot خفيف لعدة مرفقات */
      { name:'snapshot خفيف لكل المرفقات بلا dataURL', fn:function(api){
        api.reset();
        api.Reqs.saveAttachment(CUST, 'id_copy', api.file());
        api.Reqs.saveAttachment(CUST, 'license_copy', api.file());
        var s = api.Reqs.snapshot(CUST);
        eq(count(s.attachments), 2, 'snapshot يجب أن يحمل المرفقين');
        for (var k in s.attachments){ if(has(s.attachments,k)){
          assert(!has(s.attachments[k],'dataURL'), 'مرفق في snapshot يحوي dataURL');
          assert(typeof s.attachments[k].name === 'string', 'الاسم مفقود في snapshot');
        }}
        return true;
      }},

      /* 18 — snapshot يعكس الحالة بعد الاعتماد */
      { name:'snapshot يعكس الحالة approved بعد الاعتماد', fn:function(api){
        api.reset();
        api.Reqs.saveAttachment(CUST, 'id_copy', api.file());
        api.Reqs.setStatus(CUST, 'id_copy', 'approved');
        var s = api.Reqs.snapshot(CUST);
        eq(s.attachments.id_copy.status, 'approved', 'snapshot لا يعكس الاعتماد');
        return true;
      }},

      /* 19 — عميلان منفصلان لا يتداخلان */
      { name:'عميلان منفصلان لهما مرفقات مستقلة', fn:function(api){
        api.reset();
        var A = 'cust_A', B = 'cust_B';
        api.Reqs.saveAttachment(A, 'id_copy', { name:'aaa.jpg', dataURL:api.file().dataURL });
        api.Reqs.saveAttachment(B, 'id_copy', { name:'bbb.jpg', dataURL:api.file().dataURL });
        eq(api.Reqs.docs(A).attachments.id_copy.name, 'aaa.jpg', 'مرفق A مختلط');
        eq(api.Reqs.docs(B).attachments.id_copy.name, 'bbb.jpg', 'مرفق B مختلط');
        return true;
      }},

      /* 20 — تعديل مرفق عميل لا يطال الآخر */
      { name:'رفض مرفق عميل لا يطال العميل الآخر', fn:function(api){
        api.reset();
        var A = 'cust_A', B = 'cust_B';
        api.Reqs.saveAttachment(A, 'id_copy', api.file());
        api.Reqs.saveAttachment(B, 'id_copy', api.file());
        api.Reqs.setStatus(A, 'id_copy', 'rejected', 'مرفوض A');
        eq(api.Reqs.docs(A).attachments.id_copy.status, 'rejected', 'A لم يُرفض');
        eq(api.Reqs.docs(B).attachments.id_copy.status, 'pending', 'B تأثّر بالخطأ');
        return true;
      }},

      /* 21 — docs لعميل غير معروف يرجّع فاضيًا بلا رمي */
      { name:'docs لعميل غير معروف يرجّع فاضيًا بلا رمي', fn:function(api){
        api.reset();
        var d = api.Reqs.docs('no_such_customer');
        assert(d && typeof d === 'object', 'docs يجب أن يعيد كائنًا');
        eq(count(d.attachments), 0, 'مرفقات عميل مجهول يجب أن تكون فارغة');
        eq(count(d.fields), 0, 'حقول عميل مجهول يجب أن تكون فارغة');
        return true;
      }},

      /* 22 — docs لـ null/undefined لا يرمي */
      { name:'docs لمعرّف null لا يرمي ويرجّع فاضيًا', fn:function(api){
        api.reset();
        var d = api.Reqs.docs(null);
        assert(d && typeof d.attachments === 'object', 'docs(null) يجب أن يعيد بنية صالحة');
        eq(count(d.attachments), 0, 'يجب أن تكون فارغة');
        return true;
      }},

      /* 23 — snapshot لعميل غير معروف لا يرمي */
      { name:'snapshot لعميل غير معروف لا يرمي', fn:function(api){
        api.reset();
        var s = api.Reqs.snapshot('ghost');
        assert(s && typeof s.attachments === 'object', 'snapshot يجب أن يعيد بنية صالحة');
        eq(count(s.attachments), 0, 'snapshot عميل مجهول يجب أن يكون فارغًا');
        return true;
      }},

      /* 24 — حفظ حقل لا يزعج المرفقات */
      { name:'حفظ حقل لا يزعج المرفقات', fn:function(api){
        api.reset();
        api.Reqs.saveAttachment(CUST, 'id_copy', api.file());
        api.Reqs.saveField(CUST, 'nationalId', '1234567890');
        var d = api.Reqs.docs(CUST);
        assert(has(d.attachments,'id_copy'), 'المرفق اختفى بعد حفظ حقل');
        eq(d.attachments.id_copy.status, 'pending', 'حالة المرفق تغيّرت بعد حفظ حقل');
        eq(d.fields.nationalId, '1234567890', 'الحقل لم يُحفظ');
        return true;
      }},

      /* 25 — رفع مرفق لا يزعج الحقول المحفوظة */
      { name:'رفع مرفق لا يزعج الحقول المحفوظة', fn:function(api){
        api.reset();
        api.Reqs.saveField(CUST, 'nationalId', '999');
        api.Reqs.saveAttachment(CUST, 'id_copy', api.file());
        var d = api.Reqs.docs(CUST);
        eq(d.fields.nationalId, '999', 'الحقل تأثّر برفع المرفق');
        assert(has(d.attachments,'id_copy'), 'المرفق لم يُحفظ');
        return true;
      }},

      /* 26 — reset يمسح كل المرفقات (حذف حساب-مكافئ) */
      { name:'reset يمسح كل المرفقات (مكافئ حذف الحساب)', fn:function(api){
        api.reset();
        api.Reqs.saveAttachment(CUST, 'id_copy', api.file());
        api.Reqs.saveAttachment(CUST, 'license_copy', api.file());
        assert(count(api.Reqs.docs(CUST).attachments) === 2, 'لم تُحفظ المرفقات قبل reset');
        api.reset();
        eq(count(api.Reqs.docs(CUST).attachments), 0, 'reset لم يمسح المرفقات');
        return true;
      }},

      /* 27 — saveAttachment بمعرّف عميل null يفشل بلطف */
      { name:'saveAttachment بمعرّف ناقص يفشل بلا رمي', fn:function(api){
        api.reset();
        var r = api.Reqs.saveAttachment(null, 'id_copy', api.file());
        assert(r && r.ok === false, 'يجب أن يفشل عند custId ناقص');
        return true;
      }},

      /* 28 — saveAttachment بـattId ناقص يفشل بلطف */
      { name:'saveAttachment بـattId ناقص يفشل بلا رمي', fn:function(api){
        api.reset();
        var r = api.Reqs.saveAttachment(CUST, null, api.file());
        assert(r && r.ok === false, 'يجب أن يفشل عند attId ناقص');
        eq(count(api.Reqs.docs(CUST).attachments), 0, 'يجب ألا يُكتب شيء');
        return true;
      }},

      /* 29 — saveAttachment بدون كائن ملف لا يرمي */
      { name:'saveAttachment بلا كائن ملف لا يرمي ويضبط pending', fn:function(api){
        api.reset();
        var r = api.Reqs.saveAttachment(CUST, 'id_copy');
        assert(r && r.ok === true, 'يجب أن ينجح بقيم افتراضية');
        var d = api.Reqs.docs(CUST);
        eq(d.attachments.id_copy.status, 'pending', 'الحالة الافتراضية pending');
        eq(d.attachments.id_copy.name, '', 'الاسم الافتراضي يجب أن يكون فارغًا');
        return true;
      }},

      /* 30 — docs يرجّع نسخة (تعديل الناتج لا يلوّث المخزن) */
      { name:'docs يرجّع نسخة لا تلوّث المخزن', fn:function(api){
        api.reset();
        api.Reqs.saveAttachment(CUST, 'id_copy', api.file());
        var d1 = api.Reqs.docs(CUST);
        d1.attachments.id_copy.status = 'hacked';
        d1.attachments.injected = { name:'x' };
        var d2 = api.Reqs.docs(CUST);
        eq(d2.attachments.id_copy.status, 'pending', 'تعديل النسخة سرّب للمخزن');
        assert(!has(d2.attachments,'injected'), 'حقن مرفق عبر النسخة');
        return true;
      }},

      /* 31 — دورة كاملة: رفع ⇒ رفض ⇒ إعادة رفع ⇒ اعتماد */
      { name:'دورة المرفق الكاملة رفع⇒رفض⇒إعادة⇒اعتماد', fn:function(api){
        api.reset();
        api.Reqs.saveAttachment(CUST, 'id_copy', api.file());
        eq(api.Reqs.docs(CUST).attachments.id_copy.status, 'pending', '1) يجب pending');
        api.Reqs.setStatus(CUST, 'id_copy', 'rejected', 'أعد الرفع');
        eq(api.Reqs.docs(CUST).attachments.id_copy.status, 'rejected', '2) يجب rejected');
        api.Reqs.saveAttachment(CUST, 'id_copy', api.file());
        eq(api.Reqs.docs(CUST).attachments.id_copy.status, 'pending', '3) يجب pending بعد إعادة الرفع');
        api.Reqs.setStatus(CUST, 'id_copy', 'approved');
        eq(api.Reqs.docs(CUST).attachments.id_copy.status, 'approved', '4) يجب approved');
        return true;
      }},

      /* 32 — تعدد إعادة الرفع يحدّث الاسم والحالة كل مرة */
      { name:'إعادة الرفع المتكررة تحدّث الاسم وترجع pending', fn:function(api){
        api.reset();
        api.Reqs.saveAttachment(CUST, 'id_copy', { name:'v1.jpg', dataURL:api.file().dataURL });
        api.Reqs.setStatus(CUST, 'id_copy', 'approved');
        api.Reqs.saveAttachment(CUST, 'id_copy', { name:'v2.jpg', dataURL:api.file().dataURL });
        api.Reqs.setStatus(CUST, 'id_copy', 'rejected', 'لا');
        api.Reqs.saveAttachment(CUST, 'id_copy', { name:'v3.jpg', dataURL:api.file().dataURL });
        var d = api.Reqs.docs(CUST);
        eq(d.attachments.id_copy.name, 'v3.jpg', 'الاسم يجب أن يكون v3');
        eq(d.attachments.id_copy.status, 'pending', 'يجب pending بعد آخر رفع');
        eq(count(d.attachments), 1, 'يجب أن يبقى مرفق واحد');
        return true;
      }}

    ]
  };
})();
