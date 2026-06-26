;(function(){
  'use strict';
  window.__JOURNEY = window.__JOURNEY || {};

  /* ------------------------------------------------------------
     أدوات مساعدة محلية (ES5، بلا اعتماديات)
     ------------------------------------------------------------ */
  function assert(cond, msg){ if(!cond) throw new Error(msg || 'فشل التحقّق'); return true; }
  function count(o){ var n=0,k; for(k in o){ if(o.hasOwnProperty(k)) n++; } return n; }
  function findById(arr, id){ for(var i=0;i<(arr||[]).length;i++){ if(arr[i] && arr[i].id===id) return arr[i]; } return null; }
  function findByCust(arr, custId){ var out=[]; for(var i=0;i<(arr||[]).length;i++){ if(arr[i] && arr[i].custId===custId) out.push(arr[i]); } return out; }

  /* يملأ كل الحقول والمرفقات المطلوبة افتراضيًا لعميل معيّن */
  function completeDefault(api, custId){
    api.Reqs.saveField(custId, 'nationalId', '1098765432');
    api.Reqs.saveField(custId, 'licenseExpiry', '2030-01-01');
    api.Reqs.saveAttachment(custId, 'id_copy',      api.file(8));
    api.Reqs.saveAttachment(custId, 'license_copy', api.file(8));
  }

  /* هل OTB متاح؟ */
  function hasOTB(api){ return !!(api.OTB && typeof api.OTB.createBooking === 'function'); }

  /* أول سيارة متاحة من الكتالوج (لو موجود) */
  function firstCarId(api){
    try{ var a=api.OTB.cars(); return (a && a.length) ? a[0].id : null; }catch(e){ return null; }
  }

  /* يبني مسودّة حجز صالحة بتواريخ مستقبلية + عميل، ثم ينشئ الحجز */
  var __bkN=0;
  function makeBooking(api, customer, docsSnap){
    __bkN++;
    var carId = firstCarId(api);
    var cust = {};
    var k; for(k in (customer||{})){ if(customer.hasOwnProperty(k)) cust[k]=customer[k]; }
    if(docsSnap) cust.docs = docsSnap;
    var d = {
      carId: carId,
      pickup: 'فرع العليا',
      dropoff: 'فرع العليا',
      pickupAt: (2030+__bkN)+'-03-01T10:00',
      returnAt: (2030+__bkN)+'-03-04T10:00',
      extras: [],
      customer: cust
    };
    api.OTB.draft.set(d);
    return api.OTB.createBooking(d, { method:'mada', status:'paid' });
  }

  window.__JOURNEY[5] = {
    title: 'التكامل من الطرف للطرف',
    tests: [

    /* 1) المسار السعيد الكامل: تسجيل → ملء → رفع → check ok */
    { name:'المسار السعيد: حساب جديد ثم اكتمال المتطلبات (check.ok)', fn:function(api){
      api.reset();
      var r = api.signupAndLogin({ name:'سعد المطيري', email:'saad@example.com', phone:'0551234567', password:'secret1' });
      var custId = r.id;
      assert(custId, 'لم يُنشأ حساب');
      completeDefault(api, custId);
      var chk = api.Reqs.check(custId);
      assert(chk.ok === true, 'الفحص لم ينجح رغم اكتمال البيانات');
      assert(chk.missingFields.length === 0 && chk.missingAttachments.length === 0 && chk.rejected.length === 0, 'بقايا نواقص');
      return true;
    }},

    /* 2) snapshot يحمل أسماء المرفقات بلا dataURL */
    { name:'اللقطة (snapshot) بلا dataURL لكن بأسماء المرفقات', fn:function(api){
      api.reset();
      var r = api.signupAndLogin({ name:'منى', email:'mona@example.com', phone:'0560000001', password:'pass123' });
      completeDefault(api, r.id);
      var snap = api.Reqs.snapshot(r.id);
      assert(snap && snap.attachments, 'لا لقطة');
      assert(snap.attachments.id_copy, 'مرفق الهوية مفقود من اللقطة');
      assert(snap.attachments.id_copy.name, 'اسم المرفق مفقود');
      assert(snap.attachments.id_copy.dataURL == null, 'اللقطة تسرّب dataURL');
      assert(snap.attachments.id_copy.status === 'pending', 'حالة المرفق غير صحيحة');
      return true;
    }},

    /* 3) حقن اللقطة في الحجز عبر OTB.draft + createBooking */
    { name:'الحجز يحمل customer.docs من اللقطة (بلا dataURL)', fn:function(api){
      api.reset();
      var r = api.signupAndLogin({ name:'خالد', email:'khaled@example.com', phone:'0567778888', password:'pass123' });
      completeDefault(api, r.id);
      assert(api.Reqs.check(r.id).ok === true, 'الفحص فشل قبل الحجز');
      if(!hasOTB(api)) return true; /* لا OTB → تجاوز الأسس الخاصة به */
      var snap = api.Reqs.snapshot(r.id);
      var b = makeBooking(api, { name:r.name, email:r.email, phone:r.phone }, snap);
      assert(b && !b.error, 'تعذّر إنشاء الحجز: ' + (b && b.error));
      assert(b.customer && b.customer.docs, 'الحجز لا يحمل docs');
      assert(b.customer.docs.attachments.id_copy.name, 'اسم المرفق مفقود في الحجز');
      assert(b.customer.docs.attachments.id_copy.dataURL == null, 'الحجز يسرّب dataURL');
      return true;
    }},

    /* 4) الحجز المحفوظ في OTB.bookings يحمل اللقطة */
    { name:'OTB.bookings() يُرجِع الحجز محمّلًا باللقطة', fn:function(api){
      api.reset();
      var r = api.signupAndLogin({ name:'ريم', email:'reem@example.com', phone:'0551112222', password:'pass123' });
      completeDefault(api, r.id);
      if(!hasOTB(api)) return true;
      var snap = api.Reqs.snapshot(r.id);
      var b = makeBooking(api, { name:r.name, email:r.email, phone:r.phone }, snap);
      assert(!b.error, 'فشل الحجز');
      var all = api.OTB.bookings();
      var found = null;
      for(var i=0;i<all.length;i++){ if(all[i].reference === b.reference){ found = all[i]; break; } }
      assert(found, 'الحجز غير موجود في القائمة');
      assert(found.customer && found.customer.docs && found.customer.docs.attachments.license_copy.name, 'اللقطة لم تُحفظ');
      return true;
    }},

    /* 5) Auth.bookings يربط الحجز بالعميل عبر الجوال */
    { name:'Auth.bookings() يُرجِع حجز العميل بمطابقة الجوال', fn:function(api){
      api.reset();
      var r = api.signupAndLogin({ name:'فهد', email:'fahd@example.com', phone:'0599990001', password:'pass123' });
      if(!hasOTB(api)) return true;
      var b = makeBooking(api, { name:r.name, phone:r.phone }, null);
      assert(!b.error, 'فشل الحجز');
      var mine = api.Auth.bookings();
      assert(mine.length === 1, 'عدد حجوزاتي غير متوقّع: ' + mine.length);
      assert(mine[0].reference === b.reference, 'مرجع الحجز لا يطابق');
      return true;
    }},

    /* 6) Auth.bookings يربط عبر الإيميل أيضًا */
    { name:'Auth.bookings() يربط الحجز عبر الإيميل', fn:function(api){
      api.reset();
      var r = api.signupAndLogin({ name:'هند', email:'hind@example.com', phone:'0533334444', password:'pass123' });
      if(!hasOTB(api)) return true;
      /* جوال مختلف لكن نفس الإيميل */
      var b = makeBooking(api, { name:r.name, email:r.email, phone:'0500000000' }, null);
      assert(!b.error, 'فشل الحجز');
      var mine = api.Auth.bookings();
      assert(mine.length === 1, 'لم يُربط بالإيميل');
      assert(mine[0].reference === b.reference, 'مرجع غير مطابق');
      return true;
    }},

    /* 7) Auth.bookings لا يُرجع حجز عميل آخر */
    { name:'Auth.bookings() لا يُرجِع حجز عميل آخر', fn:function(api){
      api.reset();
      /* عميل أ ينشئ حجزًا */
      var a = api.signupAndLogin({ name:'عميل أ', email:'a@example.com', phone:'0551111111', password:'pass123' });
      if(!hasOTB(api)) return true;
      var ba = makeBooking(api, { name:a.name, email:a.email, phone:a.phone }, null);
      assert(!ba.error, 'فشل حجز أ');
      api.Auth.logout();
      /* عميل ب يسجّل ويدخل — لا حجوزات له */
      var b = api.signupAndLogin({ name:'عميل ب', email:'b@example.com', phone:'0552222222', password:'pass123' });
      var mine = api.Auth.bookings();
      assert(mine.length === 0, 'عميل ب يرى حجز عميل أ! العدد: ' + mine.length);
      return true;
    }},

    /* 8) Auth.bookings يفصل بين عميلين لكل واحد حجزه */
    { name:'Auth.bookings() يفصل حجوزات عميلين منفصلين', fn:function(api){
      api.reset();
      if(!hasOTB(api)) return true;
      var a = api.signupAndLogin({ name:'أحمد', email:'ahmed@example.com', phone:'0551110000', password:'pass123' });
      var ba = makeBooking(api, { name:a.name, phone:a.phone }, null);
      assert(!ba.error, 'فشل حجز أحمد');
      api.Auth.logout();
      var b = api.signupAndLogin({ name:'بدر', email:'badr@example.com', phone:'0552220000', password:'pass123' });
      var bb = makeBooking(api, { name:b.name, phone:b.phone }, null);
      assert(!bb.error, 'فشل حجز بدر');
      var mineB = api.Auth.bookings();
      assert(mineB.length === 1 && mineB[0].reference === bb.reference, 'بدر لا يرى حجزه فقط');
      api.Auth.logout();
      api.Auth.login({ id:a.email, password:'pass123' });
      var mineA = api.Auth.bookings();
      assert(mineA.length === 1 && mineA[0].reference === ba.reference, 'أحمد لا يرى حجزه فقط');
      return true;
    }},

    /* 9) Auth.bookings فارغة بدون تسجيل دخول */
    { name:'Auth.bookings() فارغة بعد الخروج', fn:function(api){
      api.reset();
      var r = api.signupAndLogin({ name:'سالم', email:'salem@example.com', phone:'0556667777', password:'pass123' });
      if(!hasOTB(api)) return true;
      makeBooking(api, { name:r.name, phone:r.phone }, null);
      api.Auth.logout();
      assert(api.Auth.bookings().length === 0, 'حجوزات تظهر بدون جلسة');
      return true;
    }},

    /* 10) رفض ثم تعافٍ كامل من الطرف للطرف */
    { name:'رفض → check يفشل → pendingReview → إعادة رفع → اعتماد → check ينجح', fn:function(api){
      api.reset();
      var r = api.signupAndLogin({ name:'وليد', email:'walid@example.com', phone:'0558889999', password:'pass123' });
      var custId = r.id;
      completeDefault(api, custId);
      assert(api.Reqs.check(custId).ok === true, 'يجب أن يكون مكتملًا أولًا');
      /* الأدمن يرفض الهوية بملاحظة */
      api.Reqs.setStatus(custId, 'id_copy', 'rejected', 'الصورة غير واضحة');
      var chk = api.Reqs.check(custId);
      assert(chk.ok === false, 'الفحص لم يفشل بعد الرفض');
      assert(chk.rejected.length === 1 && chk.rejected[0].id === 'id_copy', 'المرفوض غير صحيح');
      assert(chk.rejected[0].note === 'الصورة غير واضحة', 'الملاحظة غير محفوظة');
      /* يظهر في pendingReview كمرفوض */
      var pr = api.Reqs.pendingReview();
      var prItem = null;
      for(var i=0;i<pr.length;i++){ if(pr[i].custId===custId && pr[i].attId==='id_copy'){ prItem = pr[i]; break; } }
      assert(prItem && prItem.status === 'rejected', 'لم يظهر في قائمة المراجعة كمرفوض');
      /* العميل يعيد الرفع → pending (الموجود pending لا يُعتبر ناقصًا ولا مرفوضًا ⇒ ok=true) */
      api.Reqs.saveAttachment(custId, 'id_copy', api.file(9));
      assert(api.Reqs.docs(custId).attachments.id_copy.status === 'pending', 'لم يعد pending بعد إعادة الرفع');
      var chk2 = api.Reqs.check(custId);
      assert(chk2.ok === true, 'pending الموجود يجب أن يمرّ الفحص');
      /* الأدمن يعتمد */
      api.Reqs.setStatus(custId, 'id_copy', 'approved', '');
      assert(api.Reqs.check(custId).ok === true, 'الفحص فشل بعد الاعتماد');
      return true;
    }},

    /* 11) بعد الاعتماد لا يظهر المرفق في pendingReview */
    { name:'المرفق المعتمد يختفي من pendingReview', fn:function(api){
      api.reset();
      var r = api.signupAndLogin({ name:'ماجد', email:'majed@example.com', phone:'0551239876', password:'pass123' });
      completeDefault(api, r.id);
      api.Reqs.setStatus(r.id, 'id_copy', 'approved', '');
      api.Reqs.setStatus(r.id, 'license_copy', 'approved', '');
      var pr = api.Reqs.pendingReview();
      for(var i=0;i<pr.length;i++){ assert(pr[i].custId !== r.id, 'مرفق معتمد ما زال في المراجعة'); }
      return true;
    }},

    /* 12) ملاحظة الرفض تُمسح عند إعادة الرفع */
    { name:'إعادة الرفع تمسح ملاحظة الرفض السابقة', fn:function(api){
      api.reset();
      var r = api.signupAndLogin({ name:'ندى', email:'nada@example.com', phone:'0554443322', password:'pass123' });
      completeDefault(api, r.id);
      api.Reqs.setStatus(r.id, 'license_copy', 'rejected', 'منتهية الصلاحية');
      assert(api.Reqs.docs(r.id).attachments.license_copy.note === 'منتهية الصلاحية', 'الملاحظة لم تُحفظ');
      api.Reqs.saveAttachment(r.id, 'license_copy', api.file(7));
      var rec = api.Reqs.docs(r.id).attachments.license_copy;
      assert(rec.status === 'pending', 'الحالة لم تُعد pending');
      assert(rec.note === '', 'الملاحظة لم تُمسح بعد إعادة الرفع');
      return true;
    }},

    /* 13) رحلة الضيف (بدون تسجيل) */
    { name:'الضيف: custId=guest_+digits(phone) يُكمل ويمرّ الفحص', fn:function(api){
      api.reset();
      var phone = '0531112233';
      var custId = 'guest_' + api.digits(phone);
      completeDefault(api, custId);
      var chk = api.Reqs.check(custId);
      assert(chk.ok === true, 'الضيف لم يكمل الفحص');
      assert(!api.Auth.isLoggedIn(), 'يجب ألا يكون مسجّلًا');
      var snap = api.Reqs.snapshot(custId);
      assert(snap.attachments.id_copy.name, 'لقطة الضيف ناقصة');
      return true;
    }},

    /* 14) حجز الضيف يحمل لقطته */
    { name:'حجز الضيف يحمل docs ويظهر في OTB.bookings', fn:function(api){
      api.reset();
      var phone = '0532223344';
      var custId = 'guest_' + api.digits(phone);
      completeDefault(api, custId);
      if(!hasOTB(api)) return true;
      var snap = api.Reqs.snapshot(custId);
      var b = makeBooking(api, { name:'زائر', phone:phone }, snap);
      assert(!b.error, 'فشل حجز الضيف');
      assert(b.customer.docs.attachments.id_copy.name, 'لقطة الضيف لم تُحقن');
      assert(b.customer.docs.attachments.id_copy.dataURL == null, 'حجز الضيف يسرّب dataURL');
      return true;
    }},

    /* 15) ضيف يحجز ثم ينشئ حسابًا بنفس الجوال → يرى حجزه */
    { name:'ضيف يحجز ثم يسجّل بنفس الجوال → Auth.bookings يلتقط الحجز', fn:function(api){
      api.reset();
      if(!hasOTB(api)) return true;
      var phone = '0535556677';
      var b = makeBooking(api, { name:'زائر', phone:phone }, null);
      assert(!b.error, 'فشل حجز الضيف');
      var r = api.signupAndLogin({ name:'زائر سابق', email:'guestlater@example.com', phone:phone, password:'pass123' });
      var mine = api.Auth.bookings();
      assert(mine.length === 1 && mine[0].reference === b.reference, 'الحساب الجديد لم يلتقط حجز الضيف');
      return true;
    }},

    /* 16) pendingReview يجمّع عبر عدة عملاء */
    { name:'pendingReview يجمّع مرفقات عدة عملاء', fn:function(api){
      api.reset();
      var c1 = 'guest_' + api.digits('0541000001');
      var c2 = 'guest_' + api.digits('0541000002');
      var c3 = 'guest_' + api.digits('0541000003');
      api.Reqs.saveAttachment(c1, 'id_copy', api.file(5));
      api.Reqs.saveAttachment(c2, 'id_copy', api.file(5));
      api.Reqs.saveAttachment(c3, 'license_copy', api.file(5));
      api.Reqs.setStatus(c3, 'license_copy', 'rejected', 'مطلوب أوضح');
      var pr = api.Reqs.pendingReview();
      assert(findByCust(pr, c1).length === 1, 'c1 مفقود');
      assert(findByCust(pr, c2).length === 1, 'c2 مفقود');
      var c3items = findByCust(pr, c3);
      assert(c3items.length === 1 && c3items[0].status === 'rejected', 'c3 ليس مرفوضًا');
      assert(pr.length >= 3, 'إجمالي المراجعة ناقص: ' + pr.length);
      return true;
    }},

    /* 17) الأدمن يضيف متطلبًا جديدًا بعد الحجز → check العميل يصبح ناقصًا */
    { name:'إضافة متطلب جديد بعد الاكتمال ⇒ check يصبح ناقصًا (حجوزات مستقبلية محظورة)', fn:function(api){
      api.reset();
      var r = api.signupAndLogin({ name:'تركي', email:'turki@example.com', phone:'0547778889', password:'pass123' });
      completeDefault(api, r.id);
      assert(api.Reqs.check(r.id).ok === true, 'لم يكتمل قبل التعديل');
      /* الأدمن يضيف حقلًا مطلوبًا جديدًا */
      var cfg = api.Reqs.config();
      cfg.fields.push({ id:'address', label:'العنوان الوطني', type:'text', required:true });
      api.Reqs.saveConfig(cfg);
      var chk = api.Reqs.check(r.id);
      assert(chk.ok === false, 'الفحص لم يُكسَر بإضافة المتطلب');
      var hasNew = false;
      for(var i=0;i<chk.missingFields.length;i++){ if(chk.missingFields[i].id === 'address') hasNew = true; }
      assert(hasNew, 'الحقل الجديد غير مذكور في النواقص');
      return true;
    }},

    /* 18) إكمال المتطلب الجديد يعيد check إلى ok */
    { name:'إكمال المتطلب المضاف يعيد check.ok', fn:function(api){
      api.reset();
      var r = api.signupAndLogin({ name:'بسام', email:'bassam@example.com', phone:'0548887776', password:'pass123' });
      completeDefault(api, r.id);
      var cfg = api.Reqs.config();
      cfg.attachments.push({ id:'salary_cert', label:'تعريف بالراتب', required:true });
      api.Reqs.saveConfig(cfg);
      assert(api.Reqs.check(r.id).ok === false, 'لم يُكسَر بالمرفق الجديد');
      var miss = api.Reqs.check(r.id).missingAttachments;
      var ok = false; for(var i=0;i<miss.length;i++){ if(miss[i].id==='salary_cert') ok=true; }
      assert(ok, 'المرفق الجديد غير ناقص');
      api.Reqs.saveAttachment(r.id, 'salary_cert', api.file(6));
      assert(api.Reqs.check(r.id).ok === true, 'الفحص لم يعد ok بعد الإكمال');
      return true;
    }},

    /* 19) الأدمن يزيل متطلبًا → عميل ناقصه يكتمل */
    { name:'إزالة متطلب من الإعداد ⇒ check يكتمل لمن كان ناقصه', fn:function(api){
      api.reset();
      var r = api.signupAndLogin({ name:'عمر', email:'omar@example.com', phone:'0549990001', password:'pass123' });
      /* يملأ الهوية والرخصة لكن سنزيل المرفقات لاحقًا — أولًا اجعله ناقصًا للمرفقات */
      api.Reqs.saveField(r.id, 'nationalId', '1234567890');
      api.Reqs.saveField(r.id, 'licenseExpiry', '2031-05-05');
      assert(api.Reqs.check(r.id).ok === false, 'يجب أن يكون ناقص المرفقات');
      /* الأدمن يزيل كل المرفقات المطلوبة */
      var cfg = api.Reqs.config();
      cfg.attachments = [];
      api.Reqs.saveConfig(cfg);
      assert(api.Reqs.check(r.id).ok === true, 'لم يكتمل بعد إزالة المرفقات');
      return true;
    }},

    /* 20) الحجز يُمنع منطقيًا حين check ناقص (نتحقق أن العميل ما زال ناقصًا قبل أي حجز) */
    { name:'check ناقص يعكس عدم جاهزية الحجز (بوابة الدفع)', fn:function(api){
      api.reset();
      var r = api.signupAndLogin({ name:'يوسف', email:'yousef@example.com', phone:'0540001112', password:'pass123' });
      /* لم يرفع شيئًا */
      var chk = api.Reqs.check(r.id);
      assert(chk.ok === false, 'فحص الجديد يجب أن يفشل');
      assert(chk.missingFields.length === 2, 'حقول ناقصة غير متوقّعة: ' + chk.missingFields.length);
      assert(chk.missingAttachments.length === 2, 'مرفقات ناقصة غير متوقّعة: ' + chk.missingAttachments.length);
      return true;
    }},

    /* 21) لقطة الحجز ثابتة: تعديل المستندات بعد الحجز لا يغيّر الحجز المحفوظ */
    { name:'اللقطة داخل الحجز لا تتأثر بتعديل المستندات لاحقًا', fn:function(api){
      api.reset();
      var r = api.signupAndLogin({ name:'لينا', email:'lina@example.com', phone:'0543332221', password:'pass123' });
      completeDefault(api, r.id);
      if(!hasOTB(api)) return true;
      var snap = api.Reqs.snapshot(r.id);
      var b = makeBooking(api, { name:r.name, phone:r.phone }, snap);
      assert(!b.error, 'فشل الحجز');
      var refName = b.customer.docs.attachments.id_copy.name;
      /* العميل يعدّل/يعيد رفع بعد الحجز */
      api.Reqs.saveAttachment(r.id, 'id_copy', { name:'NEW_DOC.png', dataURL:'data:,x' });
      var all = api.OTB.bookings();
      var found=null; for(var i=0;i<all.length;i++){ if(all[i].reference===b.reference){ found=all[i]; break; } }
      assert(found.customer.docs.attachments.id_copy.name === refName, 'اللقطة المحفوظة تغيّرت!');
      return true;
    }},

    /* 22) حقل غير مطلوب لا يكسر الفحص */
    { name:'حقل/مرفق غير مطلوب لا يكسر check', fn:function(api){
      api.reset();
      var r = api.signupAndLogin({ name:'راكان', email:'rakan@example.com', phone:'0546665554', password:'pass123' });
      var cfg = api.Reqs.config();
      cfg.fields.push({ id:'notes', label:'ملاحظات', type:'text', required:false });
      api.Reqs.saveConfig(cfg);
      completeDefault(api, r.id); /* يملأ المطلوب فقط */
      assert(api.Reqs.check(r.id).ok === true, 'حقل غير مطلوب كسر الفحص');
      return true;
    }},

    /* 23) دورة كاملة: ضيف → رفض → تعافٍ → حجز يحمل لقطة معتمدة */
    { name:'ضيف: رفض ثم اعتماد ثم حجز يحمل لقطة بحالة approved', fn:function(api){
      api.reset();
      var phone = '0537778899';
      var custId = 'guest_' + api.digits(phone);
      completeDefault(api, custId);
      api.Reqs.setStatus(custId, 'id_copy', 'rejected', 'أعد الرفع');
      assert(api.Reqs.check(custId).ok === false, 'لم يفشل بعد الرفض');
      api.Reqs.saveAttachment(custId, 'id_copy', api.file(8));
      api.Reqs.setStatus(custId, 'id_copy', 'approved', '');
      api.Reqs.setStatus(custId, 'license_copy', 'approved', '');
      assert(api.Reqs.check(custId).ok === true, 'لم ينجح بعد الاعتماد');
      if(!hasOTB(api)) return true;
      var snap = api.Reqs.snapshot(custId);
      assert(snap.attachments.id_copy.status === 'approved', 'اللقطة لا تعكس الاعتماد');
      var b = makeBooking(api, { name:'زائر معتمد', phone:phone }, snap);
      assert(!b.error, 'فشل الحجز');
      assert(b.customer.docs.attachments.id_copy.status === 'approved', 'حالة المرفق في الحجز ليست approved');
      return true;
    }},

    /* 24) تكامل تسجيل الدخول مجددًا: العميل يخرج ويعود فيرى حجزه ومستنداته */
    { name:'إعادة الدخول: العميل يستعيد حجزه ومستنداته بعد الخروج', fn:function(api){
      api.reset();
      var r = api.signupAndLogin({ name:'دانة', email:'dana@example.com', phone:'0532221110', password:'pass123' });
      var custId = r.id;
      completeDefault(api, custId);
      if(!hasOTB(api)) return true;
      var snap = api.Reqs.snapshot(custId);
      var b = makeBooking(api, { name:r.name, email:r.email, phone:r.phone }, snap);
      assert(!b.error, 'فشل الحجز');
      api.Auth.logout();
      assert(api.Auth.bookings().length === 0, 'حجوزات بعد الخروج');
      var lr = api.Auth.login({ id:'0532221110', password:'pass123' });
      assert(lr.ok === true, 'تعذّر الدخول بالجوال');
      var mine = api.Auth.bookings();
      assert(mine.length === 1 && mine[0].reference === b.reference, 'لم يستعد حجزه');
      assert(mine[0].customer.docs.attachments.id_copy.name, 'لم يستعد مستنداته في الحجز');
      /* مستنداته الحيّة ما زالت موجودة بالـcustId */
      assert(api.Reqs.check(custId).ok === true, 'مستندات العميل الحيّة ضاعت');
      return true;
    }},

    /* 25) عميلان منفصلان: مستندات أحدهما لا تظهر في فحص الآخر */
    { name:'مستندات عميلين منفصلين لا تتداخل في check', fn:function(api){
      api.reset();
      var a = 'guest_' + api.digits('0521000001');
      var b = 'guest_' + api.digits('0521000002');
      completeDefault(api, a);                 /* a مكتمل */
      api.Reqs.saveField(b, 'nationalId', '999'); /* b ناقص */
      assert(api.Reqs.check(a).ok === true, 'a يجب أن يكتمل');
      assert(api.Reqs.check(b).ok === false, 'b يجب أن يكون ناقصًا');
      assert(count(api.Reqs.docs(a).attachments) === 2, 'مرفقات a غير متوقّعة');
      assert(count(api.Reqs.docs(b).attachments) === 0, 'مرفقات b يجب أن تكون صفرًا');
      return true;
    }},

    /* 26) رفض متعدد ثم اعتماد متعدد */
    { name:'رفض مرفقين معًا ثم اعتمادهما يعيد check.ok', fn:function(api){
      api.reset();
      var r = api.signupAndLogin({ name:'صالح', email:'saleh@example.com', phone:'0528887776', password:'pass123' });
      completeDefault(api, r.id);
      api.Reqs.setStatus(r.id, 'id_copy', 'rejected', 'غير واضحة');
      api.Reqs.setStatus(r.id, 'license_copy', 'rejected', 'منتهية');
      var chk = api.Reqs.check(r.id);
      assert(chk.rejected.length === 2, 'عدد المرفوضات ليس 2: ' + chk.rejected.length);
      assert(chk.ok === false, 'يجب أن يفشل');
      api.Reqs.saveAttachment(r.id, 'id_copy', api.file(8));
      api.Reqs.saveAttachment(r.id, 'license_copy', api.file(8));
      api.Reqs.setStatus(r.id, 'id_copy', 'approved', '');
      api.Reqs.setStatus(r.id, 'license_copy', 'approved', '');
      assert(api.Reqs.check(r.id).ok === true, 'لم ينجح بعد اعتماد الاثنين');
      return true;
    }}

    ]
  };
})();
