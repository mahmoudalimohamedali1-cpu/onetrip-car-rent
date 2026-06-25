/* ============================================================
   One Trip — وحدة خرائط الفروع (مشتركة)
   ------------------------------------------------------------
   مصدر واحد لعرض موقع الفرع على خرائط جوجل في أي صفحة:
     - لوحة التحكم (admin.html)  → معاينة الموقع عند إضافة/تعديل فرع
     - ودجة الشات (chat-widget)  → خريطة عند اختيار العميل للفرع
     - صفحات الموقع (تواصل/حجز)  → خريطة الفرع المختار

   تعتمد على إحداثيات الفرع (lat/lng) المخزّنة في ot_branches، وتقبل
   لصق رابط جوجل مابس لاستخراج الإحداثيات تلقائيًا. الـembed يعمل
   بدون مفتاح API (نمط maps.google.com/...&output=embed).
   ============================================================ */
;(function(){
  'use strict';

  var K_BRANCHES = 'ot_branches';
  var DEFAULT_BRANCHES = [{ name:'فرع العليا', city:'الرياض', phone:'920000000' }];

  function readBranches(){
    try { var a = JSON.parse(localStorage.getItem(K_BRANCHES)); if (Array.isArray(a) && a.length) return a; } catch(e){}
    return DEFAULT_BRANCHES;
  }

  function num(v){ var n = parseFloat(v); return isNaN(n) ? null : n; }

  /* استخراج (lat,lng) من رابط جوجل مابس أو نص "lat,lng" */
  function parseLatLng(str){
    if (!str) return null;
    str = String(str);
    var m;
    /* نمط @lat,lng,zoom  (رابط الخريطة العادي) */
    m = str.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
    if (m) return { lat:num(m[1]), lng:num(m[2]) };
    /* نمط !3dLAT!4dLNG (داخل روابط الأماكن) */
    m = str.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/);
    if (m) return { lat:num(m[1]), lng:num(m[2]) };
    /* نمط q=lat,lng أو query=lat,lng أو ll=lat,lng */
    m = str.match(/(?:[?&](?:q|query|ll|destination)=)(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/);
    if (m) return { lat:num(m[1]), lng:num(m[2]) };
    /* نص مباشر "lat, lng" */
    m = str.match(/^\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/);
    if (m) return { lat:num(m[1]), lng:num(m[2]) };
    return null;
  }

  function hasLatLng(b){ return b && num(b.lat) !== null && num(b.lng) !== null; }
  function hasLocation(b){ return hasLatLng(b) || !!(b && (b.address || b.city)); }

  function addrQuery(b){
    var parts = [];
    if (b.name) parts.push(b.name);
    if (b.address) parts.push(b.address);
    if (b.city) parts.push(b.city);
    return parts.join('، ') || 'الرياض';
  }

  /* رابط الـembed (iframe) — بدون مفتاح API */
  function embedURL(b){
    if (!b) return '';
    if (hasLatLng(b)) return 'https://maps.google.com/maps?q=' + num(b.lat) + ',' + num(b.lng) + '&z=15&hl=ar&output=embed';
    return 'https://maps.google.com/maps?q=' + encodeURIComponent(addrQuery(b)) + '&z=14&hl=ar&output=embed';
  }

  /* رابط فتح الخريطة في تطبيق/موقع جوجل */
  function linkURL(b){
    if (!b) return '#';
    if (hasLatLng(b)) return 'https://www.google.com/maps/search/?api=1&query=' + num(b.lat) + ',' + num(b.lng);
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addrQuery(b));
  }

  /* HTML للـiframe — opts:{height,style,class} */
  function embedHTML(b, opts){
    opts = opts || {};
    if (!hasLocation(b)) return '<div style="padding:14px;color:#888;font-size:13px">لا يوجد موقع محدّد لهذا الفرع.</div>';
    var h = opts.height || 200;
    var cls = opts.class || 'ot-map-frame';
    return '<iframe class="' + cls + '" src="' + embedURL(b) + '" ' +
      'style="' + (opts.style || ('width:100%;height:' + h + 'px;border:0;border-radius:12px;display:block')) + '" ' +
      'loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen title="موقع الفرع"></iframe>';
  }

  window.OneTrip = window.OneTrip || {};
  window.OneTrip.BranchMap = {
    branches:    readBranches,
    parseLatLng: parseLatLng,
    hasLatLng:   hasLatLng,
    hasLocation: hasLocation,
    embedURL:    embedURL,
    linkURL:     linkURL,
    embedHTML:   embedHTML
  };
})();
