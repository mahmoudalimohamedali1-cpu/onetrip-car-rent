;(function(){
  'use strict';
  /* ============================================================
     إيجنت 1 — التسجيل أثناء الحجز والدخول
     سيناريوهات حية على window.OneTrip.Auth (auth-core.js).
     كل fn يبدأ بـ api.reset() ثم يبني حالته، ويرجّع true عند النجاح.
     ============================================================ */

  /* مساعدات صغيرة محلية (بدون اعتماديات) */
  function assert(cond, msg){ if(!cond) throw new Error(msg || 'assertion failed'); return true; }
  function eq(a, b, msg){ if(a !== b) throw new Error((msg||'eq')+': '+a+' !== '+b); return true; }

  /* بيانات حساب صالحة افتراضية — مع إمكانية الدمج */
  function acc(over){
    var base = { name:'أحمد علي', email:'ahmed@example.com', phone:'0512345678', city:'الرياض', password:'secret1' };
    over = over || {};
    for (var k in over){ if (over.hasOwnProperty(k)) base[k] = over[k]; }
    return base;
  }

  window.__JOURNEY = window.__JOURNEY || {};
  window.__JOURNEY[1] = {
    title: 'التسجيل أثناء الحجز والدخول',
    tests: [

      { name:'تسجيل حساب جديد ينجح ويرجّع ok والعميل', fn:function(api){
        api.reset();
        var r = api.Auth.signup(acc());
        assert(r && r.ok === true, 'signup يجب أن ينجح');
        assert(r.customer && r.customer.id, 'يجب أن يرجّع customer بمعرّف');
        eq(r.customer.name, 'أحمد علي', 'الاسم محفوظ');
        return true;
      }},

      { name:'بعد التسجيل: current() و isLoggedIn() يعكسان الجلسة', fn:function(api){
        api.reset();
        assert(api.Auth.isLoggedIn() === false, 'قبل التسجيل غير مسجّل');
        var r = api.Auth.signup(acc());
        assert(r.ok, 'signup ينجح');
        assert(api.Auth.isLoggedIn() === true, 'بعد التسجيل مسجّل دخول تلقائيًا');
        var cur = api.Auth.current();
        assert(cur && cur.id === r.customer.id, 'current() يطابق العميل المُنشأ');
        eq(cur.email, 'ahmed@example.com', 'إيميل current صحيح');
        return true;
      }},

      { name:'الإيميل فريد: تسجيل بإيميل مكرر يُرفض', fn:function(api){
        api.reset();
        assert(api.Auth.signup(acc()).ok, 'الأول ينجح');
        var r2 = api.Auth.signup(acc({ phone:'0599999999' }));
        assert(r2.ok === false, 'الإيميل المكرر يُرفض');
        assert(/بالفعل/.test(r2.error||''), 'رسالة خطأ التكرار');
        return true;
      }},

      { name:'كلمة مرور قصيرة (<6) تُرفض', fn:function(api){
        api.reset();
        var r = api.Auth.signup(acc({ password:'12345' }));
        assert(r.ok === false, 'كلمة المرور القصيرة تُرفض');
        assert(/6/.test(r.error||''), 'رسالة طول كلمة المرور');
        assert(api.Auth.isLoggedIn() === false, 'لا جلسة بعد الفشل');
        return true;
      }},

      { name:'كلمة مرور بطول 6 بالضبط تُقبل (الحد الأدنى)', fn:function(api){
        api.reset();
        var r = api.Auth.signup(acc({ password:'abcdef' }));
        assert(r.ok === true, '6 أحرف مقبولة');
        return true;
      }},

      { name:'الاسم مفقود يُرفض', fn:function(api){
        api.reset();
        var r = api.Auth.signup(acc({ name:'' }));
        assert(r.ok === false, 'الاسم الفارغ يُرفض');
        assert(/الاسم/.test(r.error||''), 'رسالة الاسم');
        return true;
      }},

      { name:'الاسم مسافات فقط يُرفض (يُقصّ)', fn:function(api){
        api.reset();
        var r = api.Auth.signup(acc({ name:'    ' }));
        assert(r.ok === false, 'الاسم المسافات يُرفض بعد trim');
        return true;
      }},

      { name:'إيميل غير صالح يُرفض', fn:function(api){
        api.reset();
        var r = api.Auth.signup(acc({ email:'not-an-email' }));
        assert(r.ok === false, 'إيميل بلا @ يُرفض');
        assert(/البريد/.test(r.error||''), 'رسالة الإيميل');
        return true;
      }},

      { name:'جوال أقل من 9 أرقام يُرفض', fn:function(api){
        api.reset();
        var r = api.Auth.signup(acc({ phone:'12345' }));
        assert(r.ok === false, 'جوال قصير يُرفض');
        assert(/الجوال/.test(r.error||''), 'رسالة الجوال');
        return true;
      }},

      { name:'الإيميل يُخزَّن بحروف صغيرة (lowercased)', fn:function(api){
        api.reset();
        var r = api.Auth.signup(acc({ email:'Ahmed.UPPER@Example.COM' }));
        assert(r.ok, 'ينجح');
        eq(r.customer.email, 'ahmed.upper@example.com', 'الإيميل lowercased');
        eq(api.Auth.current().email, 'ahmed.upper@example.com', 'current كذلك lowercased');
        return true;
      }},

      { name:'الإيميل يُقصّ من المسافات قبل التخزين', fn:function(api){
        api.reset();
        var r = api.Auth.signup(acc({ email:'   spaced@example.com   ' }));
        assert(r.ok, 'ينجح');
        eq(r.customer.email, 'spaced@example.com', 'الإيميل بلا مسافات');
        return true;
      }},

      { name:'الدخول بالإيميل بكلمة المرور الصحيحة ينجح', fn:function(api){
        api.reset();
        api.Auth.signup(acc());
        api.Auth.logout();
        var r = api.Auth.login({ id:'ahmed@example.com', password:'secret1' });
        assert(r.ok === true, 'الدخول بالإيميل ينجح');
        assert(api.Auth.isLoggedIn() === true, 'صار مسجّل');
        eq(api.Auth.current().email, 'ahmed@example.com', 'الجلسة للعميل الصحيح');
        return true;
      }},

      { name:'الدخول بالجوال (آخر 9 أرقام) ينجح', fn:function(api){
        api.reset();
        api.Auth.signup(acc({ phone:'0512345678' }));
        api.Auth.logout();
        /* صيغة مختلفة بنفس آخر 9 أرقام */
        var r = api.Auth.login({ id:'+966512345678', password:'secret1' });
        assert(r.ok === true, 'الدخول بالجوال (آخر 9) ينجح');
        eq(api.Auth.current().phone, '0512345678', 'العميل الصحيح');
        return true;
      }},

      { name:'الدخول بالجوال بصيغة بفواصل/رموز ينجح (أرقام فقط)', fn:function(api){
        api.reset();
        api.Auth.signup(acc({ phone:'0512345678' }));
        api.Auth.logout();
        var r = api.Auth.login({ id:'051-234-5678', password:'secret1' });
        assert(r.ok === true, 'الرموز تُتجاهل، آخر 9 تطابق');
        return true;
      }},

      { name:'الدخول بكلمة مرور خاطئة يُرفض', fn:function(api){
        api.reset();
        api.Auth.signup(acc());
        api.Auth.logout();
        var r = api.Auth.login({ id:'ahmed@example.com', password:'wrongpass' });
        assert(r.ok === false, 'كلمة المرور الخاطئة تُرفض');
        assert(/كلمة المرور/.test(r.error||''), 'رسالة كلمة المرور');
        assert(api.Auth.isLoggedIn() === false, 'لا جلسة');
        return true;
      }},

      { name:'الدخول لحساب غير موجود يُرفض', fn:function(api){
        api.reset();
        var r = api.Auth.login({ id:'nobody@example.com', password:'secret1' });
        assert(r.ok === false, 'حساب غير موجود يُرفض');
        assert(/لا يوجد حساب/.test(r.error||''), 'رسالة عدم الوجود');
        return true;
      }},

      { name:'الدخول بدون id يُرفض', fn:function(api){
        api.reset();
        var r = api.Auth.login({ id:'', password:'secret1' });
        assert(r.ok === false, 'بدون id يُرفض');
        return true;
      }},

      { name:'الدخول بدون كلمة مرور يُرفض', fn:function(api){
        api.reset();
        api.Auth.signup(acc());
        api.Auth.logout();
        var r = api.Auth.login({ id:'ahmed@example.com', password:'' });
        assert(r.ok === false, 'بدون كلمة مرور يُرفض');
        return true;
      }},

      { name:'الدخول غير حساس لحالة أحرف الإيميل', fn:function(api){
        api.reset();
        api.Auth.signup(acc({ email:'ahmed@example.com' }));
        api.Auth.logout();
        var r = api.Auth.login({ id:'AHMED@EXAMPLE.COM', password:'secret1' });
        assert(r.ok === true, 'الإيميل بأحرف كبيرة يدخل');
        return true;
      }},

      { name:'الخروج يمسح الجلسة', fn:function(api){
        api.reset();
        api.Auth.signup(acc());
        assert(api.Auth.isLoggedIn() === true, 'مسجّل بعد التسجيل');
        var r = api.Auth.logout();
        assert(r && r.ok === true, 'logout يرجّع ok');
        assert(api.Auth.isLoggedIn() === false, 'الجلسة ممسوحة');
        assert(api.Auth.current() === null, 'current null بعد الخروج');
        return true;
      }},

      { name:'الجلسة تبقى: current() يقرأ نفس العميل تكرارًا', fn:function(api){
        api.reset();
        var r = api.Auth.signup(acc());
        var a = api.Auth.current();
        var b = api.Auth.current();
        assert(a && b, 'كلاهما موجود');
        eq(a.id, b.id, 'نفس المعرّف عبر قراءات متعددة');
        eq(a.id, r.customer.id, 'يطابق المُنشأ');
        return true;
      }},

      { name:'تعديل الاسم ينجح ويُحدّث current', fn:function(api){
        api.reset();
        api.Auth.signup(acc());
        var r = api.Auth.update({ name:'محمد سعيد' });
        assert(r.ok === true, 'update ينجح');
        eq(api.Auth.current().name, 'محمد سعيد', 'الاسم محدّث');
        return true;
      }},

      { name:'تعديل الجوال والمدينة ينجح', fn:function(api){
        api.reset();
        api.Auth.signup(acc());
        var r = api.Auth.update({ phone:'0533334444', city:'جدة' });
        assert(r.ok === true, 'update ينجح');
        var cur = api.Auth.current();
        eq(cur.phone, '0533334444', 'الجوال محدّث');
        eq(cur.city, 'جدة', 'المدينة محدّثة');
        return true;
      }},

      { name:'تعديل الجوال لرقم قصير يُرفض', fn:function(api){
        api.reset();
        api.Auth.signup(acc());
        var r = api.Auth.update({ phone:'123' });
        assert(r.ok === false, 'الجوال القصير يُرفض في update');
        return true;
      }},

      { name:'تعديل الإيميل لإيميل مكرر (لحساب آخر) يُرفض', fn:function(api){
        api.reset();
        api.Auth.signup(acc({ email:'first@example.com' }));
        api.Auth.logout();
        api.Auth.signup(acc({ email:'second@example.com', phone:'0599998888' }));
        /* الجلسة الآن للحساب الثاني — حاول أخذ إيميل الأول */
        var r = api.Auth.update({ email:'first@example.com' });
        assert(r.ok === false, 'الإيميل المكرر يُرفض في update');
        assert(/بالفعل/.test(r.error||''), 'رسالة التكرار');
        return true;
      }},

      { name:'تعديل الإيميل لنفس قيمته الحالية يُقبل', fn:function(api){
        api.reset();
        api.Auth.signup(acc({ email:'same@example.com' }));
        var r = api.Auth.update({ email:'SAME@example.com' });
        assert(r.ok === true, 'نفس الإيميل (حتى بحالة مختلفة) يُقبل');
        eq(api.Auth.current().email, 'same@example.com', 'يبقى lowercased');
        return true;
      }},

      { name:'التعديل دون تسجيل دخول يُرفض', fn:function(api){
        api.reset();
        var r = api.Auth.update({ name:'لا أحد' });
        assert(r.ok === false, 'update بلا جلسة يُرفض');
        assert(/مسجّل/.test(r.error||''), 'رسالة عدم التسجيل');
        return true;
      }},

      { name:'تغيير كلمة المرور بكلمة قديمة خاطئة يُرفض', fn:function(api){
        api.reset();
        api.Auth.signup(acc({ password:'secret1' }));
        var r = api.Auth.changePassword('wrongold', 'newpass1');
        assert(r.ok === false, 'القديمة الخاطئة تُرفض');
        assert(/الحالية/.test(r.error||''), 'رسالة كلمة المرور الحالية');
        return true;
      }},

      { name:'تغيير كلمة المرور بجديدة قصيرة يُرفض', fn:function(api){
        api.reset();
        api.Auth.signup(acc({ password:'secret1' }));
        var r = api.Auth.changePassword('secret1', '123');
        assert(r.ok === false, 'الجديدة القصيرة تُرفض');
        return true;
      }},

      { name:'تغيير كلمة المرور ينجح: القديمة تفشل والجديدة تعمل', fn:function(api){
        api.reset();
        api.Auth.signup(acc({ password:'secret1' }));
        var r = api.Auth.changePassword('secret1', 'newpass1');
        assert(r.ok === true, 'التغيير ينجح');
        api.Auth.logout();
        var oldTry = api.Auth.login({ id:'ahmed@example.com', password:'secret1' });
        assert(oldTry.ok === false, 'القديمة لم تعد تعمل');
        var newTry = api.Auth.login({ id:'ahmed@example.com', password:'newpass1' });
        assert(newTry.ok === true, 'الجديدة تعمل');
        return true;
      }},

      { name:'تغيير كلمة المرور دون تسجيل دخول يُرفض', fn:function(api){
        api.reset();
        var r = api.Auth.changePassword('a', 'newpass1');
        assert(r.ok === false, 'بلا جلسة يُرفض');
        return true;
      }},

      { name:'حذف الحساب يزيله ويُسجّل الخروج', fn:function(api){
        api.reset();
        api.Auth.signup(acc());
        api.Auth.logout();
        api.Auth.login({ id:'ahmed@example.com', password:'secret1' });
        var r = api.Auth.deleteAccount();
        assert(r.ok === true, 'الحذف ينجح');
        assert(api.Auth.isLoggedIn() === false, 'خرج بعد الحذف');
        var back = api.Auth.login({ id:'ahmed@example.com', password:'secret1' });
        assert(back.ok === false, 'الحساب لم يعد موجودًا');
        return true;
      }},

      { name:'حذف الحساب دون تسجيل دخول يُرفض', fn:function(api){
        api.reset();
        var r = api.Auth.deleteAccount();
        assert(r.ok === false, 'بلا جلسة يُرفض');
        return true;
      }},

      { name:'كلمة المرور تُخزَّن كهاش لا كنص صريح', fn:function(api){
        api.reset();
        api.Auth.signup(acc({ password:'secret1' }));
        var cur = api.Auth.current();
        assert(cur.pass, 'يوجد حقل pass');
        assert(cur.pass !== 'secret1', 'ليست نصًا صريحًا');
        eq(cur.pass, api.Auth.hashPass('secret1'), 'تطابق الهاش المتوقع');
        return true;
      }},

      { name:'الهاش حتمي لنفس المدخل', fn:function(api){
        api.reset();
        eq(api.Auth.hashPass('secret1'), api.Auth.hashPass('secret1'), 'نفس الهاش');
        assert(api.Auth.hashPass('a') !== api.Auth.hashPass('b'), 'هاش مختلف لمدخل مختلف');
        return true;
      }},

      { name:'حسابان متمايزان يتعايشان بلا تداخل', fn:function(api){
        api.reset();
        api.Auth.signup(acc({ email:'a@example.com', phone:'0511111111' }));
        api.Auth.logout();
        api.Auth.signup(acc({ email:'b@example.com', phone:'0522222222' }));
        api.Auth.logout();
        var la = api.Auth.login({ id:'a@example.com', password:'secret1' });
        assert(la.ok && api.Auth.current().email === 'a@example.com', 'دخول A صحيح');
        api.Auth.logout();
        var lb = api.Auth.login({ id:'b@example.com', password:'secret1' });
        assert(lb.ok && api.Auth.current().email === 'b@example.com', 'دخول B صحيح');
        return true;
      }},

      { name:'التسجيل يبدّل الجلسة لحساب آخر مختلف', fn:function(api){
        api.reset();
        var a = api.Auth.signup(acc({ email:'a@example.com', phone:'0511111111' }));
        eq(api.Auth.current().id, a.customer.id, 'الجلسة لـ A');
        api.Auth.logout();
        var b = api.Auth.login({ id:'a@example.com', password:'secret1' });
        assert(b.ok, 'دخول A ثانية');
        eq(api.Auth.current().id, a.customer.id, 'نفس A');
        return true;
      }},

      { name:'guest: المعرّف = guest_ + أرقام الجوال', fn:function(api){
        api.reset();
        assert(api.Auth.isLoggedIn() === false, 'لا حساب — وضع ضيف');
        var phone = '+966 51-234-5678';
        var custId = 'guest_' + api.digits(phone);
        eq(custId, 'guest_966512345678', 'معرّف الضيف من أرقام الجوال');
        assert(api.Auth.current() === null, 'لا جلسة في وضع الضيف');
        return true;
      }},

      { name:'بعد reset لا حسابات ولا جلسة', fn:function(api){
        api.reset();
        assert(api.Auth.isLoggedIn() === false, 'لا جلسة');
        assert(api.Auth.current() === null, 'لا current');
        var r = api.Auth.login({ id:'ahmed@example.com', password:'secret1' });
        assert(r.ok === false, 'لا حساب للدخول بعد reset');
        return true;
      }},

      { name:'createdAt/updatedAt مضبوطان، والتعديل يُحدّث updatedAt', fn:function(api){
        api.reset();
        var r = api.Auth.signup(acc());
        var c = r.customer;
        assert(typeof c.createdAt === 'number' && c.createdAt > 0, 'createdAt رقم موجب');
        assert(typeof c.updatedAt === 'number' && c.updatedAt > 0, 'updatedAt رقم موجب');
        var up = api.Auth.update({ city:'الدمام' });
        assert(up.ok, 'تعديل ينجح');
        assert(up.customer.updatedAt >= c.createdAt, 'updatedAt لا يتراجع');
        return true;
      }},

      { name:'current() يرجّع نسخة لا تعدّل المخزن', fn:function(api){
        api.reset();
        api.Auth.signup(acc({ name:'الأصل' }));
        var cur = api.Auth.current();
        cur.name = 'مُخترَق';
        eq(api.Auth.current().name, 'الأصل', 'تعديل النسخة لا يمسّ المخزن');
        return true;
      }},

      { name:'الدخول بإيميل بمسافات حوله ينجح (يُقصّ ويُطبّع)', fn:function(api){
        api.reset();
        api.Auth.signup(acc({ email:'trim@example.com' }));
        api.Auth.logout();
        var r = api.Auth.login({ id:'  TRIM@example.com  ', password:'secret1' });
        assert(r.ok === true, 'الإيميل المُحاط بمسافات يدخل');
        return true;
      }}

    ]
  };
})();
