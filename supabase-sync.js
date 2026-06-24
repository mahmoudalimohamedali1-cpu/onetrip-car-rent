/* ============================================================
   One Trip — supabase-sync.js  (OPTIONAL client realtime sync)
   ------------------------------------------------------------
   Owner: Agent G  (see CHAT_CONTRACT.md §5 / §8)

   This is a THIN, OPTIONAL mirror layer on top of the synchronous
   localStorage-based OneTrip.Chat (chat.js). It NEVER changes the
   offline/localStorage behavior.

     • No `ot_supabase_config`, or {enabled:false}, or invalid config,
       or OneTrip.Chat absent  ⇒  PURE NO-OP.
       The ONLY unconditional side-effect is defining
       window.OneTrip.ChatSync (so callers can probe status). Every
       other action is gated behind a valid, enabled config.

     • Enabled  ⇒  dynamically load @supabase/supabase-js@2 from a CDN,
       do an initial PULL (merge remote → local 'ot_chats'),
       monkey-patch the write methods to PUSH to Supabase after the
       original returns, and subscribe to Realtime so remote changes
       made elsewhere update local 'ot_chats' and fire 'change'.

   Style: Vanilla JS, IIFE, 'use strict', window.OneTrip namespace —
   same as cars.js / chat.js. ES5-ish. Heavy defensive coding: a
   Supabase outage degrades silently to local-only.

   JS↔SQL mapping (CHAT_CONTRACT.md §8):
     conversations: assignedTo⇄assigned_to, unreadAgent⇄unread_agent,
                    unreadUser⇄unread_user, createdAt⇄created_at,
                    updatedAt⇄updated_at  (id,name,phone,channel,status,meta as-is)
     messages:      from⇄sender  (id,text,type,data,ts,read as-is);
                    conversation_id is the parent conv id
   ============================================================ */
;(function () {
  'use strict';

  var STORAGE_KEY = 'ot_chats';
  var CONFIG_KEY = 'ot_supabase_config';
  var ESM_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
  var UMD_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  var ECHO_TTL = 8000; // ms a write signature is "ours" — ignore matching realtime echoes

  // ---- module state -------------------------------------------------------
  var state = {
    status: 'off',          // 'off' | 'connecting' | 'live' | 'error'
    config: null,           // {url, anonKey, enabled}
    client: null,           // supabase client
    channel: null,          // realtime channel
    patched: false,         // write methods wrapped?
    originals: {},          // saved original OneTrip.Chat methods
    warned: false           // console.warn fired once?
  };

  // Echo-suppression ledgers: ids/signatures WE just wrote, with expiry ts.
  var sentMsgIds = {};       // messageId  -> expiryTs
  var sentConvSigs = {};     // convId@updatedAt -> expiryTs
  var deletedConvIds = {};   // convId -> expiryTs (so our own deletes don't bounce)

  // ===========================================================================
  //  SAFE HELPERS  (never throw)
  // ===========================================================================

  function warnOnce(msg, err) {
    if (state.warned) return;
    state.warned = true;
    try { console.warn('[ChatSync] ' + msg + ' — falling back to local-only.', err || ''); } catch (e) {}
  }

  function getChat() {
    return (typeof window !== 'undefined' && window.OneTrip && window.OneTrip.Chat) || null;
  }

  function readConfig() {
    try {
      var raw = window.localStorage.getItem(CONFIG_KEY);
      if (!raw) return null;
      var cfg = JSON.parse(raw);
      if (!cfg || typeof cfg !== 'object') return null;
      return cfg;
    } catch (e) { return null; }
  }

  function isValidConfig(cfg) {
    return !!(cfg && cfg.enabled === true &&
      typeof cfg.url === 'string' && /^https?:\/\//i.test(cfg.url) &&
      typeof cfg.anonKey === 'string' && cfg.anonKey.length > 0);
  }

  function readChats() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function writeChats(arr) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(arr || []));
      return true;
    } catch (e) { return false; }
  }

  // Ask OneTrip.Chat to broadcast a 'change' (cross-tab + same-tab listeners).
  // Defensive: chat.js owns emit(); we only have the public surface, so we try
  // a couple of safe ways and never throw.
  function fireChange() {
    var chat = getChat();
    if (!chat) return;
    try {
      if (typeof chat.emit === 'function') { chat.emit('change'); return; }
    } catch (e) {}
    try {
      if (typeof chat._emit === 'function') { chat._emit('change'); return; }
    } catch (e) {}
    // Fallback: nudge cross-tab listeners via BroadcastChannel('ot_chat')
    // (chat.js also listens to the window 'storage' event on ot_chats, which
    //  our writeChats already triggers in *other* tabs).
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        var bc = new BroadcastChannel('ot_chat');
        bc.postMessage({ type: 'change' });
        bc.close();
      }
    } catch (e) {}
  }

  function now() { return Date.now(); }

  function pruneLedger(ledger) {
    var t = now();
    for (var k in ledger) {
      if (ledger.hasOwnProperty(k) && ledger[k] < t) delete ledger[k];
    }
  }

  function markSentMsg(id) { if (id) sentMsgIds[id] = now() + ECHO_TTL; }
  function markSentConv(conv) {
    if (conv && conv.id != null) sentConvSigs[conv.id + '@' + (conv.updatedAt || 0)] = now() + ECHO_TTL;
  }
  function markDeletedConv(id) { if (id != null) deletedConvIds[id] = now() + ECHO_TTL; }

  function isOurMsg(id) {
    pruneLedger(sentMsgIds);
    return !!(id != null && sentMsgIds[id]);
  }
  function isOurConv(id, updatedAt) {
    pruneLedger(sentConvSigs);
    return !!(id != null && sentConvSigs[id + '@' + (updatedAt || 0)]);
  }
  function isOurDelete(id) {
    pruneLedger(deletedConvIds);
    return !!(id != null && deletedConvIds[id]);
  }

  // ===========================================================================
  //  JS ⇄ SQL  ROW MAPPING  (CHAT_CONTRACT.md §8)
  // ===========================================================================

  function convToRow(c) {
    return {
      id: c.id,
      name: c.name != null ? c.name : 'زائر',
      phone: c.phone != null ? c.phone : '',
      channel: c.channel || 'web',
      status: c.status || 'open',
      assigned_to: c.assignedTo != null ? c.assignedTo : null,
      unread_agent: c.unreadAgent || 0,
      unread_user: c.unreadUser || 0,
      created_at: c.createdAt || null,
      updated_at: c.updatedAt || null,
      meta: c.meta || {}
    };
  }

  function rowToConv(r) {
    return {
      id: r.id,
      name: r.name != null ? r.name : 'زائر',
      phone: r.phone != null ? r.phone : '',
      channel: r.channel || 'web',
      status: r.status || 'open',
      assignedTo: r.assigned_to != null ? r.assigned_to : null,
      unreadAgent: r.unread_agent || 0,
      unreadUser: r.unread_user || 0,
      createdAt: r.created_at || null,
      updatedAt: r.updated_at || null,
      messages: [],
      meta: r.meta || {}
    };
  }

  function msgToRow(convId, m) {
    return {
      id: m.id,
      conversation_id: convId,
      sender: m.from,                 // from ⇄ sender
      text: m.text != null ? m.text : '',
      type: m.type || 'text',
      data: m.data != null ? m.data : null,
      ts: m.ts || null,
      read: !!m.read
    };
  }

  function rowToMsg(r) {
    return {
      id: r.id,
      from: r.sender,                 // sender ⇄ from
      text: r.text != null ? r.text : '',
      type: r.type || 'text',
      ts: r.ts || null,
      read: !!r.read,
      data: r.data != null ? r.data : null
    };
  }

  // ===========================================================================
  //  MERGE  (last-write-wins by id; messages unioned by id; keep local unsent)
  // ===========================================================================

  function indexById(arr) {
    var map = {};
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i].id != null) map[arr[i].id] = arr[i];
    }
    return map;
  }

  // Merge one remote conversation (already in local/camel shape, may carry
  // messages) into the local conversation list. Returns true if local changed.
  function mergeConv(local, remoteConv) {
    var byId = indexById(local);
    var existing = byId[remoteConv.id];

    if (!existing) {
      local.push(remoteConv);
      return true;
    }

    var changed = false;
    var rUpd = remoteConv.updatedAt || 0;
    var lUpd = existing.updatedAt || 0;

    // Conversation-level fields: larger updatedAt wins.
    if (rUpd > lUpd) {
      existing.name = remoteConv.name;
      existing.phone = remoteConv.phone;
      existing.channel = remoteConv.channel;
      existing.status = remoteConv.status;
      existing.assignedTo = remoteConv.assignedTo;
      existing.unreadAgent = remoteConv.unreadAgent;
      existing.unreadUser = remoteConv.unreadUser;
      existing.createdAt = remoteConv.createdAt || existing.createdAt;
      existing.updatedAt = rUpd;
      existing.meta = remoteConv.meta || existing.meta;
      changed = true;
    }

    // Messages: union by id. Preserve local-only (unsent) messages.
    if (remoteConv.messages && remoteConv.messages.length) {
      existing.messages = existing.messages || [];
      var mById = indexById(existing.messages);
      for (var i = 0; i < remoteConv.messages.length; i++) {
        var rm = remoteConv.messages[i];
        if (!rm || rm.id == null) continue;
        var lm = mById[rm.id];
        if (!lm) {
          existing.messages.push(rm);
          mById[rm.id] = rm;
          changed = true;
        } else if ((rm.ts || 0) >= (lm.ts || 0)) {
          // last-write-wins on the message too (read flag/text updates)
          if (lm.read !== rm.read || lm.text !== rm.text || lm.type !== rm.type) {
            lm.from = rm.from; lm.text = rm.text; lm.type = rm.type;
            lm.ts = rm.ts; lm.read = rm.read; lm.data = rm.data;
            changed = true;
          }
        }
      }
      // keep messages sorted by ts ascending (defensive; chat.js expects order)
      try {
        existing.messages.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
      } catch (e) {}
    }

    return changed;
  }

  function removeConvLocally(id) {
    var local = readChats();
    var out = [];
    var changed = false;
    for (var i = 0; i < local.length; i++) {
      if (local[i] && local[i].id === id) { changed = true; continue; }
      out.push(local[i]);
    }
    if (changed) { writeChats(out); fireChange(); }
    return changed;
  }

  // ===========================================================================
  //  REMOTE CLIENT LOADING  (ESM dynamic import + UMD <script> fallback)
  // ===========================================================================

  function loadSupabaseLib() {
    // Returns a Promise resolving to the `createClient` factory.
    // All remote — wrapped in try/catch by the caller.
    return new Promise(function (resolve, reject) {
      // Already present (UMD global)?
      try {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
          resolve(window.supabase.createClient);
          return;
        }
      } catch (e) {}

      // Preferred: native ESM dynamic import.
      var tryEsm = function () {
        try {
          // `import(...)` is only valid where the engine supports it; guard with Function
          // so this file still parses under ES5 tooling / `node --check`.
          var dynImport = new Function('u', 'return import(u);');
          return dynImport(ESM_URL).then(function (mod) {
            var factory = (mod && (mod.createClient || (mod.default && mod.default.createClient)));
            if (typeof factory === 'function') return factory;
            throw new Error('createClient not found in ESM module');
          });
        } catch (e) {
          return Promise.reject(e);
        }
      };

      // Fallback: inject UMD bundle <script> and read window.supabase.
      var tryUmd = function () {
        return new Promise(function (res, rej) {
          try {
            var s = document.createElement('script');
            s.src = UMD_URL;
            s.async = true;
            s.onload = function () {
              try {
                if (window.supabase && typeof window.supabase.createClient === 'function') {
                  res(window.supabase.createClient);
                } else {
                  rej(new Error('UMD loaded but window.supabase.createClient missing'));
                }
              } catch (e) { rej(e); }
            };
            s.onerror = function () { rej(new Error('UMD script failed to load')); };
            document.head.appendChild(s);
          } catch (e) { rej(e); }
        });
      };

      tryEsm().then(resolve, function (esmErr) {
        // ESM path failed (older browser / CSP) → UMD.
        tryUmd().then(resolve, function (umdErr) {
          reject(umdErr || esmErr);
        });
      });
    });
  }

  // ===========================================================================
  //  INITIAL PULL  (remote → merge into local 'ot_chats' → fire change)
  // ===========================================================================

  function initialPull() {
    if (!state.client) return Promise.resolve(false);
    // --- REMOTE: fetch conversations + messages ---------------------------
    return state.client.from('conversations').select('*')
      .then(function (convRes) {
        if (convRes && convRes.error) throw convRes.error;
        var convRows = (convRes && convRes.data) || [];
        return state.client.from('messages').select('*')
          .then(function (msgRes) {
            if (msgRes && msgRes.error) throw msgRes.error;
            var msgRows = (msgRes && msgRes.data) || [];
            return { convRows: convRows, msgRows: msgRows };
          });
      })
      .then(function (bundle) {
        // Build remote convs (camel) with their messages attached.
        var byId = {};
        var remoteConvs = [];
        var i;
        for (i = 0; i < bundle.convRows.length; i++) {
          var rc = rowToConv(bundle.convRows[i]);
          byId[rc.id] = rc;
          remoteConvs.push(rc);
        }
        for (i = 0; i < bundle.msgRows.length; i++) {
          var mr = bundle.msgRows[i];
          var parent = byId[mr.conversation_id];
          if (parent) parent.messages.push(rowToMsg(mr));
        }

        // Merge into local — last-write-wins by id, preserving local unsent.
        var local = readChats();
        var changed = false;
        for (i = 0; i < remoteConvs.length; i++) {
          if (mergeConv(local, remoteConvs[i])) changed = true;
        }
        if (changed) {
          // sort newest-first like listConversations() (§3)
          try { local.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }); } catch (e) {}
          writeChats(local);
          fireChange();
        }
        return changed;
      });
  }

  // ===========================================================================
  //  PUSH  (fire-and-forget remote upserts/inserts; from→sender, camel→snake)
  // ===========================================================================

  function pushConvUpsert(conv) {
    if (!state.client || !conv) return;
    markSentConv(conv); // suppress the realtime echo of our own write
    try {
      // --- REMOTE: upsert conversation row -------------------------------
      var p = state.client.from('conversations').upsert(convToRow(conv), { onConflict: 'id' });
      if (p && typeof p.then === 'function') {
        p.then(function (res) {
          if (res && res.error) warnOnce('conversation upsert failed', res.error);
        }, function (err) { warnOnce('conversation upsert rejected', err); });
      }
    } catch (e) { warnOnce('conversation upsert threw', e); }
  }

  function pushMsgInsert(convId, msg) {
    if (!state.client || !msg) return;
    markSentMsg(msg.id);
    try {
      // --- REMOTE: upsert message row (idempotent on id) -----------------
      var p = state.client.from('messages').upsert(msgToRow(convId, msg), { onConflict: 'id' });
      if (p && typeof p.then === 'function') {
        p.then(function (res) {
          if (res && res.error) warnOnce('message insert failed', res.error);
        }, function (err) { warnOnce('message insert rejected', err); });
      }
    } catch (e) { warnOnce('message insert threw', e); }
  }

  function pushConvDelete(id) {
    if (!state.client || id == null) return;
    markDeletedConv(id);
    try {
      // --- REMOTE: delete conversation (messages cascade per schema) -----
      var p = state.client.from('conversations').delete().eq('id', id);
      if (p && typeof p.then === 'function') {
        p.then(function (res) {
          if (res && res.error) warnOnce('conversation delete failed', res.error);
        }, function (err) { warnOnce('conversation delete rejected', err); });
      }
    } catch (e) { warnOnce('conversation delete threw', e); }
  }

  // Pull the freshest local copy of a conversation by id (post-write).
  function localConv(id) {
    var local = readChats();
    for (var i = 0; i < local.length; i++) {
      if (local[i] && local[i].id === id) return local[i];
    }
    return null;
  }

  // ===========================================================================
  //  MONKEY-PATCH  OneTrip.Chat  WRITE METHODS
  //  Rule: call original SYNCHRONOUSLY, capture return, then fire-and-forget
  //        the remote push. Always return the original's value.
  // ===========================================================================

  function patchChat() {
    var chat = getChat();
    if (!chat || state.patched) return;
    var O = state.originals;

    function wrap(name, after) {
      if (typeof chat[name] !== 'function') return;
      O[name] = chat[name];
      chat[name] = function () {
        var args = arguments;
        var ret = O[name].apply(chat, args); // SYNC original first
        try { after(args, ret); } catch (e) { warnOnce('push hook (' + name + ') threw', e); }
        return ret;                          // ...then return its value unchanged
      };
    }

    // sendMessage(convId, msg) → Message  : insert message + upsert parent conv
    wrap('sendMessage', function (args, ret) {
      var convId = args[0];
      var msg = ret || args[1];
      pushMsgInsert(convId, msg);
      var conv = localConv(convId);
      if (conv) pushConvUpsert(conv); // counters/updatedAt changed
    });

    // startConversation(opts) → Conversation : upsert new conv (+ any seed msgs)
    wrap('startConversation', function (args, ret) {
      var conv = ret;
      if (conv && conv.id != null) {
        pushConvUpsert(conv);
        if (conv.messages) {
          for (var i = 0; i < conv.messages.length; i++) pushMsgInsert(conv.id, conv.messages[i]);
        }
      }
    });

    // setStatus(convId, status) : upsert conv
    wrap('setStatus', function (args) {
      var conv = localConv(args[0]);
      if (conv) pushConvUpsert(conv);
    });

    // assign(convId, agentName) : upsert conv
    wrap('assign', function (args) {
      var conv = localConv(args[0]);
      if (conv) pushConvUpsert(conv);
    });

    // markRead(convId, side) : counters + message read flags changed → upsert conv + its msgs
    wrap('markRead', function (args) {
      var conv = localConv(args[0]);
      if (conv) {
        pushConvUpsert(conv);
        if (conv.messages) {
          for (var i = 0; i < conv.messages.length; i++) pushMsgInsert(conv.id, conv.messages[i]);
        }
      }
    });

    // deleteConversation(id) : delete remotely (cascade)
    wrap('deleteConversation', function (args) {
      pushConvDelete(args[0]);
    });

    state.patched = true;
  }

  function unpatchChat() {
    var chat = getChat();
    if (!chat || !state.patched) return;
    for (var name in state.originals) {
      if (state.originals.hasOwnProperty(name)) chat[name] = state.originals[name];
    }
    state.originals = {};
    state.patched = false;
  }

  // ===========================================================================
  //  REALTIME  (postgres_changes on conversations + messages)
  // ===========================================================================

  function applyRemoteConvChange(payload) {
    try {
      var evt = payload.eventType || payload.type;
      if (evt === 'DELETE') {
        var oldRow = payload.old || {};
        if (oldRow.id == null) return;
        if (isOurDelete(oldRow.id)) return; // our own delete echoing back
        removeConvLocally(oldRow.id);
        return;
      }
      var row = payload.new;
      if (!row || row.id == null) return;
      if (isOurConv(row.id, row.updated_at)) return; // our own write echoing back
      var local = readChats();
      if (mergeConv(local, rowToConv(row))) {
        try { local.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }); } catch (e) {}
        writeChats(local);
        fireChange();
      }
    } catch (e) { warnOnce('realtime conv handler threw', e); }
  }

  function applyRemoteMsgChange(payload) {
    try {
      var evt = payload.eventType || payload.type;
      var row = (evt === 'DELETE') ? payload.old : payload.new;
      if (!row || row.id == null) return;
      if (evt !== 'DELETE' && isOurMsg(row.id)) return; // our own message echoing back
      var convId = row.conversation_id;
      if (convId == null) return;

      var local = readChats();
      var conv = null;
      for (var i = 0; i < local.length; i++) {
        if (local[i] && local[i].id === convId) { conv = local[i]; break; }
      }
      if (!conv) return; // unknown conversation; conv-level event will create it
      conv.messages = conv.messages || [];

      var changed = false;
      var idx = -1;
      for (var j = 0; j < conv.messages.length; j++) {
        if (conv.messages[j] && conv.messages[j].id === row.id) { idx = j; break; }
      }

      if (evt === 'DELETE') {
        if (idx >= 0) { conv.messages.splice(idx, 1); changed = true; }
      } else {
        var m = rowToMsg(row);
        if (idx < 0) { conv.messages.push(m); changed = true; }
        else {
          var ex = conv.messages[idx];
          if (ex.read !== m.read || ex.text !== m.text || ex.type !== m.type) {
            conv.messages[idx] = m; changed = true;
          }
        }
        try { conv.messages.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); }); } catch (e) {}
      }

      if (changed) { writeChats(local); fireChange(); }
    } catch (e) { warnOnce('realtime msg handler threw', e); }
  }

  function subscribeRealtime() {
    if (!state.client) return;
    try {
      var ch = state.client.channel('ot_chat_sync');
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, applyRemoteConvChange);
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, applyRemoteMsgChange);
      ch.subscribe(function (status) {
        // 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED'
        if (status === 'SUBSCRIBED') { state.status = 'live'; }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          state.status = 'error';
          warnOnce('realtime channel error (' + status + ')');
        }
      });
      state.channel = ch;
    } catch (e) {
      state.status = 'error';
      warnOnce('realtime subscribe threw', e);
    }
  }

  // ===========================================================================
  //  BOOTSTRAP  /  TEARDOWN
  // ===========================================================================

  function teardown() {
    try { if (state.channel && state.client) state.client.removeChannel(state.channel); } catch (e) {}
    state.channel = null;
    state.client = null;
  }

  function start() {
    // Re-read config each start so reconnect() can pick up new settings.
    var cfg = readConfig();
    state.config = cfg;

    // --- GATE: no config / disabled / invalid / no Chat ⇒ PURE NO-OP -------
    if (!isValidConfig(cfg) || !getChat()) {
      state.status = 'off';
      return; // nothing loaded, nothing patched, localStorage untouched
    }

    state.status = 'connecting';

    loadSupabaseLib().then(function (createClient) {
      try {
        state.client = createClient(cfg.url, cfg.anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          realtime: { params: { eventsPerSecond: 5 } }
        });
      } catch (e) {
        state.status = 'error';
        warnOnce('createClient threw', e);
        return;
      }

      // Patch writes BEFORE pull so anything the user types during pull is mirrored.
      patchChat();

      // Initial pull (remote → local). Failure is non-fatal (local-only).
      initialPull().then(function () {
        subscribeRealtime();
      }, function (err) {
        warnOnce('initial pull failed', err);
        // Still subscribe — we can live-sync going forward even if pull failed.
        subscribeRealtime();
      });
    }, function (err) {
      // Could not load the library at all → stay local-only.
      state.status = 'error';
      warnOnce('failed to load supabase-js', err);
    });
  }

  function reconnect() {
    teardown();
    state.status = 'off';
    // keep echo ledgers; they self-expire
    start();
  }

  // ===========================================================================
  //  PUBLIC API  (the ONLY unconditional side-effect of this file)
  // ===========================================================================

  function publicConfig() {
    // Never expose anonKey.
    var c = state.config || readConfig();
    if (!c) return null;
    return { url: c.url || null, enabled: c.enabled === true };
  }

  window.OneTrip = window.OneTrip || {};
  window.OneTrip.ChatSync = {
    status: function () { return state.status; },
    reconnect: reconnect,
    config: publicConfig
  };

  // ---- run: immediately if Chat is already present, else on DOMContentLoaded
  function boot() {
    try { start(); } catch (e) { warnOnce('boot threw', e); }
  }

  if (getChat()) {
    boot();
  } else if (typeof document !== 'undefined' &&
             document.readyState !== 'loading') {
    boot();
  } else if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', boot);
  }

})();
