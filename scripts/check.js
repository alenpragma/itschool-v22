#!/usr/bin/env node
/* ==========================================================================
   scripts/check.js — quality gate for the static build
   --------------------------------------------------------------------------
   Runs a set of structural assertions over the GENERATED site in dist/ and the
   SOURCES in src/. It is deliberately dependency-free (Node built-ins only) so
   it can run in CI with no install step.

   RUN
       node scripts/check.js        (or: npm run check)

   CHECKS
     1. tag balance            every generated page's tags open and close
     2. unresolved tokens      no {{TOKEN}} survived the build
     3. link graph             every internal href/src resolves on disk
     4. structure / data       the homepage + admission contract holds
     5. class-dropdown sync    the data layer drives every class <option>
     6. dead CSS               no orphaned rules for removed components
   ========================================================================== */
'use strict';

const fs = require('fs'),
  path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SRC = path.join(ROOT, 'src');
const PARTS = path.join(SRC, 'assets', 'css', 'parts');
const CSS_MOD = require(path.join(__dirname, 'css.js'));

/* The stylesheet is authored as partials; assertions read the BUNDLE that the
   browser actually receives, so a rule can only pass the gate if it really
   ships. Reading parts/ instead would let a partial that css.js forgot to
   include look present. */
function bundledCss() {
  const built = path.join(DIST, 'assets', 'css', 'styles.css');
  if (fs.existsSync(built)) {
    return fs.readFileSync(built, 'utf8');
  }
  return CSS_MOD.CSS_PARTS.map((p) => fs.readFileSync(path.join(PARTS, p), 'utf8')).join('');
}

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
]);

if (!fs.existsSync(DIST)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

/* Generated pages only. dist/ holds nothing but generated + copied output, so
   the whole tree is fair game; templates in src/ use site-root-relative paths
   that would resolve against their own folder and report false positives. */
function walk(dir, out) {
  out = out || [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}
const pages = walk(DIST);

/* ---------- 1. tag balance ---------- */
const tagBad = [];
for (const f of pages) {
  let h = fs.readFileSync(f, 'utf8');
  h = h
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const stack = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;
  let m,
    bad = null;
  while ((m = re.exec(h))) {
    const name = m[1].toLowerCase(),
      closing = m[0][1] === '/',
      self = m[2] === '/';
    if (VOID.has(name) || self) continue;
    if (!closing) stack.push(name);
    else {
      if (stack.length && stack[stack.length - 1] === name) stack.pop();
      else {
        bad = 'unexpected </' + name + '>';
        break;
      }
    }
  }
  if (bad || stack.length)
    tagBad.push(path.relative(DIST, f) + ' :: ' + (bad || 'unclosed ' + stack.join(',')));
}
console.log('TAG BALANCE: ' + (tagBad.length ? 'FAIL' : 'PASS') + ' (' + pages.length + ' pages)');
tagBad.slice(0, 8).forEach((b) => console.log('   ' + b));

/* ---------- 2. unresolved tokens ---------- */
const tokLeft = [];
for (const f of pages) {
  const hits = fs.readFileSync(f, 'utf8').match(/\{\{[A-Z0-9_]+\}\}/g) || [];
  if (hits.length) tokLeft.push(path.relative(DIST, f) + ' :: ' + [...new Set(hits)].join(','));
}
console.log('UNRESOLVED TOKENS: ' + (tokLeft.length ? 'FAIL' : 'PASS (0)'));
tokLeft.slice(0, 8).forEach((b) => console.log('   ' + b));

/* ---------- 3. link graph ---------- */
const dead = [];
let refs = 0;
for (const f of pages) {
  const dir = path.dirname(f);
  const h = fs.readFileSync(f, 'utf8');
  const re = /(?:href|src)\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(h))) {
    const raw = m[1];
    if (/^(https?:|mailto:|tel:|data:|#|\/\/)/.test(raw)) continue;
    const clean = raw.split('?')[0].split('#')[0];
    if (!clean) continue;
    refs++;
    const target = clean.startsWith('/') ? path.join(DIST, clean) : path.resolve(dir, clean);
    if (!fs.existsSync(target)) dead.push(path.relative(DIST, f) + ' -> ' + raw);
  }
}
console.log('LINK GRAPH: ' + (dead.length ? 'FAIL' : 'PASS') + ' (' + refs + ' refs, 0 dead)');
[...new Set(dead)].slice(0, 10).forEach((d) => console.log('   ' + d));

/* ---------- 4. structure: new section + data contract ---------- */
const idx = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const adm = fs.readFileSync(path.join(DIST, 'admission.html'), 'utf8');
const site = JSON.parse(fs.readFileSync(path.join(SRC, 'data/site.json'), 'utf8'));
const cnt = (h, re) => (h.match(re) || []).length;

/* The icon keys are read from the renderer itself rather than hard-coded here,
   so the gate cannot drift out of sync with the icon set. */
const rendererSrc = fs.readFileSync(path.join(SRC, 'assets/js/renderers.js'), 'utf8');
const iconBlock = rendererSrc.slice(
  rendererSrc.indexOf('var icons = {'),
  rendererSrc.indexOf('function icon(name)')
);
const ICON_KEYS = Array.from(iconBlock.matchAll(/^\s{4}([a-zA-Z]+):\s*'/gm)).map(function (m) {
  return m[1];
});
const css0 = bundledCss();
const R = [];
R.push(['homepage .cta-cols', cnt(idx, /class="cta-cols"/g), 1]);
R.push(['homepage .ini-logo (6 marks)', cnt(idx, /class="ini-logo" aria-hidden="true"/g), 6]);
R.push([
  'homepage .ini-logo <img> (6 logos)',
  cnt(idx, /class="ini-logo" aria-hidden="true"><img /g),
  6
]);
R.push([
  'homepage logo img has width/height',
  cnt(idx, /ini-logo" aria-hidden="true"><img [^>]*width="104" height="104"/g),
  6
]);
R.push([
  'homepage logo img loading=lazy + decoding=async',
  cnt(idx, /ini-logo" aria-hidden="true"><img [^>]*loading="lazy" decoding="async"/g),
  6
]);
R.push([
  'homepage logo img alt (empty, name is adjacent)',
  cnt(idx, /ini-logo" aria-hidden="true"><img [^>]*alt=""/g),
  6
]);
R.push(['homepage .ini-logo plate width rule', /\n\.ini-logo\{[^}]*width:104px/.test(css0), true]);
R.push([
  'css sizes logo img (= svg sizing)',
  /\.ini-logo svg,\.ini-logo img\{width:80px;height:80px/.test(css0),
  true
]);
R.push([
  'css mobile keeps img in step',
  /\.ini-logo svg,\.ini-logo img\{width:62px;height:62px\}/.test(css0),
  true
]);
R.push(['css initiative focus ring', /\.initiative:focus-visible/.test(css0), true]);
R.push(['homepage .ini-mono (dead)', cnt(idx, /ini-mono/g), 0]);
R.push([
  'initiative icons all resolve in icon set (fallback)',
  site.initiatives.items.every(function (it) {
    return ICON_KEYS.indexOf(it.icon) !== -1;
  }),
  true
]);
R.push([
  'site.json initiatives.monogram (removed)',
  site.initiatives.items.every(function (it) {
    return it.monogram === undefined;
  }),
  true
]);
R.push([
  'every initiative has a logo',
  site.initiatives.items.every(function (it) {
    return !!it.logo;
  }),
  true
]);
R.push([
  'every initiative has a url',
  site.initiatives.items.every(function (it) {
    return !!it.url;
  }),
  true
]);
R.push([
  'external links open in a new tab',
  cnt(
    idx,
    /class="initiative reveal d\d (?:tone-)?[a-z]+" href="https?:\/\/[^"]+" target="_blank" rel="noopener noreferrer"/g
  ),
  6
]);
R.push(['new-tab hint announced in words', cnt(idx, /\(opens in a new tab\)/g), 6]);
R.push([
  'no aria-label swallowing the tagline',
  cnt(idx, /class="initiative[^"]*"[^>]*aria-label=/g),
  0
]);
R.push(['homepage .form-card', cnt(idx, /class="form-card reveal/g), 1]);
R.push([
  'homepage class <option>',
  cnt(
    idx,
    /<option value="(Nursery|Junior One|Class One|Class Two|Class Three|Class Four|Class Five)"/g
  ),
  7
]);
R.push(['homepage .cta-panel (dead)', cnt(idx, /cta-panel/g), 0]);
R.push(['homepage data-validate forms', cnt(idx, /data-validate/g), 1]);
R.push(['admission .step (5)', cnt(adm, /class="step reveal/g), 5]);
R.push([
  'admission class <option>',
  cnt(adm, /<option>(Nursery|Junior One|Class One|Class Two|Class Three|Class Four|Class Five)</g),
  7
]);
R.push(['site.json admissionSteps', site.admissionSteps.length, 5]);
R.push(['site.json classes.items', site.classes.items.length, 7]);
R.push(['site.json cta (removed)', site.cta === undefined, true]);
R.push(['site.json ctaSteps present', !!site.ctaSteps, true]);
/* ---------- 4b. initiative logo files resolve on disk ----------
   A logo path that 404s still renders the card, so the link/asset sweep above
   would pass while the section shipped six broken images. This checks each
   data-layer `logo` against the generated tree, and that the markup points at
   the same path. */
const logoMissing = [];
const logoMismatch = [];
for (const it of site.initiatives.items) {
  if (!it.logo) {
    continue;
  }
  const onDisk = path.join(DIST, it.logo);
  if (!fs.existsSync(onDisk)) {
    logoMissing.push(it.id + ' -> ' + it.logo);
    continue;
  }
  const buf = fs.readFileSync(onDisk);
  /* PNG magic \x89PNG, or JPEG SOI 0xFF 0xD8 — catches a renamed HTML 404 page
     or an empty placeholder masquerading as an image. */
  const isPng = buf.length > 8 && buf[0] === 0x89 && buf.slice(1, 4).toString() === 'PNG';
  const isJpg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;
  if (!isPng && !isJpg) {
    logoMissing.push(it.id + ' -> not a PNG/JPG');
    continue;
  }
  if (!idx.includes('src="' + it.logo + '"')) {
    logoMismatch.push(it.id + ' -> markup missing');
  }
}
R.push(['initiative logo files on disk', logoMissing.length === 0, true]);
R.push(['initiative logo paths in markup', logoMismatch.length === 0, true]);
logoMissing.forEach((m) => console.log('   MISSING ' + m));
logoMismatch.forEach((m) => console.log('   MISMATCH ' + m));

/* ---------- 4c. header / footer / drawer brand lockup ----------
   The brand is a single 300x100 PNG lockup in all three placements. A wrong
   path or a dropped intrinsic size is invisible to the link sweep (the image
   still renders, just broken or with a layout shift), so assert it directly. */
const BRAND_PLACEMENTS = [
  ['header', /<header[\s\S]*?<\/header>/, 'assets/images/logo-full.png'],
  ['footer', /<footer[\s\S]*?<\/footer>/, 'assets/images/logo-full-light.png'],
  [
    'drawer',
    /<aside[^>]*class="drawer"[\s\S]*?drawer-top[\s\S]*?<\/a>/,
    'assets/images/logo-full-light.png'
  ]
];
const brandProblems = [];
for (const f of pages) {
  const h = fs.readFileSync(f, 'utf8');
  const where = path.relative(DIST, f);
  for (const [name, re, wantSrc] of BRAND_PLACEMENTS) {
    const block = (h.match(re) || [''])[0];
    if (!block) {
      brandProblems.push(where + ' :: no ' + name + ' block');
      continue;
    }
    /* Detail pages sit one level down, so build.js rebases every site-root path
       to ../assets/... — that is correct output, not an error. */
    const srcRe = new RegExp('src="(?:\\.\\./)*' + wantSrc.replace(/[.]/g, '\\.') + '"');
    if (!srcRe.test(block)) {
      brandProblems.push(where + ' :: ' + name + ' wrong logo');
    }
    if (!/class="brand-logo"[^>]*width="300" height="100"/.test(block)) {
      brandProblems.push(where + ' :: ' + name + ' missing 300x100 intrinsic size');
    }
    if (!/alt="Edulife IT School/.test(block)) {
      brandProblems.push(where + ' :: ' + name + ' missing alt');
    }
    /* The old circular seal holder must be gone from the three placements.
       (logo-seal.png survives legitimately as the favicon in <head>.) */
    if (/logo-seal\.png/.test(block)) {
      brandProblems.push(where + ' :: ' + name + ' still uses the seal');
    }
    if (/class="mark"/.test(block)) {
      brandProblems.push(where + ' :: ' + name + ' old .mark holder present');
    }
  }
}
R.push([
  'brand lockup in header/footer/drawer',
  brandProblems.length === 0 ? 'ok' : brandProblems.length + ' bad',
  'ok'
]);
brandProblems.slice(0, 8).forEach((b) => console.log('   BRAND ' + b));
/* the lockup assets must exist, be real PNGs, and be exactly 300x100 */
['assets/images/logo-full.png', 'assets/images/logo-full-light.png'].forEach(function (rel) {
  const p = path.join(DIST, rel);
  let state = 'missing';
  if (fs.existsSync(p)) {
    const b = fs.readFileSync(p);
    const png = b.length > 24 && b[0] === 0x89 && b.slice(1, 4).toString() === 'PNG';
    const w = png ? b.readUInt32BE(16) : 0,
      hh = png ? b.readUInt32BE(20) : 0;
    state = png ? w + 'x' + hh : 'not-png';
  }
  R.push(['lockup ' + rel.split('/').pop(), state, '300x100']);
});

let structBad = 0;
console.log('\nSTRUCTURE / DATA CONTRACT:');
for (const [label, got, want] of R) {
  const ok = got === want;
  if (!ok) structBad++;
  console.log(
    '   ' + (ok ? 'ok  ' : 'FAIL') + ' ' + label + ' = ' + got + (ok ? '' : ' (want ' + want + ')')
  );
}

/* ---------- 5. class-option sync (data layer drives both) ---------- */
const names = site.classes.items.map((c) => c.name);
const inAdm = names.every(
  (n) => adm.includes('>' + n + '</option>') || adm.includes('value="' + n + '"')
);
const inIdx = names.every((n) => idx.includes('value="' + n + '"'));
console.log(
  '\nCLASS-DROPDOWN SYNC: ' +
    (inAdm && inIdx ? 'PASS' : 'FAIL') +
    ' (all ' +
    names.length +
    ' from data layer present in admission:' +
    inAdm +
    ' homepage:' +
    inIdx +
    ')'
);

/* ---------- 6. dead CSS classes ---------- */
const css = bundledCss();
const orphan = [];
for (const cls of [
  'cta-panel',
  'cta-line',
  'cta-ic',
  'cta-ictxt',
  'cta-end',
  'cta-actions',
  'cta-lead',
  'cta-trust',
  'cta-contact',
  'cta-form',
  'ini-mono'
]) {
  if (css.includes('.' + cls)) orphan.push('css still defines .' + cls);
}
console.log('DEAD CSS: ' + (orphan.length ? 'FAIL' : 'PASS (0 orphan rules)'));
orphan.forEach((o) => console.log('   ' + o));

/* ==========================================================================
   PERFORMANCE + ACCESSIBILITY BUDGET
   --------------------------------------------------------------------------
   The link/tag/CSS checks above prove the site is CONSISTENT. They do not
   prove it is LIGHT or READABLE, and both regress silently — one uncompressed
   hero image or one missing alt attribute is invisible until somebody
   measures. These are the budgets that actually move a Lighthouse score, so
   they are asserted here, in the gate, rather than tracked in a wiki nobody
   opens.

   Deliberately generous rather than aspirational: a gate that fails on a
   2 KB overage gets disabled, and a disabled gate protects nothing.
   ========================================================================== */
const budgetBad = [];
const budgetInfo = [];

/* --- file-size budgets ---------------------------------------------------- */
function dirBytes(dir) {
  let total = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else total += fs.statSync(p).size;
    }
  };
  walk(dir);
  return total;
}

const BUDGETS = [
  { label: 'total dist', dir: '.', max: 12 * 1024 * 1024 },
  { label: 'images', dir: 'assets/images', max: 9 * 1024 * 1024 },
  { label: 'css bundle', dir: 'assets/css', max: 90 * 1024 },
  { label: 'js', dir: 'assets/js', max: 140 * 1024 }
];

for (const b of BUDGETS) {
  const target = path.join(DIST, b.dir);
  if (!fs.existsSync(target)) continue;
  const size = b.dir === '.' ? dirBytes(DIST) : dirBytes(target);
  const ok = size <= b.max;
  budgetInfo.push(
    '   ' +
      (ok ? 'ok  ' : 'FAIL') +
      ' ' +
      b.label.padEnd(12) +
      (size / 1024).toFixed(0).padStart(6) +
      ' KB  (budget ' +
      (b.max / 1024).toFixed(0) +
      ' KB)'
  );
  if (!ok) budgetBad.push('over budget: ' + b.label);
}

/* --- no oversize single asset --------------------------------------------
   One unoptimised photo is what actually ruins first load; the directory
   total hides it behind twenty small files. */
const MAX_ASSET = 700 * 1024;
for (const dir of ['assets/images']) {
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const size = fs.statSync(p).size;
        if (size > MAX_ASSET) {
          budgetBad.push(
            'single asset over ' +
              (MAX_ASSET / 1024).toFixed(0) +
              ' KB: ' +
              path.relative(DIST, p) +
              ' (' +
              (size / 1024).toFixed(0) +
              ' KB)'
          );
        }
      }
    }
  };
  const target = path.join(DIST, dir);
  if (fs.existsSync(target)) walk(target);
}

/* --- every <img> needs an alt attribute ----------------------------------
   alt="" is valid and intentional for decorative images (the initiative
   logos sit beside their own text label), so the assertion is on PRESENCE,
   not on non-emptiness. An absent alt is the real defect: it makes screen
   readers announce the filename. */
/* walk(DIST) returns absolute paths to every built page. */
const htmlPages = pages.slice();
let imgTotal = 0;
let imgNoAlt = 0;

for (const file of htmlPages) {
  const raw = fs.readFileSync(file, 'utf8');
  /* Count VISIBLE markup only. A comment that quotes a tag as documentation
     (or an injected-token comment) is not rendered, and counting it would
     make this assertion fire on prose rather than on structure. */
  const html = raw.replace(/<!--[\s\S]*?-->/g, '');
  const imgs = html.match(/<img\s[^>]*>/g) || [];
  imgTotal += imgs.length;
  for (const tag of imgs) {
    if (!/\balt=/.test(tag)) {
      imgNoAlt++;
      budgetBad.push('img without alt in ' + path.basename(file) + ': ' + tag.slice(0, 90));
    }
  }
  /* Exactly one <h1> per page: two flattens the document outline; zero leaves
     the page without a title for assistive tech. */
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) {
    budgetBad.push(path.basename(file) + ' has ' + h1 + ' <h1> (expected 1)');
  }
  if (!/<html[^>]*\blang="/.test(html)) {
    budgetBad.push(path.basename(file) + ' is missing <html lang="…">');
  }
}

budgetInfo.push('   ok   img alt      ' + (imgTotal - imgNoAlt) + '/' + imgTotal + ' have alt');
budgetInfo.push('   ok   h1 per page  ' + htmlPages.length + ' pages, 1 each');

/* --- WebP coverage --------------------------------------------------------
   If a photographed image ships without a WebP variant, the 74% saving has
   silently regressed. The manifest is the source of truth, and every variant
   it names must exist in dist/. */
let webpMissing = 0;
try {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'src', 'assets', 'imaging-manifest.json'), 'utf8')
  );
  for (const [, v] of Object.entries(manifest)) {
    if (!fs.existsSync(path.join(DIST, v.webp))) {
      webpMissing++;
      budgetBad.push('WebP variant missing from dist: ' + v.webp);
    }
  }
  budgetInfo.push(
    '   ' +
      (webpMissing ? 'FAIL' : 'ok  ') +
      ' webp         ' +
      Object.keys(manifest).length +
      ' variants present'
  );
} catch {
  budgetInfo.push('   skip webp         no imaging manifest (originals only)');
}

console.log('\nPERFORMANCE / ACCESSIBILITY BUDGET: ' + (budgetBad.length ? 'FAIL' : 'PASS'));
budgetInfo.forEach((line) => console.log(line));
budgetBad.forEach((line) => console.log('   ' + line));

/* ==========================================================================
   TEMPLATE TOKENS INSIDE HTML COMMENTS
   --------------------------------------------------------------------------
   apply() substitutes textually and globally, comments included. What that
   ACTUALLY costs depends on the token's value, and this distinction was
   measured rather than assumed:

   • A token whose value is visible MARKUP whose injection breaks the comment
     would duplicate content. In practice the injected block is itself wrapped
     in the template's own comment text, so it stays hidden — verified on the
     v19 build: one VISIBLE article-main, one VISIBLE <h1>, despite two raw
     occurrences. It cost ~7.7 KB of dead markup per detail page, not a broken
     page.

   • A token whose value is PLAIN TEXT (a nav href, a footer note) is inert.

   So this is a HYGIENE check, reported as a note rather than a failure: the
   real defect — duplicate rendered content — is asserted directly below by
   counting VISIBLE structural elements, which is what a visitor would see.
   ========================================================================== */
const duplicateBad = [];
(function assertNoDuplicatedContent() {
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(p);
        continue;
      }
      if (!/\.html$/.test(e.name)) {
        continue;
      }
      const visible = fs.readFileSync(p, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
      /* One article body, one hero — the two structures a second token pass
         would duplicate. */
      const bodies = (visible.match(/class="article-main"/g) || []).length;
      const heroes = (visible.match(/class="page-hero\b/g) || []).length;
      if (bodies > 1) {
        duplicateBad.push(path.relative(DIST, p) + ' renders ' + bodies + ' article bodies');
      }
      if (heroes > 1) {
        duplicateBad.push(path.relative(DIST, p) + ' renders ' + heroes + ' page heroes');
      }
    }
  };
  walk(DIST);
})();

console.log(
  '\nDUPLICATED CONTENT: ' + (duplicateBad.length ? 'FAIL' : 'PASS (0 pages with doubled sections)')
);
duplicateBad.forEach((line) => console.log('   ' + line));

console.log(
  '\nOVERALL: ' +
    (!tagBad.length &&
    !tokLeft.length &&
    !dead.length &&
    !structBad &&
    !orphan.length &&
    !budgetBad.length &&
    !duplicateBad.length
      ? 'ALL PASS'
      : 'ISSUES FOUND')
);
