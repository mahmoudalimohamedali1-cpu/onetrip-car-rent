/* ============================================================
   One Trip — shared UI components (single source for markup)
   ------------------------------------------------------------
   Booking search widget (tab-bar + form-card) shared by
   index.html / fleet.html / create-booking.html.

   Usage in a page:
     <section class="booking" id="bookingWidget"></section>
     OneTrip.mountBookingWidget('#bookingWidget');

   mountBookingWidget injects the markup AND wires every
   interaction internally (tab switching, return toggle, action
   buttons) — pages wire nothing.

   IMPORTANT: tab 0 "ابحث الآن" markup is kept byte-identical to
   the original design (text fields). The other tabs reuse the
   exact same .field-grid / .field-box / .field-label styling so
   the card looks unchanged. Only behaviour was added.
   ============================================================ */
;(function(){
  'use strict';

  /* ---- icons (orange, match the original card) ---- */
  var PIN   = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f5901e" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 5.5-8 11-8 11s-8-5.5-8-11a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.6"/></svg>';
  var CAL   = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#f5901e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="17" rx="3"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><line x1="8" y1="2.5" x2="8" y2="6"/><line x1="16" y1="2.5" x2="16" y2="6"/></svg>';
  var CLK   = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#f5901e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>';
  var DOC   = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#f5901e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><polyline points="14 3 14 8 19 8"/></svg>';
  var PHONE = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#f5901e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8.1 9.6a16 16 0 0 0 6 6l1.2-1.1a2 2 0 0 1 2.1-.5c.8.3 1.7.6 2.6.7a2 2 0 0 1 1.7 2Z"/></svg>';
  var USER  = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#f5901e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  var FLAG  = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#f5901e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V4M4 4h13l-2 4 2 4H4"/></svg>';
  var SEARCH= '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#eef1ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>';

  var SELSTYLE = 'border:none;background:transparent;outline:none;width:100%;font-size:15.5px;font-weight:600;color:#1b2a7a;font-family:inherit;cursor:pointer;';

  function branchOpts(){
    var br = (window.OTB && OTB.branches && OTB.branches()) || [];
    return br.map(function(b){ return '<option value="'+b.name+'">'+b.name+'</option>'; }).join('');
  }
  var MONTHS = '<option value="12">١٢ شهر</option><option value="24">٢٤ شهر</option><option value="36">٣٦ شهر</option>';

  function fbInput(icon, type, ph, role){
    return '<div class="field-box">'+icon+'<input type="'+type+'" placeholder="'+ph+'" data-role="'+role+'"></div>';
  }
  function fbSelect(icon, role, optsHTML){
    return '<div class="field-box">'+icon+'<select data-role="'+role+'" style="'+SELSTYLE+'">'+optsHTML+'</select></div>';
  }

  /* ---- tab bar (unchanged from original) ---- */
  function tabBarHTML(){
    return '<div class="tab-bar" id="tabBar">'
      + '<button class="tab active" data-tab="0">'
        + '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 16.5l1.2-4.6A2.2 2.2 0 0 1 8.3 10.3h7.4a2.2 2.2 0 0 1 2.1 1.6l1.2 4.6"/><path d="M4 16.5h16v2.2a1 1 0 0 1-1 1h-1.6a1 1 0 0 1-1-1v-1.2H7.6v1.2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"/></svg>'
        + 'ابحث الآن'
      + '</button>'
      + '<button class="tab" data-tab="1">'
        + '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18h16M5.5 18 4 8l4.5 3.4L12 5l3.5 6.4L20 8l-1.5 10"/></svg>'
        + 'الاشتراك الشهري'
      + '</button>'
      + '<span class="tab-divider"></span>'
      + '<button class="tab" data-tab="2">'
        + '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="17" rx="3"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><line x1="8" y1="2.5" x2="8" y2="6"/><line x1="16" y1="2.5" x2="16" y2="6"/></svg>'
        + 'إدارة الحجز'
      + '</button>'
      + '<span class="tab-divider"></span>'
      + '<button class="tab" data-tab="3">'
        + '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><polyline points="14 3 14 8 19 8"/></svg>'
        + 'تأجير طويل الأجل'
      + '</button>'
      + '<span class="tab-divider"></span>'
      + '<button class="tab" data-tab="4">'
        + '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="20" x2="18" y2="10.5"/><line x1="18" y1="20" x2="6" y2="10.5"/><path d="M12 10c-1.7-1.1-2.3-2.9-1.7-4.7.9.7 1.4 1.6 1.7 2.7.3-1.1.8-2 1.7-2.7.6 1.8 0 3.6-1.7 4.7Z" fill="currentColor" stroke="none"/></svg>'
        + 'ون تريب ليموزين'
      + '</button>'
    + '</div>';
  }

  /* ---- tab 0: daily search — BYTE-IDENTICAL to the original design ---- */
  function dailyPane(placeholder){
    return '<div data-form="0">'
      + '<div class="field-grid">'
        + '<div>'
          + '<div class="field-head">'
            + '<label class="field-label inline">موقع الاستلام و التسليم</label>'
            + '<label class="return-toggle" id="returnToggle">'
              + '<span class="checkbox" id="returnCheckbox"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1b2a7a" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>'
              + 'الرجوع لموقع مختلف'
            + '</label>'
          + '</div>'
          + '<div class="field-box">'
            + '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f5901e" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 5.5-8 11-8 11s-8-5.5-8-11a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.6"/></svg>'
            + '<select data-role="pickup" style="' + SELSTYLE + '"><option value="">' + placeholder + '</option>' + branchOpts() + '</select>'
          + '</div>'
          + '<div id="dropoffWrap" style="display:none;margin-top:10px;">'
            + '<div class="field-box">'
              + '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f5901e" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 5.5-8 11-8 11s-8-5.5-8-11a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.6"/></svg>'
              + '<select data-role="dropoff" style="' + SELSTYLE + '"><option value="">موقع التسليم</option>' + branchOpts() + '</select>'
            + '</div>'
          + '</div>'
        + '</div>'
        + '<div>'
          + '<label class="field-label">تاريخ و وقت التسليم</label>'
          + '<div class="dt-row">'
            + '<div class="field-box date"><input type="date" data-role="pickDate">' + CAL + '</div>'
            + '<div class="field-box time"><input type="time" data-role="pickTime">' + CLK + '</div>'
          + '</div>'
        + '</div>'
        + '<div>'
          + '<label class="field-label">تاريخ و وقت العودة</label>'
          + '<div class="dt-row">'
            + '<div class="field-box date"><input type="date" data-role="retDate">' + CAL + '</div>'
            + '<div class="field-box time"><input type="time" data-role="retTime">' + CLK + '</div>'
          + '</div>'
        + '</div>'
      + '</div>'
      + '<div class="search-row">'
        + '<button class="search-btn" id="searchBtn" type="button" data-action="daily">بحث' + SEARCH + '</button>'
      + '</div>'
    + '</div>';
  }

  /* ---- tab 1: monthly subscription ---- */
  function monthlyPane(){
    return '<div data-form="1" style="display:none;">'
      + '<div class="field-grid">'
        + '<div><label class="field-label">فرع الاستلام</label>' + fbSelect(PIN,'branch',branchOpts()) + '</div>'
        + '<div><label class="field-label">تاريخ البداية</label>' + fbInput(CAL,'text','مثال: ٢٠٢٦/٠٨/٠١','start') + '</div>'
        + '<div><label class="field-label">مدة الاشتراك</label>' + fbSelect(CLK,'months',MONTHS) + '</div>'
      + '</div>'
      + '<div class="search-row">'
        + '<button class="search-btn" type="button" data-action="monthly">اعرض الباقات الشهرية' + SEARCH + '</button>'
      + '</div>'
    + '</div>';
  }

  /* ---- tab 2: manage booking ---- */
  function managePane(){
    return '<div data-form="2" style="display:none;">'
      + '<div class="field-grid">'
        + '<div><label class="field-label">رقم الحجز</label>' + fbInput(DOC,'text','OT-123456','ref') + '</div>'
        + '<div><label class="field-label">رقم الجوال</label>' + fbInput(PHONE,'tel','05XXXXXXXX','phone') + '</div>'
      + '</div>'
      + '<div class="search-row">'
        + '<button class="search-btn" type="button" data-action="manage">عرض الحجز' + SEARCH + '</button>'
      + '</div>'
    + '</div>';
  }

  /* ---- tab 3: long-term rental ---- */
  function longtermPane(){
    return '<div data-form="3" style="display:none;">'
      + '<div class="field-grid">'
        + '<div><label class="field-label">فرع الاستلام</label>' + fbSelect(PIN,'branch',branchOpts()) + '</div>'
        + '<div><label class="field-label">مدة الإيجار</label>' + fbSelect(CLK,'months',MONTHS) + '</div>'
        + '<div><label class="field-label">نوع العميل</label>' + fbSelect(USER,'ctype','<option value="فرد">فرد</option><option value="شركة">شركة</option>') + '</div>'
      + '</div>'
      + '<div class="search-row">'
        + '<button class="search-btn" type="button" data-action="longterm">اطلب عرضًا' + SEARCH + '</button>'
      + '</div>'
    + '</div>';
  }

  /* ---- tab 4: blue limousine ---- */
  function limoPane(){
    return '<div data-form="4" style="display:none;">'
      + '<div class="field-grid">'
        + '<div><label class="field-label">من</label>' + fbInput(PIN,'text','مكان الانطلاق','from') + '</div>'
        + '<div><label class="field-label">إلى</label>' + fbInput(FLAG,'text','الوجهة','to') + '</div>'
        + '<div><label class="field-label">رقم الجوال</label>' + fbInput(PHONE,'tel','05XXXXXXXX','phone') + '</div>'
      + '</div>'
      + '<div class="search-row">'
        + '<button class="search-btn" type="button" data-action="limo">اطلب ليموزين' + SEARCH + '</button>'
      + '</div>'
    + '</div>';
  }

  function bookingWidgetHTML(opts){
    opts = opts || {};
    var placeholder = opts.placeholder || 'مكان البحث — الرياض، مطار الملك خالد…';
    return tabBarHTML()
      + '<div class="form-card">'
        + '<img class="form-skyline deco deco-skyline" src="booking-skyline.png" alt="" aria-hidden="true">'
        + '<div class="form-content">'
          + '<div data-role="alert" style="display:none;margin-bottom:16px;padding:12px 16px;border-radius:12px;font-weight:800;font-size:14.5px;"></div>'
          + dailyPane(placeholder)
          + monthlyPane()
          + managePane()
          + longtermPane()
          + limoPane()
        + '</div>'
      + '</div>';
  }

  /* ---- helpers ---- */
  function val(el){ return el ? (el.value||'').trim() : ''; }
  function role(pane, r){ return pane ? pane.querySelector('[data-role="'+r+'"]') : null; }
  function alertEl(root){ return root.querySelector('[data-role="alert"]'); }
  function showAlert(root, msg, ok){
    var a = alertEl(root); if(!a) return;
    a.textContent = msg;
    if(ok){ a.style.background='#e7f7ee'; a.style.border='1.5px solid #138a52'; a.style.color='#0f7a47'; }
    else  { a.style.background='#fff5ea'; a.style.border='1.5px solid #f5901e'; a.style.color='#9a4d00'; }
    a.style.display='';
  }
  function hideAlert(root){ var a=alertEl(root); if(a) a.style.display='none'; }

  /* ---- actions ---- */
  function doDaily(root, pane){
    var pickup = val(role(pane,'pickup'));
    var dropoff = val(role(pane,'dropoff'));
    var pd = val(role(pane,'pickDate')), pt = val(role(pane,'pickTime')) || '10:00';
    var rd = val(role(pane,'retDate')),  rt = val(role(pane,'retTime'))  || '10:00';
    var pickupAt = pd ? (pd + 'T' + pt) : '';
    var returnAt = rd ? (rd + 'T' + rt) : '';
    if (pickupAt && returnAt && new Date(returnAt) <= new Date(pickupAt)){
      showAlert(root, 'تاريخ العودة لازم يكون بعد تاريخ الاستلام.'); return;
    }
    if (window.OTB && OTB.draft){
      var d = {};
      if (pickup){ d.pickup = pickup; d.dropoff = dropoff || pickup; }
      if (pickupAt) d.pickupAt = pickupAt;
      if (returnAt) d.returnAt = returnAt;
      OTB.draft.set(d);
    }
    location.href = 'create-booking.html';
  }
  function doMonthly(root, pane){
    var branch = val(role(pane,'branch')), start = val(role(pane,'start')), months = val(role(pane,'months')) || '12';
    if (window.OTB && OTB.lead) OTB.lead({ type:'monthly', message:'اشتراك شهري — ' + branch + (start?('، يبدأ '+start):'') + '، مدة ' + months + ' شهر' });
    location.href = 'long-term.html';
  }
  function doManage(root, pane){
    var ref = val(role(pane,'ref')), phone = val(role(pane,'phone'));
    if (!ref){ showAlert(root, 'من فضلك أدخل رقم الحجز.'); return; }
    location.href = 'manage-booking.html?ref=' + encodeURIComponent(ref) + '&phone=' + encodeURIComponent(phone);
  }
  function doLongterm(root, pane){
    var branch = val(role(pane,'branch')), months = val(role(pane,'months')) || '12', ctype = val(role(pane,'ctype')) || 'فرد';
    if (window.OTB && OTB.lead) OTB.lead({ type:'longterm', message:'تأجير طويل الأجل — ' + ctype + '، ' + branch + '، مدة ' + months + ' شهر' });
    location.href = (ctype === 'شركة') ? 'corporate.html' : 'long-term.html';
  }
  function doLimo(root, pane){
    var from = val(role(pane,'from')), to = val(role(pane,'to')), phone = val(role(pane,'phone'));
    if (!phone){ showAlert(root, 'من فضلك أدخل رقم الجوال للتواصل.'); return; }
    if (window.OTB && OTB.lead) OTB.lead({ type:'limousine', phone:phone, message:'ليموزين — من ' + (from||'—') + ' إلى ' + (to||'—') });
    showAlert(root, 'تم استلام طلب الليموزين ✓ — هنتواصل معاك في أقرب وقت.', true);
    ['from','to','phone'].forEach(function(r){ var el=role(pane,r); if(el) el.value=''; });
  }
  var ACTIONS = { daily:doDaily, monthly:doMonthly, manage:doManage, longterm:doLongterm, limo:doLimo };

  /* ---- self-wiring ---- */
  function wire(root){
    if (!root) return;
    var tabBar = root.querySelector('#tabBar');
    var panes  = root.querySelectorAll('.form-content > [data-form]');

    if (tabBar){
      tabBar.querySelectorAll('.tab').forEach(function(tab){
        tab.addEventListener('click', function(){
          tabBar.querySelectorAll('.tab').forEach(function(t){ t.classList.remove('active'); });
          tab.classList.add('active');
          var idx = tab.getAttribute('data-tab');
          panes.forEach(function(p){ p.style.display = (p.getAttribute('data-form') === idx) ? '' : 'none'; });
          hideAlert(root);
        });
      });
    }

    /* return-location toggle — reveals the drop-off branch field */
    var rT = root.querySelector('#returnToggle'), rC = root.querySelector('#returnCheckbox'), drop = root.querySelector('#dropoffWrap');
    if (rT && rC){
      rT.addEventListener('click', function(e){
        e.preventDefault();
        var on = !rC.classList.contains('checked');
        rC.classList.toggle('checked', on);
        if (drop) drop.style.display = on ? '' : 'none';
      });
    }

    /* sensible defaults for the daily date/time fields (today 10:00 → +3 days 10:00) */
    var dailyEl = root.querySelector('[data-form="0"]');
    if (dailyEl){
      var pad = function(n){ return (n<10?'0':'') + n; };
      var fmt = function(d){ return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); };
      var now = new Date(), plus3 = new Date(now.getTime() + 3*86400000);
      var setv = function(r, v){ var el = role(dailyEl, r); if (el && !el.value) el.value = v; };
      setv('pickDate', fmt(now));   setv('pickTime', '10:00');
      setv('retDate',  fmt(plus3)); setv('retTime', '10:00');
    }

    /* one-time scoped style: native date/time pickers open on click but keep the orange icon */
    if (!document.getElementById('otb-widget-style')){
      var st = document.createElement('style'); st.id = 'otb-widget-style';
      st.textContent =
        '.form-card .field-box{position:relative;}'
        + '.form-card input[type=date],.form-card input[type=time]{color:#1b2a7a;font-weight:600;}'
        + '.form-card input[type=date]::-webkit-calendar-picker-indicator,.form-card input[type=time]::-webkit-calendar-picker-indicator{opacity:0;position:absolute;inset:0;width:100%;height:100%;margin:0;cursor:pointer;}';
      document.head.appendChild(st);
    }

    root.querySelectorAll('[data-action]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var pane = btn.closest('[data-form]');
        var fn = ACTIONS[btn.getAttribute('data-action')];
        try { if (fn) fn(root, pane); }
        catch(err){ if (btn.getAttribute('data-action') === 'daily') location.href = 'create-booking.html'; }
      });
    });
  }

  function mountBookingWidget(sel, opts){
    var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (el){ el.innerHTML = bookingWidgetHTML(opts); wire(el); }
    return el;
  }

  window.OneTrip = window.OneTrip || {};
  window.OneTrip.bookingWidgetHTML = bookingWidgetHTML;
  window.OneTrip.mountBookingWidget = mountBookingWidget;
})();
