'use strict';
/**
 * server.js — جسر واتساب الأعمال (WhatsApp Business Cloud API) لموقع One Trip
 * ---------------------------------------------------------------------------
 * سيرفر خفيف بلا أي حزم npm (node:http + fetch المدمج، Node 18+).
 *
 * الموقع نفسه ثابت ويعمل عبر localStorage، لكن webhook واتساب الحقيقي يحتاج
 * سيرفر HTTPS عام — هذا هو ذلك السيرفر، ويُسقِط بياناته على نفس أشكال الـchat
 * المعرّفة في CHAT_CONTRACT.md، فيظهر الوارد في الودجة واللوحة (عبر Supabase Realtime).
 *
 * المسارات (Endpoints):
 *   GET  /whatsapp/webhook   — تحقّق Meta (echo hub.challenge)
 *   POST /whatsapp/webhook   — استقبال رسائل العملاء وحفظها (idempotent على waId)
 *   GET  /api/conversations        — كل المحادثات
 *   GET  /api/conversations/:id    — محادثة واحدة
 *   POST /api/send                 — إرسال رد موظف للعميل عبر Cloud API
 *   POST /api/outbox/drain         — تنزيف طابور ot_wa_outbox
 *   GET  /health                   — فحص صحّة
 */

const http = require('http');
const store = require('./store');

// ---------------------------------------------------------------------------
// إعدادات البيئة
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '3000', 10);
const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || '';
const WA_TOKEN = process.env.WA_TOKEN || '';
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID || '';
const GRAPH_VERSION = process.env.WA_GRAPH_VERSION || 'v19.0';

// ---------------------------------------------------------------------------
// أدوات HTTP مساعدة
// ---------------------------------------------------------------------------

/** يضيف ترويسات CORS متساهلة (الموقع يستهلك الـAPI من نطاق آخر) */
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sendJson(res, status, obj) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function sendText(res, status, text) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

/** يقرأ جسم الطلب ويفكّه كـJSON (مع حدّ حجم بسيط) */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1e6) { // ~1MB
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (err) { reject(new Error('invalid JSON: ' + err.message)); }
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// إرسال رسالة نصية عبر WhatsApp Cloud API
// ---------------------------------------------------------------------------
/**
 * يرسل رسالة نصية لعميل واتساب.
 * @returns {Promise<{ok:boolean, status:number, body:any}>}
 */
async function sendWhatsAppText(toPhone, text) {
  if (!WA_TOKEN || !WA_PHONE_NUMBER_ID) {
    return { ok: false, status: 0, body: { error: 'WA_TOKEN / WA_PHONE_NUMBER_ID غير مضبوطة' } };
  }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${WA_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toPhone,
    type: 'text',
    text: { preview_url: false, body: text },
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + WA_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: { error: err.message } };
  }
}

// ---------------------------------------------------------------------------
// معالجات المسارات
// ---------------------------------------------------------------------------

/** GET /whatsapp/webhook — تحقّق Meta */
function handleWebhookVerify(req, res, url) {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token && token === WA_VERIFY_TOKEN) {
    console.log('[webhook] تم التحقّق بنجاح');
    return sendText(res, 200, challenge || '');
  }
  console.warn('[webhook] فشل التحقّق (verify_token غير مطابق)');
  return sendText(res, 403, 'Forbidden');
}

/**
 * POST /whatsapp/webhook — استقبال أحداث Cloud API.
 * يستخرج رسائل العملاء من entry[].changes[].value.messages[]
 * ويحفظها كـ channel:'whatsapp' / from:'user'، idempotent على waId.
 */
async function handleWebhookInbound(req, res) {
  let payload;
  try {
    payload = await readBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  // نردّ 200 سريعًا دائمًا حتى لا تعيد Meta الإرسال؛ نعالج بعد القراءة.
  const results = [];
  try {
    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = (change && change.value) || {};
        const contacts = Array.isArray(value.contacts) ? value.contacts : [];
        const messages = Array.isArray(value.messages) ? value.messages : [];
        // خريطة الهاتف ⇒ اسم البروفايل
        const nameByWaId = {};
        for (const c of contacts) {
          if (c && c.wa_id) nameByWaId[c.wa_id] = (c.profile && c.profile.name) || '';
        }
        for (const m of messages) {
          // نتعامل فقط مع الرسائل النصّية (يمكن التوسّع لاحقًا)
          const phone = m.from || '';
          const waId = m.id || '';
          const text =
            (m.text && m.text.body) ||
            (m.button && m.button.text) ||
            (m.interactive && (
              (m.interactive.button_reply && m.interactive.button_reply.title) ||
              (m.interactive.list_reply && m.interactive.list_reply.title)
            )) ||
            '';
          if (!phone || !waId) continue;
          const name = nameByWaId[phone] || '';

          try {
            const norm = { phone, name, text, waId };
            const conv = await store.ensureWhatsAppConversation({
              phone: norm.phone,
              name: norm.name,
            });
            // معرّف الرسالة = waId ⇒ idempotency تلقائي
            const { duplicate } = await store.addMessage(conv.id, {
              id: norm.waId,
              from: 'user',
              text: norm.text,
              type: 'text',
              ts: m.timestamp ? parseInt(m.timestamp, 10) * 1000 : Date.now(),
              read: false,
              data: { waId: norm.waId },
            });
            results.push({ waId, convId: conv.id, duplicate });
          } catch (err) {
            console.error('[webhook] خطأ حفظ رسالة:', err.message);
            results.push({ waId, error: err.message });
          }
        }
      }
    }
  } catch (err) {
    console.error('[webhook] خطأ معالجة الحمولة:', err.message);
  }

  return sendJson(res, 200, { received: true, processed: results });
}

/** GET /api/conversations */
async function handleListConversations(req, res) {
  try {
    const convs = await store.listConversations();
    return sendJson(res, 200, { conversations: convs });
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }
}

/** GET /api/conversations/:id */
async function handleGetConversation(req, res, id) {
  try {
    const conv = await store.getConversation(id);
    if (!conv) return sendJson(res, 404, { error: 'not found' });
    return sendJson(res, 200, { conversation: conv });
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }
}

/**
 * POST /api/send — {convId|phone, text}
 * يضيف رسالة موظف (from:'agent') للتخزين ثم يرسلها للعميل عبر Cloud API.
 */
async function handleSend(req, res) {
  let body;
  try { body = await readBody(req); }
  catch (err) { return sendJson(res, 400, { error: err.message }); }

  const text = (body.text || '').toString();
  if (!text.trim()) return sendJson(res, 400, { error: 'text مطلوب' });

  try {
    // حدّد المحادثة بالـconvId أو بالهاتف
    let conv = null;
    if (body.convId) conv = await store.getConversation(body.convId);
    if (!conv && body.phone) conv = await store.findByPhone(body.phone);
    if (!conv && body.phone) {
      conv = await store.ensureWhatsAppConversation({ phone: body.phone, name: '' });
    }
    if (!conv) return sendJson(res, 404, { error: 'لم يُعثر على محادثة (مرّر convId أو phone)' });

    const phone = conv.phone || body.phone;
    if (!phone) return sendJson(res, 400, { error: 'لا يوجد رقم هاتف للوجهة' });

    // أضف رسالة الموظف للتخزين (viaWhatsApp في data كما في §3)
    await store.addMessage(conv.id, {
      from: 'agent',
      text,
      type: 'text',
      ts: Date.now(),
      read: false,
      data: { viaWhatsApp: true },
    });

    // أرسل عبر Cloud API
    const wa = await sendWhatsAppText(phone, text);
    return sendJson(res, wa.ok ? 200 : 502, {
      stored: true,
      delivered: wa.ok,
      waStatus: wa.status,
      waResponse: wa.body,
      convId: conv.id,
    });
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }
}

/**
 * POST /api/outbox/drain — مصفوفة [{convId,phone,text,ts}]
 * يرسل كل عنصر عبر Cloud API ويرجّع قائمة ts التي أُرسلت بنجاح.
 * (يطابق طابور ot_wa_outbox في الموقع.)
 */
async function handleOutboxDrain(req, res) {
  let body;
  try { body = await readBody(req); }
  catch (err) { return sendJson(res, 400, { error: err.message }); }

  const items = Array.isArray(body) ? body : (Array.isArray(body.items) ? body.items : []);
  if (!items.length) return sendJson(res, 400, { error: 'متوقّع مصفوفة [{convId,phone,text,ts}]' });

  const sent = [];
  const failed = [];
  for (const it of items) {
    const phone = it.phone;
    const text = it.text;
    if (!phone || !text) { failed.push({ ts: it.ts, error: 'phone/text مفقود' }); continue; }
    try {
      // اكتب الرسالة للتخزين إن توفّر convId/phone
      try {
        let conv = null;
        if (it.convId) conv = await store.getConversation(it.convId);
        if (!conv) conv = await store.findByPhone(phone);
        if (!conv) conv = await store.ensureWhatsAppConversation({ phone, name: '' });
        await store.addMessage(conv.id, {
          from: 'agent',
          text,
          type: 'text',
          ts: it.ts || Date.now(),
          read: false,
          data: { viaWhatsApp: true, outbox: true },
        });
      } catch (e) {
        console.warn('[outbox] تعذّر حفظ الرسالة محليًا:', e.message);
      }
      const wa = await sendWhatsAppText(phone, text);
      if (wa.ok) sent.push(it.ts);
      else failed.push({ ts: it.ts, status: wa.status, error: wa.body });
    } catch (err) {
      failed.push({ ts: it.ts, error: err.message });
    }
  }
  return sendJson(res, 200, { sent, failed });
}

// ---------------------------------------------------------------------------
// التوجيه (Router)
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathName = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method || 'GET';

  // CORS preflight
  if (method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    return res.end();
  }

  try {
    // فحص الصحّة
    if (method === 'GET' && (pathName === '/health' || pathName === '/')) {
      return sendJson(res, 200, {
        ok: true,
        service: 'one-trip-whatsapp-bridge',
        mode: store.USE_SUPABASE ? 'supabase' : 'json-file',
      });
    }

    // webhook
    if (pathName === '/whatsapp/webhook') {
      if (method === 'GET') return handleWebhookVerify(req, res, url);
      if (method === 'POST') return handleWebhookInbound(req, res);
    }

    // المحادثات
    if (pathName === '/api/conversations' && method === 'GET') {
      return handleListConversations(req, res);
    }
    const convMatch = pathName.match(/^\/api\/conversations\/([^/]+)$/);
    if (convMatch && method === 'GET') {
      return handleGetConversation(req, res, decodeURIComponent(convMatch[1]));
    }

    // الإرسال
    if (pathName === '/api/send' && method === 'POST') {
      return handleSend(req, res);
    }

    // تنزيف الطابور
    if (pathName === '/api/outbox/drain' && method === 'POST') {
      return handleOutboxDrain(req, res);
    }

    return sendJson(res, 404, { error: 'not found', path: pathName });
  } catch (err) {
    console.error('[server] خطأ غير متوقّع:', err);
    return sendJson(res, 500, { error: 'internal error' });
  }
});

server.listen(PORT, () => {
  console.log(`One Trip WhatsApp bridge يعمل على المنفذ ${PORT}`);
  console.log(`الوضع (mode): ${store.USE_SUPABASE ? 'Supabase (shared tables)' : 'store.json (local)'}`);
  if (!WA_TOKEN || !WA_PHONE_NUMBER_ID) {
    console.warn('تنبيه: WA_TOKEN / WA_PHONE_NUMBER_ID غير مضبوطة — الإرسال للعميل لن يعمل.');
  }
});

module.exports = server;
