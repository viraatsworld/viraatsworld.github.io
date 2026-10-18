/* Page behaviour: theme, language, nav, reveal-on-scroll, copy email, demo video. */
(function () {
  'use strict';
  var root = document.documentElement;

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  /* ---------- Theme: light by day, dark 19:00–07:00; manual toggle wins for 12 h ---------- */
  var themeBtn = document.getElementById('theme-toggle');
  var MANUAL_MS = 12 * 60 * 60 * 1000;
  function manualTheme() {
    try {
      var m = JSON.parse(localStorage.getItem('themeManual') || 'null');
      return m && m.until > Date.now() ? m.theme : null;
    } catch (e) { return null; }
  }
  function timeTheme() {
    var h = new Date().getHours();
    return h >= 7 && h < 19 ? 'light' : 'dark';
  }
  function isDark() { return root.getAttribute('data-theme') === 'dark'; }
  function applyTheme(t) {
    if (root.getAttribute('data-theme') === t) return;
    root.setAttribute('data-theme', t);
    syncThemeLabel();
    window.dispatchEvent(new Event('themechange'));
  }
  function syncThemeLabel() {
    themeBtn.setAttribute('aria-label', isDark() ? 'Switch to light mode' : 'Switch to dark mode');
  }
  themeBtn.addEventListener('click', function () {
    var next = isDark() ? 'light' : 'dark';
    store('themeManual', JSON.stringify({ theme: next, until: Date.now() + MANUAL_MS }));
    applyTheme(next);
  });
  // Follow the clock while the page stays open (e.g. across 19:00)
  setInterval(function () { if (!manualTheme()) applyTheme(timeTheme()); }, 5 * 60 * 1000);
  syncThemeLabel();

  /* ---------- Language: English (in the HTML) / German (assets/js/i18n-de.js) ---------- */
  var langBtn = document.getElementById('lang-toggle');
  var i18nEls = document.querySelectorAll('[data-i18n]');
  var english = new Map();
  var englishTitle = document.title;
  var DE = window.I18N_DE || {};
  i18nEls.forEach(function (el) { english.set(el, el.innerHTML); });
  var lang = 'en';

  function setLang(next, opts) {
    lang = next === 'de' ? 'de' : 'en';
    i18nEls.forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      el.innerHTML = lang === 'de' && DE[key] ? DE[key] : english.get(el);
    });
    document.title = lang === 'de' ? DE['meta.title'] || englishTitle : englishTitle;
    root.setAttribute('lang', lang);
    root.removeAttribute('data-lang-pending');
    // Button shows the language you can switch to
    langBtn.textContent = lang === 'de' ? 'EN' : 'DE';
    langBtn.setAttribute('lang', lang === 'de' ? 'en' : 'de');
    langBtn.setAttribute('aria-label', lang === 'de' ? DE['ui.toEn'] : DE['ui.toDe']);
    if (opts && opts.save) {
      store('lang', lang);
      try {
        var url = new URL(location.href);
        if (lang === 'de') url.searchParams.set('lang', 'de'); else url.searchParams.delete('lang');
        history.replaceState(null, '', url);
      } catch (e) {}
    }
  }
  langBtn.addEventListener('click', function () { setLang(lang === 'de' ? 'en' : 'de', { save: true }); });
  if (root.getAttribute('data-lang-pending') === 'de') setLang('de');

  /* ---------- Mobile menu ---------- */
  var menuBtn = document.getElementById('menu-toggle');
  var navLinks = document.getElementById('nav-links');
  function closeMenu() {
    navLinks.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-label', 'Open menu');
  }
  menuBtn.addEventListener('click', function () {
    var open = navLinks.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  navLinks.addEventListener('click', function (e) { if (e.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });

  /* ---------- Header border + scroll progress ---------- */
  var header = document.querySelector('.site-header');
  var progress = document.querySelector('.progress');
  var ticking = false;
  function onScroll() {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = 'scaleX(' + (max > 0 ? window.scrollY / max : 0) + ')';
    header.classList.toggle('scrolled', window.scrollY > 8);
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  /* ---------- Section dots (desktop) ---------- */
  var sections = Array.prototype.slice.call(document.querySelectorAll('main section[id]'));
  var dots = document.createElement('ul');
  dots.className = 'section-dots';
  dots.setAttribute('aria-hidden', 'true');
  var dotFor = {};
  sections.forEach(function (sec) {
    var h2 = sec.querySelector('h2');
    var label = sec.id === 'top' ? 'Viraat Saaran' : h2 ? h2.textContent.trim() : sec.id;
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = '#' + sec.id;
    a.tabIndex = -1;
    var span = document.createElement('span');
    span.textContent = label;
    a.appendChild(span);
    li.appendChild(a);
    dots.appendChild(li);
    dotFor[sec.id] = { a: a, span: span, h2: h2 };
  });
  document.body.appendChild(dots);
  // Keep dot labels in the current language
  langBtn.addEventListener('click', function () {
    sections.forEach(function (sec) {
      var d = dotFor[sec.id];
      if (d.h2) d.span.textContent = d.h2.textContent.trim();
    });
  });

  /* ---------- Active section (nav + dots) and reveal on scroll ---------- */
  if ('IntersectionObserver' in window) {
    var linkFor = {};
    navLinks.querySelectorAll('a').forEach(function (a) { linkFor[a.getAttribute('href').slice(1)] = a; });
    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.id;
        navLinks.querySelectorAll('a.active').forEach(function (a) { a.classList.remove('active'); });
        if (linkFor[id]) linkFor[id].classList.add('active');
        dots.querySelectorAll('a.active').forEach(function (a) { a.classList.remove('active'); });
        if (dotFor[id]) dotFor[id].a.classList.add('active');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { sectionObserver.observe(s); });

    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    // Stagger siblings: cards in the same grid come in one after another
    document.querySelectorAll('.reveal').forEach(function (el) {
      var sibs = Array.prototype.filter.call(el.parentNode.children, function (c) { return c.classList.contains('reveal'); });
      el.style.transitionDelay = Math.min(sibs.indexOf(el), 5) * 90 + 'ms';
      revealObserver.observe(el);
    });
  } else {
    document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- Copy email ---------- */
  var copyBtn = document.getElementById('copy-email');
  var copyStatus = document.getElementById('copy-status');
  copyBtn.addEventListener('click', function () {
    var email = copyBtn.getAttribute('data-email');
    var done = function () {
      copyStatus.textContent = lang === 'de' ? DE['ui.copied'] + email : 'Copied ' + email + ' to clipboard';
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(email).then(done, function () { copyStatus.textContent = email; });
    } else {
      copyStatus.textContent = email;
    }
  });

  /* ---------- Demo video: no autoplay for reduced-motion users ---------- */
  var messe = document.getElementById('messe-video');
  if (messe && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    messe.removeAttribute('autoplay');
    messe.pause();
    messe.controls = true;
  }

  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
