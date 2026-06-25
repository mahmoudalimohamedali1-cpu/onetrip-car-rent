/* ============================================================
   One Trip — News / Blog data layer (STANDALONE, local-only)
   ------------------------------------------------------------
   Single source of truth for the "أخبارنا" blog. Fully independent
   (own namespace OneTripNews + own localStorage key ot_news_posts),
   so it never collides with cars / leads / chat / admin.

   Used by:
     - news.html         → OneTripNews.published() to render the blog
     - news-admin.html   → load/add/update/remove/save to manage posts

   No server / no Supabase. Posts live in localStorage on the device.
   First load (key absent) falls back to the built-in SEED below, so
   the blog looks full out of the box; the dashboard edits from there.

   Post shape:
     { id, title, excerpt, body, category, author, cover,
       date (YYYY-MM-DD), featured (bool), published (bool) }
   ============================================================ */
;(function(){
  'use strict';

  var KEY = 'ot_news_posts';

  var CATEGORIES = ['أخبار الشركة', 'عروض', 'أدلة', 'نصائح', 'شراكات'];

  var SEED = [
    {
      id:'p1', featured:true, published:true,
      title:'One Trip تطلق أسطول 2026 — أحدث الموديلات بين يديك',
      excerpt:'دفعة جديدة من السيارات الحديثة تنضم إلى أسطولنا هذا الموسم، بمواصفات أعلى وأسعار تنافسية تناسب كل رحلة.',
      category:'أخبار الشركة', author:'فريق One Trip', date:'2026-06-22',
      cover:'assets/onetrip-car.png',
      body:'يسعدنا أن نعلن عن إضافة دفعة جديدة من سيارات موديل 2026 إلى أسطول One Trip Car Rent، تشمل فئات السيدان الاقتصادية والمتوسطة والفل أوبشن.\n\nكل مركبة تخضع لفحص وصيانة دورية قبل التسليم، مع باقات تأمين شاملة وخدمة مساعدة على الطريق على مدار الساعة. احجز الآن واستمتع بتجربة قيادة أحدث الموديلات بأسعار شفافة بلا مفاجآت.'
    },
    {
      id:'p2', featured:false, published:true,
      title:'عروض الصيف: خصومات تصل إلى 25% على التأجير الشهري',
      excerpt:'استمتع بمرونة التنقل طوال الصيف مع باقات شهرية مخفّضة وبدون التزام طويل الأمد.',
      category:'عروض', author:'قسم التسويق', date:'2026-06-18',
      cover:'assets/hero-handover.png',
      body:'بمناسبة موسم الصيف، تقدّم One Trip خصومات تصل إلى 25% على باقات التأجير الشهري لمدة محدودة.\n\nالعرض يشمل التأمين الشامل والصيانة الدورية، مع إمكانية تبديل السيارة حسب احتياجك. سارع بالحجز قبل انتهاء العرض.'
    },
    {
      id:'p3', featured:false, published:true,
      title:'دليلك الكامل لاستئجار سيارة في الرياض',
      excerpt:'من المستندات المطلوبة إلى أفضل المواقع للاستلام — كل ما تحتاج معرفته قبل أول حجز.',
      category:'أدلة', author:'أحمد الراشد', date:'2026-06-12',
      cover:'assets/why-car.png',
      body:'استئجار سيارة في الرياض أصبح أسهل من أي وقت مضى. تحتاج فقط إلى رخصة قيادة سارية، وبطاقة هوية أو إقامة، ووسيلة دفع.\n\nننصح باختيار نقطة استلام قريبة من وجهتك، وقراءة شروط التأمين بعناية، وفحص السيارة قبل الانطلاق. فريقنا جاهز لمساعدتك في كل خطوة.'
    },
    {
      id:'p4', featured:false, published:true,
      title:'One Trip تتوسّع إلى ثلاث مدن جديدة',
      excerpt:'نقترب أكثر منك: فروع جديدة تغطي مناطق إضافية بالمملكة لخدمة أسرع وأقرب.',
      category:'أخبار الشركة', author:'فريق One Trip', date:'2026-06-05',
      cover:'assets/fleet-hero.png',
      body:'ضمن خطة التوسّع، افتتحت One Trip فروعًا جديدة لتغطية مدن إضافية، بما يقلّل وقت الاستلام ويزيد خيارات الأسطول المتاح قريبًا منك.\n\nنواصل الاستثمار في تجربة العميل لنكون دائمًا على بُعد خطوة من رحلتك القادمة.'
    },
    {
      id:'p5', featured:false, published:true,
      title:'5 نصائح للقيادة الآمنة في رحلات الإجازات',
      excerpt:'قبل أن تنطلق في رحلتك الطويلة، إليك أهم ما يضمن سلامتك وراحتك على الطريق.',
      category:'نصائح', author:'م. سارة المطيري', date:'2026-05-28',
      cover:'assets/why-skyline.png',
      body:'الرحلات الطويلة تحتاج تحضيرًا جيدًا: افحص الإطارات والزيوت، خذ فترات راحة كل ساعتين، تجنّب القيادة وقت الذروة الحارة، واحرص على ترطيب الجسم.\n\nمع باقات One Trip تحصل على مساعدة على الطريق على مدار الساعة، فأنت لست وحدك في أي رحلة.'
    },
    {
      id:'p6', featured:false, published:true,
      title:'شراكة جديدة لحلول أساطيل الشركات',
      excerpt:'اتفاقية تتيح للشركات إدارة أساطيلها بمرونة أكبر وتكلفة شهرية ثابتة.',
      category:'شراكات', author:'قسم الشركات', date:'2026-05-20',
      cover:'assets/contact-cars.png',
      body:'وقّعت One Trip شراكة جديدة توسّع حلول إدارة الأساطيل للشركات، بعقود مرنة وتكلفة شهرية واضحة تشمل الصيانة والتأمين.\n\nتواصل مع فريق حلول الشركات لتصميم باقة تناسب حجم أسطولك واحتياج أعمالك.'
    }
  ];

  function load(){
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch(e){}
    if (raw === null || raw === undefined) return SEED.slice();   // never edited → defaults
    try { var a = JSON.parse(raw); return Array.isArray(a) ? a : SEED.slice(); }
    catch(e){ return SEED.slice(); }
  }
  function persist(list){ try { localStorage.setItem(KEY, JSON.stringify(list)); } catch(e){} }
  function save(list){ persist(Array.isArray(list) ? list : []); }   // full overwrite (admin)

  function byDateDesc(a,b){ return (b.date||'').localeCompare(a.date||''); }

  /* public blog: only published, newest first, featured surfaced first */
  function published(){
    return load().filter(function(p){ return p.published !== false; }).sort(byDateDesc);
  }
  function get(id){ return load().filter(function(p){ return p.id === id; })[0] || null; }

  function add(post){
    var list = load();
    var rec = {
      id: 'n_' + new Date().getTime(),
      title:   (post.title   || 'بدون عنوان').trim(),
      excerpt: (post.excerpt || '').trim(),
      body:    (post.body    || '').trim(),
      category:(post.category|| CATEGORIES[0]),
      author:  (post.author  || 'فريق One Trip').trim(),
      cover:   (post.cover   || '').trim(),
      date:    (post.date    || new Date().toISOString().slice(0,10)),
      featured: !!post.featured,
      published: post.published !== false
    };
    list.push(rec); persist(list); return rec;
  }
  function update(id, patch){
    var list = load();
    list.forEach(function(p){ if(p.id === id){ for(var k in patch){ if(patch.hasOwnProperty(k)) p[k] = patch[k]; } } });
    persist(list); return get(id);
  }
  function remove(id){ persist(load().filter(function(p){ return p.id !== id; })); }
  function clearAll(){ persist([]); }
  function resetSeed(){ persist(SEED.slice()); return load(); }

  /* helpers shared by both pages */
  function readingMinutes(post){
    var words = ((post.body||'') + ' ' + (post.excerpt||'')).trim().split(/\s+/).length;
    return Math.max(1, Math.round(words / 180));
  }
  function formatDate(d){
    if(!d) return '';
    try{
      var parts = String(d).split('-');
      var months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
      var m = parseInt(parts[1],10);
      return parseInt(parts[2],10) + ' ' + (months[m-1]||'') + ' ' + parts[0];
    }catch(e){ return String(d); }
  }

  window.OneTripNews = {
    KEY: KEY, CATEGORIES: CATEGORIES, SEED: SEED,
    load: load, save: save, published: published, get: get,
    add: add, update: update, remove: remove, clearAll: clearAll, resetSeed: resetSeed,
    readingMinutes: readingMinutes, formatDate: formatDate
  };
})();
