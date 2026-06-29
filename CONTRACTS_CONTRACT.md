# CONTRACTS_CONTRACT — عقود الاشتراك الشهري (Monthly Subscription Contracts)

مصدر واحد للحقيقة. كله تجريبي على localStorage. ألوان الهوية: #1b2a7a / #2300d9 / #f5901e.
RTL، أرقام عربية-هندية عبر `toAr`، عملة عبر `money` (ضريبة ١٥٪).

ترتيب التحميل في الصفحات: `cars.js` ← `booking-core.js` ← `contracts-core.js` (يحتاج OneTrip.cars + اختياريًا OTB).

---

## 1) النموذج — `ot_contracts` (Array)
```js
{
  id:'ctr_<ts>', ref:'SUB-123456',
  customer:{ name, phone, email, idNum, license },
  carId, carName, carImage,
  duration: 12|24|36,                 // شهور
  monthlyPrice,                       // من car.monthly[duration]
  kmPerMonth: 3000, extraKmPrice: 0.5,
  addons:['cdw',...],                 // معرّفات من otb_extras (اختياري)
  addonsMonthly,                      // مجموع شهري للإضافات المختارة
  subtotal,                           // (monthlyPrice + addonsMonthly) * duration
  vat,                                // subtotal * 0.15
  total,                              // subtotal + vat
  deposit,                            // تأمين مسترد
  downPayment: 0,
  startDate:'YYYY-MM-DD', endDate:'YYYY-MM-DD',
  schedule:[{n:1, dueDate:'YYYY-MM-DD', amount, status:'due'|'paid'|'late'}],
  status:'pending'|'active'|'completed'|'cancelled'|'suspended',
  source:'website'|'admin', notes:'', createdAt:<ts>
}
```

## 2) النواة — `window.OneTrip.Contracts` (ملف contracts-core.js — جديد)
كل وصول للتخزين داخل try/catch، لا يرمي أبدًا. يبثّ التغيير عبر `BroadcastChannel('ot_contracts')` + حدث storage (زي offers-core.js).

ثوابت: `DURATIONS=[12,24,36]`، `VAT=(window.OTB&&OTB.VAT)||0.15`، `DEFAULT_KM=3000`, `EXTRA_KM=0.5`, `DEFAULT_DEPOSIT=1000`.

دوال (تُصدّر كلها):
- `all()` ⇒ المصفوفة مرتّبة createdAt تنازلي.
- `get(id)` / `findByRef(ref)` ⇒ عقد أو null.
- `monthlyPrice(carId, duration)` ⇒ رقم من `(OneTrip.cars master).monthly[duration]` (أو ltCars().priceByMonths). 0 لو غير موجود.
- `carsWithMonthly()` ⇒ [{id,name,monthly:{12,24,36}}] للسيارات اللي ليها أسعار شهرية (لاستخدام اللوحة).
- `addonMonthly(addon)` ⇒ `addon.unit==='day'? addon.price*30 : addon.price`. (مصدر الإضافات: `OTB.extras()` أو localStorage 'otb_extras').
- `quote({carId,duration,kmPerMonth,addons})` ⇒ `{carId,carName,duration,monthlyPrice,addonsLines:[{id,name,monthly}],addonsMonthly,subtotal,vat,total,deposit,kmPerMonth,extraKmPrice}`.
- `endDate(startDate,duration)` ⇒ 'YYYY-MM-DD' = البداية + duration شهر − يوم.
- `schedule(startDate,duration,total)` ⇒ مصفوفة `duration` دفعات؛ كل دفعة `amount=round(total/duration)` (آخر دفعة تعدّل الفرق)، `dueDate` كل شهر من البداية، `status:'due'`.
- `ref()` ⇒ 'SUB-' + ٦ أرقام.
- `createSubscription(data)` ⇒ يبني ويحفظ عقدًا. data:`{carId,duration,customer,startDate,kmPerMonth,addons,downPayment,status,source,notes}`.
  - تحقق: السيارة موجودة ولها سعر شهري للمدة؛ duration ضمن DURATIONS؛ (للويب) الاسم+الجوال مطلوبان. خطأ ⇒ `{error:'...'}`.
  - الحالة الافتراضية: 'pending' (source website) أو كما تُمرَّر. يولّد ref/endDate/schedule/totals. يرجّع العقد.
- `saveContract(c)` ⇒ upsert (إضافة/تعديل من اللوحة): يطبّع، يعيد حساب totals/endDate/schedule، يبثّ، يرجّع rec.
- `deleteContract(id)` ⇒ bool.
- `setStatus(id,status)` ⇒ يحدّث الحالة، يرجّع rec.
- `effectiveStatus(c)` ⇒ cancelled→cancelled؛ active وendDate<اليوم→completed؛ غير كده الحالة المخزّنة.
- `carBusy(carId, fromISO, toISO)` ⇒ bool: أي عقد active/pending لنفس السيارة يتداخل [startDate,endDate] مع [from,to]. (لربط التوفّر).
- `activeForCar(carId)` ⇒ عقد نشط أو null.
- `statusLabel(s)` ⇒ {pending:'قيد الانتظار',active:'نشط',completed:'منتهٍ',cancelled:'ملغى',suspended:'معلّق'}.
- `on('change',cb)/off` + `emitChange` داخلي.

## 3) لوحة التحكم — سكشن «عقود الاشتراك» (admin.html — تعديل جراحي)
أنماط موجودة لازم تُتبع: `$,$$,toAr,esc,toast,openModal('#id'),closeModal,load,save,num('#id'),confirm`، ودمج في `renderAll` و`renderCounts` و`allowed()` و handler الـnav.
- زر nav: `<button class="nav-i" data-sec="contracts">… عقود الاشتراك <span class="ct" id="ctContracts">0</span></button>` (بعد bookings).
- سكشن `id="sec-contracts"` بعنوان «عقود الاشتراك الشهري» + زر `#addContract`.
- جدول `#contractsTable`: المرجع | العميل | السيارة | المدة | الشهري | الإجمالي (شامل الضريبة) | الحالة (pill) | إجراءات (عرض/تعديل/حذف).
- مودال `#contractModal`: العميل (اسم/جوال/إيميل/هوية/رخصة)، select السيارة `#ct-car` (من `OneTrip.Contracts.carsWithMonthly()`)، select المدة `#ct-duration`، إضافات (checkboxes من otb_extras)، km/شهر، تاريخ البداية `#ct-start` (والنهاية تُحسب)، deposit، downPayment، الحالة `#ct-status`، ملاحظات. **معاينة حيّة** للشهري/الإجمالي/الضريبة عبر `OneTrip.Contracts.quote(...)` عند تغيير السيارة/المدة/الإضافات.
- مودال عرض `#contractViewModal`: «عقد اشتراك شهري» قابل للطباعة — كل البيانات + **جدول الدفعات** (schedule) + الشروط المختصرة.
- حفظ: يجمع الحقول ⇒ `OneTrip.Contracts.saveContract({...})` ثم `renderAll(); closeModal(); toast('تم حفظ العقد ✓','ok')`.
- `renderContracts()` تُضاف لمصفوفة `renderAll` و`if(s==='contracts') renderContracts()` في handler الـnav، و`#ctContracts` في `renderCounts`، و'contracts' في قائمة صلاحيات الموظفين (لو موجودة).

## 4) ربط الموقع — long-term.html (تفعيل «احجز الآن»)
حاليًا زر «احجز الآن» (carId,months) بيعمل console.log فقط. التفعيل:
- عند الضغط: افتح مودال طلب اشتراك بسيط (اسم/جوال/إيميل اختياري/هوية اختياري) للسيارة والمدة المختارة، مع ملخّص السعر الشهري والإجمالي (شامل الضريبة) عبر `OneTrip.Contracts.quote`.
- عند التأكيد: `OneTrip.Contracts.createSubscription({carId,duration:months,customer,startDate:اليوم,source:'website',status:'pending'})` ⇒ رسالة نجاح برقم الطلب (ref) «هنتواصل معك لتفعيل العقد».
- يحمّل `contracts-core.js` (بعد cars.js + booking-core.js) في long-term.html.

## 5) ربط التوفّر — booking-core.js (المنسّق، محروس)
داخل `isAvailable(carId,pickupAt,returnAt)`: بعد فحص الحجوزات، أضِف فحصًا محروسًا:
`try{ if(window.OneTrip&&OneTrip.Contracts&&OneTrip.Contracts.carBusy&&OneTrip.Contracts.carBusy(carId,pickupAt,returnAt)) return false; }catch(e){}`
(سيارة على عقد شهري نشط لا تُتاح لحجز يومي متداخل). محروس: لو Contracts غير موجود لا شيء يتغيّر.

## 6) تحميل contracts-core.js
صفحات: admin.html, long-term.html, + (للتوفّر) أي صفحة حجز تستدعي isAvailable: create-booking.html, car.html, extras.html — بعد booking-core.js. idempotent.
