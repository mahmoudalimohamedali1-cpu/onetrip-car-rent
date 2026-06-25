/* ============================================================
   One Trip — Contact form data layer (STANDALONE, local-only)
   ------------------------------------------------------------
   Dedicated inbox for the "تواصل معنا" form. Fully independent
   of the orders/leads system (its own localStorage key + its own
   namespace OneTripContact), so it never collides with anything else.

   Used by:
     - contact.html        → OneTripContact.add(...) on submit
     - contact-inbox.html  → OneTripContact.load() + reply builders

   No server / no Supabase. Messages live in localStorage on the
   device. "Direct reply" is done via WhatsApp (wa.me) and email
   (mailto) deep-links built here.

   ⚠️ PLACEHOLDERS — change BUSINESS below to the real values once
   ready; everything (form + inbox) reads from this single place.
   ============================================================ */
;(function(){
  'use strict';

  var BUSINESS = {
    name:     'One Trip Car Rent',
    whatsapp: '966500000000',     // ← placeholder — international format, digits only, no +
    email:    'info@onetrip.sa'   // ← placeholder — business email
  };

  var KEY = 'ot_contact_messages';   // dedicated key — separate from ot_leads

  function digits(s){ return String(s||'').replace(/[^0-9]/g,''); }

  function load(){
    try { var a = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  function persist(list){ try { localStorage.setItem(KEY, JSON.stringify(list)); } catch(e){} }

  /* add a submission; returns the saved record (with id, date, read flag) */
  function add(msg){
    var list = load();
    var now = new Date();
    var rec = {
      id:      'cm_' + now.getTime(),
      name:    (msg.name    || '').trim(),
      email:   (msg.email   || '').trim(),
      phone:   (msg.phone   || '').trim(),
      subject: (msg.subject || '').trim(),
      message: (msg.message || '').trim(),
      ts:      now.getTime(),
      date:    now.toLocaleDateString('ar-EG') + ' ' + now.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}),
      read:    false
    };
    list.push(rec); persist(list); return rec;
  }

  function markRead(id, v){ var l = load(); l.forEach(function(m){ if(m.id===id) m.read = (v !== false); }); persist(l); }
  function remove(id){ persist(load().filter(function(m){ return m.id !== id; })); }
  function clearAll(){ persist([]); }
  function unreadCount(){ return load().filter(function(m){ return !m.read; }).length; }

  /* ---- direct-reply deep links (business → customer) ---- */
  function waReplyCustomer(rec){
    var text = 'مرحبًا ' + (rec.name || '') + '،\nشكرًا لتواصلك مع ' + BUSINESS.name + '.'
             + (rec.subject ? '\nبخصوص: ' + rec.subject : '')
             + (rec.message ? '\n«' + rec.message + '»' : '');
    return 'https://wa.me/' + digits(rec.phone) + '?text=' + encodeURIComponent(text);
  }
  function mailReplyCustomer(rec){
    var subj = 'رد من ' + BUSINESS.name + (rec.subject ? ' — ' + rec.subject : '');
    var body = 'مرحبًا ' + (rec.name || '') + '،\n\nشكرًا لتواصلك معنا.'
             + (rec.message ? '\nبخصوص استفسارك:\n«' + rec.message + '»\n' : '')
             + '\n\nمع تحيات فريق ' + BUSINESS.name;
    return 'mailto:' + encodeURIComponent(rec.email) + '?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(body);
  }

  /* ---- direct-contact deep links (customer → business) ---- */
  function waContactBusiness(prefill){
    return 'https://wa.me/' + digits(BUSINESS.whatsapp) + (prefill ? '?text=' + encodeURIComponent(prefill) : '');
  }
  function mailContactBusiness(subject, body){
    return 'mailto:' + BUSINESS.email
         + '?subject=' + encodeURIComponent(subject || '')
         + (body ? '&body=' + encodeURIComponent(body) : '');
  }

  window.OneTripContact = {
    BUSINESS: BUSINESS, KEY: KEY,
    load: load, add: add, markRead: markRead, remove: remove, clearAll: clearAll, unreadCount: unreadCount,
    waReplyCustomer: waReplyCustomer, mailReplyCustomer: mailReplyCustomer,
    waContactBusiness: waContactBusiness, mailContactBusiness: mailContactBusiness
  };
})();
