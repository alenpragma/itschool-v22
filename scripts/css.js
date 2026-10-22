#!/usr/bin/env node
/* ==========================================================================
   scripts/css.js — bundles src/assets/css/parts/*.css -> dist/assets/css
   --------------------------------------------------------------------------
   WHY THIS EXISTS
   The stylesheet is authored as numbered partials so a developer can find the
   footer rules without scrolling through 1,200 lines, but the site still ships
   ONE stylesheet (no extra request, no @import waterfall, works on any static
   host). This script is the only thing that knows the concatenation order.

   It is also a correctness check: the ordered list below must name exactly the
   files present in parts/, so a partial can never be silently dropped from the
   bundle or left behind as dead weight.

   RUN
       node scripts/css.js            (or: npm run css)
       node scripts/css.js --check    verify only, no write
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PARTS = path.join(ROOT, 'src', 'assets', 'css', 'parts');
const OUT_DIR = path.join(ROOT, 'dist', 'assets', 'css');
const OUT_FILE = path.join(OUT_DIR, 'styles.css');

/* The cascade order. Numbers are positions, not decoration: 27/28 must remain
   last, because they are the only files that override earlier rules inside a
   media query. See src/assets/css/README.md. */
const CSS_PARTS = [
  '00-header.css',
  '01-tokens.css',
  '02-base.css',
  '03-scroll-progress-bar.css',
  '04-header-navigation.css',
  '05-buttons.css',
  '06-section-rhythm-headings.css',
  '07-hero-home.css',
  '08-marquee.css',
  '09-founder-message.css',
  '10-pillars.css',
  '11-feature-cards.css',
  '12-gallery.css',
  '13-teachers.css',
  '14-notice-board-events.css',
  '15-journal-blog.css',
  '16-admission.css',
  '17-stats.css',
  '18-trust-permits-press.css',
  '19-contact-page.css',
  '20-footer.css',
  '21-reveal-animations.css',
  '22-back-to-top.css',
  '23-mobile-drawer.css',
  '24-404.css',
  '25-closing-admission-section-initiatives.css',
  '26-classes-we-offer.css',
  '27-responsive.css',
  '28-motion-print.css',
  '29-data-states.css'
];

/**
 * The list and the directory must agree, in both directions.
 * A missing entry means a partial silently vanishes from the site; an extra
 * entry means the build references a file nobody wrote.
 */
function verifyParts() {
  const onDisk = fs
    .readdirSync(PARTS)
    .filter((f) => f.endsWith('.css'))
    .sort();
  const listed = CSS_PARTS.slice().sort();
  const missingFromList = onDisk.filter((f) => !CSS_PARTS.includes(f));
  const missingFromDisk = CSS_PARTS.filter((f) => !onDisk.includes(f));
  const problems = [];
  if (missingFromList.length) {
    problems.push(
      'partial(s) present but not in CSS_PARTS (would be dropped from the bundle): ' +
        missingFromList.join(', ')
    );
  }
  if (missingFromDisk.length) {
    problems.push('CSS_PARTS names file(s) that do not exist: ' + missingFromDisk.join(', '));
  }
  if (listed.join('|') !== onDisk.join('|') && !missingFromList.length && !missingFromDisk.length) {
    problems.push('CSS_PARTS and parts/ disagree');
  }
  return problems;
}

function buildCss() {
  const problems = verifyParts();
  if (problems.length) {
    problems.forEach((p) => console.error('  CSS ERROR: ' + p));
    process.exit(1);
  }

  const bundles = CSS_PARTS.map((name) => {
    const body = fs.readFileSync(path.join(PARTS, name), 'utf8');
    return {
      name,
      body,
      /* Self-check: a partial whose selectors all reference tokens that exist
         is fine; an unclosed brace is not, and would corrupt every rule after
         it while still producing a syntactically "plausible" file. */
      braces: (body.match(/{/g) || []).length - (body.match(/}/g) || []).length
    };
  });

  const unbalanced = bundles.filter((b) => b.braces !== 0);
  if (unbalanced.length) {
    unbalanced.forEach((b) =>
      console.error('  CSS ERROR: ' + b.name + ' has ' + b.braces + ' unbalanced brace(s)')
    );
    process.exit(1);
  }

  const css = bundles.map((b) => b.body).join('');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, css, 'utf8');
  return { bytes: Buffer.byteLength(css), parts: bundles.length };
}

/* --check: report whether dist/ matches what parts/ would produce, without
   writing. Used by the quality gate so a stale bundle cannot ship. */
function checkCss() {
  if (!fs.existsSync(OUT_FILE)) {
    return { state: 'missing', detail: 'dist/assets/css/styles.css not built' };
  }
  const problems = verifyParts();
  if (problems.length) {
    return { state: 'stale', detail: problems.join('; ') };
  }
  const expected = CSS_PARTS.map((n) => fs.readFileSync(path.join(PARTS, n), 'utf8')).join('');
  const actual = fs.readFileSync(OUT_FILE, 'utf8');
  if (expected !== actual) {
    return { state: 'stale', detail: 'dist CSS differs from parts/ — rerun npm run build' };
  }
  return { state: 'ok', detail: CSS_PARTS.length + ' partials concatenated' };
}

module.exports = { buildCss, checkCss, CSS_PARTS, verifyParts };

if (require.main === module) {
  if (process.argv.includes('--check')) {
    const r = checkCss();
    console.log('CSS ' + r.state.toUpperCase() + ': ' + r.detail);
    process.exit(r.state === 'ok' ? 0 : 1);
  }
  const r = buildCss();
  console.log(
    '  \u2713 css  ' +
      r.parts +
      ' partials \u2192 assets/css/styles.css (' +
      (r.bytes / 1024).toFixed(1) +
      ' KB)'
  );
}
