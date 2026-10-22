#!/usr/bin/env node
/* ==========================================================================
   scripts/publish.js — copy dist/ over the served root
   --------------------------------------------------------------------------
   OPTIONAL, and only for hosts that serve the repository root rather than a
   dist/ directory (plain GitHub Pages "deploy from branch" is the common one).

   Netlify and Vercel are already configured to publish `dist/` and must NOT use
   this — running it there just duplicates every built file into the repo.

   WHY IT IS A SCRIPT NOW
   The old workflow was `node build.js && cp -r .build/. .` copied by hand.
   That left 80 generated files sitting at the root, tracked by git, next to
   src/ — two copies of the site and only one of them authoritative. This
   script makes the mirror explicit, keeps it out of git, and warns.

   USAGE
       node scripts/publish.js            copy dist/ -> root
       node scripts/publish.js --clean    remove the root mirror again
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

/* Files and folders that make up the mirror at the repo root. Kept explicit so
   --clean cannot touch source, docs or config by accident. */
const MIRROR_ENTRIES = [
  'index.html',
  'about.html',
  'admission.html',
  'teachers.html',
  'notice.html',
  'events.html',
  'gallery.html',
  'blog.html',
  'contact.html',
  '404.html',
  'article.html',
  'sitemap.xml',
  'robots.txt',
  'assets',
  'blog',
  'notice',
  'event',
  'data'
];

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name);
    const d = path.join(to, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function publish() {
  if (!fs.existsSync(DIST)) {
    console.error('  no dist/ — run `npm run build` first');
    process.exit(1);
  }
  for (const e of MIRROR_ENTRIES) {
    const src = path.join(DIST, e);
    const dst = path.join(ROOT, e);
    if (!fs.existsSync(src)) continue;
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.rmSync(dst, { recursive: true, force: true });
      copyDir(src, dst);
    } else {
      fs.copyFileSync(src, dst);
    }
  }
  console.log('  ✓ dist/ mirrored to the repository root (' + MIRROR_ENTRIES.length + ' entries)');
  console.log('    These are BUILD ARTIFACTS and are gitignored. Do not edit them.');
}

function clean() {
  let removed = 0;
  for (const e of MIRROR_ENTRIES) {
    const p = path.join(ROOT, e);
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
      removed++;
    }
  }
  console.log('  ✓ removed ' + removed + ' mirrored entr' + (removed === 1 ? 'y' : 'ies'));
}

if (require.main === module) {
  if (process.argv.includes('--clean')) clean();
  else publish();
}
