# One Trip — Supabase setup / إعداد Supabase للدردشة

AR: هذه الطبقة **اختيارية**. بدون إعدادات Supabase يظل النظام يعمل من `localStorage` كما هو (no-op).
EN: This layer is **optional**. With no Supabase config, the chat keeps working from `localStorage` (no-op).

---

## 1) Create a project / أنشئ مشروعًا

EN: Go to <https://supabase.com> → New project. Choose a name, a strong database password, and a region.
AR: ادخل <https://supabase.com> ← **New project**، اختر اسمًا وكلمة مرور قوية للقاعدة ومنطقة قريبة.

## 2) Run the schema / شغّل المخطط

EN: Open **SQL Editor** → New query → paste the entire contents of [`schema.sql`](./schema.sql) → **Run**.
AR: افتح **SQL Editor** ← **New query** ← الصق كامل محتوى `schema.sql` ← اضغط **Run**.

EN: It is idempotent — safe to re-run. It creates the `conversations` and `messages` tables,
the index, Realtime publication, RLS, and the demo policies.
AR: المخطط آمن لإعادة التشغيل، وينشئ جدولي `conversations` و`messages` والفهرس والبث اللحظي وسياسات RLS التجريبية.

## 3) Find your keys / استخرج المفاتيح

EN: **Settings → API**:
- **Project URL** (e.g. `https://xxxx.supabase.co`)
- **Project API keys → `anon` `public`** (browser-safe / آمن للمتصفح)
- **Project API keys → `service_role` `secret`** (⚠️ server-only / للسيرفر فقط)

AR: من **Settings → API** ستجد: **Project URL**، ومفتاح **anon public** (للواجهة)،
ومفتاح **service_role secret** (سرّي للسيرفر فقط — لا يُوضع في المتصفح أبدًا).

## 4) Enable Realtime / فعّل البث اللحظي

EN: `schema.sql` already adds both tables to the `supabase_realtime` publication.
Verify in **Database → Replication** (or **Realtime**) that `conversations` and `messages` are enabled.
AR: المخطط يضيف الجدولين تلقائيًا لمنشور Realtime. تأكد من تفعيلهما من **Database → Replication**.

---

## ⚠️ SECURITY WARNING / تنويه أمني

EN: The **demo policies (`demo_anon_*`) are fully OPEN** — anyone with the `anon` key can read,
insert and update all conversations and messages. Use them for testing ONLY. Before production,
follow the `-- ⚠️ PRODUCTION` block in `schema.sql`: drop the demo policies, route all writes through
the server's `service_role` key, and scope visitor reads by phone/session.

AR: **السياسات التجريبية `demo_anon_*` مفتوحة بالكامل** — أي شخص يملك مفتاح `anon` يستطيع
القراءة والإضافة والتعديل على كل المحادثات والرسائل. للتجربة فقط. قبل الإنتاج طبّق كتلة
`-- ⚠️ PRODUCTION` داخل `schema.sql`: احذف السياسات التجريبية، واجعل الكتابة عبر `service_role`
من السيرفر، واقصر قراءة الزائر حسب الهاتف/الجلسة.

---

## 5) Where to paste the keys / أين تضع المفاتيح

### Admin panel → "Supabase" settings / لوحة التحكم → إعدادات "Supabase"

EN: Paste the **browser-safe** values only:
AR: ضع القيم **الآمنة للمتصفح** فقط:

```
url      = https://xxxx.supabase.co        (Project URL)
anonKey  = eyJhbGciOi...                    (anon public key)
```

EN: This is stored client-side as `ot_supabase_config` and used by `supabase-sync.js`.
AR: تُحفظ في المتصفح باسم `ot_supabase_config` ويستخدمها `supabase-sync.js`.

### WhatsApp server env / متغيرات بيئة سيرفر واتساب

EN: Server-side only. The **service_role** key must NEVER reach the browser.
AR: للسيرفر فقط. مفتاح **service_role** يجب ألا يصل للمتصفح إطلاقًا.

```
SUPABASE_URL         = https://xxxx.supabase.co
SUPABASE_SERVICE_KEY = eyJhbGciOi...        (service_role secret — keep private)
```

EN: When both are set, the WhatsApp server (`whatsapp/store.js`) reads/writes the same
`conversations` + `messages` tables via `service_role` (bypasses RLS) instead of `store.json`.
AR: عند ضبطهما، يقرأ/يكتب سيرفر واتساب على نفس الجدولين عبر `service_role` بدل `store.json`.
