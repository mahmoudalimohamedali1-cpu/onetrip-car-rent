/* ============================================================
   One Trip — BOOKING ENGINE (window.OTB)  ·  SINGLE CONTRACT
   ------------------------------------------------------------
   Every booking-flow page (car / extras / checkout / payment /
   confirmation / manage-booking) and the admin use ONLY this API.
   Demo persistence = localStorage/sessionStorage; the exact same
   surface swaps to Supabase later (one file changes).

   Load order on every flow page:
     <script src="cars.js"></script>
     <script src="booking-core.js"></script>
   ============================================================ */
;(function(){
  'use strict';

  var VAT = 0.15;                       // KSA VAT
  var LS  = { bookings:'otb_bookings', extras:'otb_extras', promos:'otb_promos' };
  var DRAFT = 'otb_draft';             // in-progress booking (sessionStorage)

  function load(k,f){ try{var v=JSON.parse(localStorage.getItem(k)); return v==null?f:v;}catch(e){return f;} }
  function save(k,v){ try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(e){return false;} }
  function ssget(k,f){ try{var v=JSON.parse(sessionStorage.getItem(k)); return v==null?f:v;}catch(e){return f;} }
  function ssset(k,v){ try{sessionStorage.setItem(k,JSON.stringify(v));}catch(e){} }

  var ARMAP={'0':'٠','1':'١','2':'٢','3':'٣','4':'٤','5':'٥','6':'٦','7':'٧','8':'٨','9':'٩'};
  function toAr(n){ return (n==null?'':String(n)).replace(/[0-9]/g,function(d){return ARMAP[d];}); }
  function money(n){ var s=Math.round(n||0).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'٬'); return toAr(s)+' ريال'; }

  /* ---- catalog (from cars.js) ---- */
  function cars(){ return (window.OneTrip && window.OneTrip.bookingCars && window.OneTrip.bookingCars()) || []; }
  function car(id){ var a=cars(); for(var i=0;i<a.length;i++) if(a[i].id===id) return a[i]; return null; }
  function carFull(id){ var a=(window.OneTrip&&window.OneTrip.cars)||[]; for(var i=0;i<a.length;i++) if(a[i].id===id) return a[i]; return car(id); }

  /* ---- extras / insurance (seed; admin can override via localStorage 'otb_extras') ---- */
  var EXTRAS_SEED=[
    {id:'cdw',      name:'تأمين شامل (CDW)',       type:'insurance', price:35, unit:'day',     desc:'تغطية كاملة ضد الحوادث وتقليل مبلغ التحمّل.'},
    {id:'driver',   name:'سائق إضافي',             type:'service',   price:20, unit:'day',     desc:'إضافة سائق ثانٍ معتمد على العقد.'},
    {id:'gps',      name:'جهاز ملاحة GPS',         type:'equipment', price:15, unit:'day',     desc:'ملاحة محدّثة لكل مناطق المملكة.'},
    {id:'child',    name:'كرسي أطفال',             type:'equipment', price:10, unit:'day',     desc:'كرسي أمان معتمد للأطفال.'},
    {id:'unlimited',name:'كيلومترات غير محدودة',  type:'service',   price:25, unit:'day',     desc:'قُد بدون أي حد للمسافة.'},
    {id:'delivery', name:'توصيل السيارة لموقعك',  type:'service',   price:60, unit:'booking', desc:'نوصّلك السيارة داخل المدينة.'}
  ];
  function extras(){ var s=load(LS.extras,null); return (s&&s.length)?s:EXTRAS_SEED; }
  function extra(id){ var a=extras(); for(var i=0;i<a.length;i++) if(a[i].id===id) return a[i]; return null; }

  /* ---- promo codes (seed; admin override via 'otb_promos') ---- */
  var PROMOS_SEED=[
    {code:'ONETRIP10', type:'percent', value:10, minTotal:0,   active:true},
    {code:'WELCOME50', type:'fixed',   value:50, minTotal:300, active:true}
  ];
  function promos(){ var s=load(LS.promos,null); return (s&&s.length)?s:PROMOS_SEED; }
  function validatePromo(code, subtotal){
    code=(code||'').trim().toUpperCase();
    if(!code) return {ok:false,discount:0,msg:''};
    var p=null, a=promos();
    for(var i=0;i<a.length;i++) if(a[i].active && a[i].code.toUpperCase()===code){ p=a[i]; break; }
    if(!p) return {ok:false,discount:0,msg:'كود الخصم غير صالح'};
    if((subtotal||0) < (p.minTotal||0)) return {ok:false,discount:0,msg:'الحد الأدنى للطلب '+money(p.minTotal)};
    var d = p.type==='percent' ? (subtotal*p.value/100) : p.value;
    d=Math.min(d,subtotal);
    return {ok:true,discount:d,code:p.code,msg:'تم تطبيق الخصم'};
  }

  /* ---- branches (shared with admin 'ot_branches') ---- */
  function branches(){ return load('ot_branches',[
    {id:'br_1',name:'فرع العليا',city:'الرياض',address:'شارع العليا - بجوار برج المملكة',phone:'9200 32104'},
    {id:'br_2',name:'مطار الملك خالد',city:'الرياض',address:'صالة الوصول الدولية',phone:'9200 32104'}
  ]); }

  /* ---- dates / availability ---- */
  function days(a,b){ if(!a||!b) return 1; var d=Math.ceil((new Date(b)-new Date(a))/86400000); return Math.max(1,d||1); }
  function overlaps(aS,aE,bS,bE){ return new Date(aS) < new Date(bE) && new Date(bS) < new Date(aE); }
  function isAvailable(carId, pickupAt, returnAt){
    var c=car(carId); if(!c || c.available===false) return false;
    if(!pickupAt||!returnAt) return true;
    var bk=bookings();
    for(var i=0;i<bk.length;i++){ var b=bk[i];
      if(b.status!=='cancelled' && b.carId===carId && overlaps(pickupAt,returnAt,b.pickupAt,b.returnAt)) return false; }
    return true;
  }
  function availableCars(pickupAt, returnAt){
    return cars().filter(function(c){ return isAvailable(c.id, pickupAt, returnAt); });
  }

  /* ---- pricing / quote ---- */
  function quote(o){   // {carId, days, extras:[{id,qty}], promoCode}
    var c=car(o.carId)||{}; var d=o.days||1;
    var base=(c.price||0)*d;
    var extrasTotal=0, lines=[];
    (o.extras||[]).forEach(function(sel){ var e=extra(sel.id); if(!e) return; var qty=sel.qty||1;
      var amt = e.unit==='day' ? e.price*d*qty : e.price*qty;
      /* عرض على الإضافة (مجاني/خصم) من سيستم العروض — يُحتسب هنا فيظهر صح بكل الخطوات */
      try{ var _om = window.OneTrip && OneTrip.Offers && OneTrip.Offers.extraModifierForCar && OneTrip.Offers.extraModifierForCar(o.carId, e.id);
        if(_om){ if(_om.mode==='free') amt=0; else if(_om.mode==='percent') amt=amt*(1-(_om.value||0)/100); else if(_om.mode==='amount') amt=Math.max(0, amt-(_om.value||0)); }
      }catch(_e){}
      extrasTotal+=amt; lines.push({id:e.id, name:e.name, qty:qty, amount:amt});
    });
    var subtotal=base+extrasTotal;
    var pr=o.promoCode ? validatePromo(o.promoCode,subtotal) : {ok:false,discount:0,msg:''};
    var discount=pr.ok?pr.discount:0;
    var taxable=Math.max(0,subtotal-discount);
    var vat=taxable*VAT;
    var deposit=c.deposit||500;
    var total=taxable+vat;
    return { car:c, days:d, base:base, extrasTotal:extrasTotal, extraLines:lines,
             subtotal:subtotal, discount:discount, promoOk:pr.ok, promoMsg:pr.msg,
             vat:vat, deposit:deposit, total:total };
  }

  /* ---- draft (the booking-in-progress, survives across steps) ---- */
  var draft={
    get:function(){ return ssget(DRAFT,{}); },
    set:function(p){ var d=ssget(DRAFT,{}); for(var k in p) d[k]=p[k]; ssset(DRAFT,d); return d; },
    clear:function(){ try{sessionStorage.removeItem(DRAFT);}catch(e){} }
  };

  /* ---- bookings ---- */
  function bookings(){ return load(LS.bookings,[]); }
  function ref(){ var s='OT-'; for(var i=0;i<6;i++) s+='0123456789'[Math.floor(Math.random()*10)]; return s; }
  function createBooking(d, payment){
    d=d||{};
    // guard: valid date range + still-available car (prevents inverted dates & double-booking at write time)
    if(d.pickupAt && d.returnAt && new Date(d.returnAt) <= new Date(d.pickupAt)) return {error:'baddates'};
    if(!isAvailable(d.carId, d.pickupAt, d.returnAt)) return {error:'unavailable'};
    var q=quote({carId:d.carId, days:days(d.pickupAt,d.returnAt), extras:d.extras, promoCode:d.promo});
    var b={ reference:ref(), carId:d.carId, carName:(car(d.carId)||{}).name||'', carImage:(car(d.carId)||{}).image||'',
      pickup:d.pickup||'', dropoff:d.dropoff||d.pickup||'', pickupAt:d.pickupAt, returnAt:d.returnAt, days:q.days,
      extras:d.extras||[], promo:d.promo||null, customer:d.customer||{},
      totals:{ base:q.base, extras:q.extrasTotal, extraLines:q.extraLines||[], discount:q.discount, vat:q.vat, deposit:q.deposit, total:q.total },
      payment:payment||{method:'mada',status:'paid'}, status:'confirmed', createdAt:new Date().toISOString() };
    var all=bookings(); all.push(b);
    if(!save(LS.bookings,all)) return {error:'save'};   // storage failed → don't pretend success
    try{ sendConfirmation(b); }catch(e){}
    return b;
  }
  function findBooking(reference, phone){
    var rf=(reference||'').trim().toUpperCase(), all=bookings(), b=null;
    for(var i=0;i<all.length;i++) if(all[i].reference===rf){ b=all[i]; break; }
    if(!b) return null;
    if(phone){ var p=(phone||'').replace(/\D/g,''), bp=((b.customer&&b.customer.phone)||'').replace(/\D/g,'');
      if(p && bp && p!==bp) return null; }
    return b;
  }
  function cancelBooking(reference){ var rf=(reference||'').trim().toUpperCase(), all=bookings(); for(var i=0;i<all.length;i++) if(all[i].reference===rf){ all[i].status='cancelled'; save(LS.bookings,all); return all[i]; } return null; }

  /* ---- leads / inquiries (contact + corporate forms) → admin inbox 'ot_leads' ---- */
  function lead(obj){
    obj=obj||{};
    var arr; try{ arr=JSON.parse(localStorage.getItem('ot_leads'))||[]; }catch(e){ arr=[]; }
    if(!(arr instanceof Array)) arr=[];
    var d=new Date();
    obj.id='lead_'+Date.now()+'_'+Math.floor(Math.random()*1e6);
    obj.status='new';
    obj.date=d.toLocaleDateString('ar-EG')+' '+d.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});
    arr.push(obj);
    try{ localStorage.setItem('ot_leads',JSON.stringify(arr)); }catch(e){}
    return obj;
  }

  /* ---- combine date (YYYY-MM-DD) + time (HH:MM) → datetime-local "YYYY-MM-DDTHH:MM" ---- */
  function dt(dateStr, timeStr){
    if(!dateStr) return '';
    return dateStr+'T'+(timeStr||'10:00');
  }

  /* ---- booking confirmation email ----
     Recorded to localStorage 'otb_emails' (auditable). Real delivery is sent via
     EmailJS when window.OTB_EMAILJS = {serviceId,templateId,publicKey} is configured
     and the EmailJS SDK is loaded; otherwise the send is marked 'simulated'. ---- */
  function emails(){ return load('otb_emails',[]); }
  function fmtDateAr(s){ if(!s) return ''; try{ var d=new Date(s); return d.toLocaleDateString('ar-SA')+' '+d.toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'}); }catch(e){ return s; } }
  function buildConfirmationBody(b){
    var c=b.customer||{}, t=b.totals||{};
    return 'مرحبًا '+(c.name||'عميلنا العزيز')+'،\n\n'+
      'تم تأكيد حجزك في One Trip Car Rent ✓\n\n'+
      'رقم الحجز: '+b.reference+'\n'+
      'السيارة: '+(b.carName||'')+'\n'+
      'الاستلام: '+(b.pickup||'')+' — '+fmtDateAr(b.pickupAt)+'\n'+
      'التسليم: '+(b.dropoff||b.pickup||'')+' — '+fmtDateAr(b.returnAt)+'\n'+
      'عدد الأيام: '+toAr(b.days)+'\n'+
      'الإجمالي المدفوع (شامل الضريبة): '+money(t.total)+'\n'+
      'مبلغ التأمين المسترد: '+money(t.deposit)+'\n\n'+
      'لإدارة حجزك: افتح صفحة «إدارة الحجز» وأدخل رقم الحجز ورقم جوالك.\n\n'+
      'شكرًا لاختيارك One Trip Car Rent — رحلة سعيدة! 🚗';
  }
  function sendConfirmation(b){
    if(!b) return null;
    var to=(b.customer&&b.customer.email)||'';
    var rec={ ref:b.reference, from:'carrent@onetrip.sa', to:to, name:(b.customer&&b.customer.name)||'',
      subject:'تأكيد حجز '+b.reference+' — One Trip Car Rent',
      body:buildConfirmationBody(b), createdAt:new Date().toISOString(), status:to?'simulated':'no-email' };
    try{
      var cfg=window.OTB_EMAILJS;
      if(cfg && window.emailjs && window.emailjs.send && to){
        window.emailjs.send(cfg.serviceId, cfg.templateId,
          { to_email:to, to_name:rec.name, subject:rec.subject, message:rec.body, reference:b.reference }, cfg.publicKey);
        rec.status='sent';
      }
    }catch(e){ rec.status='error'; }
    var all=emails(); all.push(rec); save('otb_emails',all);
    return rec;
  }
  function emailFor(reference){ var a=emails(); for(var i=a.length-1;i>=0;i--) if(a[i].ref===reference) return a[i]; return null; }

  /* ---- shared chrome: slim header + step progress bar ----
     Call OTB.mountChrome({step:N}) at the top of each flow page.
     step is 0-based into OTB.steps. Injects a <header class="otb-head"> + stepper
     as the FIRST element of <body>. Requires booking.css. ---- */
  var STEPS=['السيارة','الإضافات','بياناتك','الدفع','تأكيد'];
  function mountChrome(opts){
    opts=opts||{}; var step=opts.step==null?-1:opts.step;
    var steps=STEPS.map(function(s,i){
      var st = i<step?'done' : (i===step?'now':'');
      return '<div class="otb-step '+st+'"><span class="otb-dot">'+(i<step?'✓':toAr(i+1))+'</span><span class="otb-slbl">'+s+'</span></div>'+
             (i<STEPS.length-1?'<span class="otb-line '+(i<step?'done':'')+'"></span>':'');
    }).join('');
    var back = opts.back ? '<a class="otb-back" href="'+opts.back+'">→ رجوع</a>' : '<span></span>';
    var html =
      '<div class="otb-sadu"></div>'+
      '<header class="otb-head">'+
        '<a class="otb-logo" href="index.html"><img src="assets/onetrip-logo.png" alt="One Trip Car Rent"></a>'+
        '<div class="otb-secure"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg> حجز آمن</div>'+
        back+
      '</header>'+
      (step>=0 ? '<div class="otb-stepper-wrap"><div class="otb-stepper">'+steps+'</div></div>' : '');
    var host=document.createElement('div'); host.className='otb-chrome'; host.innerHTML=html;
    document.body.insertBefore(host, document.body.firstChild);
  }

  /* ---- public surface ---- */
  window.OTB={
    VAT:VAT, toAr:toAr, money:money, steps:STEPS,
    cars:cars, car:car, carFull:carFull,
    extras:extras, extra:extra, promos:promos, validatePromo:validatePromo, branches:branches,
    days:days, isAvailable:isAvailable, availableCars:availableCars, quote:quote,
    draft:draft, bookings:bookings, ref:ref, createBooking:createBooking,
    findBooking:findBooking, cancelBooking:cancelBooking, mountChrome:mountChrome,
    lead:lead, dt:dt,
    sendConfirmation:sendConfirmation, emails:emails, emailFor:emailFor
  };
})();
