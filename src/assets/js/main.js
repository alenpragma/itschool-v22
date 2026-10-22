/* ==========================================================================
   main.js — page behaviours (no content, no data)
   --------------------------------------------------------------------------
   Every behaviour is defensive: it looks the element up, bails if the page
   does not contain it, so the same file can be loaded by all 10 pages.

     1. header scroll state + reading-progress bar
     2. mobile drawer
     3. scroll reveal (+ exposes EDU.refreshReveal for hydrated content)
     4. animated counters
     5. generic list filters  [data-filter-group]
     6. gallery lightbox      [data-lightbox]
     7. validated demo forms  form[data-validate]
     8. runtime hydration hand-off (EDU.hydrate from data-loader.js)
     9. article share bar     [data-share]  (exposes EDU.initArticleShares)
   ========================================================================== */
(function () {
  'use strict';

  var EDU = (window.EDU = window.EDU || {});
  var on = function (el, ev, fn, opts) {
    if (el) {
      el.addEventListener(ev, fn, opts);
    }
  };

  /* ------------------------------------------------- 1. header + progress */
  var header = document.getElementById('header');
  var progress = document.getElementById('progress');
  var toTop = document.getElementById('toTop');
  var queued = false;

  function onScroll() {
    var y = window.pageYOffset || document.documentElement.scrollTop;
    if (header) {
      header.classList.toggle('scrolled', y > 30);
    }
    if (progress) {
      var travel = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = (travel > 0 ? (y / travel) * 100 : 0) + '%';
    }
    if (toTop) {
      toTop.classList.toggle('show', y > 600);
    }
    queued = false;
  }
  on(
    window,
    'scroll',
    function () {
      if (!queued) {
        queued = true;
        window.requestAnimationFrame(onScroll);
      }
    },
    { passive: true }
  );
  onScroll();

  on(toTop, 'click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* -------------------------------------------------------- 2. mobile drawer */
  var burger = document.getElementById('burger');
  var drawer = document.getElementById('drawer');
  var drawerClose = document.getElementById('drawerClose');
  var scrim = document.getElementById('drawerScrim');
  var lastFocused = null;
  var scrollY = 0;

  /* The element that receives focus when the panel opens. The close button is
     the first control in the panel, so this is also the natural first tab stop. */
  function drawerFocusables() {
    if (!drawer) {
      return [];
    }
    return Array.prototype.filter.call(
      drawer.querySelectorAll('a[href], button:not([disabled])'),
      function (el) {
        return el.offsetParent !== null || el === drawerClose;
      }
    );
  }

  function openDrawer() {
    if (!drawer) {
      return;
    }
    lastFocused = document.activeElement;

    /* Lock the page behind the panel without losing the reading position:
       `position:fixed` + the saved offset is what actually holds still on iOS,
       where `overflow:hidden` on <body> alone is ignored. */
    scrollY = window.pageYOffset || document.documentElement.scrollTop;
    document.body.style.position = 'fixed';
    document.body.style.top = -scrollY + 'px';
    document.body.style.width = '100%';

    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    if (scrim) {
      scrim.classList.add('open');
    }
    if (burger) {
      burger.setAttribute('aria-expanded', 'true');
    }

    /* Move focus into the panel, retrying across a few frames.
       Why a loop rather than one call: the panel's `visibility` transition
       does not flip to `visible` until the frame AFTER the class is added
       (measured: computed style is still `hidden` inside the first
       requestAnimationFrame). An element inside a `visibility:hidden` box is
       not focusable, so an early focus() silently does nothing and focus is
       left on the hamburger. Retrying until focus actually lands is immune to
       that exact frame, and to slower layout on low-end phones. */
    var tries = 0;
    function focusIntoPanel() {
      if (!drawer.classList.contains('open')) {
        return;
      } /* closed meanwhile */
      if (drawer.contains(document.activeElement)) {
        return;
      } /* already landed */
      var f = drawerFocusables();
      if (f.length) {
        f[0].focus({ preventScroll: true });
      }
      if (++tries < 15 && !drawer.contains(document.activeElement)) {
        window.requestAnimationFrame(focusIntoPanel);
      }
    }
    window.requestAnimationFrame(focusIntoPanel);
  }

  function closeDrawer() {
    if (!drawer || !drawer.classList.contains('open')) {
      return;
    }

    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    if (scrim) {
      scrim.classList.remove('open');
    }
    if (burger) {
      burger.setAttribute('aria-expanded', 'false');
    }

    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    window.scrollTo(0, scrollY);

    /* Return focus to whatever opened the panel (normally the hamburger), so
       keyboard users are not dropped at the top of the document. */
    if (lastFocused && lastFocused.focus) {
      lastFocused.focus({ preventScroll: true });
    }
    lastFocused = null;
  }

  on(burger, 'click', openDrawer);
  on(drawerClose, 'click', closeDrawer);
  on(scrim, 'click', closeDrawer);
  if (drawer) {
    Array.prototype.forEach.call(drawer.querySelectorAll('a'), function (a) {
      a.addEventListener('click', closeDrawer);
    });
  }

  on(document, 'keydown', function (e) {
    if (!drawer || !drawer.classList.contains('open')) {
      if (e.key === 'Escape') {
        closeDrawer();
      }
      return;
    }
    if (e.key === 'Escape') {
      closeDrawer();
      return;
    }

    /* Focus trap: Tab cycles within the open panel only. */
    if (e.key !== 'Tab') {
      return;
    }
    var f = drawerFocusables();
    if (!f.length) {
      return;
    }
    var first = f[0];
    var last = f[f.length - 1];
    var current = document.activeElement;

    if (e.shiftKey && (current === first || !drawer.contains(current))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (current === last || !drawer.contains(current))) {
      e.preventDefault();
      first.focus();
    }
  });

  /* --------------------------------------------------------- 3. scroll reveal */
  var revealObserver = null;
  function refreshReveal() {
    var els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(els, function (el) {
        el.classList.add('in');
      });
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add('in');
              revealObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
      );
    }
    Array.prototype.forEach.call(els, function (el) {
      if (el.classList.contains('in')) {
        return;
      }
      /* Anything already inside the viewport at load appears immediately —
         above-the-fold content must never wait for a scroll event that may
         never come (short pages, embedded/iframe views, print). */
      if (el.getBoundingClientRect().top < window.innerHeight) {
        el.classList.add('in');
        return;
      }
      revealObserver.observe(el);
    });
  }
  EDU.refreshReveal = refreshReveal;

  /* ------------------------------------------------------ 4. animated counters */
  function animateCount(el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    var suffix = el.getAttribute('data-suffix') || '';
    if (isNaN(target)) {
      return;
    }
    var started = null;
    function tick(ts) {
      if (started === null) {
        started = ts;
      }
      var p = Math.min((ts - started) / 1400, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) {
        window.requestAnimationFrame(tick);
      }
    }
    window.requestAnimationFrame(tick);
  }
  function refreshCounters() {
    var counters = document.querySelectorAll('[data-count]');
    if (!('IntersectionObserver' in window)) {
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    Array.prototype.forEach.call(counters, function (el) {
      io.observe(el);
    });
  }

  /* ---------------------------------------------------------- 5. list filters */
  function initFilters() {
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-filter-group]'),
      function (group) {
        var key = group.getAttribute('data-filter-group'); /* e.g. "campus" */
        var targetSel = group.getAttribute('data-target'); /* e.g. "[data-teachers]" */
        var emptySel = group.getAttribute('data-empty');
        var scope = targetSel ? document.querySelector(targetSel) : document;
        if (!key || !scope) {
          return;
        }
        var items = scope.querySelectorAll('[data-item]');
        var empty = emptySel ? document.querySelector(emptySel) : null;
        var attr = 'data-' + key;

        group.addEventListener('click', function (e) {
          var btn = e.target.closest('[data-filter]');
          if (!btn) {
            return;
          }
          var value = btn.getAttribute('data-filter');

          Array.prototype.forEach.call(group.querySelectorAll('[data-filter]'), function (b) {
            b.classList.toggle('active', b === btn);
            b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
          });

          var shown = 0;
          Array.prototype.forEach.call(items, function (item) {
            var match = value === 'all' || item.getAttribute(attr) === value;
            item.classList.toggle('hidden', !match);
            if (match) {
              shown++;
            }
            if (match && !item.classList.contains('in')) {
              item.classList.add('in');
            }
          });
          if (empty) {
            empty.classList.toggle('show', shown === 0);
          }
        });
      }
    );
  }

  /* --------------------------------------------------------- 6. gallery lightbox */
  function initLightbox() {
    var box = document.getElementById('lightbox');
    if (!box) {
      return;
    }
    var img = box.querySelector('img');
    var capTitle = box.querySelector('.lb-cap b');
    var capCat = box.querySelector('.lb-cap small');

    function open(src, title, cat) {
      if (img) {
        img.setAttribute('src', src);
        img.setAttribute('alt', title || '');
      }
      if (capTitle) {
        capTitle.textContent = title || '';
      }
      if (capCat) {
        capCat.textContent = cat || '';
      }
      box.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    function close() {
      box.classList.remove('open');
      document.body.style.overflow = '';
    }

    on(document, 'click', function (e) {
      var trigger = e.target.closest('[data-lightbox]');
      if (trigger) {
        e.preventDefault();
        open(
          trigger.getAttribute('data-full'),
          trigger.getAttribute('data-title'),
          trigger.getAttribute('data-cat')
        );
        return;
      }
      if (e.target.closest('.lb-close') || e.target === box) {
        close();
      }
    });
    on(document, 'keydown', function (e) {
      if (e.key === 'Escape') {
        close();
      }
      if (e.key === 'Enter') {
        var focused = document.activeElement;
        if (focused && focused.matches('[data-lightbox]')) {
          open(
            focused.getAttribute('data-full'),
            focused.getAttribute('data-title'),
            focused.getAttribute('data-cat')
          );
        }
      }
    });
  }

  /* ------------------------------------------------------- 7. validated forms */
  function initForms() {
    Array.prototype.forEach.call(document.querySelectorAll('form[data-validate]'), function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var fields = form.querySelectorAll('[required]');
        var valid = true;
        Array.prototype.forEach.call(fields, function (field) {
          var ok = field.value.trim() !== '';
          if (ok && field.type === 'email') {
            ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value.trim());
          }
          field.style.borderColor = ok ? '' : 'var(--coral)';
          if (!ok) {
            valid = false;
          }
        });
        if (!valid) {
          return;
        }

        var success = form.querySelector('.form-success');
        if (success) {
          success.classList.add('show');
          window.setTimeout(function () {
            success.classList.remove('show');
          }, 6000);
        }
        form.reset();
      });
    });
  }

  /* -------------------------------------------------- 9. article share bar */
  /* The share hrefs are built at click time from the ACTUAL page URL, so the
     same markup works for a prerendered detail page and for the ?type=&slug=
     runtime route (whose canonical address is the clean /blog/:slug one once
     routing is configured). */
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    /* Fallback for file:// and older browsers. */
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch {
      /* execCommand is deprecated; failure is non-fatal */
    }
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  function initArticleShares() {
    var bars = document.querySelectorAll('.share-bar');
    if (!bars.length) {
      return;
    }

    Array.prototype.forEach.call(bars, function (bar) {
      var note = bar.querySelector('.copy-note');
      var btns = bar.querySelectorAll('[data-share]');

      Array.prototype.forEach.call(btns, function (btn) {
        btn.addEventListener('click', function () {
          var kind = btn.getAttribute('data-share');
          var title = btn.getAttribute('data-share-title') || document.title;
          var url = window.location.href;
          var map = {
            x:
              'https://twitter.com/intent/tweet?text=' +
              encodeURIComponent(title) +
              '&url=' +
              encodeURIComponent(url),
            facebook: 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url),
            whatsapp: 'https://wa.me/?text=' + encodeURIComponent(title + ' ' + url)
          };

          if (kind === 'copy') {
            copyToClipboard(url).then(function () {
              if (note) {
                note.textContent = 'Link copied';
                window.setTimeout(function () {
                  note.textContent = '';
                }, 2600);
              }
            });
            return;
          }
          if (map[kind]) {
            window.open(map[kind], '_blank', 'noopener,noreferrer,width=680,height=620');
          }
        });
      });
    });
  }
  EDU.initArticleShares = initArticleShares;

  /* ------------------------------------------------------------- 8. bootstrap */
  function start() {
    refreshReveal();
    refreshCounters();
    initFilters();
    initLightbox();
    initForms();
    initArticleShares();

    /* Content hydration is a no-op unless <body data-live="true">: by default
       the page ships fully pre-rendered by build.js. When enabled, re-arm the
       reveal/counter observers and the share bar for freshly injected nodes. */
    if (EDU.hydrate) {
      EDU.hydrate().then(function (didHydrate) {
        if (didHydrate) {
          refreshReveal();
          refreshCounters();
          initArticleShares();
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
