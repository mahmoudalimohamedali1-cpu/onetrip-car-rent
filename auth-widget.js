/* ==========================================================================
   One Trip — Customer account widget (login/signup modal + account menu)
   Owner: auth-widget.js + auth-widget.css (Agent B) · Vanilla JS · IIFE · RTL
   Consumes window.OneTrip.Auth (AUTH_CONTRACT §3) — degrades gracefully if missing.
   Exposes: window.OneTrip.AuthWidget.{ mount(), open(mode), instance() }
   Auto-mounts on DOMContentLoaded (idempotent). Class prefix: .otauth-
   Load order: cars.js → auth-core.js → … → chat-widget.js → auth-widget.js
   ========================================================================== */
(function (window, document) {
  'use strict';

  var WIN_NS = (window.OneTrip = window.OneTrip || {});

  /* ---- safe access to the data layer (auth-core.js) ---- */
  function Auth() { return (window.OneTrip && window.OneTrip.Auth) || null; }
  function warned(msg) {
    if (!warned._s) { warned._s = {}; }
    if (!warned._s[msg]) { warned._s[msg] = 1; try { console.warn('[OneTrip.AuthWidget] ' + msg); } catch (e) {} }
  }
  function safe(fn, fallback) {
    try { return fn(); } catch (e) { warned('error: ' + (e && e.message)); return fallback; }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function firstName(name) {
    var n = String(name || '').trim();
    if (!n) return 'حسابي';
    return n.split(/\s+/)[0];
  }

  /* ---- validation helpers ---- */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function validEmail(v) { return EMAIL_RE.test(String(v || '').trim()); }
  function digits(v) { return String(v || '').replace(/\D/g, ''); }
  function validPhone(v) { return digits(v).length >= 9; }
  function validPass(v) { return String(v || '').length >= 6; }

  var SVG = {
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>',
    bookings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
  };

  var INJECT_SELECTORS = [
    'header nav', '.site-header', '.nav', '.nav-links', '.header-actions',
    'header', '.main-nav'
  ];

  /* ======================================================================
     Widget instance
     ====================================================================== */
  function Widget(opts) {
    this.opts = opts || {};
    this.mounted = false;
    this.modalOpen = false;
    this.menuOpen = false;
    this.mode = 'login';           // 'login' | 'signup'
    this.floating = false;
    this._onChange = this.rerender.bind(this);
    this.el = {};
  }

  Widget.prototype.mount = function () {
    if (this.mounted) return;
    this.mounted = true;

    this.injectControl();
    this.injectModal();
    this.rerender();

    // realtime: login state changes across tabs / other widgets
    var auth = Auth();
    if (auth && typeof auth.on === 'function') {
      safe(function () { auth.on('change', this._onChange); }.bind(this));
    } else {
      warned('OneTrip.Auth not found — widget runs in limited mode.');
    }

    // close menu on outside click / Escape
    var self = this;
    document.addEventListener('click', function (e) {
      if (!self.menuOpen) return;
      if (self.el.control && self.el.control.contains(e.target)) return;
      self.setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (self.modalOpen) self.setModal(false);
      else if (self.menuOpen) self.setMenu(false);
    });
  };

  /* ---------- header control (or floating fallback) ---------- */
  Widget.prototype.injectControl = function () {
    var host = null;
    for (var i = 0; i < INJECT_SELECTORS.length; i++) {
      var c = document.querySelector(INJECT_SELECTORS[i]);
      if (c) { host = c; break; }
    }
    var control = document.createElement('div');
    control.className = 'otauth-control';
    control.setAttribute('dir', 'rtl');

    if (host) {
      host.appendChild(control);
    } else {
      // floating fallback — TOP-RIGHT (chat launcher is bottom-left, no overlap)
      this.floating = true;
      control.classList.add('otauth-floating');
      (document.body || document.documentElement).appendChild(control);
    }
    this.el.control = control;

    /* إزالة زر «تسجيل الدخول/حساب جديد» الثابت لو موجود في الهيدر (من قالب الموقع)
       حتى لا يظهر زرّان — ودجتنا هي الوحيدة الفعّالة. (يُعاد المحاولة لو الهيدر تأخّر) */
    var self = this;
    self.hideNativeLogin();
    setTimeout(function(){ self.hideNativeLogin(); }, 400);
    setTimeout(function(){ self.hideNativeLogin(); }, 1200);
  };

  Widget.prototype.hideNativeLogin = function () {
    try {
      var scope = document.querySelector('header, .site-header, .header-actions') || document;
      var els = scope.querySelectorAll('.login-link, a, button');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.closest && el.closest('.otauth-control')) continue;       // لا تلمس ودجتنا
        if (el.getAttribute('data-otauth-dup')) continue;
        var isLoginLink = /(^|\s)login-link(\s|$)/.test(el.className || '');
        var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        var isDup = isLoginLink || t === 'حساب جديد' || t === 'تسجيل الدخول' || t === 'تسجيل الدخول / حساب جديد' || t === 'تسجيل الدخول/حساب جديد';
        if (isDup) { el.style.display = 'none'; el.setAttribute('data-otauth-dup', '1'); }
      }
    } catch (e) {}
  };

  /* ---------- modal ---------- */
  Widget.prototype.injectModal = function () {
    var overlay = document.createElement('div');
    overlay.className = 'otauth-overlay';
    overlay.setAttribute('dir', 'rtl');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'حساب العميل');
    overlay.hidden = true;
    overlay.innerHTML = this.modalTemplate();
    (document.body || document.documentElement).appendChild(overlay);
    this.el.overlay = overlay;

    var self = this;
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) self.setModal(false);
    });
    overlay.querySelector('.otauth-modal-close').addEventListener('click', function () {
      self.setModal(false);
    });

    // tabs
    this.el.tabs = overlay.querySelectorAll('.otauth-tab');
    for (var i = 0; i < this.el.tabs.length; i++) {
      (function (tab) {
        tab.addEventListener('click', function () { self.setMode(tab.getAttribute('data-mode')); });
      })(this.el.tabs[i]);
    }

    // login form
    this.el.loginForm = overlay.querySelector('.otauth-form-login');
    this.el.loginForm.addEventListener('submit', function (e) { e.preventDefault(); self.submitLogin(); });
    // signup form
    this.el.signupForm = overlay.querySelector('.otauth-form-signup');
    this.el.signupForm.addEventListener('submit', function (e) { e.preventDefault(); self.submitSignup(); });
  };

  Widget.prototype.modalTemplate = function () {
    return '' +
      '<div class="otauth-modal" role="document">' +
        '<button class="otauth-modal-close" type="button" aria-label="إغلاق">' + SVG.x + '</button>' +
        '<div class="otauth-brand"><span class="otauth-brand-dot"></span> One Trip</div>' +
        '<div class="otauth-tabs" role="tablist">' +
          '<button class="otauth-tab is-active" type="button" data-mode="login" role="tab">دخول</button>' +
          '<button class="otauth-tab" type="button" data-mode="signup" role="tab">حساب جديد</button>' +
        '</div>' +

        /* ---- LOGIN ---- */
        '<form class="otauth-form otauth-form-login" novalidate>' +
          '<div class="otauth-field">' +
            '<label class="otauth-label">البريد الإلكتروني أو رقم الجوال</label>' +
            '<input class="otauth-input" name="id" type="text" autocomplete="username" placeholder="بريدك أو جوالك">' +
            '<div class="otauth-err" data-err="id"></div>' +
          '</div>' +
          '<div class="otauth-field">' +
            '<label class="otauth-label">كلمة المرور</label>' +
            '<input class="otauth-input" name="password" type="password" autocomplete="current-password" placeholder="••••••">' +
            '<div class="otauth-err" data-err="password"></div>' +
          '</div>' +
          '<div class="otauth-form-err" aria-live="polite"></div>' +
          '<button class="otauth-submit" type="submit">تسجيل الدخول</button>' +
          '<div class="otauth-switch">ليس لديك حساب؟ <button type="button" class="otauth-link" data-go="signup">أنشئ حسابًا</button></div>' +
        '</form>' +

        /* ---- SIGNUP ---- */
        '<form class="otauth-form otauth-form-signup" novalidate hidden>' +
          '<div class="otauth-field">' +
            '<label class="otauth-label">الاسم</label>' +
            '<input class="otauth-input" name="name" type="text" autocomplete="name" placeholder="اسمك الكامل">' +
            '<div class="otauth-err" data-err="name"></div>' +
          '</div>' +
          '<div class="otauth-field">' +
            '<label class="otauth-label">البريد الإلكتروني</label>' +
            '<input class="otauth-input" name="email" type="email" autocomplete="email" placeholder="name@example.com" dir="ltr">' +
            '<div class="otauth-err" data-err="email"></div>' +
          '</div>' +
          '<div class="otauth-field">' +
            '<label class="otauth-label">رقم الجوال</label>' +
            '<input class="otauth-input" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="05XXXXXXXX" dir="ltr">' +
            '<div class="otauth-err" data-err="phone"></div>' +
          '</div>' +
          '<div class="otauth-field">' +
            '<label class="otauth-label">المدينة <span class="otauth-opt">(اختياري)</span></label>' +
            '<input class="otauth-input" name="city" type="text" autocomplete="address-level2" placeholder="مدينتك">' +
            '<div class="otauth-err" data-err="city"></div>' +
          '</div>' +
          '<div class="otauth-field">' +
            '<label class="otauth-label">كلمة المرور</label>' +
            '<input class="otauth-input" name="password" type="password" autocomplete="new-password" placeholder="٦ أحرف على الأقل">' +
            '<div class="otauth-err" data-err="password"></div>' +
          '</div>' +
          '<div class="otauth-form-err" aria-live="polite"></div>' +
          '<button class="otauth-submit" type="submit">إنشاء الحساب</button>' +
          '<div class="otauth-switch">لديك حساب؟ <button type="button" class="otauth-link" data-go="login">سجّل الدخول</button></div>' +
        '</form>' +
      '</div>';
  };

  /* ---------- render the control (logged in / out) ---------- */
  Widget.prototype.rerender = function () {
    if (!this.mounted || !this.el.control) return;
    var auth = Auth();
    var cust = (auth && typeof auth.current === 'function') ? safe(function () { return auth.current(); }, null) : null;
    var self = this;

    if (cust) {
      this.el.control.classList.add('is-in');
      this.el.control.innerHTML =
        '<button class="otauth-account" type="button" aria-haspopup="true" aria-expanded="' + (this.menuOpen ? 'true' : 'false') + '">' +
          '<span class="otauth-avatar">' + SVG.user + '</span>' +
          '<span class="otauth-account-name">' + esc(firstName(cust.name)) + '</span>' +
          '<span class="otauth-account-chev">' + SVG.chev + '</span>' +
        '</button>' +
        '<div class="otauth-menu" role="menu">' +
          '<div class="otauth-menu-head">' +
            '<div class="otauth-menu-name">' + esc(cust.name || 'عميل One Trip') + '</div>' +
            (cust.email ? '<div class="otauth-menu-mail" dir="ltr">' + esc(cust.email) + '</div>' : '') +
          '</div>' +
          '<a class="otauth-menu-item" role="menuitem" href="profile.html">' + SVG.profile + '<span>ملفي الشخصي</span></a>' +
          '<a class="otauth-menu-item" role="menuitem" href="profile.html#bookings">' + SVG.bookings + '<span>حجوزاتي</span></a>' +
          '<button class="otauth-menu-item otauth-menu-logout" role="menuitem" type="button">' + SVG.logout + '<span>تسجيل الخروج</span></button>' +
        '</div>';

      var accBtn = this.el.control.querySelector('.otauth-account');
      accBtn.addEventListener('click', function (e) { e.stopPropagation(); self.setMenu(!self.menuOpen); });
      this.el.control.querySelector('.otauth-menu-logout').addEventListener('click', function () {
        self.setMenu(false);
        var a = Auth();
        if (a && typeof a.logout === 'function') safe(function () { a.logout(); });
        else warned('logout unavailable — OneTrip.Auth missing.');
      });
      this.el.control.classList.toggle('is-menu-open', this.menuOpen);
    } else {
      this.menuOpen = false;
      this.el.control.classList.remove('is-in', 'is-menu-open');
      this.el.control.innerHTML =
        '<button class="otauth-btn otauth-btn-login" type="button">' +
          '<span class="otauth-btn-ic">' + SVG.user + '</span><span>تسجيل الدخول</span>' +
        '</button>' +
        '<button class="otauth-btn otauth-btn-signup" type="button">حساب جديد</button>';
      this.el.control.querySelector('.otauth-btn-login').addEventListener('click', function () { self.open('login'); });
      this.el.control.querySelector('.otauth-btn-signup').addEventListener('click', function () { self.open('signup'); });
    }
  };

  /* ---------- account menu ---------- */
  Widget.prototype.setMenu = function (v) {
    this.menuOpen = !!v;
    if (this.el.control) {
      this.el.control.classList.toggle('is-menu-open', this.menuOpen);
      var btn = this.el.control.querySelector('.otauth-account');
      if (btn) btn.setAttribute('aria-expanded', this.menuOpen ? 'true' : 'false');
    }
  };

  /* ---------- modal open/close + mode ---------- */
  Widget.prototype.open = function (mode) {
    this.setMode(mode === 'signup' ? 'signup' : 'login');
    this.setModal(true);
  };

  Widget.prototype.setModal = function (v) {
    this.modalOpen = !!v;
    if (!this.el.overlay) return;
    if (this.modalOpen) {
      this.clearErrors();
      this.el.overlay.hidden = false;
      // next frame -> trigger transition
      var ov = this.el.overlay;
      requestAnimationFrame(function () { ov.classList.add('is-open'); });
      var self = this;
      setTimeout(function () {
        var f = self.mode === 'signup' ? self.el.signupForm : self.el.loginForm;
        var inp = f && f.querySelector('.otauth-input');
        if (inp) inp.focus();
      }, 80);
    } else {
      this.el.overlay.classList.remove('is-open');
      var o = this.el.overlay;
      setTimeout(function () { if (!o.classList.contains('is-open')) o.hidden = true; }, 220);
    }
  };

  Widget.prototype.setMode = function (mode) {
    this.mode = mode === 'signup' ? 'signup' : 'login';
    if (!this.el.overlay) return;
    for (var i = 0; i < this.el.tabs.length; i++) {
      this.el.tabs[i].classList.toggle('is-active', this.el.tabs[i].getAttribute('data-mode') === this.mode);
    }
    this.el.loginForm.hidden = this.mode !== 'login';
    this.el.signupForm.hidden = this.mode !== 'signup';
    this.clearErrors();
    // wire the in-form switch links (idempotent)
    var self = this;
    var links = this.el.overlay.querySelectorAll('.otauth-link');
    for (var k = 0; k < links.length; k++) {
      if (links[k]._wired) continue;
      links[k]._wired = true;
      (function (lk) { lk.addEventListener('click', function () { self.setMode(lk.getAttribute('data-go')); }); })(links[k]);
    }
  };

  /* ---------- error helpers ---------- */
  Widget.prototype.clearErrors = function () {
    if (!this.el.overlay) return;
    var errs = this.el.overlay.querySelectorAll('.otauth-err');
    for (var i = 0; i < errs.length; i++) errs[i].textContent = '';
    var fields = this.el.overlay.querySelectorAll('.otauth-field');
    for (var j = 0; j < fields.length; j++) fields[j].classList.remove('is-invalid');
    var forms = this.el.overlay.querySelectorAll('.otauth-form-err');
    for (var f = 0; f < forms.length; f++) forms[f].textContent = '';
  };

  Widget.prototype.fieldErr = function (form, name, msg) {
    var box = form.querySelector('[data-err="' + name + '"]');
    if (box) {
      box.textContent = msg;
      var field = box.closest('.otauth-field');
      if (field) field.classList.add('is-invalid');
    }
  };

  Widget.prototype.formErr = function (form, msg) {
    var box = form.querySelector('.otauth-form-err');
    if (box) box.textContent = msg || '';
  };

  Widget.prototype.busy = function (form, on) {
    var btn = form.querySelector('.otauth-submit');
    if (btn) { btn.disabled = !!on; btn.classList.toggle('is-busy', !!on); }
  };

  /* ---------- submit: login ---------- */
  Widget.prototype.submitLogin = function () {
    var form = this.el.loginForm;
    this.clearErrors();
    var id = (form.id.value || '').trim();
    var password = form.password.value || '';
    var ok = true;

    if (!id) { this.fieldErr(form, 'id', 'أدخل بريدك الإلكتروني أو رقم جوالك.'); ok = false; }
    else if (!validEmail(id) && !validPhone(id)) { this.fieldErr(form, 'id', 'أدخل بريدًا صحيحًا أو رقم جوال صحيح.'); ok = false; }
    if (!validPass(password)) { this.fieldErr(form, 'password', 'كلمة المرور ٦ أحرف على الأقل.'); ok = false; }
    if (!ok) return;

    var auth = Auth();
    if (!auth || typeof auth.login !== 'function') {
      this.formErr(form, 'تعذّر الاتصال بنظام الحسابات. حاول لاحقًا.');
      warned('login unavailable — OneTrip.Auth missing.');
      return;
    }
    var self = this;
    this.busy(form, true);
    var res = safe(function () { return auth.login({ id: id, password: password }); }, { ok: false, error: 'حدث خطأ غير متوقع.' });
    this.busy(form, false);
    if (res && res.ok) {
      this.setModal(false);
      this.rerender();
    } else {
      this.formErr(form, (res && res.error) || 'بيانات الدخول غير صحيحة.');
    }
  };

  /* ---------- submit: signup ---------- */
  Widget.prototype.submitSignup = function () {
    var form = this.el.signupForm;
    this.clearErrors();
    var name = (form.name.value || '').trim();
    var email = (form.email.value || '').trim();
    var phone = (form.phone.value || '').trim();
    var city = (form.city.value || '').trim();
    var password = form.password.value || '';
    var ok = true;

    if (!name) { this.fieldErr(form, 'name', 'أدخل اسمك.'); ok = false; }
    if (!validEmail(email)) { this.fieldErr(form, 'email', 'أدخل بريدًا إلكترونيًا صحيحًا.'); ok = false; }
    if (!validPhone(phone)) { this.fieldErr(form, 'phone', 'رقم الجوال ٩ أرقام على الأقل.'); ok = false; }
    if (!validPass(password)) { this.fieldErr(form, 'password', 'كلمة المرور ٦ أحرف على الأقل.'); ok = false; }
    if (!ok) return;

    var auth = Auth();
    if (!auth || typeof auth.signup !== 'function') {
      this.formErr(form, 'تعذّر الاتصال بنظام الحسابات. حاول لاحقًا.');
      warned('signup unavailable — OneTrip.Auth missing.');
      return;
    }
    var payload = { name: name, email: email, phone: phone, password: password };
    if (city) payload.city = city;

    var self = this;
    this.busy(form, true);
    var res = safe(function () { return auth.signup(payload); }, { ok: false, error: 'حدث خطأ غير متوقع.' });
    this.busy(form, false);
    if (res && res.ok) {
      this.setModal(false);
      this.rerender();
    } else {
      this.formErr(form, (res && res.error) || 'تعذّر إنشاء الحساب.');
    }
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

  WIN_NS.AuthWidget = WIN_NS.AuthWidget || {
    mount: mount,
    open: function (mode) { var w = mount(WIN_NS.AuthWidget.options || {}); if (w) w.open(mode); return w; },
    instance: function () { return _instance; }
  };

  function autoMount() {
    if (WIN_NS.AuthWidget._auto) return;
    WIN_NS.AuthWidget._auto = true;
    mount(WIN_NS.AuthWidget.options || {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount, { once: true });
  } else {
    autoMount();
  }
})(window, document);
