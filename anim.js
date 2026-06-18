/* ============================================================
   One Trip — animation engine
   - Scroll-reveal with stagger (IntersectionObserver)
   - Safety sweep so above-the-fold content always reveals
   - Number count-up for [data-count]
   - Re-scans JS-rendered grids (cars / benefits)
   A tiny inline head script hides content (.js-anim) and arms a
   fallback timer; this file clears it and drives the animation.
   ============================================================ */
(function(){
  'use strict';
  var root = document.documentElement;
  function clearFallback(){ if (window.__af){ clearTimeout(window.__af); window.__af = null; } }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)){ clearFallback(); root.classList.remove('js-anim'); return; }

  var SEL = '.hero-inner > *, .hero-copy > *, .section-head, .bz-head, .bz-cta, .benefit, .step, .car, .car-card,'
          + '.why-card, .portal-visual, .portal-feats li, .quote-card, .fleet-intro-text, .corp';

  var tracked = [];

  function reveal(el){
    if (el.__in) return; el.__in = true;
    el.classList.add('in');
    try { io.unobserve(el); } catch(e){}
    if (el.matches && el.matches('[data-count]')) countUp(el);
    if (el.querySelectorAll) el.querySelectorAll('[data-count]').forEach(countUp);
  }

  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){ if (e.isIntersecting) reveal(e.target); });
  }, { threshold:0.12, rootMargin:'0px 0px -6% 0px' });

  function matches(el, sel){ return el.matches ? el.matches(sel) : false; }

  function scan(){
    document.querySelectorAll(SEL).forEach(function(el){
      if (el.__rev) return; el.__rev = true;
      var idx = 0;
      if (el.parentElement){
        var sibs = [].slice.call(el.parentElement.children).filter(function(c){ return matches(c, SEL); });
        idx = sibs.indexOf(el); if (idx < 0) idx = 0;
      }
      el.style.transitionDelay = (Math.min(idx, 8) * 0.07).toFixed(2) + 's';
      tracked.push(el);
      io.observe(el);
    });
  }

  // reveal anything already within (or above) the viewport — covers cases
  // where IO is slow/suspended (e.g. background tab) so nothing stays hidden.
  function sweep(){
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;
    tracked.forEach(function(el){
      if (el.__in) return;
      var r = el.getBoundingClientRect();
      if (r.top < vh * 0.95 && r.bottom > -40) reveal(el);
    });
  }

  /* ---- count-up (Arabic-Indic digits + ٬ separator) ---- */
  var AR = {'0':'٠','1':'١','2':'٢','3':'٣','4':'٤','5':'٥','6':'٦','7':'٧','8':'٨','9':'٩'};
  function toAr(n){
    var s = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
    return s.replace(/[0-9]/g, function(d){ return AR[d]; });
  }
  function countUp(el){
    if (el.__counted) return; el.__counted = true;
    var target = parseFloat(el.getAttribute('data-count')) || 0;
    var suffix = el.getAttribute('data-suffix') || '';
    var dur = 1300, t0 = null;
    function paint(v){ el.innerHTML = toAr(v) + (suffix ? '<em>' + suffix + '</em>' : ''); }
    if (!('requestAnimationFrame' in window)){ paint(target); return; }
    function step(ts){
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      paint(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step); else paint(target);
    }
    requestAnimationFrame(step);
  }

  function init(){
    clearFallback();
    scan();
    sweep();
    var mo = new MutationObserver(function(){ scan(); sweep(); });
    ['#benefits', '#carsGrid', '#fleetTrack'].forEach(function(s){
      var n = document.querySelector(s); if (n) mo.observe(n, { childList:true });
    });
  }

  // expose for pages that re-render lists (filters/sort) and need a refresh
  window.__animScan = function(){ scan(); sweep(); };

  // jump to an in-page anchor reliably (e.g. arriving at index.html#fleet from
  // another page). The native hash jump can race layout + the reveal state, so
  // we re-scroll instantly and reveal whatever lands in view.
  function gotoHash(){
    if (!location.hash || location.hash === '#') return;
    var el; try { el = document.querySelector(location.hash); } catch(e){ return; }
    if (!el) return;
    scan();
    // landing on a deep-link: reveal EVERYTHING so nothing is left invisible if the
    // scroll lands late, then jump instantly to the target.
    document.querySelectorAll(SEL).forEach(reveal);
    var d = document.documentElement, prev = d.style.scrollBehavior;
    d.style.scrollBehavior = 'auto';            // force an instant jump (override CSS smooth)
    el.scrollIntoView({ block:'start' });
    d.style.scrollBehavior = prev;
  }
  // retry a few times so a late layout shift (hero video / images) can't strand us
  function hashWatch(){ if (location.hash){ gotoHash(); setTimeout(gotoHash, 200); setTimeout(gotoHash, 650); } }

  if (document.readyState !== 'loading') { init(); hashWatch(); }
  else document.addEventListener('DOMContentLoaded', function(){ init(); hashWatch(); });
  window.addEventListener('load', function(){ scan(); sweep(); if (location.hash) gotoHash(); });
  window.addEventListener('hashchange', gotoHash);
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) sweep(); });
  window.addEventListener('scroll', sweep, { passive:true });
})();
