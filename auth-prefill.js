/* auth-prefill.js — One Trip
   Glue آمن وإضافي: لو العميل مسجّل دخول، يملأ تلقائيًا حقول الاسم/الإيميل/الجوال
   الفاضية في فورمات الحجز/التواصل. لا يكتب فوق أي حقل غير فاضٍ. لا يرمي أخطاء.
   مالك الملف: إيجنت E (راجع AUTH_CONTRACT.md §7). */
(function () {
  'use strict';

  function fillIfEmpty(el, value) {
    try {
      if (!el || value == null || value === '') return;
      // لا تكتب فوق حقل غير فاضٍ
      if (el.value && String(el.value).trim() !== '') return;
      if (el.disabled || el.readOnly) return;
      el.value = value;
      // أطلق events عشان أي تحقق/تخزين مرتبط بالحقل يلتقط القيمة
      try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
      try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
    } catch (e) {}
  }

  function isNameField(el) {
    try {
      var n = (el.getAttribute('name') || '').toLowerCase();
      var dr = (el.getAttribute('data-role') || '').toLowerCase();
      var ph = (el.getAttribute('placeholder') || '');
      var id = (el.id || '').toLowerCase();
      return (
        n.indexOf('name') !== -1 ||
        id.indexOf('name') !== -1 ||
        dr === 'name' ||
        ph.indexOf('الاسم') !== -1 || ph.indexOf('اسم') !== -1
      );
    } catch (e) { return false; }
  }

  function run() {
    try {
      var OT = window.OneTrip;
      if (!OT || !OT.Auth || typeof OT.Auth.isLoggedIn !== 'function') return;
      if (!OT.Auth.isLoggedIn()) return;
      var cust = (typeof OT.Auth.current === 'function') ? OT.Auth.current() : null;
      if (!cust) return;

      // الإيميل
      if (cust.email) {
        var emails = document.querySelectorAll('input[type="email"]');
        for (var i = 0; i < emails.length; i++) fillIfEmpty(emails[i], cust.email);
      }

      // الجوال
      if (cust.phone) {
        var tels = document.querySelectorAll('input[type="tel"]');
        for (var j = 0; j < tels.length; j++) fillIfEmpty(tels[j], cust.phone);
      }

      // الاسم — نبحث في كل حقول النص ونرشّح بالاسم
      if (cust.name) {
        var nameSel = 'input[name*="name" i], input[data-role="name"]';
        var names = document.querySelectorAll(nameSel);
        for (var k = 0; k < names.length; k++) fillIfEmpty(names[k], cust.name);
        // fallback: حقول text ذات placeholder عربي يشير للاسم
        var texts = document.querySelectorAll('input[type="text"]');
        for (var m = 0; m < texts.length; m++) {
          if (isNameField(texts[m])) fillIfEmpty(texts[m], cust.name);
        }
      }
    } catch (e) {}
  }

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  } catch (e) {}
})();
