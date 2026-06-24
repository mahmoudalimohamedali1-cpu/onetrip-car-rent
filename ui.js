/* ============================================================
   One Trip — shared UI components (single source for markup)
   ------------------------------------------------------------
   Currently provides the daily-booking search widget (tab-bar +
   form-card) shared by fleet.html and create-booking.html, which
   previously kept two byte-identical copies. Edit it once here.

   Usage in a page:
     <section class="booking" id="bookingWidget"></section>
     ...
     OneTrip.mountBookingWidget('#bookingWidget');   // before wiring events

   The mounted markup keeps the same element IDs (#tabBar,
   #returnToggle, #returnCheckbox, #searchBtn) so each page's
   existing interaction script keeps working unchanged.
   ============================================================ */
;(function(){
  'use strict';

  function bookingWidgetHTML(opts){
    opts = opts || {};
    var placeholder = opts.placeholder || 'مكان البحث — الرياض، مطار الملك خالد…';
    return ''
      + '<div class="tab-bar" id="tabBar">'
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
          + 'بلو ليموزين'
        + '</button>'
      + '</div>'

      + '<div class="form-card">'
        + '<img class="form-skyline" src="booking-skyline.png" alt="" aria-hidden="true">'
        + '<div class="form-content">'
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
                + '<input type="text" placeholder="' + placeholder + '">'
              + '</div>'
            + '</div>'
            + '<div>'
              + '<label class="field-label">تاريخ و وقت التسليم</label>'
              + '<div class="dt-row">'
                + '<div class="field-box date"><input type="text" placeholder="التاريخ"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#f5901e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="17" rx="3"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><line x1="8" y1="2.5" x2="8" y2="6"/><line x1="16" y1="2.5" x2="16" y2="6"/></svg></div>'
                + '<div class="field-box time"><input type="text" placeholder="الوقت"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#f5901e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg></div>'
              + '</div>'
            + '</div>'
            + '<div>'
              + '<label class="field-label">تاريخ و وقت العودة</label>'
              + '<div class="dt-row">'
                + '<div class="field-box date"><input type="text" placeholder="التاريخ"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#f5901e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="17" rx="3"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><line x1="8" y1="2.5" x2="8" y2="6"/><line x1="16" y1="2.5" x2="16" y2="6"/></svg></div>'
                + '<div class="field-box time"><input type="text" placeholder="الوقت"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#f5901e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg></div>'
              + '</div>'
            + '</div>'
          + '</div>'
          + '<div class="search-row">'
            + '<button class="search-btn" id="searchBtn" type="button">بحث'
              + '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#eef1ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>'
            + '</button>'
          + '</div>'
        + '</div>'
      + '</div>';
  }

  function mountBookingWidget(sel, opts){
    var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (el) el.innerHTML = bookingWidgetHTML(opts);
    return el;
  }

  window.OneTrip = window.OneTrip || {};
  window.OneTrip.bookingWidgetHTML = bookingWidgetHTML;
  window.OneTrip.mountBookingWidget = mountBookingWidget;
})();
