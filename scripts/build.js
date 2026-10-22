#!/usr/bin/env node
/* ==========================================================================
   scripts/build.js — static site generator for the Edulife IT School site
   --------------------------------------------------------------------------
   WHY THIS EXISTS
   A developer building a dynamic backend should not have to hand-copy card
   markup into ten HTML files. This script is the only thing that knows how the
   three layers fit together:

       src/data/*.json          <- content        (replaced by your API later)
       src/components/          <- partials       (header, drawer, footer, lightbox)
       src/layouts/base.html    <- the shell      (<head>, slots, script tags)
       src/pages/*.html         <- page bodies    (tokens + {{BLOCK_*}} placeholders)
       src/assets/js/renderers.js <- the view layer, shared with the browser

   RUN
       node scripts/build.js        (or: npm run build)
   OUTPUT
       dist/            the complete, publish-ready site:
                          dist/*.html            assembled pages
                          dist/blog|notice|event/<slug>.html   detail pages
                          dist/assets/           copied verbatim from src/assets
                          dist/robots.txt        copied verbatim from public/
                          dist/sitemap.xml       generated from the page manifest
       dist/ is a BUILD ARTIFACT — never hand-edit it, and it is gitignored.
       The build CLEANS dist/ first, so a removed page cannot linger as a stale
       file that still resolves.

   ADDING A PAGE
       Drop src/pages/<name>.html, then add one entry to PAGES below.
       See README.md -> "Add a page" for the full walkthrough.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ------------------------------------------------------------- locations */
/* This file lives in scripts/, so the project root is one level up. */
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const PUBLIC = path.join(ROOT, 'public');
const OUT_DIR = path.join(ROOT, 'dist');

const R = require(path.join(SRC, 'assets', 'js', 'renderers.js'));

/* The stylesheet is authored as numbered partials (src/assets/css/parts/) and
   concatenated by scripts/css.js. Using it here — rather than copying a single
   monolith verbatim — is what makes the partial split real: a new partial
   cannot ship unless it is listed in CSS_PARTS. */
const CSS = require(path.join(__dirname, 'css.js'));

/* --------------------------------------------------------------- helpers */

function read(rel) {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}
function readJson(rel) {
  return JSON.parse(read(rel));
}
/** Placeholder substitution — literal, global, no regex escaping surprises. */
function apply(template, tokens) {
  let out = template;
  Object.keys(tokens).forEach(function (key) {
    if (tokens[key] === undefined || tokens[key] === null) {
      return;
    }
    out = out.split('{{' + key + '}}').join(String(tokens[key]));
  });
  return out;
}
const esc = R.esc;

/** Recursively copy a directory (used for src/assets -> dist/assets and
    public/ -> dist/). Node has fs.cpSync, but a tiny explicit walk keeps the
    script dependency-free and works on every Node >= 14. */
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from, { withFileTypes: true }).forEach(function (e) {
    const s = path.join(from, e.name);
    const d = path.join(to, e.name);
    if (e.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  });
}

/* Copy src/assets into dist/assets, EXCEPT css/ — that directory holds the
   authored partials and must never ship flat. The browser gets one bundled
   stylesheet instead, built by scripts/css.js. */
function copyAssets() {
  const from = path.join(SRC, 'assets');
  const to = path.join(OUT_DIR, 'assets');
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from, { withFileTypes: true }).forEach(function (e) {
    if (e.name === 'css') {
      return;
    }
    const s = path.join(from, e.name);
    const d = path.join(to, e.name);
    if (e.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  });
  const css = CSS.buildCss();
  console.log(
    '  \u2713 css  ' +
      css.parts +
      ' partials \u2192 assets/css/styles.css (' +
      (css.bytes / 1024).toFixed(1) +
      ' KB)'
  );
}

/* ------------------------------------------------------------ load layers */

const site = readJson('data/site.json');
const teachers = readJson('data/teachers.json');
const notices = readJson('data/notices.json');
const events = readJson('data/events.json');
const gallery = readJson('data/gallery.json');
const blog = readJson('data/blog.json');

/* Templates carry developer documentation in HTML comments — and some of those
   comments name the very tokens we substitute. Strip comments BEFORE
   substitution, otherwise the placeholder expands inside the comment, the
   comment breaks, and the component ends up emitted twice. */
function stripComments(s) {
  return s.replace(/<!--[\s\S]*?-->/g, '');
}

const layout = stripComments(read('layouts/base.html'));
const parts = {
  header: stripComments(read('components/header.html')),
  drawer: stripComments(read('components/drawer.html')),
  footer: stripComments(read('components/footer.html')),
  lightbox: stripComments(read('components/lightbox.html'))
};

/* --------------------------------------------------------- shared tokens */

function navLinks(activeKey) {
  return site.nav
    .map(function (n) {
      const active = n.key === activeKey ? ' class="active" aria-current="page"' : '';
      return '<a href="' + esc(n.href) + '"' + active + '>' + esc(n.label) + '</a>';
    })
    .join('\n      ');
}

/* Mobile drawer nav links. Each carries its index in a --i custom property so
   the CSS entrance animation can stagger one link after another. The active
   page is marked with aria-current so it can be styled and announced. */
function drawerLinks(activeKey) {
  return site.nav
    .map(function (n, i) {
      const active =
        n.key === activeKey
          ? ' class="drawer-link active" aria-current="page"'
          : ' class="drawer-link"';
      return (
        '<a href="' +
        esc(n.href) +
        '"' +
        active +
        ' style="--i:' +
        i +
        '">' +
        '<span>' +
        esc(n.label) +
        '</span>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' +
        '</a>'
      );
    })
    .join('\n    ');
}

/* Social icons for the drawer footer. Paths live here rather than in the JSON
   so the data layer stays pure content (label + href + which icon). */
const SOCIAL_PATHS = {
  facebook:
    '<path d="M15 3h-2.5A4.5 4.5 0 0 0 8 7.5V10H5.5v4H8v7h4v-7h3l.5-4H12V7.5c0-.6.4-1 1-1h2z"/>',
  youtube:
    '<path d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.9C18.2 5 12 5 12 5s-6.2 0-7.8.3A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 4.8 2.6 2.6 0 0 0 1.8 1.9C5.8 19 12 19 12 19s6.2 0 7.8-.3a2.6 2.6 0 0 0 1.8-1.9A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.8z"/><path d="m10 15 5-3-5-3z"/>',
  whatsapp: '<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z"/><path d="M8.5 9.5c0 3 2.3 5.3 5.2 5.8"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>'
};

function drawerSocial() {
  return (site.social || [])
    .map(function (s) {
      return (
        '<a href="' +
        esc(s.href) +
        '" target="_blank" rel="noopener" aria-label="' +
        esc(s.label) +
        '" title="' +
        esc(s.label) +
        '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        (SOCIAL_PATHS[s.icon] || SOCIAL_PATHS.mail) +
        '</svg></a>'
      );
    })
    .join('');
}

function footerColumns() {
  return site.footer.columns
    .map(function (col) {
      const links = col.links
        .map(function (l) {
          return '<a href="' + esc(l.href) + '">' + esc(l.label) + '</a>';
        })
        .join('');
      return (
        '      <div class="foot-col">\n' +
        '        <h4>' +
        esc(col.title) +
        '</h4>\n' +
        '        ' +
        links +
        '\n' +
        '      </div>'
      );
    })
    .join('\n');
}

function heroTitle() {
  return (
    esc(site.hero.titleLead) +
    ' <span class="accent">' +
    esc(site.hero.titleAccent) +
    '</span> ' +
    esc(site.hero.titleTail)
  );
}

/*
 * The hero's secondary highlight: "Admissions open · 2027".
 *
 * Deliberately a LINK to the admissions notice, not a decorative label: the
 * notice already holds the dates, the campuses and the class range, so the
 * badge is the shortest path to the detail a parent wants next.
 *
 * Rendered as a <p> wrapper containing the <a>, so the badge occupies its own
 * line in the hero stack without becoming a heading element (a second heading
 * above the <h1> would break the document outline, and the gate asserts
 * exactly one <h1> per page).
 *
 * Returns '' when no badge is configured — every escaping rule stays here, so
 * the template never interpolates a raw value.
 */
function heroBadge() {
  var b = site.hero.admissionsBadge;
  if (!b || !b.text) return '';
  var href = b.href || 'admission.html';
  return (
    '<p class="hero-badge-row reveal">' +
    '<a class="hero-badge" href="' +
    esc(href) +
    '"><span class="hb-dot" aria-hidden="true"></span>' +
    esc(b.text) +
    '</a>' +
    '</p>'
  );
}

function heroTags() {
  return site.hero.tags
    .map(function (t) {
      return '<span>' + esc(t) + '</span>';
    })
    .join('');
}

function heroFloatCards() {
  return site.hero.floatCards
    .map(function (c) {
      return (
        '<div class="float-card ' +
        esc(c.style) +
        '"><small>' +
        esc(c.label) +
        '</small><b>' +
        esc(c.value) +
        '</b></div>'
      );
    })
    .join('\n        ');
}

function marquee() {
  const one = site.marquee
    .map(function (m) {
      return '<span>' + esc(m) + '</span>';
    })
    .join('');
  return one + one; /* duplicated so the -50% keyframe loops seamlessly */
}

/** Tokens every page receives. */
function baseTokens(activeKey) {
  const c0 = site.campuses[0],
    c1 = site.campuses[1];
  return Object.assign({
    /* layout */
    HEADER: apply(parts.header, {
      NAV_LINKS: navLinks(activeKey),
      CTA_LABEL: esc(site.primaryCta.label),
      CTA_HREF: esc(site.primaryCta.href)
    }),
    DRAWER: apply(parts.drawer, {
      DRAWER_LINKS: drawerLinks(activeKey),
      DRAWER_CTA_EYEBROW: esc('Admissions open'),
      DRAWER_CTA_LABEL: esc(site.primaryCta.label),
      DRAWER_CTA_HREF: esc(site.primaryCta.href),
      DRAWER_PHONE: esc(site.contact.phone),
      DRAWER_PHONE_HREF: esc(site.contact.phoneHref),
      DRAWER_EMAIL: esc(site.contact.email),
      DRAWER_EMAIL_HREF: esc(site.contact.emailHref),
      DRAWER_ADDRESS: esc(c0.address),
      DRAWER_SOCIAL: drawerSocial()
    }),
    FOOTER: apply(parts.footer, {
      FOOTER_DESCRIPTION: esc(site.brand.description),
      FOOTER_COLUMNS: footerColumns(),
      FOOTER_NOTE: esc(site.footer.note),
      FOOTER_STRAP: esc(site.footer.strap)
    }),
    LIGHTBOX: parts.lightbox,
    LIVE: 'false',
    /* Detail pages only; empty string on every ordinary page. */
    ARTICLE_HEAD: '',

    /* (spread below) */

    /* hero */
    /* The admissions badge is optional: an empty object (or a missing block)
       collapses both tokens to '' and the markup renders nothing, so a school
       between admission cycles can switch it off in data alone. */
    HERO_BADGE: heroBadge(),
    HERO_EYEBROW: esc(site.hero.eyebrow),
    HERO_TITLE: heroTitle(),
    HERO_LEAD: esc(site.hero.lead),
    HERO_PRIMARY_LABEL: esc(site.hero.primaryAction.label),
    HERO_PRIMARY_HREF: esc(site.hero.primaryAction.href),
    HERO_SECONDARY_LABEL: esc(site.hero.secondaryAction.label),
    HERO_SECONDARY_HREF: esc(site.hero.secondaryAction.href),
    HERO_TAGS: heroTags(),
    HERO_IMAGE: esc(site.hero.image),
    HERO_IMAGE_ALT: esc(site.hero.imageAlt),
    HERO_FLOAT_CARDS: heroFloatCards(),
    MARQUEE: marquee(),

    /* contact & campuses */
    CONTACT_REPLY_TIME: esc(site.contact.replyTime),
    CONTACT_PHONE: esc(site.contact.phone),
    CONTACT_PHONE_HREF: esc(site.contact.phoneHref),
    CONTACT_EMAIL: esc(site.contact.email),
    CONTACT_EMAIL_HREF: esc(site.contact.emailHref),
    OFFICE_HOURS: esc(site.contact.hours),
    CAMPUS_1_NAME: esc(c0.name),
    CAMPUS_1_ADDRESS: esc(c0.address),
    CAMPUS_1_PHONE: esc(c0.phone),
    CAMPUS_1_EMAIL: esc(c0.email),
    CAMPUS_2_NAME: esc(c1.name),
    CAMPUS_2_ADDRESS: esc(c1.address),
    CAMPUS_2_PHONE: esc(c1.phone),
    CAMPUS_2_EMAIL: esc(c1.email),

    /* Closing admission section (homepage). Copy lives in site.json -> ctaSteps
       so a writer never has to touch markup. The five STEPS are deliberately
       NOT read from here — they come from the shared `admissionSteps` array, so
       the homepage and /admission can never describe a different process. */
    CTA_EYEBROW: esc(site.ctaSteps.eyebrow),
    CTA_TITLE: esc(site.ctaSteps.title),
    CTA_TEXT: esc(site.ctaSteps.text),
    CTA_FORM_TITLE: esc(site.ctaSteps.formTitle),
    CTA_SUBMIT: esc(site.ctaSteps.submit),
    CTA_FORM_NOTE: esc(site.ctaSteps.note),
    CTA_SUCCESS: esc(site.ctaSteps.success),

    /* "Edulife family" initiatives strip (homepage). */
    INI_EYEBROW: esc(site.initiatives.eyebrow),
    INI_TITLE: esc(site.initiatives.title),
    INI_TEXT: esc(site.initiatives.text),

    /* "Classes we offer" grid (Admission page). Copy lives in site.json ->
       classes so the school can add or rename a class without touching markup. */
    CLASSES_EYEBROW: esc(site.classes.eyebrow),
    CLASSES_TITLE: esc(site.classes.title),
    CLASSES_TEXT: esc(site.classes.text),
    CLASSES_BADGE: esc(site.classes.badge)
  });
}

/** {{BLOCK_*}} content built from data/*.json through the shared renderers. */
const BLOCKS = {
  BLOCK_PILLARS: function () {
    return R.renderList(site.pillars, R.pillarCard);
  },
  BLOCK_STATS: function () {
    return R.renderList(site.stats, R.statCard);
  },
  BLOCK_FEATURES: function () {
    return R.renderList(site.features, R.featureCard);
  },
  BLOCK_STEPS: function () {
    return R.renderList(site.admissionSteps, R.journeyStep);
  },
  BLOCK_CLASSES: function () {
    return R.renderList(site.classes.items, R.classCard);
  },
  BLOCK_CLASS_OPTIONS: function () {
    return R.renderList(site.classes.items, R.classOption);
  },
  BLOCK_INITIATIVES: function () {
    return R.renderList(site.initiatives.items, R.initiativeCard);
  },
  BLOCK_INFO_CARDS: function () {
    return R.renderList(site.contact.cards, R.infoCard);
  },

  BLOCK_GALLERY_HOME: function () {
    return R.renderList(gallery.items.slice(0, 5), R.galleryItem);
  },
  BLOCK_GALLERY_FULL: function () {
    return R.renderList(gallery.items, R.galleryItem);
  },

  BLOCK_TEACHERS_HOME: function () {
    return R.renderList(teachers.staff.slice(0, 8), R.teacherCard);
  },
  BLOCK_TEACHERS_FULL: function () {
    return R.renderList(teachers.staff, R.teacherCard);
  },
  BLOCK_LEADERSHIP: function () {
    return R.renderList(teachers.leadership, R.memberCard);
  },

  BLOCK_NOTICES: function () {
    return R.renderList(notices.items.slice(0, 3), R.noticeRow);
  },
  BLOCK_NOTICES_FULL: function () {
    return R.renderList(notices.items, R.announcementRow);
  },
  BLOCK_EVENTS: function () {
    return R.renderList(events.items.slice(0, 3), R.eventRow);
  },
  BLOCK_EVENTS_FULL: function () {
    return R.renderList(events.items, R.eventRowFull);
  },

  BLOCK_POSTS: function () {
    return R.renderList(blog.items, R.postCard);
  },
  BLOCK_JOURNAL_FEATURE: function () {
    return R.journalFeature(blog.items[0], 0);
  },
  BLOCK_JOURNAL_ITEMS: function () {
    return R.renderList(blog.items.slice(1, 5), R.journalItem);
  },
  BLOCK_JOURNAL_ITEMS_B: function () {
    return R.renderList(blog.items.slice(4, 8), R.journalItem);
  }
};

/* ------------------------------------------------------------ page manifest */

const PAGES = [
  {
    src: 'index.html',
    out: 'index.html',
    key: 'home',
    title: 'Edulife IT School — English-focused, IT-integrated primary school',
    description:
      'An English-focused primary school integrating Computer, IT, Programming, AI and modern learning skills to prepare students for the future.'
  },
  {
    src: 'about.html',
    out: 'about.html',
    key: 'about',
    title: 'About Us — Edulife IT School',
    description:
      'Our story, our three learning pillars, our leadership team and the official teaching permits behind Edulife IT School.'
  },
  {
    src: 'admission.html',
    out: 'admission.html',
    key: 'admission',
    title: 'Admission — Edulife IT School',
    description:
      'Admissions are open for the new academic session. See the five admission steps, what to prepare, and send an inquiry.'
  },
  {
    src: 'teachers.html',
    out: 'teachers.html',
    key: 'teachers',
    title: 'Teachers — Edulife IT School',
    description:
      'Meet the Edulife faculty across our Khagrachari and Luxmichari campuses, plus the school leadership team.'
  },
  {
    src: 'notice.html',
    out: 'notice.html',
    key: 'notice',
    title: 'Notice Board — Edulife IT School',
    description: 'Latest announcements for Edulife families and students, filterable by category.'
  },
  {
    src: 'events.html',
    out: 'events.html',
    key: 'events',
    title: 'Events — Edulife IT School',
    description:
      'Upcoming Edulife events: showcases, carnivals, science fairs and parents meetings.'
  },
  {
    src: 'gallery.html',
    out: 'gallery.html',
    key: 'gallery',
    title: 'Gallery — Edulife IT School',
    description:
      'Life at Edulife in pictures: classrooms, coding lab, speaking showcases and campus moments.'
  },
  {
    src: 'blog.html',
    out: 'blog.html',
    key: 'blog',
    title: 'The Edulife Journal — Edulife IT School',
    description:
      'Practical ideas for curious families on reading, digital literacy, speaking confidence and school life.'
  },
  {
    src: 'contact.html',
    out: 'contact.html',
    key: 'contact',
    title: 'Contact — Edulife IT School',
    description: 'Contact the Edulife school office, find both campuses, or send us a message.'
  },
  {
    src: '404.html',
    out: '404.html',
    key: '404',
    title: 'Page not found — Edulife IT School',
    description: 'This page could not be found. Return to the Edulife IT School homepage.'
  },

  /* The runtime detail route. Serves any single blog post / notice / event from
     one URL as  article.html?type=&slug=  — see src/assets/js/article.js. Its
     body is replaced at runtime, so no nav key is highlighted until it resolves. */
  {
    src: 'article.html',
    out: 'article.html',
    key: '',
    title: 'Article — Edulife IT School',
    description: 'A single article, notice or event from the Edulife IT School data layer.'
  }
];

/* --------------------------------------------------------------------------
   DETAIL PAGES  —  one prerendered file per item in the data layer
   --------------------------------------------------------------------------
   The three detail families. Everything they need is already in src/data/*.json:
   `slug` becomes the file name, `body[]` becomes the prose, and the siblings in
   the same array become the pager and the related grid.

   Why prerender them at all, if article.js can render any slug at runtime?
   Because a real file per item is crawlable, shareable and works without JS.
   article.js exists so the same template can be served from ONE url once a
   backend owns the route.
   -------------------------------------------------------------------------- */

const ART_SETS = [
  { type: 'blog', dir: 'blog', key: 'blog', items: blog.items, noun: 'blog post' },
  { type: 'notice', dir: 'notice', key: 'notice', items: notices.items, noun: 'notice' },
  { type: 'event', dir: 'event', key: 'events', items: events.items, noun: 'event' }
];

/** Every detail page path, relative to the site root. Used by the sitemap. */
function detailPaths() {
  const out = [];
  ART_SETS.forEach(function (set) {
    set.items.forEach(function (item) {
      out.push(set.dir + '/' + item.slug + '.html');
    });
  });
  return out;
}

/**
 * Content-derived build stamp for local CSS/JS.
 *
 * Assets are served with a long `Cache-Control: max-age`, and edges commonly
 * ignore the query string when revalidating, so without this a redeploy can sit
 * unseen behind a warm cache for days. Stamping each local stylesheet/script URL
 * with a hash of the asset bytes means the URL itself changes whenever the code
 * does, so a release is picked up immediately.
 */
const LOCAL_ASSETS = [
  'assets/js/renderers.js',
  'assets/js/data-loader.js',
  'assets/js/main.js',
  'assets/js/article.js',
  'assets/js/chat.js'
];

/* The stylesheet's hash comes from the CONCATENATED partials, not from one
   source file, so editing any single partial busts the cache exactly as
   editing the old monolith did. */
function assetVersion() {
  const h = crypto.createHash('sha1');
  LOCAL_ASSETS.forEach(function (f) {
    h.update(fs.readFileSync(path.join(SRC, f)));
  });
  CSS.CSS_PARTS.forEach(function (p) {
    h.update(fs.readFileSync(path.join(SRC, 'assets', 'css', 'parts', p)));
  });
  return h.digest('hex').slice(0, 8);
}

/** Append ?v=<stamp> to every local css/js reference in a generated page. */
function stampAssets(html, version) {
  return html.replace(/(assets\/(?:css|js)\/[a-z0-9._-]+\.(?:css|js))"/g, function (m, asset) {
    return asset + '?v=' + version + '"';
  });
}

/* -------------------------------------------------------------- images --- */
/* scripts/images.js writes a manifest of the WebP variants it produced. Here we
   upgrade each photographed <img> to a <picture> that offers WebP first and
   the original file as the fallback.

   WHY <picture> AND NOT srcset
   The layout is fluid but the images are content-driven (a portrait is 300px
   wide, a hero is full-bleed), so a density-based srcset would need a per-image
   size hint that the data layer does not carry. <picture> with one format
   switch captures the whole 74% saving with no new authoring burden. Width
   descriptors can be layered on later per collection; see docs/ARCHITECTURE.md.

   Non-photographic assets (logos, the seal, initiative marks, press logo) are
   absent from the manifest on purpose, so they pass through untouched and keep
   their exact intrinsic size and transparency. */
let IMAGING = {};
try {
  IMAGING = JSON.parse(fs.readFileSync(path.join(SRC, 'assets', 'imaging-manifest.json'), 'utf8'));
} catch {
  IMAGING = {}; /* no manifest: ship the originals, exactly as before */
}

function upgradeImages(html) {
  var keys = Object.keys(IMAGING);
  if (!keys.length) {
    return html;
  }
  return html.replace(/<img\s([^>]*?)\/?>/g, function (whole, attrs) {
    var srcMatch = /\bsrc="([^"]+)"/.exec(attrs);
    if (!srcMatch) {
      return whole;
    }
    /* Detail pages are rebased AFTER this step, so a variant lookup has to
       tolerate a leading ../ that is not in the manifest yet. */
    var raw = srcMatch[1];
    var clean = raw.replace(/^(?:\.\.\/)+/, '');
    var variant = IMAGING[clean];
    if (!variant) {
      return whole;
    }
    /* Give the fallback <img> its intrinsic size so the reserved box cannot
       shift when the WebP arrives. Only when the template omitted it — never
       override an author's deliberate dimensions. */
    var extra = '';
    if (!/\bwidth=/.test(attrs) && variant.width) {
      extra += ' width="' + variant.width + '" height="' + variant.height + '"';
    }
    /* The manifest already holds the dist-relative variant path; swapping the
       original for it keeps any leading ../ intact for detail pages. */
    var webp = raw.replace(clean, variant.webp);
    return (
      '<picture>' +
      '<source srcset="' +
      webp +
      '" type="image/webp" />' +
      '<img ' +
      attrs +
      extra +
      ' />' +
      '</picture>'
    );
  });
}

/* Computed once per run; every page in this build shares the same stamp.
   Derived from LOCAL_ASSETS rather than re-listing the files, so adding an
   asset in one place cannot silently leave it out of the cache-busting hash. */
const VERSION = assetVersion();

/**
 * Prefix every site-root-relative URL with the right number of "../" hops.
 *
 * Detail pages live one level down (blog/<slug>.html), so an href of
 * "assets/css/styles.css" or "index.html" written for a root page would resolve
 * against blog/ and 404. Rather than maintain a second set of templates, the
 * generated page is rewritten once, here: absolute URLs (http:, mailto:, tel:,
 * data:), protocol-relative (//), in-page anchors (#) and already-relative
 * paths (./ ../) are all left untouched.
 */
function rebase(html, depth) {
  if (!depth) {
    return html;
  }
  const up = new Array(depth + 1).join('../');
  return (
    html
      .replace(/\b(href|src)="([^"]*)"/g, function (m, attr, url) {
        if (!url) {
          return m;
        }
        if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
          return m;
        } /* scheme: */
        if (url.charAt(0) === '#' || url.slice(0, 2) === '//') {
          return m;
        }
        if (url.slice(0, 2) === './' || url.slice(0, 3) === '../') {
          return m;
        }
        return attr + '="' + up + url + '"';
      })
      /* og:image is a content= attribute rather than href/src. */
      .replace(/(property="og:image" content=")([^"]*)(")/g, function (m, a, url, b) {
        if (!url || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
          return m;
        }
        return a + up + url + b;
      })
  );
}

/** Write one prerendered page per item, all from src/pages/detail.html. */
function buildDetails(warnings) {
  const tpl = read('pages/detail.html');
  const written = [];

  ART_SETS.forEach(function (set) {
    fs.mkdirSync(path.join(OUT_DIR, set.dir), { recursive: true });

    set.items.forEach(function (item, i) {
      if (!item.slug) {
        warnings.push(set.type + ' -> item without a slug: "' + item.title + '" (skipped)');
        return;
      }

      /* Siblings drive the prev/next pager and the related grid. */
      const prev = set.items[i - 1] || null;
      const next = set.items[i + 1] || null;
      const related = set.items
        .filter(function (_, j) {
          return j !== i;
        })
        .slice(0, 3);

      const tokens = baseTokens(set.key);
      tokens.DETAIL_CONTENT = R.renderDetail(set.type, item, {
        related: related,
        prev: prev,
        next: next
      });

      const content = apply(tpl, tokens);
      const html = apply(
        layout,
        Object.assign({}, tokens, {
          PAGE_TITLE: esc(item.title + ' — Edulife IT School'),
          PAGE_DESCRIPTION: esc(item.excerpt || item.title),
          CANONICAL: esc(set.dir + '/' + item.slug + '.html'),
          PAGE_KEY: esc(set.key),
          CONTENT: content
        })
      );

      if (/\{\{[A-Z0-9_]+\}\}/.test(html)) {
        warnings.push(set.dir + '/' + item.slug + '.html -> unresolved token');
      }

      const rel = set.dir + '/' + item.slug + '.html';
      fs.writeFileSync(
        path.join(OUT_DIR, rel),
        rebase(upgradeImages(stampAssets(html, VERSION)), 1),
        'utf8'
      );
      written.push(rel);
    });
  });

  written.sort();
  written.forEach(function (rel) {
    console.log('  \u2713 ' + rel);
  });
  console.log(
    '  \u2192 ' +
      written.length +
      ' detail pages (' +
      ART_SETS.map(function (s) {
        return s.items.length + ' ' + s.noun + (s.items.length === 1 ? '' : 's');
      }).join(', ') +
      ')'
  );
  return written;
}

/* ------------------------------------------------------------------- build */

function build() {
  /* Clean the output directory first, so a page that was renamed or removed
     cannot survive as a stale file that still resolves on the host. */
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const warnings = [];
  console.log('  asset stamp: v=' + VERSION);

  PAGES.forEach(function (page) {
    const body = read(path.join('pages', page.src));
    let tokens = baseTokens(page.key);

    Object.keys(BLOCKS).forEach(function (name) {
      if (body.indexOf('{{' + name + '}}') !== -1) {
        tokens[name] = BLOCKS[name]();
      }
    });

    let content = apply(body, tokens);

    /* Strip any remaining block placeholders a page does not use, so the
       output never carries a stray {{TOKEN}}. */
    content = content.replace(/\{\{[A-Z0-9_]+\}\}/g, function (m) {
      warnings.push(page.out + ' -> unused token ' + m);
      return '';
    });

    const html = apply(
      layout,
      Object.assign({}, tokens, {
        PAGE_TITLE: esc(page.title),
        PAGE_DESCRIPTION: esc(page.description),
        CANONICAL: esc(page.out),
        PAGE_KEY: esc(page.key),
        CONTENT: content
      })
    );

    if (/\{\{[A-Z0-9_]+\}\}/.test(html)) {
      warnings.push(page.out + ' -> layout still has unresolved tokens');
    }

    fs.writeFileSync(
      path.join(OUT_DIR, page.out),
      upgradeImages(stampAssets(html, VERSION)),
      'utf8'
    );
    console.log('  \u2713 ' + page.out + '  (' + (html.length / 1024).toFixed(1) + ' KB)');
  });

  /* detail pages ---------------------------------------------------------- */
  console.log('');
  buildDetails(warnings);

  /* static passthrough ---------------------------------------------------- */
  /* src/assets -> dist/assets (css, js, images) and public/ -> dist/ (robots.txt,
     favicon, anything that must be served verbatim). Both are copied AFTER the
     pages so a passthrough file can never be overwritten by a generated one. */
  copyAssets();
  if (fs.existsSync(PUBLIC)) {
    copyDir(PUBLIC, OUT_DIR);
  }
  /* The JSON fixtures are ALSO published, so the runtime data seam keeps
     working: flip data-live="true" (or config.useStaticJson=false) and
     data-loader.js fetches dist/data/*.json exactly as documented. */
  copyDir(path.join(SRC, 'data'), path.join(OUT_DIR, 'data'));
  console.log('  \u2713 assets/ + public/ + data/ copied');

  /* sitemap --------------------------------------------------------------- */
  /* Every real file is listed, including the per-item detail pages. The
     runtime route (article.html) is excluded: it is a template, not content,
     and would duplicate every detail URL with a query string. */
  const urlPaths = PAGES.filter(function (p) {
    return p.out !== '404.html' && p.out !== 'article.html';
  })
    .map(function (p) {
      return p.out;
    })
    .concat(detailPaths());
  const urls = urlPaths
    .map(function (u) {
      return '  <url><loc>' + u + '</loc></url>';
    })
    .join('\n');
  fs.writeFileSync(
    path.join(OUT_DIR, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<!-- Replace the relative <loc> values with absolute URLs on deploy. -->\n' +
      '<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">\n' +
      urls +
      '\n</urlset>\n',
    'utf8'
  );
  console.log('  \u2713 sitemap.xml');

  if (warnings.length) {
    console.log('\n  \u26a0 notes:');
    warnings.forEach(function (w) {
      console.log('    - ' + w);
    });
  }
  console.log(
    '\n  built ' +
      (PAGES.length + detailPaths().length) +
      ' pages \u2192 ' +
      path.relative(ROOT, OUT_DIR) +
      '/  (' +
      PAGES.length +
      ' main + ' +
      detailPaths().length +
      ' detail)'
  );
}

build();
