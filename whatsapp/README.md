# One Trip — جسر واتساب (WhatsApp Business Bridge)

سيرفر خفيف بلا أي حزم npm (`node:http` + `fetch` المدمج، **Node 18+**) يربط
**WhatsApp Business Cloud API** بنظام الدردشة في موقع One Trip.

> **إطار صريح / Honest framing:**
> الموقع ثابت (static) ويعمل عبر `localStorage`. لكن webhook واتساب الحقيقي
> **يحتاج سيرفر HTTPS عامًا** — وهذا هو ذلك السيرفر. يستقبل رسائل العملاء من Meta،
> ويحفظها على **نفس أشكال البيانات** الموصوفة في `CHAT_CONTRACT.md` (محادثة/رسالة).
>
> **بدون نشر هذا السيرفر + ضبط Meta ⇒ التواصل ثنائي الاتجاه عبر واتساب معطّل.**
> أمّا الدردشة داخل الموقع (in-site chat) فتظل تعمل كالمعتاد.

---

## المسارات (Endpoints)

| Method | Path | الوظيفة |
|---|---|---|
| `GET`  | `/whatsapp/webhook` | تحقّق Meta — يردّ `hub.challenge` عند تطابق `WA_VERIFY_TOKEN`. |
| `POST` | `/whatsapp/webhook` | استقبال رسائل العملاء وحفظها كـ `channel:'whatsapp'` / `from:'user'`، **idempotent على `waId`**. |
| `GET`  | `/api/conversations` | كل المحادثات (CORS مفتوح). |
| `GET`  | `/api/conversations/:id` | محادثة واحدة بالمعرّف. |
| `POST` | `/api/send` | `{convId\|phone, text}` — يضيف رسالة موظف ويرسلها للعميل عبر Cloud API. |
| `POST` | `/api/outbox/drain` | مصفوفة `[{convId,phone,text,ts}]` (يطابق `ot_wa_outbox`) — يرسل كلًّا ويرجّع قائمة `ts` المُرسَلة. |
| `GET`  | `/health` | فحص صحّة + الوضع الحالي. |

---

## التشغيل محليًا (Local run)

```bash
cd whatsapp
cp .env.example .env      # ثم عبّئ القيم
node server.js            # أو: npm start
```

---

## إعداد Meta + WhatsApp (Setup)

1. **أنشئ تطبيق Meta**: <https://developers.facebook.com/apps> → نوع *Business*.
2. أضِف منتج **WhatsApp** للتطبيق.
3. من **WhatsApp → API Setup**:
   - انسخ **Phone Number ID** (وليس الرقم نفسه) → `WA_PHONE_NUMBER_ID`.
   - أنشئ **Permanent Access Token** عبر *System User* في *Business Settings*
     (التوكن المؤقّت يعمل للتجربة لكنه ينتهي خلال 24 ساعة) → `WA_TOKEN`.
4. **اختر `WA_VERIFY_TOKEN`**: أي نص سرّي تخترعه أنت.
5. **اضبط الـWebhook** (WhatsApp → Configuration):
   - Callback URL: `https://YOUR-DOMAIN/whatsapp/webhook`
   - Verify Token: نفس `WA_VERIFY_TOKEN`.
   - اشترك في حقل **messages**.

---

## النشر (Deployment)

> **المنفذ:** المنصّات تحقن متغيّر `PORT` تلقائيًا — والسيرفر يقرأه (`process.env.PORT`).

### Render
- *New → Blueprint* مع `render.yaml` الموجود، أو *Web Service* يدويًا:
  - **Root Directory:** `whatsapp/`
  - **Build Command:** فارغ (لا تبعيات)
  - **Start Command:** `node server.js`
  - **Health Check Path:** `/health`
  - أضِف متغيّرات البيئة: `WA_VERIFY_TOKEN`, `WA_TOKEN`, `WA_PHONE_NUMBER_ID`
    (واختياريًا `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`).

### Railway
- `railway init` ثم اربط المجلد، أو استخدم `railway.json` الموجود.
- اضبط نفس متغيّرات البيئة في تبويب *Variables*. Start Command: `node server.js`.

### Docker
```bash
cd whatsapp
docker build -t onetrip-wa .
docker run -p 3000:3000 --env-file .env onetrip-wa
```

### اختبار محلي بنطاق عام (cloudflared / ngrok)
لأن webhook يحتاج HTTPS عامًا، استخدم نفقًا أثناء التطوير:
```bash
# cloudflared
cloudflared tunnel --url http://localhost:3000
# أو ngrok
ngrok http 3000
```
ثم ضع رابط `https://...trycloudflare.com/whatsapp/webhook` (أو ngrok) في لوحة Meta.

---

## وضع Supabase (Supabase mode) — المسار الموصى به للإنتاج

اضبط متغيّرَي البيئة:

```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_KEY=service-role-key   # سرّي — على السيرفر فقط
```

عندها يكتب/يقرأ الجسر مباشرةً من جدولَي **`conversations` + `messages`** المشتركين
(عبر `service_role` على PostgREST: `${SUPABASE_URL}/rest/v1/<table>`) بدلًا من `store.json`.
النتيجة:

> **الوارد من واتساب يظهر فورًا في دردشة الموقع وفي لوحة التحكم** عبر Supabase Realtime،
> لأن السيرفر يكتب على **نفس الجداول** التي تقرأ منها الواجهة عبر `supabase-sync.js`.

**التحويل (mapping) حسب §8 من العقد:**
`msg.from` ⇄ `sender`، و camelCase ⇄ snake_case
(`assignedTo`⇄`assigned_to`, `unreadAgent`⇄`unread_agent`, `createdAt`⇄`created_at`, `updatedAt`⇄`updated_at`).
الـupsert يتم عبر `Prefer: resolution=merge-duplicates` و `on_conflict=id` ⇒ idempotent.

**بدون** هذين المتغيّرين ⇒ الجسر يعمل بـ `store.json` المحلي (fallback سليم تمامًا، لا شيء يتغيّر في الواجهة).

> **تنبيه أمني:** `SUPABASE_SERVICE_KEY` يتخطّى RLS — يجب أن يبقى على السيرفر فقط،
> ولا يوضع أبدًا في كود الواجهة أو في مستودع عام.

---

## كيف يرتبط الجسر بالواجهة (Front-end mapping)

- الواجهة تكتب الرسائل الصادرة في طابور `ot_wa_outbox`
  (`[{convId,phone,text,ts,sent:false}]`) — وهذا الجسر ينزّفه عبر `POST /api/outbox/drain`.
- جسر الواجهة `OneTrip.Chat.WhatsApp` (في `chat.js`) يستقبل الوارد عبر
  `ingestInbound({phone,name,text,waId})` — وهو نفس الشكل الذي يطبّعه هذا السيرفر من حمولة Meta.
- إعدادات الأدمن `ot_wa_config` (`{enabled, businessPhone, phoneNumberId, token, verifyToken}`)
  تطابق متغيّرات البيئة هنا: `phoneNumberId→WA_PHONE_NUMBER_ID`, `token→WA_TOKEN`, `verifyToken→WA_VERIFY_TOKEN`.
- **المسار الموصى به للإنتاج:** Supabase (الكتابة عبر `service_role` من السيرفر) ⇒
  مزامنة حيّة عبر كل الأجهزة بدل تبادل localStorage.

---

## أوامر اختبار (curl)

**1) تحقّق الـwebhook (يجب أن يردّ `test123`):**
```bash
curl "http://localhost:3000/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test123"
```

**2) محاكاة رسالة واردة (باستخدام `webhook-sample.json`):**
```bash
curl -X POST http://localhost:3000/whatsapp/webhook \
  -H "Content-Type: application/json" \
  --data @webhook-sample.json
```

**3) عرض المحادثات:**
```bash
curl http://localhost:3000/api/conversations
```

**4) إرسال رد موظف للعميل:**
```bash
curl -X POST http://localhost:3000/api/send \
  -H "Content-Type: application/json" \
  -d '{"phone":"201234567890","text":"أهلًا بك في One Trip! كيف نخدمك؟"}'
```

**5) تنزيف الطابور (outbox drain):**
```bash
curl -X POST http://localhost:3000/api/outbox/drain \
  -H "Content-Type: application/json" \
  -d '[{"convId":"conv_1","phone":"201234567890","text":"رسالة من الطابور","ts":1719240000000}]'
```

> ملاحظة: الإرسال الفعلي للعميل (#4 و #5) يحتاج `WA_TOKEN` + `WA_PHONE_NUMBER_ID`
> صحيحَين ورقمًا ضمن نافذة 24 ساعة أو قالبًا معتمدًا (template). بدونها تُحفظ الرسالة
> محليًا لكن لا تُسلَّم.

---

## البنية (Files)

| الملف | الوظيفة |
|---|---|
| `server.js` | السيرفر والمسارات + إرسال Cloud API. |
| `store.js` | تخزين مزدوج: `store.json` افتراضيًا أو Supabase عند ضبط البيئة. |
| `package.json` | بلا تبعيات، `start`, `engines node>=18`. |
| `.env.example` | قالب متغيّرات البيئة. |
| `webhook-sample.json` | حمولة Cloud API نموذجية للاختبار. |
| `Dockerfile` / `render.yaml` / `railway.json` | ملفات النشر. |
| `.gitignore` / `.dockerignore` | تجاهل `node_modules`, `.env`, `store.json`. |
