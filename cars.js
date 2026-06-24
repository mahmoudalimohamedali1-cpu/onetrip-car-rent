/* ============================================================
   One Trip — master car catalog (SINGLE SOURCE OF TRUTH)
   ------------------------------------------------------------
   Every page renders from this one list:
     - الرئيسية (index.html)       → عرض الأسطول   → OneTrip.fleetData()
     - الحجز/الأسطول (fleet, create-booking) → تسعير يومي → OneTrip.bookingCars()
     - طويل الأجل (long-term.html)  → تسعير شهري    → OneTrip.ltCars()

   Edit a car ONCE here and it updates everywhere. The builder
   functions below reshape this catalog into the exact object
   each page already expects, so page render code stays unchanged.

   Pricing contexts per car:
     daily    — daily booking price (SAR)
     showcase — homepage card price (SAR/day);  null = not on homepage
     monthly  — long-term price by contract length {12,24,36} (SAR/mo)
   ============================================================ */
;(function(){
  'use strict';

  var TAX_NOTE = 'السعر لا يشمل الضريبة';

  var CARS = [
    {
      id:'camry23', name:'تويوتا كامري 2023', category:'سيدان متوسطة', image:'assets/cars/camry.png',
      year:2023, seats:5, bags:2, gear:'أوتوماتيك', doors:4, ac:true,
      daily:180, available:true, bookingBadge:'الأكثر طلبًا',
      onHomepage:true, order:1, showcase:299, featured:false, showcaseBadge:null,
      monthly:{12:2968, 24:2822, 36:2408}
    },
    {
      id:'accent25', name:'هيونداي أكسنت 2025', category:'سيدان صغيرة', image:'assets/cars/accent.png',
      year:2025, seats:5, bags:2, gear:'أوتوماتيك', doors:4, ac:true,
      daily:120, available:true, bookingBadge:null,
      onHomepage:true, order:2, showcase:259, featured:true, showcaseBadge:'الأكثر طلبًا',
      monthly:{12:1736, 24:1652, 36:1406}
    },
    {
      id:'sunny26', name:'نيسان صني 2026', category:'سيدان اقتصادية', image:'assets/cars/sunny26.png',
      year:2026, seats:5, bags:1, gear:'أوتوماتيك', doors:4, ac:true,
      daily:110, available:true, bookingBadge:'جديد',
      onHomepage:true, order:3, showcase:249, featured:false, showcaseBadge:null,
      monthly:{12:1641, 24:1562, 36:1327}
    },
    {
      id:'sunny25', name:'نيسان صني 2025', category:'سيدان اقتصادية', image:'assets/cars/sunny25.png',
      year:2025, seats:5, bags:1, gear:'أوتوماتيك', doors:4, ac:true,
      daily:105, available:true, bookingBadge:null,
      onHomepage:true, order:4, showcase:249, featured:false, showcaseBadge:null,
      monthly:{12:1590, 24:1510, 36:1290}
    },
    {
      id:'camry23-full', name:'تويوتا كامري 2023 — فل', category:'سيدان متوسطة', image:'assets/cars/camry.png',
      year:2023, seats:5, bags:3, gear:'أوتوماتيك', doors:4, ac:true,
      daily:210, available:true, bookingBadge:null,
      onHomepage:false, order:5, showcase:null, featured:false, showcaseBadge:null,
      monthly:{12:3080, 24:2929, 36:2468}
    },
    {
      id:'accent25-std', name:'هيونداي أكسنت 2025 — ستاندر', category:'سيدان صغيرة', image:'assets/cars/accent.png',
      year:2025, seats:5, bags:2, gear:'أوتوماتيك', doors:4, ac:true,
      daily:115, available:false, bookingBadge:null,
      onHomepage:false, order:6, showcase:null, featured:false, showcaseBadge:null,
      monthly:{12:1680, 24:1600, 36:1360}
    }
  ];

  /* intro copy for the homepage fleet section */
  var INTRO = {
    eyebrow: 'خيارات تناسبك',
    heading1: 'سيارات مميزة',
    heading2: 'في أسطولنا',
    subtext: 'مجموعة واسعة من السيارات الحديثة بأفضل الأسعار وخدمة عملاء استثنائية'
  };

  function byOrder(a,b){ return (a.order||0) - (b.order||0); }
  function sorted(){ return CARS.slice().sort(byOrder); }

  /* الرئيسية — عرض الأسطول (index.html) : { intro, cars } */
  function fleetData(){
    var cars = sorted().filter(function(c){ return c.onHomepage; }).map(function(c){
      return {
        id:c.id, order:c.order, category:c.category, name:c.name, image:c.image,
        price:c.showcase, currency:'ريال', unit:'يوم', taxNote:TAX_NOTE,
        featured:c.featured, badge:c.showcaseBadge, discount:null, visible:true
      };
    });
    return { intro:INTRO, cars:cars };
  }

  /* الحجز اليومي (fleet.html + create-booking.html) */
  function bookingCars(){
    return sorted().map(function(c){
      return {
        id:c.id, name:c.name, category:c.category, image:c.image,
        price:c.daily, year:c.year, seats:c.seats, bags:c.bags,
        gear:c.gear, doors:c.doors, ac:c.ac, available:c.available, badge:c.bookingBadge
      };
    });
  }

  /* التأجير طويل الأجل (long-term.html) */
  function ltCars(){
    return sorted().map(function(c){
      return {
        id:c.id, name:c.name, category:c.category, image:c.image,
        seats:c.seats, bags:c.bags, gear:c.gear, doors:c.doors, ac:c.ac,
        priceByMonths:c.monthly
      };
    });
  }

  window.OneTrip = window.OneTrip || {};
  window.OneTrip.cars       = CARS;
  window.OneTrip.fleetData  = fleetData;
  window.OneTrip.bookingCars = bookingCars;
  window.OneTrip.ltCars     = ltCars;
})();
