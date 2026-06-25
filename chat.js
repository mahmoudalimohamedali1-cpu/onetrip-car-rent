/* ============================================================
   One Trip — chat data layer (SINGLE SOURCE OF TRUTH)
   ------------------------------------------------------------
   طبقة بيانات الدردشة الموحّدة لخدمة العملاء (RTL, عربي).
   كل من يبني جزءًا من الشات يقرأ/يكتب من هنا فقط:
     - ودجة الموقع (chat-widget.js)  → currentConversation / sendMessage / botReply
     - لوحة التحكم (admin.html)       → listConversations / unreadAgentTotal / assign
     - جسر واتساب (whatsapp/)         → WhatsApp.ingestInbound / outbox / markSent

   المخزن الآن تجريبي عبر localStorage (نفس نمط cars.js) ويتبدّل إلى
   Supabase لاحقًا بنفس الأشكال (انظر CHAT_CONTRACT.md). كل وصول
   لـlocalStorage داخل try/catch ولا يُرمى أي خطأ للمستدعي.

   Realtime: كل تعديل يبثّ {type:'change'} عبر BroadcastChannel('ot_chat')
   ومستمع window 'storage' على 'ot_chats' كاحتياطي عبر التبويبات.
   ============================================================ */
;(function(){
  'use strict';

  /* ---- مفاتيح التخزين ---- */
  var K_CHATS    = 'ot_chats';
  var K_SESSION  = 'ot_chat_session';
  var K_WACONFIG = 'ot_wa_config';
  var K_WAOUTBOX = 'ot_wa_outbox';
  var K_BRANCHES = 'ot_branches';
  var K_LEADS    = 'ot_leads';
  var K_SETTINGS = 'ot_chat_settings';
  var K_SURVEYS  = 'ot_surveys';

  /* إعدادات الشات الافتراضية (v2) — تُدمج فوقها قيم localStorage */
  var DEFAULT_SETTINGS = {
    closeMessage: 'تم إنهاء المحادثة. شكرًا لتواصلك مع One Trip 🌟 نتمنى أن نكون قدّمنا لك خدمة مميزة.',
    surveyEnabled: true,
    surveyQuestion: 'كيف تقيّم خدمتنا؟',
    waitingMessage: 'جميع موظفينا مشغولون حاليًا بالرد على عملاء آخرين 🙏 برجاء الانتظار وسيتم الرد عليك في أقرب وقت.',
    reassignMinutes: 3   /* لو الموظف ما فتحش المحادثة خلال هذه المدة تتحوّل لموظف آخر (0 = إيقاف) */
  };

  /* فرع افتراضي عند غياب ot_branches */
  var DEFAULT_BRANCHES = [
    { name:'فرع العليا', city:'الرياض', phone:'920000000' }
  ];

  /* عدّاد داخلي لتفادي تصادم نفس الميلّي-ثانية في المعرّفات */
  var seq = 0;
  function uid(prefix){ seq++; return prefix + Date.now() + '_' + seq; }

  /* ------------------------------------------------------------
     طبقة التخزين (محروسة بالكامل — لا ترمي أبدًا)
     ------------------------------------------------------------ */
  function readJSON(key, fallback){
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var val = JSON.parse(raw);
      return (val == null) ? fallback : val;
    } catch(e){ return fallback; }
  }
  function writeJSON(key, val){
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch(e){ return false; }
  }
  function readStr(key, fallback){
    try { var v = localStorage.getItem(key); return (v == null) ? fallback : v; }
    catch(e){ return fallback; }
  }
  function writeStr(key, val){
    try { localStorage.setItem(key, val); return true; } catch(e){ return false; }
  }

  function loadChats(){
    var arr = readJSON(K_CHATS, []);
    return Array.isArray(arr) ? arr : [];
  }
  function saveChats(arr){ writeJSON(K_CHATS, arr || []); }

  /* ------------------------------------------------------------
     البث (Realtime) — BroadcastChannel + window 'storage'
     ------------------------------------------------------------ */
  var listeners = { change: [] };
  var bc = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('ot_chat');
      bc.onmessage = function(ev){
        if (ev && ev.data && ev.data.type === 'change') fire('change');
      };
    }
  } catch(e){ bc = null; }

  try {
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('storage', function(ev){
        if (ev && ev.key === K_CHATS) fire('change');
      });
    }
  } catch(e){}

  var firing = false;
  function fire(event){
    var cbs = listeners[event];
    if (!cbs) return;
    if (firing) return;            // حماية من التكرار المتداخل (re-entrancy) — يكسر أي حلقة بثّ لا نهائية
    firing = true;
    try {
      for (var i = 0; i < cbs.length; i++){
        try { cbs[i](); } catch(e){}
      }
    } finally { firing = false; }
  }

  /* emit: يُستدعى بعد أي تعديل — يبثّ للتبويبات الأخرى ثم يطلق محليًا */
  function emit(){
    try { if (bc) bc.postMessage({ type:'change' }); } catch(e){}
    fire('change');
  }

  function on(event, cb){
    if (!listeners[event]) listeners[event] = [];
    if (typeof cb === 'function') listeners[event].push(cb);
  }
  function off(event, cb){
    var cbs = listeners[event];
    if (!cbs) return;
    for (var i = cbs.length - 1; i >= 0; i--){
      if (cbs[i] === cb) cbs.splice(i, 1);
    }
  }

  /* ------------------------------------------------------------
     قراءة
     ------------------------------------------------------------ */
  function byUpdatedDesc(a, b){ return (b.updatedAt || 0) - (a.updatedAt || 0); }

  function listConversations(){
    return loadChats().slice().sort(byUpdatedDesc);
  }

  function findIndex(arr, id){
    for (var i = 0; i < arr.length; i++){ if (arr[i].id === id) return i; }
    return -1;
  }

  function getConversation(id){
    var arr = loadChats();
    var i = findIndex(arr, id);
    return i === -1 ? null : arr[i];
  }

  function currentConversation(){
    var sid = readStr(K_SESSION, '');
    if (!sid) return null;
    return getConversation(sid);
  }

  function unreadAgentTotal(){
    var arr = loadChats(), total = 0;
    for (var i = 0; i < arr.length; i++){ total += (arr[i].unreadAgent || 0); }
    return total;
  }

  /* ------------------------------------------------------------
     كتابة
     ------------------------------------------------------------ */
  function newConversation(opts){
    opts = opts || {};
    var now = Date.now();
    return {
      id: uid('conv_'),
      name: opts.name || 'زائر',
      phone: opts.phone || '',
      channel: opts.channel || 'web',
      status: 'open',
      assignedTo: null,
      assignedAt: 0,           /* وقت آخر إسناد (لحساب التحويل عند تأخر الموظف) */
      agentOpened: false,      /* هل فتح الموظف المحادثة في اللوحة؟ */
      waitingNotified: false,  /* هل أُرسلت رسالة الانتظار في فترة الانتظار الحالية؟ */
      unreadAgent: 0,
      unreadUser: 0,
      createdAt: now,
      updatedAt: now,
      messages: [],
      meta: opts.meta || {}
    };
  }

  /* ---- توزيع المحادثات على الموظفين (round-robin بأقل حِمل) ---- */
  function agents(){
    var us = readJSON('ot_users', []);
    if (!Array.isArray(us)) return [];
    return us.filter(function(u){ return u && u.role === 'agent'; });
  }
  /* عدد المحادثات النشطة (غير المقفولة) المسنودة لكل موظف */
  function agentLoad(){
    var arr = loadChats(), load = {};
    for (var i = 0; i < arr.length; i++){
      var c = arr[i];
      if (c.status !== 'closed' && c.assignedTo) load[c.assignedTo] = (load[c.assignedTo] || 0) + 1;
    }
    return load;
  }
  /* اختيار الموظف الأقل حِملًا (الفاضي) — مع استبعاد موظف معيّن عند التحويل */
  function pickAgent(excludeId){
    var ags = agents(); if (!ags.length) return null;
    var load = agentLoad(), best = null, bestN = Infinity;
    for (var i = 0; i < ags.length; i++){
      var id = ags[i].id;
      if (excludeId && id === excludeId) continue;
      var n = load[id] || 0;
      if (n < bestN){ bestN = n; best = id; }
    }
    return best;
  }
  /* إسناد تلقائي لكائن محادثة (قبل الحفظ) */
  function autoAssignConv(conv, excludeId){
    var id = pickAgent(excludeId || null);
    if (id){ conv.assignedTo = id; conv.assignedAt = Date.now(); conv.agentOpened = false; conv.waitingNotified = false; }
    return id;
  }

  function startConversation(opts){
    var arr = loadChats();
    var conv = newConversation(opts);
    autoAssignConv(conv);            /* وجّه المحادثة الجديدة لأقل موظف حِملًا */
    arr.push(conv);
    saveChats(arr);
    writeStr(K_SESSION, conv.id);
    emit();
    return conv;
  }

  function newMessage(msg){
    msg = msg || {};
    return {
      id: uid('m_'),
      from: msg.from || 'user',
      text: (msg.text == null ? '' : String(msg.text)),
      type: msg.type || 'text',
      ts: Date.now(),
      read: false,
      data: (msg.data == null ? null : msg.data)
    };
  }

  /* sendMessage — القاعدة الأساسية للعدّادات:
       from==='user'              ⇒ unreadAgent++
       from==='agent' || 'bot'    ⇒ unreadUser++
     ثم تحديث updatedAt وبثّ 'change'. */
  function sendMessage(convId, msg){
    var arr = loadChats();
    var i = findIndex(arr, convId);
    if (i === -1) return null;
    var conv = arr[i];

    var m = newMessage(msg);
    if (!Array.isArray(conv.messages)) conv.messages = [];
    conv.messages.push(m);

    if (m.from === 'user') {
      conv.unreadAgent = (conv.unreadAgent || 0) + 1;
    } else if (m.from === 'agent' || m.from === 'bot') {
      conv.unreadUser = (conv.unreadUser || 0) + 1;
    }
    conv.updatedAt = Date.now();

    /* رسالة موظف على محادثة واتساب تُدفع لطابور الصادر،
       إلا إذا كانت أصلًا قادمة من واتساب (data.viaWhatsApp=true) */
    if (conv.channel === 'whatsapp' && m.from === 'agent') {
      var viaWA = !!(m.data && m.data.viaWhatsApp);
      if (!viaWA) enqueueOutbound(convId, m.text);
    }

    saveChats(arr);
    emit();
    return m;
  }

  function markRead(convId, side){
    var arr = loadChats();
    var i = findIndex(arr, convId);
    if (i === -1) return;
    var conv = arr[i];
    var changed = false;          // نبثّ فقط لو فعلًا اتغيّر حاجة — يكسر حلقة rerender↔markRead

    if (side === 'agent') {
      if (conv.unreadAgent) { conv.unreadAgent = 0; changed = true; }
      if (Array.isArray(conv.messages)) {
        for (var a = 0; a < conv.messages.length; a++){
          if (conv.messages[a].from === 'user' && !conv.messages[a].read) { conv.messages[a].read = true; changed = true; }
        }
      }
    } else if (side === 'user') {
      if (conv.unreadUser) { conv.unreadUser = 0; changed = true; }
      if (Array.isArray(conv.messages)) {
        for (var u = 0; u < conv.messages.length; u++){
          var f = conv.messages[u].from;
          if ((f === 'agent' || f === 'bot') && !conv.messages[u].read) { conv.messages[u].read = true; changed = true; }
        }
      }
    }
    if (!changed) return;
    saveChats(arr);
    emit();
  }

  function setStatus(convId, status){
    var arr = loadChats();
    var i = findIndex(arr, convId);
    if (i === -1) return;
    var conv = arr[i];
    var wasClosed = (conv.status === 'closed');
    conv.status = status;
    conv.updatedAt = Date.now();

    /* التحويل لـ'closed' (ولو لم تكن مقفولة قبل كده):
       رسالة إغلاق + تفعيل التقييم. لا نكرّر لو كانت مقفولة بالفعل. */
    if (status === 'closed' && !wasClosed) {
      /* نضيف رسالة الإغلاق على نفس مسار الإلحاق الذي يستخدمه sendMessage
         (إلحاق + عدّاد + updatedAt + طابور واتساب لو لزم) بدون emit مزدوج —
         نحفظ ونبثّ مرة واحدة في نهاية setStatus. ملاحظة: from:'bot' فلا يقلب الحالة ولا يستدعي botReply. */
      var s = settings();
      var m = newMessage({ from:'bot', type:'system', text:s.closeMessage, data:{ kind:'close' } });
      if (!Array.isArray(conv.messages)) conv.messages = [];
      conv.messages.push(m);
      conv.unreadUser = (conv.unreadUser || 0) + 1;   // bot ⇒ unreadUser++ (نفس قاعدة sendMessage)
      conv.updatedAt = Date.now();
      if (conv.channel === 'whatsapp') {
        var viaWA = !!(m.data && m.data.viaWhatsApp);
        if (!viaWA) enqueueOutbound(convId, m.text);
      }
      /* تفعيل بطاقة التقييم لو مفعّل ولا يوجد تقييم سابق */
      if (s.surveyEnabled && !conv.survey) conv.surveyPending = true;
    }

    saveChats(arr);
    emit();
  }

  function assign(convId, agentName){
    var arr = loadChats();
    var i = findIndex(arr, convId);
    if (i === -1) return;
    var conv = arr[i];
    var changed = (conv.assignedTo !== (agentName || null));
    conv.assignedTo = agentName || null;
    /* عند الإسناد لموظف مختلف: يبدأ مؤقّت جديد والموظف الجديد لازم يفتح المحادثة */
    if (changed){
      conv.assignedAt = agentName ? Date.now() : 0;
      conv.agentOpened = false;
      conv.waitingNotified = false;
    }
    conv.updatedAt = Date.now();
    saveChats(arr);
    emit();
  }

  /* markOpened — الموظف فتح المحادثة في اللوحة: يوقف رسائل الانتظار والتحويل التلقائي.
     لو غير مسنودة يسنِدها لمن فتحها (بدون إعادة ضبط agentOpened). */
  function markOpened(convId, byId){
    var arr = loadChats();
    var i = findIndex(arr, convId);
    if (i === -1) return;
    var conv = arr[i], changed = false;
    if (!conv.agentOpened){ conv.agentOpened = true; changed = true; }
    if (byId && !conv.assignedTo){ conv.assignedTo = byId; conv.assignedAt = Date.now(); changed = true; }
    if (changed){ conv.updatedAt = Date.now(); saveChats(arr); emit(); }
  }

  /* checkReassign — لو الموظف ما فتحش المحادثة خلال reassignMinutes، حوّلها لموظف آخر فاضي */
  function checkReassign(convId){
    var mins = parseInt(settings().reassignMinutes, 10);
    if (!mins || mins <= 0) return false;
    var arr = loadChats();
    var i = findIndex(arr, convId);
    if (i === -1) return false;
    var conv = arr[i];
    if (conv.status === 'closed' || conv.agentOpened) return false;
    if (!conv.assignedTo || !(conv.assignedAt > 0)) return false;
    if (Date.now() - conv.assignedAt < mins * 60000) return false;
    var next = pickAgent(conv.assignedTo);
    if (!next || next === conv.assignedTo) return false;   /* لا يوجد موظف آخر فاضي */
    conv.assignedTo = next;
    conv.assignedAt = Date.now();
    conv.waitingNotified = false;
    conv.updatedAt = Date.now();
    saveChats(arr);
    emit();
    return true;
  }
  /* reassignSweep — فحص دوري لكل المحادثات المتأخرة (تستدعيه اللوحة كل فترة) */
  function reassignSweep(){
    var arr = loadChats(), any = false;
    for (var i = 0; i < arr.length; i++){
      var c = arr[i];
      if (c.status !== 'closed' && !c.agentOpened && c.assignedTo) {
        if (checkReassign(c.id)) any = true;
      }
    }
    return any;
  }

  function deleteConversation(id){
    var arr = loadChats();
    var i = findIndex(arr, id);
    if (i === -1) return;
    arr.splice(i, 1);
    saveChats(arr);
    try { if (readStr(K_SESSION, '') === id) writeStr(K_SESSION, ''); } catch(e){}
    emit();
  }

  /* ------------------------------------------------------------
     الخدمات السريعة + الرد الآلي
     ------------------------------------------------------------ */
  /* أيقونات SVG مضمّنة (stroke currentColor) */
  var ICONS = {
    prices:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    branches:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    book:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
    longterm:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    corporate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><line x1="9" y1="9" x2="9" y2="9"/><line x1="9" y1="13" x2="9" y2="13"/></svg>',
    status:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    agent:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>'
  };

  function quickServices(){
    return [
      { id:'prices',    label:'أسعار السيارات', icon:ICONS.prices,    kind:'reply' },
      { id:'branches',  label:'الفروع والمواقع', icon:ICONS.branches,  kind:'reply' },
      { id:'book',      label:'احجز الآن',       icon:ICONS.book,      kind:'link', href:'create-booking.html' },
      { id:'longterm',  label:'باقات شهرية',     icon:ICONS.longterm,  kind:'link', href:'long-term.html' },
      { id:'corporate', label:'حلول الشركات',    icon:ICONS.corporate, kind:'link', href:'corporate.html' },
      { id:'status',    label:'حالة طلبي',       icon:ICONS.status,    kind:'reply' },
      { id:'agent',     label:'التحدث مع موظف',  icon:ICONS.agent,     kind:'reply' }
    ];
  }

  /* ---- مولّدات نصوص الخدمات (تقرأ من بيانات المشروع الحقيقية) ---- */
  function pricesPayload(){
    var cars = [];
    try {
      if (window.OneTrip && typeof window.OneTrip.bookingCars === 'function') {
        cars = window.OneTrip.bookingCars() || [];
      }
    } catch(e){ cars = []; }
    var items = [];
    for (var i = 0; i < cars.length; i++){
      items.push({ name: cars[i].name, price: cars[i].price, unit:'يوم', currency:'ريال' });
    }
    return items;
  }
  function pricesText(){
    var items = pricesPayload();
    if (!items.length) return 'لا تتوفر أسعار حاليًا. تواصل معنا وسنساعدك.';
    var lines = ['أسعار السيارات (لليوم):'];
    for (var i = 0; i < items.length; i++){
      lines.push('• ' + items[i].name + ' — ' + items[i].price + ' ريال/يوم');
    }
    return lines.join('\n');
  }

  function branchesList(){
    var arr = readJSON(K_BRANCHES, null);
    if (!Array.isArray(arr) || !arr.length) arr = DEFAULT_BRANCHES;
    return arr;
  }
  function branchesText(){
    var arr = branchesList();
    var lines = ['فروعنا ومواقعنا:'];
    for (var i = 0; i < arr.length; i++){
      var b = arr[i];
      var name = b.name || 'فرع';
      var city = b.city ? (' — ' + b.city) : '';
      var phone = (b.phone || b.tel || b.mobile) ? (' — هاتف: ' + (b.phone || b.tel || b.mobile)) : '';
      lines.push('• ' + name + city + phone);
    }
    return lines.join('\n');
  }

  function digitsOnly(s){ return String(s == null ? '' : s).replace(/\D/g, ''); }

  /* البحث عن طلب في ot_leads بالرقم (phone||mobile||tel) مع آخر 9 أرقام كاحتياطي */
  function findLeadByPhone(phone){
    var leads = readJSON(K_LEADS, []);
    if (!Array.isArray(leads) || !leads.length) return null;
    var target = digitsOnly(phone);
    if (!target) return null;
    var tail = target.slice(-9);
    for (var i = leads.length - 1; i >= 0; i--){
      var L = leads[i] || {};
      var p = digitsOnly(L.phone || L.mobile || L.tel || '');
      if (!p) continue;
      if (p === target) return L;
      if (tail && p.slice(-9) === tail) return L;
    }
    return null;
  }
  function statusText(conv){
    var phone = conv && conv.phone ? conv.phone : '';
    if (!phone) return 'للاستعلام عن حالة طلبك، يرجى تزويدنا برقم الجوال المستخدم في الحجز.';
    var lead = findLeadByPhone(phone);
    if (!lead) return 'لم نعثر على طلب مرتبط بالرقم ' + phone + '. تأكد من الرقم أو تواصل مع موظف الخدمة.';
    var st = lead.status || lead.state || 'قيد المعالجة';
    var name = lead.name ? (' باسم ' + lead.name) : '';
    return 'حالة طلبك' + name + ': ' + st + '.';
  }

  function agentText(){ return 'تم تحويلك إلى فريق خدمة العملاء، وسيتم الرد عليك في أقرب وقت 🙏'; }

  /* runQuickService — ينفّذ خدمة بالمعرّف ويضيف ردّها (from:'bot') للمحادثة */
  function runQuickService(convId, serviceId){
    var conv = getConversation(convId);
    if (!conv) return null;

    if (serviceId === 'prices') {
      return sendMessage(convId, { from:'bot', type:'card', text:pricesText(), data:{ service:'prices', items:pricesPayload() } });
    }
    if (serviceId === 'branches') {
      return sendMessage(convId, { from:'bot', type:'card', text:branchesText(), data:{ service:'branches', branches:branchesList() } });
    }
    if (serviceId === 'status') {
      return sendMessage(convId, { from:'bot', type:'text', text:statusText(conv), data:{ service:'status' } });
    }
    if (serviceId === 'agent') {
      return sendMessage(convId, { from:'bot', type:'text', text:agentText(), data:{ service:'agent' } });
    }
    /* خدمات روابط (book/longterm/corporate): نضيف رسالة إرشادية بالرابط */
    var svc = null, list = quickServices();
    for (var i = 0; i < list.length; i++){ if (list[i].id === serviceId) { svc = list[i]; break; } }
    if (svc && svc.kind === 'link') {
      return sendMessage(convId, { from:'bot', type:'text', text:svc.label + ': ' + svc.href, data:{ service:serviceId, href:svc.href } });
    }
    return null;
  }

  /* botReply — مساعد الانتظار: طول ما الموظف ما فتحش المحادثة، يرد على العميل
     برسالة "جميع موظفينا مشغولون… برجاء الانتظار" (مرّة واحدة لكل فترة انتظار).
     أول ما الموظف يفتح المحادثة (agentOpened) أو يقفلها — البوت يسكت ويسيب الموظف يرد. */
  function botReply(convId /*, userText (لم يعد يُستخدم للتوجيه) */){
    /* لو الموظف اتأخر في الفتح: حوّل لموظف آخر قبل أي رد */
    checkReassign(convId);

    var arr = loadChats();
    var i = findIndex(arr, convId);
    if (i === -1) return null;
    var conv = arr[i];

    if (conv.status === 'closed') return null;   /* المحادثة منتهية */
    if (conv.agentOpened) return null;           /* موظف بشري بيتابعها — مفيش رد آلي */
    if (conv.waitingNotified) return null;        /* قلناله يستنى بالفعل في فترة الانتظار دي */

    var m = newMessage({ from:'bot', type:'text', text:settings().waitingMessage, data:{ kind:'waiting' } });
    if (!Array.isArray(conv.messages)) conv.messages = [];
    conv.messages.push(m);
    conv.unreadUser = (conv.unreadUser || 0) + 1;
    conv.waitingNotified = true;
    conv.updatedAt = Date.now();
    saveChats(arr);
    emit();
    return m;
  }

  /* ------------------------------------------------------------
     v2 — إعدادات الشات + التقييم (CSAT)
     ------------------------------------------------------------ */
  /* settings — قيم ot_chat_settings مدموجة فوق الافتراضي */
  function settings(){
    var saved = readJSON(K_SETTINGS, null);
    var out = {
      closeMessage:    DEFAULT_SETTINGS.closeMessage,
      surveyEnabled:   DEFAULT_SETTINGS.surveyEnabled,
      surveyQuestion:  DEFAULT_SETTINGS.surveyQuestion,
      waitingMessage:  DEFAULT_SETTINGS.waitingMessage,
      reassignMinutes: DEFAULT_SETTINGS.reassignMinutes
    };
    if (saved && typeof saved === 'object') {
      if (saved.closeMessage    != null) out.closeMessage    = saved.closeMessage;
      if (saved.surveyEnabled   != null) out.surveyEnabled   = !!saved.surveyEnabled;
      if (saved.surveyQuestion  != null) out.surveyQuestion  = saved.surveyQuestion;
      if (saved.waitingMessage  != null) out.waitingMessage  = saved.waitingMessage;
      if (saved.reassignMinutes != null) out.reassignMinutes = parseInt(saved.reassignMinutes, 10) || 0;
    }
    return out;
  }

  /* saveSettings — دمج فوق الحالي + حفظ + بثّ (تستخدمها اللوحة) */
  function saveSettings(partial){
    var cur = settings();
    partial = partial || {};
    if (partial.closeMessage    != null) cur.closeMessage    = partial.closeMessage;
    if (partial.surveyEnabled   != null) cur.surveyEnabled   = !!partial.surveyEnabled;
    if (partial.surveyQuestion  != null) cur.surveyQuestion  = partial.surveyQuestion;
    if (partial.waitingMessage  != null) cur.waitingMessage  = partial.waitingMessage;
    if (partial.reassignMinutes != null) cur.reassignMinutes = parseInt(partial.reassignMinutes, 10) || 0;
    writeJSON(K_SETTINGS, cur);
    emit();
    return cur;
  }

  function surveys(){
    var arr = readJSON(K_SURVEYS, []);
    return Array.isArray(arr) ? arr : [];
  }

  /* submitSurvey — تقييم واحد لكل محادثة (idempotent) */
  function submitSurvey(convId, opts){
    opts = opts || {};
    var arr = loadChats();
    var i = findIndex(arr, convId);
    if (i === -1) return null;
    var conv = arr[i];
    if (conv.survey) return conv.survey;   // idempotent — موجود بالفعل، نتجاهل

    var rating = parseInt(opts.rating, 10);
    if (isNaN(rating)) rating = 0;
    if (rating < 1) rating = 1;
    if (rating > 5) rating = 5;            // clamp 1..5
    var comment = opts.comment || '';
    var ts = Date.now();
    var agent = conv.assignedTo || null;

    conv.survey = { rating:rating, comment:comment, ts:ts, agent:agent };
    conv.surveyPending = false;
    conv.updatedAt = ts;
    saveChats(arr);

    var list = surveys();
    list.push({
      id: 'sv_' + ts,
      convId: convId,
      rating: rating,
      comment: comment,
      ts: ts,
      agent: agent,
      agentName: '',
      channel: conv.channel,
      customer: (conv.name || conv.phone || 'زائر')
    });
    writeJSON(K_SURVEYS, list);

    emit();
    return conv.survey;
  }

  /* surveyStats — تجميع عام + لكل موظف */
  function surveyStats(){
    var list = surveys();
    var overall = { count:0, avg:0 };
    var perAgent = {};
    var sum = 0;
    for (var i = 0; i < list.length; i++){
      var sv = list[i] || {};
      var r = parseInt(sv.rating, 10);
      if (isNaN(r)) continue;
      overall.count++;
      sum += r;

      var key = sv.agent || 'unassigned';
      if (!perAgent[key]) {
        perAgent[key] = { name:(sv.agentName || key), count:0, avg:0, _sum:0, counts:{1:0,2:0,3:0,4:0,5:0} };
      }
      var a = perAgent[key];
      if (sv.agentName) a.name = sv.agentName;
      a.count++;
      a._sum += r;
      if (a.counts[r] != null) a.counts[r]++;
    }
    overall.avg = overall.count ? Math.round((sum / overall.count) * 10) / 10 : 0;
    for (var k in perAgent){
      if (!perAgent.hasOwnProperty(k)) continue;
      var p = perAgent[k];
      p.avg = p.count ? Math.round((p._sum / p.count) * 10) / 10 : 0;
      delete p._sum;
    }
    return { overall:overall, perAgent:perAgent };
  }

  /* ------------------------------------------------------------
     جسر واتساب (client-side) — يستدعيه الباك-إند/البريدج
     ------------------------------------------------------------ */
  function waConfig(){
    return readJSON(K_WACONFIG, { enabled:false, businessPhone:'', phoneNumberId:'', token:'', verifyToken:'' });
  }

  function findConvByPhone(phone){
    var target = digitsOnly(phone);
    if (!target) return null;
    var tail = target.slice(-9);
    var arr = loadChats();
    for (var i = 0; i < arr.length; i++){
      if (arr[i].channel !== 'whatsapp') continue;
      var p = digitsOnly(arr[i].phone);
      if (!p) continue;
      if (p === target || (tail && p.slice(-9) === tail)) return arr[i];
    }
    return null;
  }

  /* وارد من عميل واتساب → محادثة channel:'whatsapp' برسالة from:'user' */
  function ingestInbound(opts){
    opts = opts || {};
    var phone = opts.phone || '';
    var conv = findConvByPhone(phone);
    if (!conv) {
      conv = startConversation({
        name: opts.name || 'زائر واتساب',
        phone: phone,
        channel: 'whatsapp',
        meta: opts.waId ? { waId: opts.waId } : {}
      });
    } else if (opts.waId && conv.meta && !conv.meta.waId) {
      var arr = loadChats(), i = findIndex(arr, conv.id);
      if (i !== -1){ arr[i].meta = arr[i].meta || {}; arr[i].meta.waId = opts.waId; saveChats(arr); }
    }
    return sendMessage(conv.id, { from:'user', type:'text', text:(opts.text == null ? '' : opts.text), data:opts.waId ? { waId:opts.waId } : null });
  }

  function enqueueOutbound(convId, text){
    var conv = getConversation(convId);
    var phone = conv ? conv.phone : '';
    var box = readJSON(K_WAOUTBOX, []);
    if (!Array.isArray(box)) box = [];
    box.push({ convId:convId, phone:phone, text:(text == null ? '' : String(text)), ts:Date.now(), sent:false });
    writeJSON(K_WAOUTBOX, box);
    return box[box.length - 1];
  }

  function waOutbox(){
    var box = readJSON(K_WAOUTBOX, []);
    return Array.isArray(box) ? box : [];
  }

  function waMarkSent(ts){
    var box = waOutbox();
    for (var i = 0; i < box.length; i++){
      if (box[i].ts === ts) box[i].sent = true;
    }
    writeJSON(K_WAOUTBOX, box);
  }

  /* ------------------------------------------------------------
     نشر الواجهة على window.OneTrip.Chat
     ------------------------------------------------------------ */
  window.OneTrip = window.OneTrip || {};
  window.OneTrip.Chat = {
    /* قراءة */
    listConversations:  listConversations,
    getConversation:    getConversation,
    currentConversation:currentConversation,
    unreadAgentTotal:   unreadAgentTotal,
    /* كتابة */
    startConversation:  startConversation,
    sendMessage:        sendMessage,
    markRead:           markRead,
    markOpened:         markOpened,
    setStatus:          setStatus,
    assign:             assign,
    checkReassign:      checkReassign,
    reassignSweep:      reassignSweep,
    agents:             agents,
    deleteConversation: deleteConversation,
    /* أحداث */
    on:  on,
    off: off,
    /* الخدمات السريعة + الرد الآلي */
    quickServices:   quickServices,
    botReply:        botReply,
    runQuickService: runQuickService,
    /* v2 — إعدادات + تقييم (CSAT) */
    settings:        settings,
    saveSettings:    saveSettings,
    submitSurvey:    submitSurvey,
    surveys:         surveys,
    surveyStats:     surveyStats,
    /* جسر واتساب */
    WhatsApp: {
      config:         waConfig,
      ingestInbound:  ingestInbound,
      enqueueOutbound:enqueueOutbound,
      outbox:         waOutbox,
      markSent:       waMarkSent
    }
  };
})();
