# One Trip — عقد نظام حسابات العملاء (Customer Auth Contract)

مصدر الحقيقة الوحيد لبناء تسجيل الدخول/حساب جديد + البروفايل للعملاء (مش موظفي اللوحة).
الأسلوب نفس المشروع: Vanilla JS، IIFE، RTL، `window.OneTrip` namespace، طبقة بيانات `localStorage`
(تجريبي → Supabase Auth لاحقًا). **ملاحظة أمنية:** كلمات المرور تخزَّن محليًا (هاش بسيط غير آمن) —
للتجربة فقط؛ الإنتاج يستخدم Supabase Auth. لا تخزّن أسرارًا حقيقية.

> مهم: ده حساب **العميل** (زائر الموقع). مختلف عن `ot_users` (حسابات موظفي لوحة التحكم — لا تلمسها).

---

## 1) مفاتيح التخزين
| المفتاح | الوصف |
|---|---|
| `ot_customers` | مصفوفة حسابات العملاء |
| `ot_customer_session` | معرّف العميل المسجّل حاليًا (string) |

موجود ولا يُلمس شكله: `ot_catalog, ot_branches, ot_leads, ot_chats, ot_users, otb_*` (الحجوزات).

## 2) نموذج العميل (Customer)
```js
{
  id:'cust_1719…', name:'', email:'', phone:'', city:'',
  pass:'<hash>',                 // هاش بسيط (غير آمن — تجريبي)
  createdAt:0, updatedAt:0,
  meta:{}
}
```

## 3) واجهة `window.OneTrip.Auth` (يطبّقها `auth-core.js` — المالك: إيجنت A)
```js
signup({name,email,phone,password,city?})  // إيميل فريد ⇒ {ok:true,customer} أو {ok:false,error}
login({id,password})           // id = إيميل أو جوال ⇒ {ok,customer} أو {ok:false,error}
logout()
current()                      // العميل المسجّل أو null
isLoggedIn()                   // bool
update(partial)                // تعديل name/phone/city/email (إيميل يظل فريدًا) ⇒ {ok,customer|error}
changePassword(oldP,newP)      // ⇒ {ok} أو {ok:false,error}
deleteAccount()                // يحذف الحساب الحالي ويسجّل خروج

// روابط بباقي الموقع (قراءة فقط — لا تعدّل booking-core/الشات):
bookings()                     // حجوزات العميل: لو window.OTB موجود، OTB.bookings() مفلترة بمطابقة phone/email
                               //   (آخر 9 أرقام للجوال) — وإلا []
conversations()                // محادثات الشات للعميل: OneTrip.Chat.listConversations() مفلترة بالـphone — وإلا []
leads()                        // ot_leads المطابقة بالـphone/email

on('change',cb) / off('change',cb)   // عبر BroadcastChannel('ot_auth') + window 'storage'
hashPass(s)                    // الهاش البسيط (مُصدَّر للاختبار)
```
قواعد: الإيميل فريد (حساس لحالة الأحرف؟ خزّنه lowercased). login يطابق الإيميل أو الجوال (آخر 9 أرقام).
كل عملية ناجحة تبثّ `'change'`. كل وصول localStorage داخل try/catch (لا يرمي للمستدعي).

## 4) ودجة الحساب (auth-widget.js + auth-widget.css — المالك: إيجنت B)
- **تركيب تلقائي** على DOMContentLoaded (idempotent). لا تعدّل ترويسة الصفحات يدويًا.
  حاول الحقن في ترويسة الموقع لو لقيت (`header`, `.site-header`, `.nav`, `.nav-links`)؛ وإلا **زر عائم أعلى اليمين**.
  (لا تتعارض مع ودجة الشات أسفل اليسار.)
- **مسجّل خروج:** زر «تسجيل الدخول» + «حساب جديد» يفتحوا **مودال** (overlay) فيه فورم دخول/تسجيل (تبويبين).
- **مسجّل دخول:** يعرض اسم العميل + قائمة: «ملفي الشخصي» (→ `profile.html`)، «حجوزاتي» (→ `profile.html#bookings`)، «تسجيل الخروج».
- يستخدم `OneTrip.Auth`. التحقق: إيميل صحيح، جوال ≥9 أرقام، كلمة مرور ≥6. رسائل خطأ عربية واضحة.
- يشترك في `Auth.on('change')` ليحدّث نفسه فورًا. RTL، ألوان الهوية (أزرق `#1b2a7a`/`#141d5c`، برتقالي `#f5901e`). كل الستايل في auth-widget.css ببادئة `.otauth-`.
- يَعرِض `window.OneTrip.AuthWidget = { mount(), open(mode), instance() }` (mode:'login'|'signup').

## 5) صفحة البروفايل (profile.html — المالك: إيجنت C)
صفحة كاملة RTL بهوية الموقع (راجع index.html للهيدر/الفوتر/الألوان):
- لو مش مسجّل دخول ⇒ رسالة + زر «تسجيل الدخول» (يفتح مودال الودجة عبر `OneTrip.AuthWidget.open('login')`).
- لو مسجّل: بطاقة بيانات (اسم/إيميل/جوال/مدينة) **قابلة للتعديل** (`Auth.update`)، تغيير كلمة المرور (`Auth.changePassword`)،
  قسم **«حجوزاتي»** (id=bookings) من `Auth.bookings()` (رقم الحجز/السيارة/التواريخ/الحالة)، قسم محادثاتي (اختياري من `Auth.conversations()`)، زر خروج، زر حذف الحساب.
- يحمّل: `cars.js`, `auth-core.js`, `branch-map.js`, `chat.js`, `supabase-sync.js`, `chat-widget.js`, `auth-widget.js` + `auth-widget.css` (+ booking-core.js لو احتجت الحجوزات).

## 6) قسم العملاء في الداشبورد (admin.html — المالك: إيجنت D — وحده يعدّل admin.html)
- nav جديد `data-sec="customers"` (label «العملاء») + `#sec-customers` + إضافة `customers:'العملاء'` لكائن `titles`
  + `if(s==='customers') renderCustomers();` في معالج النّاف + إضافة `renderCustomers` لمصفوفة `renderAll`'s safeRender.
- جدول العملاء من `ot_customers` (الاسم/الإيميل/الجوال/المدينة/عدد الحجوزات/تاريخ التسجيل) + بحث + عرض تفاصيل (حجوزاته).
- عدد الحجوزات: لو `window.OTB` موجود طابق `OTB.bookings()` بالجوال/الإيميل. للأدمن فقط (allowed('customers')=isAdmin).
- حمّل `<script src="auth-core.js"></script>` بجانب باقي السكربتات في admin.html.
- استخدم نفس الأنماط: `$,$$,toAr,esc,toast,load/save,.panel,.pill,.empty,openModal/closeModal`.

## 7) الربط والصفحات (المالك: إيجنت E)
- أضِف في كل صفحات الموقع العامة قبل `</body>` (بعد cars.js وقبل chat-widget مناسب):
  `<link rel="stylesheet" href="auth-widget.css">` + `<script src="auth-core.js"></script>` + `<script src="auth-widget.js"></script>`.
  الصفحات: index, fleet, create-booking, long-term, corporate, contact, about, terms, rental-terms, privacy, cancellation, cookies (واللي موجود فعلًا فقط، idempotent).
- glue اختياري آمن (additive): لو `Auth.isLoggedIn()`، عبّئ تلقائيًا حقول الاسم/الجوال/الإيميل في فورمات الحجز/التواصل لو فاضية (بالبحث عن input[type=tel]/[type=email] والاسم) — بدون كسر أي شيء.
- أنشئ `AUTH_README.md` (عربي): الفكرة، الملفات، التدفّق، الربط بالحجوزات/الشات/الداشبورد، ومسار Supabase Auth للإنتاج.

## 8) ملكية الملفات (ممنوع إيجنت يلمس ملف غيره)
| الملف | المالك |
|---|---|
| `auth-core.js` (جديد) | A |
| `auth-widget.js` + `auth-widget.css` (جديد) | B |
| `profile.html` (جديد) | C |
| `admin.html` (قسم العملاء فقط) | D |
| وسوم السكربت في صفحات الموقع + glue + `AUTH_README.md` | E |

ترتيب التحميل: `cars.js` → `auth-core.js` → `branch-map.js` → `chat.js` → `supabase-sync.js` → `chat-widget.js` → `auth-widget.js`.
ألوان الهوية: أزرق `#1b2a7a`/`#141d5c` — برتقالي `#f5901e` — ذهبي فاتح.
