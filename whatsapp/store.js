'use strict';
/**
 * store.js — طبقة التخزين لجسر واتساب (One Trip)
 * ---------------------------------------------------------------------------
 * نموذج البيانات نفسه الموجود في CHAT_CONTRACT.md (المحادثة + الرسالة).
 *
 * وضعان (DUAL MODE):
 *  1) ملف JSON محلي (store.json) — السلوك الافتراضي بدون أي إعداد.
 *  2) Supabase (PostgREST) — يُفعَّل تلقائيًا عند ضبط متغيّرَي البيئة:
 *       SUPABASE_URL + SUPABASE_SERVICE_KEY
 *     عندها يقرأ/يكتب من الجدولين conversations + messages بمفتاح service_role
 *     (نفس جداول الموقع ⇒ الوارد من واتساب يظهر فورًا في الودجة واللوحة عبر Realtime).
 *
 * كل العمليات async (الواجهة موحّدة سواء JSON أو Supabase)، و idempotent على المعرّفات.
 * التحويل JS⇄SQL حسب §8: msg.from ⇄ sender، و camelCase ⇄ snake_case.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// إعدادات الوضع
// ---------------------------------------------------------------------------
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);

const STORE_FILE = path.join(__dirname, 'store.json');

// ---------------------------------------------------------------------------
// أدوات عامة
// ---------------------------------------------------------------------------
function now() { return Date.now(); }

/** ينشئ معرّف محادثة جديد */
function newConvId() { return 'conv_' + now(); }
/** ينشئ معرّف رسالة جديد */
function newMsgId() { return 'm_' + now() + '_' + Math.random().toString(36).slice(2, 7); }

// ===========================================================================
//  وضع JSON المحلي (store.json)
// ===========================================================================
function readJsonFile() {
  try {
    if (!fs.existsSync(STORE_FILE)) return { conversations: [] };
    const raw = fs.readFileSync(STORE_FILE, 'utf8').trim();
    if (!raw) return { conversations: [] };
    const data = JSON.parse(raw);
    if (!Array.isArray(data.conversations)) data.conversations = [];
    return data;
  } catch (err) {
    console.error('[store] فشل قراءة store.json:', err.message);
    return { conversations: [] };
  }
}

function writeJsonFile(data) {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[store] فشل كتابة store.json:', err.message);
  }
}

// ===========================================================================
//  وضع Supabase (PostgREST عبر service_role)
// ===========================================================================
const sbHeaders = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
  'Content-Type': 'application/json',
};

/** نداء PostgREST عام */
async function sbFetch(table, { method = 'GET', query = '', body = null, prefer = '' } = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query ? '?' + query : ''}`;
  const headers = Object.assign({}, sbHeaders);
  if (prefer) headers['Prefer'] = prefer;
  const res = await fetch(url, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Supabase ${method} ${table} => ${res.status} ${txt}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return null;
}

// ---- تحويل المحادثة JS ⇄ SQL ----
function convToRow(c) {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone || '',
    channel: c.channel || 'web',
    status: c.status || 'open',
    assigned_to: c.assignedTo || null,
    unread_agent: c.unreadAgent || 0,
    unread_user: c.unreadUser || 0,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    meta: c.meta || {},
  };
}
function rowToConv(r) {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone || '',
    channel: r.channel || 'web',
    status: r.status || 'open',
    assignedTo: r.assigned_to || null,
    unreadAgent: r.unread_agent || 0,
    unreadUser: r.unread_user || 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    meta: r.meta || {},
    messages: [], // تُحمَّل على حدة
  };
}

// ---- تحويل الرسالة JS ⇄ SQL (msg.from ⇄ sender) ----
function msgToRow(convId, m) {
  return {
    id: m.id,
    conversation_id: convId,
    sender: m.from,
    text: m.text,
    type: m.type || 'text',
    data: m.data || null,
    ts: m.ts,
    read: !!m.read,
  };
}
function rowToMsg(r) {
  return {
    id: r.id,
    from: r.sender,
    text: r.text,
    type: r.type || 'text',
    ts: r.ts,
    read: !!r.read,
    data: r.data || null,
  };
}

// ---- عمليات Supabase ----
async function sbUpsertConv(conv) {
  await sbFetch('conversations', {
    method: 'POST',
    query: 'on_conflict=id',
    body: [convToRow(conv)],
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
}

async function sbUpsertMsg(convId, msg) {
  await sbFetch('messages', {
    method: 'POST',
    query: 'on_conflict=id',
    body: [msgToRow(convId, msg)],
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
}

async function sbListConversations() {
  const rows = await sbFetch('conversations', {
    query: 'select=*&order=updated_at.desc',
  });
  return (rows || []).map(rowToConv);
}

async function sbGetConversation(id) {
  const convs = await sbFetch('conversations', {
    query: `select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
  });
  if (!convs || !convs.length) return null;
  const conv = rowToConv(convs[0]);
  const msgs = await sbFetch('messages', {
    query: `select=*&conversation_id=eq.${encodeURIComponent(id)}&order=ts.asc`,
  });
  conv.messages = (msgs || []).map(rowToMsg);
  return conv;
}

/** يبحث عن محادثة واتساب عبر رقم الهاتف (channel=whatsapp) */
async function sbFindByPhone(phone) {
  const rows = await sbFetch('conversations', {
    query: `select=*&phone=eq.${encodeURIComponent(phone)}&channel=eq.whatsapp&order=updated_at.desc&limit=1`,
  });
  if (!rows || !rows.length) return null;
  return sbGetConversation(rows[0].id);
}

/** هل معرّف الرسالة موجود مسبقًا؟ (للـ idempotency على waId) */
async function sbMessageExists(msgId) {
  const rows = await sbFetch('messages', {
    query: `select=id&id=eq.${encodeURIComponent(msgId)}&limit=1`,
  });
  return Boolean(rows && rows.length);
}

// ===========================================================================
//  الواجهة الموحّدة (هذه فقط ما يستدعيه server.js)
// ===========================================================================

/** كل المحادثات مرتبة بـ updatedAt تنازليًا */
async function listConversations() {
  if (USE_SUPABASE) return sbListConversations();
  const data = readJsonFile();
  return data.conversations
    .slice()
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/** محادثة واحدة بمعرّفها (مع الرسائل) */
async function getConversation(id) {
  if (USE_SUPABASE) return sbGetConversation(id);
  const data = readJsonFile();
  return data.conversations.find((c) => c.id === id) || null;
}

/**
 * يضمن وجود محادثة واتساب لرقم هاتف معيّن، وإلا ينشئها.
 * @returns {Promise<Object>} المحادثة
 */
async function ensureWhatsAppConversation({ phone, name }) {
  const ts = now();
  if (USE_SUPABASE) {
    const existing = await sbFindByPhone(phone);
    if (existing) {
      // حدّث الاسم لو توفّر
      if (name && existing.name !== name) {
        existing.name = name;
        existing.updatedAt = ts;
        await sbUpsertConv(existing);
      }
      return existing;
    }
    const conv = {
      id: newConvId(),
      name: name || 'زائر',
      phone: phone || '',
      channel: 'whatsapp',
      status: 'open',
      assignedTo: null,
      unreadAgent: 0,
      unreadUser: 0,
      createdAt: ts,
      updatedAt: ts,
      messages: [],
      meta: {},
    };
    await sbUpsertConv(conv);
    return conv;
  }

  // وضع JSON
  const data = readJsonFile();
  let conv = data.conversations.find(
    (c) => c.channel === 'whatsapp' && c.phone === phone
  );
  if (conv) {
    if (name && conv.name !== name) {
      conv.name = name;
      conv.updatedAt = ts;
      writeJsonFile(data);
    }
    return conv;
  }
  conv = {
    id: newConvId(),
    name: name || 'زائر',
    phone: phone || '',
    channel: 'whatsapp',
    status: 'open',
    assignedTo: null,
    unreadAgent: 0,
    unreadUser: 0,
    createdAt: ts,
    updatedAt: ts,
    messages: [],
    meta: {},
  };
  data.conversations.push(conv);
  writeJsonFile(data);
  return conv;
}

/**
 * يضيف رسالة لمحادثة. idempotent: لو msg.id موجود مسبقًا لا يُضاف ثانيةً.
 * يطبّق قواعد العدّادات من §3:
 *   from==='user'  ⇒ unreadAgent++
 *   from==='agent' أو 'bot' ⇒ unreadUser++
 * @returns {Promise<{message:Object, conversation:Object, duplicate:boolean}>}
 */
async function addMessage(convId, msg) {
  const ts = msg.ts || now();
  const message = {
    id: msg.id || newMsgId(),
    from: msg.from || 'user',
    text: msg.text || '',
    type: msg.type || 'text',
    ts,
    read: !!msg.read,
    data: msg.data || null,
  };

  if (USE_SUPABASE) {
    // idempotency
    if (msg.id && (await sbMessageExists(msg.id))) {
      const conv = await sbGetConversation(convId);
      return { message, conversation: conv, duplicate: true };
    }
    const conv = await sbGetConversation(convId);
    if (!conv) throw new Error('conversation not found: ' + convId);
    await sbUpsertMsg(convId, message);
    // حدّث العدّادات + updatedAt
    if (message.from === 'user') conv.unreadAgent = (conv.unreadAgent || 0) + 1;
    else conv.unreadUser = (conv.unreadUser || 0) + 1;
    conv.updatedAt = ts;
    await sbUpsertConv(conv);
    conv.messages = conv.messages || [];
    conv.messages.push(message);
    return { message, conversation: conv, duplicate: false };
  }

  // وضع JSON
  const data = readJsonFile();
  const conv = data.conversations.find((c) => c.id === convId);
  if (!conv) throw new Error('conversation not found: ' + convId);
  if (!Array.isArray(conv.messages)) conv.messages = [];
  // idempotency
  if (msg.id && conv.messages.some((m) => m.id === msg.id)) {
    return { message, conversation: conv, duplicate: true };
  }
  conv.messages.push(message);
  if (message.from === 'user') conv.unreadAgent = (conv.unreadAgent || 0) + 1;
  else conv.unreadUser = (conv.unreadUser || 0) + 1;
  conv.updatedAt = ts;
  writeJsonFile(data);
  return { message, conversation: conv, duplicate: false };
}

/** يبحث عن محادثة واتساب برقم الهاتف (أو null) */
async function findByPhone(phone) {
  if (USE_SUPABASE) return sbFindByPhone(phone);
  const data = readJsonFile();
  return (
    data.conversations.find(
      (c) => c.channel === 'whatsapp' && c.phone === phone
    ) || null
  );
}

module.exports = {
  USE_SUPABASE,
  listConversations,
  getConversation,
  ensureWhatsAppConversation,
  addMessage,
  findByPhone,
  // أدوات مساعدة مكشوفة للاختبار
  _newConvId: newConvId,
  _newMsgId: newMsgId,
};
