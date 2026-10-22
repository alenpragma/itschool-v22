/* ==========================================================================
   article.js — the runtime DETAIL route
   --------------------------------------------------------------------------
   One file, three detail families, addressed by query parameter:

       article.html?type=blog&slug=why-digital-literacy-belongs-in-primary-school
       article.html?type=notice&slug=admissions-open-2027-academic-session
       article.html?type=event&slug=edulife-student-carnival

   ┌── WHY BOTH THIS AND THE PRERENDERED PAGES? ────────────────────────────┐
   │ build.js also writes a real file for every item — blog/<slug>.html,    │
   │ notice/<slug>.html, event/<slug>.html — so the site is crawlable and   │
   │ every card link resolves without JavaScript. This runtime entry is the │
   │ counterpart that makes the same template usable from ONE url, which is │
   │ exactly how a dynamic backend serves the route.                        │
   │                                                                        │
   │ Convert to real dynamic routing by pointing your host's rewrite at     │
   │ this file:                                                             │
   │     /blog/:slug   ->  article.html?type=blog&slug=:slug                │
   │     /notice/:slug ->  article.html?type=notice&slug=:slug              │
   │     /event/:slug  ->  article.html?type=event&slug=:slug               │
   │ then set EDU.render.setLinkBase('/') so generated links drop the .html.│
   └────────────────────────────────────────────────────────────────────────┘

   Depends on: renderers.js (EDU.render) and data-loader.js (EDU.load).
   If either the payload or the slug is missing, it renders an honest
   not-found panel instead of a blank page.
   ========================================================================== */
(function () {
  'use strict';

  var EDU = (window.EDU = window.EDU || {});
  var R = EDU.render;

  /** type -> { source key in data-loader, the array path inside the payload } */
  var SOURCES = {
    blog: {
      source: 'blog',
      pick: 'items',
      listHref: 'blog.html',
      listLabel: 'The Edulife Journal'
    },
    notice: {
      source: 'notices',
      pick: 'items',
      listHref: 'notice.html',
      listLabel: 'Notice Board'
    },
    event: { source: 'events', pick: 'items', listHref: 'events.html', listLabel: 'Events' }
  };

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }

  /** Mark the matching top-level nav item as current. */
  function activateNav(type) {
    var href = (SOURCES[type] || {}).listHref;
    if (!href) {
      return;
    }
    var links = document.querySelectorAll('#navLinks a');
    Array.prototype.forEach.call(links, function (a) {
      if (a.getAttribute('href') === href) {
        a.classList.add('active');
        a.setAttribute('aria-current', 'page');
      }
    });
  }

  function setTitle(type, item) {
    var suffix = 'Edulife IT School';
    document.title = item ? item.title + ' — ' + suffix : 'Not found — ' + suffix;
    var desc = document.querySelector('meta[name="description"]');
    if (desc && item) {
      desc.setAttribute('content', item.excerpt || item.title);
    }
    var og = document.querySelector('meta[property="og:title"]');
    if (og && item) {
      og.setAttribute('content', item.title + ' — ' + suffix);
    }
  }

  function notFound(mount, type, slug) {
    var src = SOURCES[type];
    mount.innerHTML =
      '<section class="page-hero"><div class="wrap"><div class="inner">' +
      '<nav class="crumbs"><a href="index.html">Home</a><span>/</span>' +
      (src ? '<a href="' + src.listHref + '">' + src.listLabel + '</a><span>/</span>' : '') +
      '<span>Not found</span></nav>' +
      '<span class="eyebrow">404</span>' +
      '<h1 class="display">We could not find that page.</h1>' +
      '<p class="lead">' +
      (slug
        ? 'No item matches <code>' + slug.replace(/[<>&"]/g, '') + '</code> in this section.'
        : 'That address is missing a <code>slug</code> parameter.') +
      '</p>' +
      '<div class="hero-actions" style="margin-top:30px">' +
      (src
        ? '<a class="btn btn-primary" href="' +
          src.listHref +
          '">' +
          src.listLabel +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg></a>'
        : '') +
      '<a class="btn btn-ghost" href="index.html">Go to the homepage</a>' +
      '</div></div></div></section>';
  }

  function render(type, slug, items, mount) {
    var idx = -1;
    for (var i = 0; i < items.length; i++) {
      if (items[i].slug === slug) {
        idx = i;
        break;
      }
    }
    if (idx === -1) {
      notFound(mount, type, slug);
      return;
    }

    var item = items[idx];
    /* Neighbours inside the same family — the pager and the related grid. */
    var prev = items[idx - 1] || null;
    var next = items[idx + 1] || null;
    var related = items
      .filter(function (_, i) {
        return i !== idx;
      })
      .slice(0, 3);

    mount.innerHTML = R.renderDetail(type, item, { related: related, prev: prev, next: next });
    setTitle(type, item);
    activateNav(type);

    if (EDU.refreshReveal) {
      EDU.refreshReveal();
    }
    if (EDU.refreshCounters) {
      EDU.refreshCounters();
    }
    if (EDU.initArticleShares) {
      EDU.initArticleShares();
    }
  }

  function start() {
    var mount = document.getElementById('articleMount');
    if (!mount) {
      return;
    }

    var type = param('type') || '';
    var slug = param('slug') || '';

    if (!SOURCES[type]) {
      notFound(mount, type, slug);
      return;
    }

    /* The JSON (or REST) layer supplies the items — this file never hard-codes
       content, so swapping in an API changes nothing here. */
    EDU.load(SOURCES[type].source)
      .then(function (payload) {
        var items = payload && payload[SOURCES[type].pick];
        if (!Array.isArray(items)) {
          notFound(mount, type, slug);
          return;
        }
        render(type, slug, items, mount);
      })
      .catch(function (err) {
        console.error(err);
        notFound(mount, type, slug);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
