# عقد اختبارات رحلة الحجز (Journey Test Harness)

5 إيجنتس يكتبوا سيناريوهات حية لرحلة عميل يحجز وهو لسه بيعمل حساب — بكل الافتراضات.
المنسّق يشغّلهم مركزيًا في إطار (iframe) فيه كل الوحدات، كل اختبار يعيد ضبط الحالة بنفسه.

## شكل الملف (لكل إيجنت N=1..5): `tests/journeyN.js`
```js
;(function(){
  window.__JOURNEY = window.__JOURNEY || {};
  window.__JOURNEY[N] = {
    title: 'عنوان المحور',
    tests: [
      { name:'وصف السيناريو', fn:function(api){ /* ... */ return true; } },
      // ... 22+ اختبارًا على الأقل لكل إيجنت (الإجمالي ≥ 100)
    ]
  };
})();
```
- `fn(api)` يرجّع `true` (نجح) أو `false`/يرمي استثناء (فشل). كل `fn` **يبدأ بـ`api.reset()`** ثم يبني حالته.
- لا DOM مطلوب — استخدم الـAPIs الحقيقية (`api.Auth`, `api.Reqs`, `api.OTB`). الاختبارات حقيقية على الكود الفعلي.

## الـ`api` المتاح وقت التشغيل
```js
api.Auth   // window.OneTrip.Auth   (signup/login/logout/current/isLoggedIn/update/changePassword/deleteAccount/bookings/conversations/leads)
api.Reqs   // window.OneTrip.Reqs   (config/saveConfig/docs/saveField/saveAttachment/setStatus/check/snapshot/pendingReview)
api.OTB    // window.OTB            (draft/createBooking/bookings/quote/days...) — قد يكون null؛ احرس
api.reset()          // يمسح: ot_customers, ot_customer_session, ot_customer_docs, ot_booking_reqs,
                     //        ot_leads, otb_bookings + sessionStorage otb_draft — حالة نظيفة (إعداد المتطلبات الافتراضي)
api.file(kb)         // يرجّع {name:'doc.jpg', dataURL:'data:...'} بحجم ~kb (افتراضي صغير) لاختبار الرفع
api.bigFile()        // يرجّع مرفقًا كبيرًا (>1.5MB) لاختبار رفض الحجم
api.digits(s)        // أرقام فقط
api.signupAndLogin(o)// اختصار: api.Auth.signup(o) — يرجّع customer
```

## المحاور (كل إيجنت محور — اكتب 22+ سيناريو حقيقي)
- **إيجنت 1 — التسجيل أثناء الحجز والدخول:** حساب جديد، إيميل مكرر، كلمة مرور قصيرة، دخول بالإيميل، دخول بالجوال (آخر 9)، دخول خاطئ، خروج/جلسة، تعديل بيانات، تغيير كلمة مرور، حذف حساب، ضيف بدون تسجيل (custId='guest_'+digits(phone)).
- **إيجنت 2 — اكتمال المتطلبات والبوابة (check):** نسي الهوية، نسي الرخصة، نسي حقلًا، ملأ حقلًا واحدًا من كذا، رفع مرفقًا واحدًا فقط، اكتمل الكل (ok=true)، حقل/مرفق غير مطلوب لا يكسر، الأدمن أضاف متطلبًا جديدًا ⇒ يكسر الفحص، أزال متطلبًا ⇒ يكتمل. تحقّق من محتوى missingFields/missingAttachments.
- **إيجنت 3 — المرفقات ودورتها:** رفع → pending، إعادة رفع، رفع متعدد، ملف كبير (يُرفض/يُعالَج)، snapshot بدون dataURL، الأسماء/الحالات محفوظة، عميلان منفصلان لا يتداخلان.
- **إيجنت 4 — الرفض ومساره:** الأدمن يرفض بملاحظة ⇒ check يفشل ويظهر في rejected بالملاحظة ⇒ يظهر في pendingReview ⇒ العميل يعيد الرفع ⇒ pending ⇒ الأدمن يعتمد ⇒ check ينجح. رفض متعدد، اعتماد ثم لا يظهر في pendingReview، الملاحظة تُحفظ/تُمسح.
- **إيجنت 5 — التكامل من الطرف للطرف:** المسار السعيد كامل (تسجيل→ملء حقول→رفع→check ok→snapshot في الحجز عبر OTB.draft/createBooking→الحجز يحمل customer.docs)، ربط حجوزات العميل بالجوال/الإيميل (Auth.bookings)، pendingReview عبر عدة عملاء، إعادة فتح بعد الرفض ثم اعتماد ثم الحجز مكتمل المستندات.

## القواعد
- ملف واحد لكل إيجنت تحت `tests/` — لا تلمس أي ملف آخر. ES5-ish، بدون اعتماديات. `node --check` ينجح.
- كل اختبار مستقل ويبدأ بـ`api.reset()`. أسماء واضحة بالعربي. 22+ لكل إيجنت.
