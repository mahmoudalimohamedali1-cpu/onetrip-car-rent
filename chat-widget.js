/* ==========================================================================
   One Trip — Public floating customer-service chat widget
   Owner: chat-widget.js (Agent B)  ·  Vanilla JS · IIFE · RTL · localStorage layer
   Consumes window.OneTrip.Chat (CHAT_CONTRACT §3,4) — degrades gracefully if missing.
   Exposes: window.OneTrip.ChatWidget.mount(opts)  + auto-mounts on DOMContentLoaded.
   Load order: cars.js → chat.js → supabase-sync.js → chat-widget.js
   ========================================================================== */
(function (window, document) {
  'use strict';

  var WIN_NS = (window.OneTrip = window.OneTrip || {});

  /* ---- config / constants ---- */
  var CFG = {
    logo: 'assets/onetrip-logo.png',
    title: 'خدمة عملاء One Trip',
    subtitle: 'نرد عادة خلال دقائق',
    welcome: 'أهلًا بك في One Trip 👋 كيف نقدر نساعدك؟',
    prechatNote: 'عرّفنا بنفسك لنخدمك بشكل أفضل (اختياري).'
  };

  var SVG = {
    open: '<svg class="otchat-ic-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
    close: '<svg class="otchat-ic-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    dot: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="9"/></svg>',
    chev: '<svg class="otchat-chev-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
  };

  /* ---- safe access to the data layer (chat.js) ---- */
  function Chat() { return (window.OneTrip && window.OneTrip.Chat) || null; }
  function warned(msg) { if (!warned._s) { warned._s = {}; } if (!warned._s[msg]) { warned._s[msg] = 1; try { console.warn('[OneTrip.ChatWidget] ' + msg); } catch (e) {} } }
  function safe(fn, fallback) { try { return fn(); } catch (e) { warned('error: ' + (e && e.message)); return fallback; } }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function arTime(ts) {
    var d = ts ? new Date(ts) : new Date();
    try {
      return d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      var h = d.getHours(), m = d.getMinutes();
      return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
    }
  }

  /* ======================================================================
     Widget instance
     ====================================================================== */
  function Widget(opts) {
    this.opts = opts || {};
    this.open = false;
    this.mounted = false;
    this.askedPrechat = false;
    this.quickOpen = true;       // الخدمات السريعة مفتوحة في البداية، وتنطوي وقت الكلام
    this.statusServiceId = null; // a quick-service awaiting a typed answer (e.g. 'status')
    this._onChange = this.rerender.bind(this);
    this.el = {};
  }

  Widget.prototype.mount = function () {
    if (this.mounted) return;
    this.mounted = true;

    var root = document.createElement('div');
    root.className = 'otchat-root';
    root.setAttribute('dir', 'rtl');
    root.setAttribute('aria-live', 'polite');
    root.innerHTML = this.template();
    document.body.appendChild(root);
    this.root = root;

    this.el.launcher = root.querySelector('.otchat-launcher');
    this.el.badge = root.querySelector('.otchat-badge');
    this.el.panel = root.querySelector('.otchat-panel');
    this.el.close = root.querySelector('.otchat-close');
    this.el.quick = root.querySelector('.otchat-quick');
    this.el.quickH = root.querySelector('.otchat-quick-h');
    this.el.quickLbl = root.querySelector('.otchat-quick-h-lbl');
    this.el.quickGrid = root.querySelector('.otchat-quick-grid');
    this.el.list = root.querySelector('.otchat-list');
    this.el.prechat = root.querySelector('.otchat-prechat');
    this.el.input = root.querySelector('.otchat-input');
    this.el.send = root.querySelector('.otchat-send');

    this.bind();
    this.renderQuickServices();
    this.refreshBadge();

    // realtime: dashboard / agent replies appear live
    var chat = Chat();
    if (chat && typeof chat.on === 'function') {
      safe(function () { chat.on('change', this._onChange); }.bind(this));
    } else {
      warned('OneTrip.Chat not found — widget runs in limited mode.');
    }
  };

  Widget.prototype.template = function () {
    return '' +
      '<button class="otchat-launcher" type="button" aria-label="فتح خدمة العملاء">' +
        SVG.open + SVG.close +
        '<span class="otchat-badge" aria-hidden="true">0</span>' +
      '</button>' +
      '<section class="otchat-panel" role="dialog" aria-label="' + esc(CFG.title) + '">' +
        '<header class="otchat-head">' +
          '<div class="otchat-logo"><img src="' + esc(this.opts.logo || CFG.logo) + '" alt="One Trip" onerror="this.style.display=\'none\'"></div>' +
          '<div class="otchat-head-txt">' +
            '<h3 class="otchat-title">' + esc(CFG.title) + '</h3>' +
            '<div class="otchat-status"><span class="otchat-dot"></span>' + esc(CFG.subtitle) + '</div>' +
          '</div>' +
          '<button class="otchat-close" type="button" aria-label="إغلاق">' + SVG.x + '</button>' +
        '</header>' +
        '<div class="otchat-quick">' +
          '<button class="otchat-quick-h" type="button" aria-expanded="true">' +
            '<span class="otchat-quick-h-l">' + SVG.bolt + ' <span class="otchat-quick-h-lbl">خدمات سريعة</span></span>' +
            '<span class="otchat-quick-chev">' + SVG.chev + '</span>' +
          '</button>' +
          '<div class="otchat-quick-grid"></div>' +
        '</div>' +
        '<div class="otchat-list" role="log"></div>' +
        '<div class="otchat-prechat" hidden>' +
          '<p>' + esc(CFG.prechatNote) + '</p>' +
          '<input class="otchat-pc-name" type="text" placeholder="الاسم" autocomplete="name">' +
          '<input class="otchat-pc-phone" type="tel" placeholder="رقم الجوال" autocomplete="tel" inputmode="tel">' +
          '<div class="otchat-prechat-btns">' +
            '<button class="otchat-btn otchat-btn-primary otchat-pc-go" type="button">ابدأ المحادثة</button>' +
            '<button class="otchat-btn otchat-btn-ghost otchat-pc-skip" type="button">تخطّي</button>' +
          '</div>' +
        '</div>' +
        '<div class="otchat-composer">' +
          '<textarea class="otchat-input" rows="1" placeholder="اكتب رسالتك…" aria-label="رسالتك"></textarea>' +
          '<button class="otchat-send" type="button" aria-label="إرسال">' + SVG.send + '</button>' +
        '</div>' +
      '</section>';
  };

  Widget.prototype.bind = function () {
    var self = this;
    this.el.launcher.addEventListener('click', function () { self.toggle(); });
    this.el.close.addEventListener('click', function () { self.setOpen(false); });

    // الخدمات السريعة: زرار العنوان يفتح/يقفل (يرجّعها وقت ما العميل يحب)
    if (this.el.quickH) this.el.quickH.addEventListener('click', function () { self.setQuickOpen(!self.quickOpen); });

    this.el.send.addEventListener('click', function () { self.handleSend(); });
    this.el.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); self.handleSend(); }
    });
    this.el.input.addEventListener('input', function () {
      var t = self.el.input;
      t.style.height = 'auto';
      t.style.height = Math.min(90, t.scrollHeight) + 'px';
    });

    // pre-chat actions
    this.root.querySelector('.otchat-pc-go').addEventListener('click', function () { self.submitPrechat(false); });
    this.root.querySelector('.otchat-pc-skip').addEventListener('click', function () { self.submitPrechat(true); });

    // close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && self.open) self.setOpen(false);
    });
  };

  /* ---------- open / close ---------- */
  Widget.prototype.toggle = function () { this.setOpen(!this.open); };
  Widget.prototype.setOpen = function (v) {
    this.open = !!v;
    this.root.classList.toggle('is-open', this.open);
    if (this.open) {
      // ابدأ مطويّ لو فيه محادثة شغّالة (العميل بدأ كلام) — وإلا مفتوح للترحيب
      var conv0 = this.currentConv();
      var chatting = !!(conv0 && conv0.messages && conv0.messages.some(function (m) { return m.from === 'user'; }));
      this.setQuickOpen(!chatting);
      this.rerender();
      var conv = conv0;
      if (conv) safe(function () { Chat().markRead(conv.id, 'user'); });
      this.refreshBadge();
      var self = this;
      setTimeout(function () { self.scrollBottom(); if (self.el.input) self.el.input.focus(); }, 60);
    }
  };

  /* ---------- quick-services collapse (زرار العودة) ---------- */
  Widget.prototype.setQuickOpen = function (v) {
    this.quickOpen = !!v;
    if (this.el.quick) this.el.quick.classList.toggle('is-collapsed', !this.quickOpen);
    if (this.el.quickH) this.el.quickH.setAttribute('aria-expanded', this.quickOpen ? 'true' : 'false');
    if (this.el.quickLbl) this.el.quickLbl.textContent = this.quickOpen ? 'خدمات سريعة' : 'الخدمات السريعة';
  };

  /* ---------- data helpers ---------- */
  Widget.prototype.currentConv = function () {
    var chat = Chat();
    if (!chat || typeof chat.currentConversation !== 'function') return null;
    return safe(function () { return chat.currentConversation(); }, null);
  };

  Widget.prototype.refreshBadge = function () {
    var conv = this.currentConv();
    var n = conv && conv.unreadUser ? conv.unreadUser : 0;
    var b = this.el.badge;
    if (!b) return;
    if (n > 0 && !this.open) { b.textContent = n > 99 ? '99+' : n; b.classList.add('is-show'); }
    else { b.classList.remove('is-show'); }
  };

  /* ---------- quick services ---------- */
  Widget.prototype.renderQuickServices = function () {
    var chat = Chat();
    var list = (chat && typeof chat.quickServices === 'function')
      ? safe(function () { return chat.quickServices(); }, []) : [];
    if (!list || !list.length) { this.el.quickGrid.parentNode.style.display = 'none'; return; }

    var self = this, grid = this.el.quickGrid;
    grid.innerHTML = '';
    list.forEach(function (s) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'otchat-chip';
      chip.innerHTML = '<span class="otchat-chip-ic">' + (s.icon || SVG.dot) + '</span>' +
        '<span class="otchat-chip-lbl">' + esc(s.label || '') + '</span>';
      chip.addEventListener('click', function () { self.runQuick(s); });
      grid.appendChild(chip);
    });
  };

  Widget.prototype.runQuick = function (s) {
    var chat = Chat();
    if (!s) return;
    // link chips navigate
    if (s.kind === 'link' && s.href) { window.location.href = s.href; return; }
    // reply chips run the service against an existing conversation (create if needed)
    var self = this;
    this.ensureConversation(function (conv) {
      if (!conv) return;
      self.setOpen(true);
      safe(function () { chat.runQuickService(conv.id, s.id); });
      self.setQuickOpen(false); // اطوِ الخدمات بعد اختيار خدمة — وتظهر بزرار العودة
      self.rerender();
    });
  };

  /* ---------- conversation bootstrap ---------- */
  // ensure a conversation exists; show skippable pre-chat the first time
  Widget.prototype.ensureConversation = function (done) {
    var chat = Chat();
    if (!chat) { warned('cannot start conversation — OneTrip.Chat missing.'); done(null); return; }
    var conv = this.currentConv();
    if (conv) { done(conv); return; }

    if (!this.askedPrechat) {
      this.askedPrechat = true;
      this._pendingAfterPrechat = done;
      this.showPrechat(true);
      return;
    }
    // already asked/skipped — just create
    var created = safe(function () { return chat.startConversation({ channel: 'web' }); }, null);
    this.seedWelcome(created);
    done(created);
  };

  Widget.prototype.showPrechat = function (v) {
    if (!this.el.prechat) return;
    this.el.prechat.hidden = !v;
    if (v) {
      var nm = this.root.querySelector('.otchat-pc-name');
      if (nm) setTimeout(function () { nm.focus(); }, 50);
    }
  };

  Widget.prototype.submitPrechat = function (skip) {
    var chat = Chat();
    var name = (this.root.querySelector('.otchat-pc-name').value || '').trim();
    var phone = (this.root.querySelector('.otchat-pc-phone').value || '').trim();
    var opts = { channel: 'web' };
    if (!skip && name) opts.name = name;
    if (!skip && phone) opts.phone = phone;

    var conv = safe(function () { return chat ? chat.startConversation(opts) : null; }, null);
    this.showPrechat(false);
    this.seedWelcome(conv);
    var cb = this._pendingAfterPrechat; this._pendingAfterPrechat = null;
    if (cb) cb(conv);
  };

  // first welcome bot message (only if conversation has no messages yet)
  Widget.prototype.seedWelcome = function (conv) {
    var chat = Chat();
    if (!chat || !conv) return;
    if (conv.messages && conv.messages.length) return;
    safe(function () {
      chat.sendMessage(conv.id, { from: 'bot', text: CFG.welcome, type: 'text' });
    });
  };

  /* ---------- send ---------- */
  Widget.prototype.handleSend = function () {
    var chat = Chat();
    var text = (this.el.input.value || '').trim();
    if (!text) return;
    var self = this;

    this.ensureConversation(function (conv) {
      if (!conv || !chat) { warned('send failed — no conversation / data layer.'); return; }
      self.el.input.value = '';
      self.el.input.style.height = 'auto';
      self.setQuickOpen(false); // العميل بدأ يكتب → اطوِ الخدمات السريعة (ترجع بزرار العودة)

      // a quick-service asked for a typed answer (e.g. order status by phone)
      if (self.statusServiceId) {
        var sid = self.statusServiceId; self.statusServiceId = null;
        safe(function () { chat.sendMessage(conv.id, { from: 'user', text: text, type: 'text' }); });
        safe(function () { chat.runQuickService(conv.id, sid, text); });
        self.rerender();
        return;
      }

      safe(function () { chat.sendMessage(conv.id, { from: 'user', text: text, type: 'text' }); });
      // automated reply / escalation
      if (typeof chat.botReply === 'function') {
        self.showTyping(true);
        setTimeout(function () {
          self.showTyping(false);
          safe(function () { chat.botReply(conv.id, text); });
          self.rerender();
        }, 480);
      }
      self.rerender();
    });
  };

  Widget.prototype.showTyping = function (on) {
    this._typing = !!on;
    this.rerender();
  };

  /* ---------- render messages ---------- */
  Widget.prototype.rerender = function () {
    if (!this.mounted) return;
    this.refreshBadge();
    var conv = this.currentConv();
    var list = this.el.list;
    if (!list) return;
    list.innerHTML = '';

    var msgs = (conv && conv.messages) ? conv.messages : [];
    if (!msgs.length && !this._typing) {
      list.appendChild(this.emptyState());
    }
    for (var i = 0; i < msgs.length; i++) {
      if ((msgs[i].type || 'text') === 'system') continue;
      list.appendChild(this.renderMsg(msgs[i]));
    }
    if (this._typing) list.appendChild(this.typingRow());

    // open marks read
    if (this.open && conv) safe(function () { Chat().markRead(conv.id, 'user'); });
    this.scrollBottom();
  };

  Widget.prototype.emptyState = function () {
    var row = document.createElement('div');
    row.className = 'otchat-row is-agent';
    row.innerHTML = '<div class="otchat-bubble">' + esc(CFG.welcome) + '</div>' +
      '<div class="otchat-time">' + esc(arTime()) + '</div>';
    return row;
  };

  Widget.prototype.renderMsg = function (m) {
    var isUser = m.from === 'user';
    var row = document.createElement('div');
    row.className = 'otchat-row ' + (isUser ? 'is-user' : 'is-agent');

    if (m.type === 'card') {
      row.appendChild(this.renderCard(m));
    } else {
      var b = document.createElement('div');
      b.className = 'otchat-bubble';
      b.textContent = m.text || '';
      row.appendChild(b);
    }
    var t = document.createElement('div');
    t.className = 'otchat-time';
    t.textContent = arTime(m.ts);
    row.appendChild(t);
    return row;
  };

  // card messages — payload in m.data.items | m.data.cars | m.data.rows  (name + price)
  Widget.prototype.renderCard = function (m) {
    var data = m.data || {};
    var items = data.items || data.cars || data.rows || [];
    var card = document.createElement('div');
    card.className = 'otchat-card';

    var head = '';
    if (m.text) head = '<div class="otchat-card-title">' + esc(m.text) + '</div>';
    var body = '';
    if (items && items.length) {
      for (var i = 0; i < items.length; i++) {
        var it = items[i] || {};
        var name = it.name || it.title || it.label || '';
        var sub = it.category || it.city || it.subtitle || it.note || '';
        var price = (it.price != null) ? it.price : (it.daily != null ? it.daily : null);
        var unit = it.unit || (price != null ? ' ريال/يوم' : '');
        var phone = it.phone ? ('<div class="otchat-card-sub" dir="ltr">' + esc(it.phone) + '</div>') : '';
        body += '<div class="otchat-card-item">' +
            '<div class="otchat-card-main">' +
              '<div class="otchat-card-name">' + esc(name) + '</div>' +
              (sub ? '<div class="otchat-card-sub">' + esc(sub) + '</div>' : '') + phone +
            '</div>' +
            (price != null ? '<div class="otchat-card-price">' + esc(price) + esc(unit) + '</div>' : '') +
          '</div>';
      }
    } else {
      body = '<div class="otchat-card-item"><div class="otchat-card-name">' + esc(m.text || 'لا توجد بيانات') + '</div></div>';
    }
    card.innerHTML = head + body;
    return card;
  };

  Widget.prototype.typingRow = function () {
    var row = document.createElement('div');
    row.className = 'otchat-row is-agent otchat-typing';
    row.innerHTML = '<div class="otchat-bubble"><i></i><i></i><i></i></div>';
    return row;
  };

  Widget.prototype.scrollBottom = function () {
    var l = this.el.list;
    if (l) l.scrollTop = l.scrollHeight;
  };

  /* ======================================================================
     Public API + auto-mount (idempotent — never twice)
     ====================================================================== */
  var _instance = null;
  function mount(opts) {
    if (_instance && _instance.mounted) return _instance;
    if (!_instance) _instance = new Widget(opts);
    if (document.body) _instance.mount();
    return _instance;
  }

  WIN_NS.ChatWidget = WIN_NS.ChatWidget || {
    mount: mount,
    instance: function () { return _instance; }
  };

  function autoMount() {
    if (WIN_NS.ChatWidget._auto) return;
    WIN_NS.ChatWidget._auto = true;
    mount(WIN_NS.ChatWidget.options || {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount, { once: true });
  } else {
    autoMount();
  }
})(window, document);
