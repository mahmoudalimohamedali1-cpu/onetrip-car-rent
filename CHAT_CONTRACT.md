# One Trip — عقد واجهة الشات (Chat Integration Contract)

مصدر الحقيقة الوحيد لكل من يبني جزءًا من نظام الدردشة. **لا تغيّر الأسماء أو الأشكال.**
الأسلوب نفس باقي المشروع: Vanilla JS، IIFE، RTL، `window.OneTrip` namespace، طبقة بيانات `localStorage`
بنفس نمط `cars.js` و `admin.html` (تجريبي الآن → Supabase لاحقًا).

---

## 1) مفاتيح التخزين (localStorage)

| المفتاح | الوصف |
|---|---|
| `ot_chats` | مصفوفة المحادثات (انظر النموذج) |
| `ot_chat_session` | معرّف محادثة الزائر الحالي على متصفحه (string) |
| `ot_wa_config` | إعدادات واتساب: `{ enabled, businessPhone, phoneNumberId, token, verifyToken }` |
| `ot_wa_outbox` | طابور رسائل صادرة للواتساب ينزّفه الباك-إند: `[{ convId, phone, text, ts, sent:false }]` |
| `ot_supabase_config` | إعدادات Supabase: `{ url, anonKey, enabled }` |

موجود مسبقًا ولا يُلمس شكله: `ot_catalog`, `ot_categories`, `ot_branches`, `ot_leads`, `ot_intro`.

---

## 2) نموذج المحادثة (Conversation)

```js
{
  id: 'conv_1719240000000',     // 'conv_' + timestamp
  name: 'زائر',                  // اسم الزائر (افتراضي 'زائر')
  phone: '',                     // رقم الجوال إن توفّر (مفتاح ربط واتساب و ot_leads)
  channel: 'web',                // 'web' | 'whatsapp'
  status: 'open',                // 'open' | 'pending' | 'closed'  (pending = بانتظار رد موظف)
  assignedTo: null,              // اسم/معرّف الموظف
  unreadAgent: 0,                // غير مقروء عند الموظف (للوحة التحكم)
  unreadUser: 0,                 // غير مقروء عند الزائر (لودجة الموقع)
  createdAt: 1719240000000,
  updatedAt: 1719240000000,
  messages: [ /* Message[] */ ],
  meta: {}                       // أي بيانات إضافية (waId, lastLead...)
}
```

### نموذج الرسالة (Message)
```js
{
  id: 'm_1719240000001',
  from: 'user',                  // 'user' (الزائر) | 'agent' (موظف/داشبورد) | 'bot' (رد آلي/خدمة سريعة)
  text: 'نص الرسالة',
  type: 'text',                  // 'text' | 'quick' | 'card' | 'system'
  ts: 1719240000001,
  read: false,
  data: null                     // اختياري: payload للكروت/الخدمات السريعة
}
```

---

## 3) واجهة `OneTrip.Chat` (يطبّقها ملف `chat.js`)

```js
// ---- قراءة ----
listConversations()            // → Conversation[] مرتبة بـ updatedAt تنازليًا
getConversation(id)            // → Conversation | null
currentConversation()          // جهة الزائر: يرجّع محادثته من ot_chat_session أو null
unreadAgentTotal()             // → مجموع unreadAgent عبر كل المحادثات (لِبادج الداشبورد)

// ---- كتابة ----
startConversation(opts)        // opts:{name?,phone?,channel?} → ينشئ محادثة، يحفظ ot_chat_session، يرجّع Conversation
sendMessage(convId, msg)       // msg:{from,text,type?,data?} → ينشئ Message، يحدّث العدّادات/updatedAt، يبثّ 'change'، يرجّع Message
//   قواعد العدّادات: from==='user' ⇒ unreadAgent++ ; from==='agent'||'bot' ⇒ unreadUser++
//   من قناة whatsapp مع from==='agent' لا يُضاف لـ ot_wa_outbox (جاي من واتساب) — مرّر msg.data.viaWhatsApp=true
markRead(convId, side)         // side:'agent'|'user' → يصفّر العدّاد المقابل ويعلّم الرسائل read، يبثّ 'change'
setStatus(convId, status)      // 'open'|'pending'|'closed'
assign(convId, agentName)
deleteConversation(id)

// ---- أحداث (Realtime عبر BroadcastChannel('ot_chat') + window 'storage') ----
on(event, cb)                  // event: 'change' — يُستدعى بعد أي تعديل (نفس التبويب وعبر التبويبات)
off(event, cb)

// ---- الخدمات السريعة + الرد الآلي ----
quickServices()                // → QuickService[]  (انظر القسم 4)
botReply(convId, userText)     // يحلّل نص الزائر، يردّ آليًا (from:'bot')، ويصعّد لموظف عند اللزوم
runQuickService(convId, serviceId)  // ينفّذ خدمة سريعة بالمعرّف ويضيف ردّها للمحادثة

// ---- جسر واتساب (يستدعيه الباك-إند/البريدج) ----
WhatsApp: {
  config(),                    // يقرأ ot_wa_config
  ingestInbound({phone,name,text,waId}),  // وارد من عميل واتساب → محادثة channel:'whatsapp' as from:'user'
  enqueueOutbound(convId, text),          // يضيف لـ ot_wa_outbox
  outbox(), markSent(ts)
}
```

البث: أي تعديل ينادي `emit()` ترسل عبر `BroadcastChannel('ot_chat')` رسالة `{type:'change'}`،
ومستمع `storage` على `ot_chats` كاحتياطي. المستمعون عبر `on('change', cb)`.

---

## 4) الخدمات السريعة (Quick Services)

`quickServices()` ترجّع مصفوفة: `{ id, label, icon:'<svg…/>', kind:'reply'|'link', href? }`

| id | label | السلوك |
|---|---|---|
| `prices` | أسعار السيارات | رسالة bot type:'card' من `OneTrip.bookingCars()` (الاسم + السعر اليومي) |
| `branches` | الفروع والمواقع | يقرأ `ot_branches` (أو الافتراضي) ويسرد الاسم/المدينة/الهاتف |
| `book` | احجز الآن | kind:link → `create-booking.html` |
| `longterm` | باقات شهرية | kind:link → `long-term.html` |
| `corporate` | حلول الشركات | kind:link → `corporate.html` |
| `status` | حالة طلبي | يسأل عن رقم الجوال ثم يبحث في `ot_leads` بالرقم ويعرض الحالة |
| `agent` | التحدث مع موظف | `setStatus(convId,'pending')` + رسالة bot "جارٍ تحويلك لموظف…" |

`botReply` يوجّه بالكلمات المفتاحية (سعر/أسعار→prices، فرع/فروع/موقع→branches، حجز/احجز→book،
شهر/طويل→longterm، شركة/شركات→corporate، موظف/خدمة/بشري→agent، السلام/مرحبا/اهلا/هلا→ترحيب)
وإلا ردّ افتراضي + اقتراح "التحدث مع موظف".

---

## 5) ملكية الملفات (عشان ما يحصلش تعارض)

| الملف | المالك |
|---|---|
| `chat.js` (واجهة OneTrip.Chat + الخدمات + الرد الآلي + جسر واتساب client-side) | إيجنت A |
| `chat-widget.js` + `chat-widget.css` (ودجة الموقع العائمة) | إيجنت B |
| `admin.html` (قسم "المحادثات" + "واتساب" + "Supabase") | المنسّق يدويًا |
| `whatsapp/` (مجلد: webhook + send + store + نشر + README) | إيجنت D/H |
| `supabase/` (schema.sql + README) | إيجنت F |
| `supabase-sync.js` (طبقة المزامنة العميلة) | إيجنت G |
| وسوم `<script>` في صفحات الموقع العامة + README | إيجنت E/I |

---

## 6) نقاط الإدماج في صفحات الموقع

الصفحات العامة: `index.html, fleet.html, create-booking.html, long-term.html, corporate.html, contact.html, about.html, terms.html, rental-terms.html, privacy.html, cancellation.html, cookies.html`
أضِف قبل `</body>` (وبعد سكربتات الصفحة):
```html
<link rel="stylesheet" href="chat-widget.css">
<script src="chat.js"></script>
<script src="supabase-sync.js"></script>
<script src="chat-widget.js"></script>
```
الودجة تركّب نفسها تلقائيًا — زر عائم أسفل اليسار (RTL) بألوان الهوية. لا تحجب الفوتر.
ترتيب التحميل: `cars.js` → `chat.js` → `supabase-sync.js` → `chat-widget.js`.

## 7) ألوان الهوية
أزرق غامق `#1b2a7a` / `#141d5c` — برتقالي `#f5901e` — ذهبي فاتح. خط: نفس صفحات الموقع.

---

## 8) مخطط Supabase الموحّد (للتزامن عبر الأجهزة)

`chat.js` يفضل طبقة **متزامنة** تقرأ/تكتب من `localStorage`. ملف `supabase-sync.js` طبقة **اختيارية**:
لو فيه `ot_supabase_config` تعمل mirror محلي↔بعيد وتبثّ `'change'` عند أي تغيير بعيد (Realtime).
**بدون إعدادات Supabase ⇒ لا شيء يتغيّر (no-op، نفس سلوك localStorage).** ممنوع كسر المسار المحلي.

### الجداول (SQL canonical — لا تغيّر الأسماء)
```sql
create table public.conversations (
  id text primary key, name text default 'زائر', phone text default '',
  channel text default 'web', status text default 'open', assigned_to text,
  unread_agent int default 0, unread_user int default 0,
  created_at bigint, updated_at bigint, meta jsonb default '{}'::jsonb
);
create table public.messages (
  id text primary key,
  conversation_id text references public.conversations(id) on delete cascade,
  sender text, text text, type text default 'text', data jsonb,
  ts bigint, read boolean default false
);
create index on public.messages (conversation_id, ts);
alter publication supabase_realtime add table public.conversations, public.messages;
```
**التحويل JS↔SQL:** `msg.from` ⇄ `sender`. camelCase ⇄ snake_case
(`unreadAgent`⇄`unread_agent`, `assignedTo`⇄`assigned_to`, `createdAt`⇄`created_at`, `updatedAt`⇄`updated_at`).

### RLS
ديمو: سياسات تسمح للـ`anon` بالـselect/insert/update على الجدولين. **تنويه أمني إلزامي بالـREADME:**
مفتوح للتجربة فقط؛ في الإنتاج قيّد بـRLS وخلي كتابة الموظف عبر service_role من السيرفر.

### السيرفر (whatsapp/store.js)
لو `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` في البيئة ⇒ يكتب/يقرأ من نفس الجدولين (service_role) بدل `store.json`.

ترتيب التحميل في كل صفحة: `cars.js` → `chat.js` → `supabase-sync.js` → `chat-widget.js`.
