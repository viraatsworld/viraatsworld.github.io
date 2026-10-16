/* Page behaviour: theme, nav, reveal-on-scroll, copy email, demo video. */
(function () {
  'use strict';
  var root = document.documentElement;

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  /* ---------- Theme toggle ---------- */
  var themeBtn = document.getElementById('theme-toggle');
  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  function isDark() {
    var t = root.getAttribute('data-theme');
    return t ? t === 'dark' : darkQuery.matches;
  }
  function syncThemeLabel() {
    themeBtn.setAttribute('aria-label', isDark() ? 'Switch to light mode' : 'Switch to dark mode');
  }
  themeBtn.addEventListener('click', function () {
    var next = isDark() ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    store('theme', next);
    syncThemeLabel();
    window.dispatchEvent(new Event('themechange'));
  });
  darkQuery.addEventListener('change', function () {
    syncThemeLabel();
    window.dispatchEvent(new Event('themechange'));
  });
  syncThemeLabel();

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

  /* ---------- Active nav link + reveal on scroll ---------- */
  if ('IntersectionObserver' in window) {
    var linkFor = {};
    navLinks.querySelectorAll('a').forEach(function (a) { linkFor[a.getAttribute('href').slice(1)] = a; });
    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var link = linkFor[entry.target.id];
        if (!link) return;
        if (entry.isIntersecting) {
          navLinks.querySelectorAll('a.active').forEach(function (a) { a.classList.remove('active'); });
          link.classList.add('active');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('main section[id]').forEach(function (s) { sectionObserver.observe(s); });

    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    document.querySelectorAll('.reveal').forEach(function (el, i) {
      el.style.transitionDelay = (i % 5) * 60 + 'ms';
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
    var done = function () { copyStatus.textContent = 'Copied ' + email + ' to clipboard'; };
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
