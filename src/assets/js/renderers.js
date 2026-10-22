/* ==========================================================================
   renderers.js — the single source of truth for every repeating card's markup
   --------------------------------------------------------------------------
   Deliberately isomorphic. The SAME file is consumed by:

     • build.js            (Node)  ->  require('./assets/js/renderers.js')
     • data-loader.js      (browser) ->  window.EDU.render

   Why it matters: a page pre-rendered at build time from data/*.json and the
   same page hydrated at runtime from an API therefore produce byte-identical
   HTML. When you swap the JSON for an endpoint, the view layer does not change.

   Convention: every renderer is  fn(item, index) -> html string
   Every value that reaches the DOM passes through esc().

   Two families of renderer live here:

     LIST renderers   postCard · noticeRow · eventRow · announcementRow …
                      Each links to the item's own DETAIL page.

     DETAIL renderers detailHeroHtml · detailBodyHtml · detailSideHtml ·
                      detailRelatedHtml · detailPagerHtml · shareHtml
                      Consumed by build.js (one static page per item) and by
                      article.js (the ?type=&slug= runtime route).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EDU = root.EDU || {};
    root.EDU.render = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ routes */

  /* The three detail families the site publishes. `dir` is the folder each
     item's page lives in; `list` is the listing page it belongs to.
     Convert to clean URLs (/blog/:slug) by setting linkBase:'/' and rewriting
     the host — see README → "Detail routes". */
  var TYPES = {
    blog: {
      dir: 'blog',
      list: 'blog.html',
      key: 'blog',
      label: 'The Edulife Journal',
      back: 'Back to the Journal'
    },
    notice: {
      dir: 'notice',
      list: 'notice.html',
      key: 'notice',
      label: 'Notice Board',
      back: 'Back to the Notice Board'
    },
    event: {
      dir: 'event',
      list: 'events.html',
      key: 'events',
      label: 'Events',
      back: 'Back to Events'
    }
  };

  var linkBase = ''; /* '' -> blog/slug.html   '/' -> /blog/slug */

  /** The href of one item's detail page. */
  function detailHref(type, slug) {
    var t = TYPES[type];
    if (!t || !slug) {
      return t ? t.list : '#';
    }
    if (linkBase === '/') {
      return '/' + t.dir + '/' + slug;
    }
    return linkBase + t.dir + '/' + slug + '.html';
  }

  /** Runtime/SSR hook: '' for file-based routes, '/' for clean routing. */
  function setLinkBase(base) {
    linkBase = base || '';
  }

  /** Google Calendar "add event" href from a dated event item. */
  function calendarHref(e) {
    var start = String(e.date || '').replace(/-/g, '');
    if (!start) {
      return '#';
    }
    var end = start;
    var d = new Date(e.date + 'T00:00:00');
    if (!isNaN(d.getTime())) {
      d.setDate(d.getDate() + 1);
      end = d.toISOString().slice(0, 10).replace(/-/g, '');
    }
    var text = encodeURIComponent(e.title + ' — Edulife IT School');
    var where = encodeURIComponent([e.venue, e.time].filter(Boolean).join(', '));
    var details = encodeURIComponent((e.excerpt || '') + '\n\n' + 'Edulife IT School');
    return (
      'https://www.google.com/calendar/render?action=TEMPLATE' +
      '&text=' +
      text +
      '&dates=' +
      start +
      '/' +
      end +
      '&location=' +
      where +
      '&details=' +
      details
    );
  }

  /* ------------------------------------------------------------------ utils */

  /** Escape a value for safe interpolation into HTML text or an attribute. */
  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Staggered scroll-reveal delay class, cycling .d1 … .d6. */
  function d(i) {
    return ' d' + ((i % 6) + 1);
  }

  /** Zero-padded list index used by the numbered "why choose" cards. */
  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function cls(base, extra) {
    return base + (extra ? ' ' + extra : '');
  }

  /**
   * Is `href` an absolute http(s) URL? Those leave the site, so they need
   * target="_blank" + rel="noopener noreferrer"; in-site paths must NOT carry
   * them, since opening the site in a new tab from its own nav is wrong.
   */
  function isExternal(href) {
    return /^https?:\/\//i.test(String(href || ''));
  }

  /**
   * The "opens in a new tab" hint for a card that leaves the site.
   *
   * The arrow icon is aria-hidden, so on its own a screen reader would announce
   * an identical link with no warning that the page will change underneath. An
   * .sr-only span restores that warning in words. It is returned EMPTY for
   * in-site links, so a card that resolves internally stays a plain link.
   */
  function externHint(href) {
    return isExternal(href) ? '<span class="sr-only"> (opens in a new tab)</span>' : '';
  }

  /** Join a list of items through a renderer. */
  function renderList(items, fn) {
    return (items || [])
      .map(function (item, i) {
        return fn(item, i);
      })
      .join('\n        ');
  }

  /* ------------------------------------------------------------ icon set --- */
  /* Minimal inline stroke-icon set. Add a key here and reference it by name
     from data/site.json (feature.icon) or data/contact.json (card.icon).       */
  var icons = {
    arrow:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>',
    chevron:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/></svg>',
    monitor:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    users:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2-6.3-4.6L5.7 21 8 13.8 2 9.4h7.6z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    phone:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>',
    clock:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    calendar:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 12 22l-9-9V3h10z"/><circle cx="7.5" cy="7.5" r="1.2"/></svg>',
    alert:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v5M12 17.5h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>',
    share:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',

    /* --- brand marks: the six Edulife initiatives -------------------------
       Drawn on the same 24px grid, 1.9 stroke and round caps as the utility
       icons above, so a mark sits inside a tinted plate without looking
       pasted in. Referenced by name from data/site.json -> initiatives.items
       -> icon. Each is decorative (aria-hidden in the card) because the
       initiative name is rendered next to it as real text. */
    cap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 9.2 12 4.4 2 9.2l10 4.8 10-4.8z"/><path d="M6.2 11.5V16c0 1.6 2.6 2.9 5.8 2.9s5.8-1.3 5.8-2.9v-4.5"/><path d="M22 9.2v4.6"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z"/><path d="M14.5 6.5l3 3"/></svg>',
    balloon:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.3" r="5.8"/><path d="M10.9 13.9 10 15.8h4l-.9-1.9"/><path d="M12 15.8c0 1.5-1.3 1.8-1.3 2.9"/></svg>',
    pages:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.6C10.5 4.9 8 4.1 5 4.1H2.2v13.8H5c3 0 5.5.8 7 2.5"/><path d="M12 6.6c1.5-1.7 4-2.5 7-2.5h2.8v13.8H19c-3 0-5.5.8-7 2.5"/><path d="M12 6.6v13.8"/></svg>',
    apple:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8.4c-1.2-1.5-3.1-2.1-4.8-1.5C4.6 7.9 3.2 10.3 3.2 13c0 4 2.7 8.2 5.6 8.2 1 0 1.6-.5 3.2-.5s2.2.5 3.2.5c2.9 0 5.6-4.2 5.6-8.2 0-2.7-1.4-5.1-4-6.1-1.7-.6-3.6 0-4.8 1.5z"/><path d="M12 8.4V5.6"/><path d="M12 5.6c.5-1.5 1.9-2.4 3.4-2.4-.2 1.6-1.5 2.8-3.4 3.1z"/></svg>',
    chip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="6.6" y="6.6" width="10.8" height="10.8" rx="2.6"/><rect x="10" y="10" width="4" height="4" rx="1.1"/><path d="M9.6 3.2v3.4M14.4 3.2v3.4M9.6 17.4v3.4M14.4 17.4v3.4M3.2 9.6h3.4M3.2 14.4h3.4M17.4 9.6h3.4M17.4 14.4h3.4"/></svg>'
  };

  function icon(name) {
    return icons[name] || icons.star;
  }

  /* -------------------------------------------------------------- home view */

  /** .pillar — the three "learning pillars" cards. */
  function pillarCard(p, i) {
    return (
      '<article class="pillar reveal' +
      d(i) +
      '">' +
      '<span class="corner"></span>' +
      '<span class="num">' +
      esc(p.num) +
      '</span>' +
      '<h3>' +
      esc(p.title) +
      '</h3>' +
      '<p>' +
      esc(p.text) +
      '</p>' +
      '<span class="bar"></span>' +
      '</article>'
    );
  }

  /** .stat — animated counter tile. */
  function statCard(s, i) {
    var suffix = s.suffix || '';
    return (
      '<div class="stat reveal' +
      d(i) +
      '">' +
      '<b data-count="' +
      esc(s.value) +
      '" data-suffix="' +
      esc(suffix) +
      '">' +
      esc(s.value) +
      esc(suffix) +
      '</b>' +
      '<span>' +
      esc(s.label) +
      '</span>' +
      '</div>'
    );
  }

  /** .feature — numbered "why choose" card with a named icon. */
  function featureCard(f, i) {
    return (
      '<article class="feature reveal' +
      d(i) +
      '">' +
      '<span class="idx">' +
      pad2(i + 1) +
      '</span>' +
      '<span class="ic">' +
      icon(f.icon) +
      '</span>' +
      '<h3>' +
      esc(f.title) +
      '</h3>' +
      '<p>' +
      esc(f.text) +
      '</p>' +
      '</article>'
    );
  }

  /** .g-item — gallery tile (size: "" | "big" | "wide"). */
  function galleryItem(g, i) {
    return (
      '<figure class="' +
      cls('g-item', g.size || '') +
      ' reveal' +
      d(i) +
      '"' +
      ' data-lightbox data-full="' +
      esc(g.image) +
      '"' +
      ' data-title="' +
      esc(g.title) +
      '" data-cat="' +
      esc(g.category) +
      '"' +
      ' tabindex="0" role="button" aria-label="View ' +
      esc(g.title) +
      '">' +
      '<img src="' +
      esc(g.image) +
      '" alt="' +
      esc(g.alt || g.title) +
      '" loading="lazy" />' +
      '<figcaption class="cap"><small>' +
      esc(g.category) +
      '</small><b>' +
      esc(g.title) +
      '</b></figcaption>' +
      '</figure>'
    );
  }

  /* --------------------------------------------------------------- teachers */

  /** .teacher — roster card, filterable through data-campus. */
  function teacherCard(t, i) {
    return (
      '<article class="teacher reveal' +
      d(i) +
      '" data-item data-campus="' +
      esc(t.campus) +
      '">' +
      '<div class="ph">' +
      '<img src="' +
      esc(t.image) +
      '" alt="' +
      esc(t.name) +
      ', ' +
      esc(t.role) +
      '" loading="lazy" />' +
      '<span class="campus">' +
      esc(t.campus) +
      '</span>' +
      '</div>' +
      '<div class="info">' +
      '<h3>' +
      esc(t.name) +
      '</h3>' +
      '<p class="role">' +
      esc(t.role) +
      '</p>' +
      '<p>' +
      esc(t.bio) +
      '</p>' +
      '</div>' +
      '</article>'
    );
  }

  /** .member — leadership spotlight card. */
  function memberCard(m, i) {
    return (
      '<article class="member reveal' +
      d(i) +
      '">' +
      '<img src="' +
      esc(m.image) +
      '" alt="' +
      esc(m.name) +
      ', ' +
      esc(m.role) +
      '" loading="lazy" />' +
      '<h3>' +
      esc(m.name) +
      '</h3>' +
      '<p class="role">' +
      esc(m.role) +
      '</p>' +
      '<p>' +
      esc(m.bio) +
      '</p>' +
      '</article>'
    );
  }

  /* ------------------------------------------------------- notices & events */
  /* NOTE: every row below now links to its item's DETAIL page, not back to the
     listing page. The slug comes from data/{notices,events}.json.             */

  /** .board-item — compact notice row used on the home Notice board. */
  function noticeRow(n, i) {
    return (
      '<a class="board-item reveal' +
      d(i) +
      '" href="' +
      esc(detailHref('notice', n.slug)) +
      '">' +
      '<div class="meta"><b>' +
      esc(n.category) +
      '</b><span>' +
      esc(n.dateLabel) +
      '</span></div>' +
      '<div class="body"><h4>' +
      esc(n.title) +
      '</h4><p>' +
      esc(n.excerpt) +
      '</p></div>' +
      '</a>'
    );
  }

  /** .board-item — compact event row with a date chip. */
  function eventRow(e, i) {
    return (
      '<a class="board-item reveal' +
      d(i) +
      '" href="' +
      esc(detailHref('event', e.slug)) +
      '">' +
      '<div class="date-chip"><b>' +
      esc(e.day) +
      '</b><span>' +
      esc(e.month) +
      '</span></div>' +
      '<div class="ev"><h4>' +
      esc(e.title) +
      '</h4>' +
      '<p class="where">' +
      esc(e.venue) +
      ' · ' +
      esc(e.time) +
      '</p>' +
      '<p>' +
      esc(e.excerpt) +
      '</p></div>' +
      '</a>'
    );
  }

  /** .row-card — full-width announcement on the Notice page; links to detail. */
  function announcementRow(n, i) {
    var prio = n.priority
      ? '<span class="prio prio-' +
        esc(String(n.priority).toLowerCase()) +
        '">' +
        esc(n.priority) +
        '</span>'
      : '';
    return (
      '<a class="row-card reveal' +
      d(i) +
      '" href="' +
      esc(detailHref('notice', n.slug)) +
      '"' +
      ' data-item data-category="' +
      esc(n.category) +
      '">' +
      '<div class="stamp"><b>' +
      esc(n.day) +
      '</b><span>' +
      esc(n.monthYear) +
      '</span></div>' +
      '<div><span class="tag">' +
      esc(n.category) +
      '</span>' +
      prio +
      '<h3>' +
      esc(n.title) +
      '</h3><p>' +
      esc(n.excerpt) +
      '</p></div>' +
      '<span class="go" aria-hidden="true">' +
      icons.arrow +
      '</span>' +
      '</a>'
    );
  }

  /** .row-card — full-width event on the Events page; links to detail. */
  function eventRowFull(e, i) {
    return (
      '<a class="row-card reveal' +
      d(i) +
      '" href="' +
      esc(detailHref('event', e.slug)) +
      '"' +
      ' data-item data-category="' +
      esc(e.category) +
      '">' +
      '<div class="stamp"><b>' +
      esc(e.day) +
      '</b><span>' +
      esc(e.monthYear) +
      '</span></div>' +
      '<div><span class="tag">' +
      esc(e.category) +
      '</span>' +
      '<h3>' +
      esc(e.title) +
      '</h3>' +
      '<p>' +
      esc(e.excerpt) +
      '</p>' +
      '<p class="where" style="color:var(--teal);font-weight:800;font-size:11.5px;margin-top:10px">' +
      esc(e.venue) +
      ' · ' +
      esc(e.time) +
      '</p></div>' +
      '<span class="go" aria-hidden="true">' +
      icons.arrow +
      '</span>' +
      '</a>'
    );
  }

  /* ------------------------------------------------------------------ blog */
  /* Every post card links to /blog/<slug>.html                                */

  /** .post — blog index card, filterable through data-category. */
  function postCard(p, i) {
    var href = detailHref('blog', p.slug);
    return (
      '<article class="post reveal' +
      d(i) +
      '" data-item data-category="' +
      esc(p.category) +
      '">' +
      '<a class="ph" href="' +
      esc(href) +
      '" aria-label="' +
      esc(p.title) +
      '">' +
      '<img src="' +
      esc(p.image) +
      '" alt="' +
      esc(p.alt || p.title) +
      '" loading="lazy" />' +
      '</a>' +
      '<div class="bd">' +
      '<span class="cat">' +
      esc(p.category) +
      '</span>' +
      '<h3><a href="' +
      esc(href) +
      '">' +
      esc(p.title) +
      '</a></h3>' +
      '<p>' +
      esc(p.excerpt) +
      '</p>' +
      '<div class="meta"><span>' +
      esc(p.dateLabel) +
      ' · ' +
      esc(p.readTime) +
      '</span>' +
      '<span class="more">Read article ' +
      icons.chevron +
      '</span></div>' +
      '</div>' +
      '</article>'
    );
  }

  /** .j-feature — hero article inside the dark journal panel. */
  function journalFeature(p, i) {
    return (
      '<a class="j-feature reveal' +
      d(i) +
      '" href="' +
      esc(detailHref('blog', p.slug)) +
      '">' +
      '<img src="' +
      esc(p.image) +
      '" alt="' +
      esc(p.alt || p.title) +
      '" loading="lazy" />' +
      '<div class="ov"></div>' +
      '<div class="txt">' +
      '<span class="cat">' +
      esc(p.category) +
      ' · ' +
      esc(p.dateLabel) +
      '</span>' +
      '<h3>' +
      esc(p.title) +
      '</h3>' +
      '<p>' +
      esc(p.excerpt) +
      '</p>' +
      '</div>' +
      '</a>'
    );
  }

  /** .j-item — compact article row inside the dark journal panel. */
  function journalItem(p, i) {
    return (
      '<a class="j-item reveal' +
      d(i) +
      '" href="' +
      esc(detailHref('blog', p.slug)) +
      '">' +
      '<img src="' +
      esc(p.image) +
      '" alt="' +
      esc(p.alt || p.title) +
      '" loading="lazy" />' +
      '<div><span class="cat">' +
      esc(p.category) +
      '</span>' +
      '<h4>' +
      esc(p.title) +
      '</h4>' +
      '<span class="date">' +
      esc(p.dateLabel) +
      '</span></div>' +
      '</a>'
    );
  }

  /* ----------------------------------------------------------- initiatives */

  /**
   * .initiative — one card in the "Edulife family" grid on the homepage.
   *
   * The visual identity is a brand logo image (`it.logo`) on a tone-tinted 52px
   * plate, with the name and tagline as real text beside it.
   *
   * Two ways to sit on the plate, both of which keep one shape for all six:
   *
   *   logo  an <img> of the PNG/JPG. alt comes from `it.alt` — but only when the
   *         name is NOT already rendered beside it, otherwise a screen reader
   *         hears "Edulife IT logo Edulife IT". So a card with a visible name
   *         passes alt="" (decorative) and keeps the real label as text.
   *   icon  the inline SVG fallback, used when `logo` is blank or the file is
   *         missing. Without it a bad path would render an empty plate.
   *
   * Dimensions are pinned in the HTML (104x104, or 80x80 on one column via CSS)
   * and in CSS, not just in the file, so the browser reserves the box BEFORE the
   * image loads and the six cards cannot jump as logos arrive.
   *
   * Linking: `url` is the initiative's own site and takes priority. Leave it
   * blank to fall back to `href`, an in-site page. http(s) targets get
   * target="_blank" + rel="noopener noreferrer" (a third-party page must not
   * reach back through window.opener); in-site targets do not.
   *
   * Data shape (data/site.json → initiatives.items[]):
   *   { id, icon, logo, alt, name, tagline, url, href, tone }
   */
  function initiativeCard(it, i) {
    var tone = /^(teal|amber|coral)$/.test(it.tone || '') ? ' tone-' + it.tone : ' tone-teal';
    var outbound = it.url || '';
    var target = outbound || it.href || '#';
    var ext = isExternal(target);

    var mark;
    if (it.logo) {
      /* alt="" on purpose — the name is rendered next to the image below, so a
         described logo would be announced twice. See the note above. */
      mark =
        '<img src="' +
        esc(it.logo) +
        '" alt="" width="104" height="104"' +
        ' loading="lazy" decoding="async" />';
    } else {
      mark = icon(it.icon);
    }

    /* No aria-label: it would REPLACE the whole accessible name, so the tagline
       and the new-tab hint would both vanish for a screen reader. The name stays
       the visible text, and externHint() appends the warning in words. */
    return (
      '<a class="initiative reveal' +
      d(i) +
      tone +
      '" href="' +
      esc(target) +
      '"' +
      (ext ? ' target="_blank" rel="noopener noreferrer"' : '') +
      '>' +
      '<span class="ini-top">' +
      '<span class="ini-logo" aria-hidden="true">' +
      mark +
      '</span>' +
      '<span class="ini-arrow">' +
      icons.arrow +
      '</span>' +
      '</span>' +
      '<span class="ini-body">' +
      '<b class="ini-name">' +
      esc(it.name) +
      '</b>' +
      '<span class="ini-tag">' +
      esc(it.tagline) +
      '</span>' +
      externHint(target) +
      '</span>' +
      '</a>'
    );
  }

  /* ------------------------------------------------------------- admission */

  /** .step — one node of the admission journey. */
  function journeyStep(s, i) {
    return (
      '<div class="step reveal' +
      d(i) +
      '">' +
      '<span class="dot">' +
      esc(s.step) +
      '</span>' +
      '<div><h3>' +
      esc(s.title) +
      '</h3><p>' +
      esc(s.text) +
      '</p></div>' +
      '</div>'
    );
  }

  /**
   * .class-card — one class in the "Classes we offer" grid on the Admission page.
   *
   * The visual identity is a large Fraunces level mark (N / J1 / 1 … 5) tinted by
   * `tone`, so the seven cards read as a progression through the school rather
   * than seven identical tiles. The age chip carries the practical detail a
   * parent scans for first, and the focus line says what the year is for.
   *
   * Data shape (data/site.json → classes.items[]):
   *   { id, mark, name, age, focus, tone }
   */
  function classCard(c, i) {
    var tone = /^(teal|amber|coral)$/.test(c.tone || '') ? ' tone-' + c.tone : ' tone-teal';
    return (
      '<article class="class-card reveal' +
      d(i) +
      tone +
      '">' +
      '<span class="cc-top">' +
      '<span class="cc-mark" aria-hidden="true">' +
      esc(c.mark) +
      '</span>' +
      '<span class="cc-age">' +
      esc(c.age) +
      '</span>' +
      '</span>' +
      '<h3 class="cc-name">' +
      esc(c.name) +
      '</h3>' +
      '<p class="cc-focus">' +
      esc(c.focus) +
      '</p>' +
      '</article>'
    );
  }

  /**
   * <option> — one row of an admission form's class dropdown.
   *
   * Generated from the SAME data/site.json → classes.items array that fills the
   * "Classes we offer" grid, so adding a class updates the grid AND every class
   * dropdown at once. Before this existed the dropdown was a hard-coded list of
   * <option> tags that silently went stale the moment a class was added.
   *
   * The label is the class NAME only. A longer "Class One (Age 5–6)" label
   * widened the whole grid column and broke the panel's column alignment.
   */
  function classOption(c) {
    return '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>';
  }

  /* --------------------------------------------------------------- contact */

  /** .info-card — contact detail tile. */
  function infoCard(c, i) {
    var inner =
      '<span class="ic">' +
      icon(c.icon) +
      '</span>' +
      '<div><h3>' +
      esc(c.title) +
      '</h3><p>' +
      esc(c.text) +
      '</p></div>';
    var open = c.href
      ? '<a class="info-card reveal' + d(i) + '" href="' + esc(c.href) + '">'
      : '<div class="info-card reveal' + d(i) + '">';
    var close = c.href ? '</a>' : '</div>';
    return open + inner + close;
  }

  /* ------------------------------------------------------- trust elements */

  /* The teaching-permit / press-mention renderers were removed along with the
     homepage "Official recognition" section. The block survives as literal
     markup on the About page only; re-add a renderer here if that page is ever
     moved onto the data layer. */

  /* ==========================================================================
     DETAIL VIEW  —  one item rendered as a full page
     --------------------------------------------------------------------------
     Consumed twice, with identical output:
       • build.js   → writes blog/<slug>.html, notice/<slug>.html, event/<slug>.html
       • article.js → renders the ?type=&slug= entry at runtime

     The public entry point is `renderDetail(type, item, ctx)` where ctx is
     { related: [...], prev: item|null, next: item|null }.
     ========================================================================== */

  /** Content blocks (the `body` array in JSON) → prose HTML. */
  function detailBody(blocks) {
    return (blocks || [])
      .map(function (b, i) {
        var t = b.type;
        if (t === 'lead') {
          return '<p class="lead reveal' + d(i) + '">' + esc(b.text) + '</p>';
        }
        if (t === 'h2') {
          return '<h2 class="reveal">' + esc(b.text) + '</h2>';
        }
        if (t === 'h3') {
          return '<h3 class="reveal">' + esc(b.text) + '</h3>';
        }
        if (t === 'p') {
          return '<p class="reveal' + d(i) + '">' + esc(b.text) + '</p>';
        }
        if (t === 'list') {
          return (
            '<ul class="reveal' +
            d(i) +
            '">' +
            (b.items || [])
              .map(function (li) {
                return '<li>' + esc(li) + '</li>';
              })
              .join('') +
            '</ul>'
          );
        }
        if (t === 'quote') {
          return (
            '<blockquote class="reveal' +
            d(i) +
            '"><p>' +
            esc(b.text) +
            '</p>' +
            (b.cite ? '<cite>' + esc(b.cite) + '</cite>' : '') +
            '</blockquote>'
          );
        }
        if (t === 'callout') {
          return (
            '<aside class="callout reveal' +
            d(i) +
            '">' +
            (b.title ? '<b>' + esc(b.title) + '</b>' : '') +
            '<p>' +
            esc(b.text) +
            '</p></aside>'
          );
        }
        if (t === 'image') {
          return (
            '<figure class="fig reveal' +
            d(i) +
            '"><img src="' +
            esc(b.image) +
            '" alt="' +
            esc(b.alt || '') +
            '" loading="lazy" />' +
            (b.caption ? '<figcaption>' + esc(b.caption) + '</figcaption>' : '') +
            '</figure>'
          );
        }
        return '';
      })
      .join('\n      ');
  }

  /** Small `label / value` fact rows used in the hero and the sidebar. */
  function factRow(pairs) {
    return pairs
      .filter(function (p) {
        return p && p.value;
      })
      .map(function (p) {
        return (
          '<div class="fact"><span>' + esc(p.label) + '</span><b>' + esc(p.value) + '</b></div>'
        );
      })
      .join('');
  }

  /** .prio chip for a notice. */
  function prioChip(priority) {
    if (!priority) {
      return '';
    }
    return (
      '<span class="prio prio-' +
      esc(String(priority).toLowerCase()) +
      '">' +
      icons.alert +
      esc(priority) +
      '</span>'
    );
  }

  /** Chips row (category, read time, tags…). */
  function chipRow(items) {
    return (items || [])
      .filter(Boolean)
      .map(function (c) {
        return '<span class="chip-static">' + esc(c) + '</span>';
      })
      .join('');
  }

  /** Hero / title area — type-aware. */
  function detailHero(type, item) {
    var t = TYPES[type] || TYPES.blog;
    var crumbs =
      '<nav class="crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><span>/</span>' +
      '<a href="' +
      esc(t.list) +
      '">' +
      esc(t.label) +
      '</a><span>/</span><span>' +
      esc(item.category || t.label) +
      '</span></nav>';

    var head = '',
      meta = '',
      media = '';

    if (type === 'blog') {
      head =
        '<span class="eyebrow">' +
        esc(t.label) +
        '</span>' +
        '<div class="chip-row">' +
        chipRow([item.category, item.readTime]) +
        '</div>' +
        '<h1 class="display">' +
        esc(item.title) +
        '</h1>' +
        '<p class="lead">' +
        esc(item.excerpt) +
        '</p>';
      meta =
        '<div class="byline">' +
        (item.authorImage
          ? '<img src="' +
            esc(item.authorImage) +
            '" alt="' +
            esc(item.author || '') +
            '" loading="lazy" />'
          : '') +
        '<div><b>' +
        esc(item.author || 'Edulife Journal') +
        '</b>' +
        '<span>' +
        esc(item.authorRole || 'Editorial team') +
        '</span></div>' +
        '<span class="sep"></span><span class="stamp-date">' +
        esc(item.dateLabel) +
        '</span>' +
        '</div>';
      media = item.image
        ? '<figure class="cover reveal"><img src="' +
          esc(item.image) +
          '" alt="' +
          esc(item.alt || item.title) +
          '" /></figure>'
        : '';
    } else if (type === 'notice') {
      head =
        '<span class="eyebrow">' +
        esc(t.label) +
        '</span>' +
        '<div class="chip-row">' +
        chipRow([item.category]) +
        prioChip(item.priority) +
        '</div>' +
        '<h1 class="display">' +
        esc(item.title) +
        '</h1>' +
        '<p class="lead">' +
        esc(item.excerpt) +
        '</p>';
      meta =
        '<div class="fact-row">' +
        factRow([
          { label: 'Posted', value: item.dateLabel },
          { label: 'From', value: item.department },
          { label: 'For', value: (item.audience || []).join(', ') }
        ]) +
        '</div>';
    } else {
      head =
        '<span class="eyebrow">' +
        esc(t.label) +
        '</span>' +
        '<div class="chip-row">' +
        chipRow([item.category]) +
        '</div>' +
        '<h1 class="display">' +
        esc(item.title) +
        '</h1>' +
        '<p class="lead">' +
        esc(item.excerpt) +
        '</p>';
      meta =
        '<div class="fact-row">' +
        factRow([
          { label: 'Date', value: item.dateLabel },
          { label: 'Time', value: item.endTime ? item.time + ' – ' + item.endTime : item.time },
          { label: 'Venue', value: item.venue },
          { label: 'For', value: (item.audience || []).join(', ') }
        ]) +
        '</div>';
      media = item.image
        ? '<figure class="cover reveal"><img src="' +
          esc(item.image) +
          '" alt="' +
          esc(item.alt || item.title) +
          '" /></figure>'
        : '';
    }

    return (
      '<section class="page-hero detail-hero">' +
      '<span class="blob b1" aria-hidden="true"></span><span class="blob b2" aria-hidden="true"></span>' +
      '<div class="p-grid" aria-hidden="true"></div>' +
      '<div class="wrap"><div class="inner">' +
      crumbs +
      head +
      meta +
      '</div></div>' +
      '</section>' +
      (media ? '<div class="wrap"><div class="article-cover-wrap">' + media + '</div></div>' : '')
    );
  }

  /** Share bar — hrefs are filled from location.href by main.js. */
  function shareHtml(title) {
    var t = esc(title || '');
    function btn(kind, label, svg) {
      return (
        '<button class="sh" data-share="' +
        kind +
        '" data-share-title="' +
        t +
        '" aria-label="Share: ' +
        label +
        '">' +
        svg +
        '<span>' +
        label +
        '</span></button>'
      );
    }
    var x =
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-7.2 8.2L23.2 22h-6.6l-5.2-6.8L5.5 22H2.4l7.7-8.8L1.2 2h6.8l4.7 6.2L18.9 2Zm-1.1 18h1.7L7.3 3.8H5.5L17.8 20Z"/></svg>';
    var fb =
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h3l1-3h-4v-2c0-.6.4-1 1-1Z"/></svg>';
    var wa =
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm5.2 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.7-.1a11 11 0 0 1-5.4-4.6c-.5-.9-.8-1.7-.6-2.4.1-.5.7-1.5 1.3-1.7.3-.1.7 0 .9.3l.6 1.2c.1.3 0 .5-.1.7l-.4.5c-.1.2-.2.3 0 .6.4.7 1.4 1.9 2.4 2.3.3.1.4 0 .6-.1l.6-.6c.2-.2.4-.2.6-.1l1.2.6c.3.2.4.5.3.8Z"/></svg>';
    var cp = icons.link;
    return (
      '<div class="share-bar reveal"><span class="share-label">' +
      icons.share +
      'Share this</span>' +
      '<div class="share-btns">' +
      btn('x', 'Post', x) +
      btn('facebook', 'Facebook', fb) +
      btn('whatsapp', 'WhatsApp', wa) +
      btn('copy', 'Copy link', cp) +
      '</div><span class="copy-note" aria-live="polite"></span></div>'
    );
  }

  /** Agenda table (events only). */
  function agendaHtml(items) {
    if (!items || !items.length) {
      return '';
    }
    var rows = items
      .map(function (a) {
        return (
          '<li><span class="at">' +
          esc(a.time) +
          '</span><span class="ai">' +
          esc(a.item) +
          '</span></li>'
        );
      })
      .join('');
    return (
      '<section class="agenda reveal"><h2>Programme</h2><ol class="agenda-list">' +
      rows +
      '</ol></section>'
    );
  }

  /** Sidebar: type-specific facts + a CTA card. */
  function detailSide(type, item) {
    var facts = [],
      ctaTitle = '',
      ctaText = '',
      ctaLabel = 'Contact us',
      ctaHref = 'contact.html';

    if (type === 'blog') {
      facts = [
        { label: 'Written by', value: item.author },
        { label: 'Published', value: item.dateLabel },
        { label: 'Reading time', value: item.readTime },
        { label: 'Topic', value: item.category }
      ];
      ctaTitle = 'Come and see it in practice';
      ctaText = 'Book a campus visit and watch a real Edulife school day.';
      ctaLabel = 'Book a visit';
    } else if (type === 'notice') {
      facts = [
        { label: 'Posted', value: item.dateLabel },
        { label: 'Department', value: item.department },
        { label: 'Priority', value: item.priority },
        { label: 'Audience', value: (item.audience || []).join(', ') }
      ];
      ctaTitle = 'Need to follow this up?';
      ctaText = 'Our school office replies to every message within one working day.';
      ctaLabel = 'Contact the office';
    } else {
      facts = [
        { label: 'Date', value: item.dateLabel },
        { label: 'Start', value: item.time },
        { label: 'End', value: item.endTime },
        { label: 'Venue', value: item.venue },
        { label: 'Audience', value: (item.audience || []).join(', ') },
        { label: 'Registration', value: item.registration }
      ];
      ctaTitle = 'Planning to come?';
      ctaText = 'Tell us you are coming and we will make sure you are expected.';
      ctaLabel = 'Let us know';
    }

    var actionBtn = '';
    if (item.action && item.action.href) {
      actionBtn =
        '<a href="' +
        esc(item.action.href) +
        '" class="btn btn-primary btn-block">' +
        esc(item.action.label) +
        icons.arrow +
        '</a>';
    }
    if (type === 'event') {
      actionBtn +=
        '<a href="' +
        esc(calendarHref(item)) +
        '" class="btn btn-ghost btn-block" target="_blank" rel="noopener">' +
        icons.calendar +
        'Add to calendar</a>';
    }

    return (
      '<aside class="article-side">' +
      '<div class="side-card reveal">' +
      '<h3>At a glance</h3>' +
      '<div class="fact-list">' +
      factRow(facts) +
      '</div>' +
      (actionBtn ? '<div class="side-actions">' + actionBtn + '</div>' : '') +
      '</div>' +
      (item.tags && item.tags.length
        ? '<div class="side-card reveal d1"><h3>Tags</h3><div class="tag-list">' +
          item.tags
            .map(function (tg) {
              return '<span class="chip-static">' + esc(tg) + '</span>';
            })
            .join('') +
          '</div></div>'
        : '') +
      '<div class="side-card side-cta reveal d2">' +
      '<h3>' +
      esc(ctaTitle) +
      '</h3><p>' +
      esc(ctaText) +
      '</p>' +
      '<a href="' +
      esc(ctaHref) +
      '" class="btn btn-light">' +
      esc(ctaLabel) +
      icons.arrow +
      '</a>' +
      '</div>' +
      '</aside>'
    );
  }

  /** Prev / next pager within a type. */
  function detailPager(type, prev, next) {
    if (!prev && !next) {
      return '';
    }
    function cell(item, dir) {
      if (!item) {
        return '<span class="pager-cell is-empty"></span>';
      }
      return (
        '<a class="pager-cell ' +
        dir +
        '" href="' +
        esc(detailHref(type, item.slug)) +
        '">' +
        '<span class="pager-dir">' +
        (dir === 'prev' ? 'Previous' : 'Next') +
        '</span>' +
        '<b>' +
        esc(item.title) +
        '</b></a>'
      );
    }
    return (
      '<nav class="pager reveal" aria-label="More in this section">' +
      cell(prev, 'prev') +
      cell(next, 'next') +
      '</nav>'
    );
  }

  /** Related items (up to `limit`), same type. */
  function detailRelated(type, items, limit) {
    var list = (items || []).slice(0, limit || 3);
    if (!list.length) {
      return '';
    }
    var t = TYPES[type] || TYPES.blog;
    var titles = { blog: 'More from the Journal', notice: 'Other notices', event: 'More events' };
    var render = type === 'blog' ? postCard : type === 'notice' ? announcementRow : eventRowFull;
    var gridCls = type === 'blog' ? 'posts' : 'stack';
    return (
      '<section class="pad-sm related-sec">' +
      '<div class="wrap"><div class="head-row">' +
      '<div class="sec-head reveal"><span class="eyebrow">Keep reading</span>' +
      '<h2 class="display">' +
      esc(titles[type] || 'More like this') +
      '</h2></div>' +
      '<a href="' +
      esc(t.list) +
      '" class="btn btn-ghost reveal d2">' +
      esc(t.back) +
      icons.arrow +
      '</a>' +
      '</div>' +
      '<div class="' +
      gridCls +
      '" style="margin-top:44px">' +
      renderList(list, render) +
      '</div>' +
      '</div></section>'
    );
  }

  /** Back-to-listing link + share bar, above the body. */
  function detailToolbar(type, item) {
    var t = TYPES[type] || TYPES.blog;
    var meta =
      type === 'blog'
        ? esc(item.dateLabel) + ' &nbsp;·&nbsp; ' + esc(item.readTime)
        : type === 'notice'
          ? esc(item.dateLabel) + ' &nbsp;·&nbsp; ' + esc(item.department || '')
          : esc(item.dateLabel) + ' &nbsp;·&nbsp; ' + esc(item.time || '');
    return (
      '<div class="article-toolbar reveal">' +
      '<a class="back-link" href="' +
      esc(t.list) +
      '">' +
      icons.back +
      esc(t.back) +
      '</a>' +
      '<span class="toolbar-meta">' +
      meta +
      '</span>' +
      '</div>'
    );
  }

  /**
   * Whole detail page body for one item.
   * @param {string} type  'blog' | 'notice' | 'event'
   * @param {object} item  the entry from data/{blog,notices,events}.json
   * @param {object} ctx   { related:[…], prev, next }
   */
  function renderDetail(type, item, ctx) {
    ctx = ctx || {};
    var extras = type === 'event' ? agendaHtml(item.agenda) : '';
    return (
      detailHero(type, item) +
      '<section class="pad-sm article-sec">' +
      '<div class="wrap">' +
      detailToolbar(type, item) +
      '<div class="article-wrap">' +
      '<article class="article-main">' +
      '<div class="prose reveal">' +
      detailBody(item.body) +
      '</div>' +
      extras +
      shareHtml(item.title) +
      '</article>' +
      detailSide(type, item) +
      '</div>' +
      detailPager(type, ctx.prev, ctx.next) +
      '</div>' +
      '</section>' +
      detailRelated(type, ctx.related)
    );
  }

  return {
    esc: esc,
    icon: icon,
    icons: icons,
    renderList: renderList,
    TYPES: TYPES,
    detailHref: detailHref,
    setLinkBase: setLinkBase,
    calendarHref: calendarHref,
    /* list renderers */
    pillarCard: pillarCard,
    statCard: statCard,
    featureCard: featureCard,
    galleryItem: galleryItem,
    teacherCard: teacherCard,
    memberCard: memberCard,
    noticeRow: noticeRow,
    eventRow: eventRow,
    announcementRow: announcementRow,
    eventRowFull: eventRowFull,
    postCard: postCard,
    journalFeature: journalFeature,
    journalItem: journalItem,
    journeyStep: journeyStep,
    classCard: classCard,
    classOption: classOption,
    infoCard: infoCard,
    initiativeCard: initiativeCard,
    /* detail renderers */
    renderDetail: renderDetail,
    detailHero: detailHero,
    detailBody: detailBody,
    detailSide: detailSide,
    detailRelated: detailRelated,
    detailPager: detailPager,
    detailToolbar: detailToolbar,
    shareHtml: shareHtml,
    agendaHtml: agendaHtml,
    factRow: factRow,
    chipRow: chipRow,
    prioChip: prioChip
  };
});
