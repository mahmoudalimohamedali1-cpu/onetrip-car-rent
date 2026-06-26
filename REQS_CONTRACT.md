# One Trip — عقد «متطلبات الحجز» (Booking Requirements + Attachments)

نظام التزامات/مستندات إلزامية للحجز: الأدمن يحدّد الحقول والمرفقات المطلوبة، تُملأ من البروفايل أو
خطوة «بيانات المستأجر»، تُفحَص قبل الدفع، وتُراجَع/تُعتمد من الداشبورد (رفض + ملاحظة → العميل يعيد الإرفاق).
الأسلوب: Vanilla JS، IIFE، RTL، `window.OneTrip`، localStorage (تجريبي → Supabase لاحقًا).

## 1) مفاتيح التخزين
| المفتاح | الوصف |
|---|---|
| `ot_booking_reqs` | إعداد الأدمن: الحقول + المرفقات المطلوبة |
| `ot_customer_docs` | مستندات العملاء: `{ [custId]: {fields:{},attachments:{}} }` |

`custId` = `OneTrip.Auth.current().id` للمسجّل؛ للضيف `'guest_'+digits(phone)`.

## 2) النماذج
```js
// ot_booking_reqs
{ fields:[{id,label,type:'text'|'date',required:true}],
  attachments:[{id,label,required:true}] }
// الافتراضي:
{ fields:[
    {id:'nationalId',label:'رقم الهوية/الإقامة',type:'text',required:true},
    {id:'licenseExpiry',label:'تاريخ انتهاء الرخصة',type:'date',required:true}],
  attachments:[
    {id:'id_copy',label:'صورة الهوية/الإقامة',required:true},
    {id:'license_copy',label:'صورة رخصة القيادة',required:true}] }

// ot_customer_docs[custId]
{ fields:{ nationalId:'1012345678', licenseExpiry:'2027-05-01' },
  attachments:{ id_copy:{ name:'id.jpg', dataURL:'data:image/...', status:'pending'|'approved'|'rejected', note:'', ts:0 } } }
```
المرفقات تُخزَّن كـ dataURL (base64) — تجريبي؛ احرص على ضغط/حدّ الحجم (≤~1.5MB للملف) وامسك أخطاء امتلاء localStorage.

## 3) واجهة `window.OneTrip.Reqs` (يطبّقها `req-core.js` — المالك: إيجنت A)
```js
config()                       // ot_booking_reqs مدموجة فوق الافتراضي
saveConfig(cfg)                // حفظ + emit (الأدمن)
docs(custId)                   // {fields:{},attachments:{}} للعميل (أو فاضي)
saveField(custId, fieldId, value)
saveAttachment(custId, attId, {name,dataURL})   // status='pending', ts=Date.now()
setStatus(custId, attId, status, note)          // approve/reject + ملاحظة (الأدمن)
check(custId)                  // ⇒ { ok:bool, missingFields:[{id,label}], missingAttachments:[{id,label}], rejected:[{id,label,note}] }
                               //   (المطلوب فقط؛ rejected = موجود لكن مرفوض ⇒ يلزم إعادة إرفاق ⇒ ok=false)
snapshot(custId)              // نسخة مبسّطة للحجز: {fields:{}, attachments:{attId:{name,status}}} (بدون dataURL الثقيل)
pendingReview()               // [{custId, attId, label, name, status, note, ts}] لكل المرفقات pending/rejected (للأدمن)
on('change',cb)/off('change',cb)   // BroadcastChannel('ot_reqs') + 'storage'
```
كل وصول localStorage في try/catch؛ لا يرمي للمستدعي. كل تعديل يبثّ 'change'.

## 4) الداشبورد (admin.html — المالك: إيجنت B — وحده يعدّل admin.html)
يستخدم أنماط admin الموجودة (`$,$$,toAr,esc,toast,load/save,.panel,.pill,.empty,openModal/closeModal,nav titles/handler/renderAll, isAlowed`).
أضف `<script src="req-core.js"></script>` بجانب auth-core.js.
1. **قسم «متطلبات الحجز»** `data-sec="reqs"` (+ titles + handler + renderAll): تحرير قائمة الحقول (label/type/مطلوب) وقائمة المرفقات (label/مطلوب) — إضافة/حذف/تبديل مطلوب — `OneTrip.Reqs.saveConfig`. للمدير فقط.
2. **قسم «مراجعة المستندات»** `data-sec="docs"` (+ wiring): جدول من `OneTrip.Reqs.pendingReview()` — العميل/المرفق/معاينة (فتح dataURL في تبويب أو صورة مصغّرة) + **اعتماد**/**رفض (مع ملاحظة)** عبر `setStatus` + زر «مراسلة العميل» (mailto لإيميل العميل من ot_customers). بادج عدد المعلّق في الـnav.
3. (تكامل) لو قسم «الحجوزات» يعرض تفاصيل حجز: اعرض حالة مستندات صاحبه من `Reqs.docs`/الـsnapshot المخزّن في `booking.customer.docs` — اختياري وغير مخرّب.

## 5) البروفايل (profile.html — المالك: إيجنت C)
أضف قسم **«متطلبات الحجز / مستنداتي»**:
- لكل حقل في `Reqs.config().fields`: input (type نص/تاريخ) مملوء من `Reqs.docs(cust).fields` → `Reqs.saveField`.
- لكل مرفق: `<input type=file accept="image/*,application/pdf">` → عند الاختيار اقرأه FileReader إلى dataURL واستدعِ `Reqs.saveAttachment` (اعرض المعاينة + الحالة: قيد المراجعة/معتمد/مرفوض + الملاحظة + زر إعادة رفع لو مرفوض).
- ملخّص حالة عبر `Reqs.check(cust.id)`: «مكتمل ✓» أو «ناقص: …».
- يحمّل `req-core.js` (أضِفه لقائمة سكربتات profile.html).

## 6) الـcheckout (checkout.html — المالك: إيجنت D — ملف حسّاس، تعديلات إضافية فقط)
الوضع الحالي (لا تكسره): يجمع name/phone/email/nationalId/license/dob/notes، يتحقق من المطلوب، ثم
`OTB.draft.set({customer:{...}})` و`location.href='payment.html'` عبر زر `#goPay`. يحمّل `cars.js`,`booking-core.js` فقط.
المطلوب (إضافي):
- أضِف includes: `<script src="auth-core.js"></script>`, `<script src="req-core.js"></script>`, `<script src="auth-widget.js"></script>`, `<link rel="stylesheet" href="auth-widget.css">` (لمودال الدخول).
- **شريط حساب أعلى الخطوة:** لو غير مسجّل اعرض «سجّل الدخول لإكمال متطلباتك» (يفتح `OneTrip.AuthWidget.open('login')`)؛ لو مسجّل اعرض «مرحبًا {الاسم}» واملأ الحقول من `Auth.current()` (إن كانت فارغة).
- **لوحة «متطلبات الحجز»** (panel جديد بعد لوحة «بيانات المستأجر»): اعرض حقول `Reqs.config().fields` (مملوءة من docs) + رافعات المرفقات `Reqs.config().attachments` (مع الحالة لو موجودة). custId = `Auth.current()?.id` أو `'guest_'+digits(phone)`.
- **بوابة قبل الدفع:** عدّل سلوك `#goPay` (دون كسر تحققه الحالي): بعد التحقق الحالي، احفظ الحقول/المرفقات عبر `Reqs.saveField/saveAttachment` ثم `var r=Reqs.check(custId)`; لو `!r.ok` امنع الانتقال واعرض رسالة واضحة: «يجب إكمال/إرفاق: » + قائمة `missingFields+missingAttachments+rejected` (مثال: «يجب إرفاق صورة الهوية أولًا»). لو ok: `OTB.draft.set({customer:{...الموجود..., docs:Reqs.snapshot(custId)}})` ثم انتقل للدفع.
- لا تعدّل booking-core.js — الـsnapshot يمرّ ضمن `customer` فيُحفظ تلقائيًا في الحجز (`createBooking` يحفظ `customer:d.customer`).

## 7) الربط والتحميل (إيجنت E — لو لزم) 
- تأكد أن `req-core.js` محمّل أينما يُستخدم: admin.html (B)، profile.html (C)، checkout.html (D). الصفحات العامة التي فيها auth: أضِف `req-core.js` بعد `auth-core.js` (idempotent) لو احتجته.
- حدّث `AUTH_README.md` أو أنشئ `REQS_README.md` بشرح النظام والتدفّق والاعتماد ومسار Supabase/Storage للإنتاج.

## 8) ملكية الملفات
| الملف | المالك |
|---|---|
| `req-core.js` (جديد) | A |
| `admin.html` (قسمَا reqs + docs) | B |
| `profile.html` (قسم مستنداتي) | C |
| `checkout.html` (بوابة المتطلبات + includes) | D |
| includes في الصفحات العامة + README | E |

ترتيب التحميل: `cars.js`/`booking-core.js` → `auth-core.js` → `req-core.js` → (branch-map/chat/...) → `auth-widget.js`.
ألوان الهوية: أزرق `#1b2a7a`/`#141d5c` — برتقالي `#f5901e`.
