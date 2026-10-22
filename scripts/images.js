#!/usr/bin/env node
/* ==========================================================================
   scripts/images.js — WebP variants for the photographic assets
   --------------------------------------------------------------------------
   WHY THIS IS A SEPARATE STEP
   The photography dominates the page weight (the largest PNG alone was 1.5 MB,
   for a photo that should never have been a PNG). Converting at build time
   keeps `src/` as the author's originals — nobody has to re-save a JPEG by hand
   — and means the optimisation is reproducible rather than a one-off.

   WHAT IT DOES
     • converts photographic raster images to WebP at a display-appropriate
       width, into src/assets/images/opt/
     • writes src/assets/imaging-manifest.json, which build.js reads to rewrite
       each <img> into a <picture> with a WebP <source> and the original as the
       fallback
     • skips anything that must stay pixel-exact: logos, the seal, initiative
       marks, the press logo (transparency + exact sizing), and small files
       where WebP would not win

   WHY NO AVIF
   Pillow in this environment has no AVIF encoder, and the project has no
   native toolchain. Emitting AVIF would mean a binary dependency for a
   marginal gain over WebP. Documented rather than silently skipped.

   RUN
       node scripts/images.js           (or: npm run images)
       node scripts/images.js --force   re-encode even if the cache is fresh
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const IMAGES = path.join(ROOT, 'src', 'assets', 'images');
const OUT = path.join(IMAGES, 'opt');
const MANIFEST = path.join(ROOT, 'src', 'assets', 'imaging-manifest.json');

/* Skip list. These must stay exactly as authored: they are logos with precise
   intrinsic dimensions and transparency, and the gate asserts their pixel size.
   Converting them would risk both the assertion and the rendering. */
const SKIP = [/^logo-/, /^initiatives\//, /^press-logo\./, /^opt\//];

/* Below this, the conversion is not worth an extra request. */
const MIN_BYTES = 40 * 1024;

/* Never upscale: cap the long edge at what the layout can actually use. */
const MAX_WIDTH = 1200;

const PHOTO_EXT = /\.(png|jpg|jpeg)$/i;

function listImages(dir, prefix) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) {
      if (rel === 'opt') {
        continue;
      }
      out.push(...listImages(path.join(dir, entry.name), rel));
    } else if (PHOTO_EXT.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * The encoder. Pillow is used through a tiny inline script because there is no
 * Node image library in the dependency-free toolchain — and adding a native
 * one (`sharp`) would break the "npm install is not required to build" promise.
 */
const PY = `
import json, sys, os
from PIL import Image
jobs = json.load(open(sys.argv[1]))
results = []
for job in jobs:
    src, dst, max_w = job['src'], job['dst'], job['max']
    im = Image.open(src)
    w, h = im.size
    if w > max_w:
        im = im.resize((max_w, max(1, round(h * max_w / w))), Image.LANCZOS)
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGB')
    im.save(dst, 'WEBP', quality=82, method=6)
    results.append({'src': os.path.basename(src), 'w': im.size[0], 'h': im.size[1],
                    'bytes': os.path.getsize(dst)})
print(json.dumps(results))
`;

function build({ force } = {}) {
  fs.mkdirSync(OUT, { recursive: true });

  const all = listImages(IMAGES, '');
  const candidates = all.filter((rel) => {
    if (SKIP.some((re) => re.test(rel))) {
      return false;
    }
    return fs.statSync(path.join(IMAGES, rel)).size >= MIN_BYTES;
  });

  const jobs = [];
  const planned = [];
  for (const rel of candidates) {
    const src = path.join(IMAGES, rel);
    const dstRel = rel.replace(PHOTO_EXT, '.webp');
    const dst = path.join(OUT, dstRel);
    const srcStat = fs.statSync(src);

    /* Cache: re-encode only when the source is newer than the output. */
    if (!force && fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= srcStat.mtimeMs) {
      continue;
    }
    jobs.push({ src, dst, max: MAX_WIDTH });
    planned.push({ rel, dstRel });
  }

  let results = [];
  if (jobs.length) {
    const jobFile = path.join(require('os').tmpdir(), 'edu-imaging-jobs.json');
    fs.writeFileSync(jobFile, JSON.stringify(jobs), 'utf8');
    const stdout = execFileSync('python3', ['-c', PY, jobFile], { encoding: 'utf8' });
    results = JSON.parse(stdout);
  }

  /* Rebuild the manifest from EVERY variant on disk, not just the ones encoded
     this run, so a cached build still produces a complete manifest. */
  const manifest = {};
  let beforeBytes = 0;
  let afterBytes = 0;

  for (const rel of candidates) {
    const dstRel = rel.replace(PHOTO_EXT, '.webp');
    const dst = path.join(OUT, dstRel);
    if (!fs.existsSync(dst)) {
      continue;
    }
    const original = fs.statSync(path.join(IMAGES, rel)).size;
    const webp = fs.statSync(dst).size;
    /* Only advertise a variant that actually saves bytes — a WebP that is
       bigger than the JPEG would make every visitor slower, not faster. */
    if (webp >= original) {
      fs.rmSync(dst, { force: true });
      continue;
    }
    /* Header-only read for the intrinsic size, so the <img> keeps correct
       width/height and the layout cannot shift. */
    const buf = fs.readFileSync(dst);
    let w = 0;
    let h = 0;
    if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') {
      const chunk = buf.slice(12, 16).toString();
      if (chunk === 'VP8X') {
        w = 1 + buf.readUIntLE(24, 3);
        h = 1 + buf.readUIntLE(27, 3);
      } else if (chunk === 'VP8 ') {
        w = buf.readUInt16LE(26) & 0x3fff;
        h = buf.readUInt16LE(28) & 0x3fff;
      } else if (chunk === 'VP8L') {
        const b = buf.readUInt32LE(21);
        w = (b & 0x3fff) + 1;
        h = ((b >> 14) & 0x3fff) + 1;
      }
    }
    manifest['assets/images/' + rel] = {
      webp: 'assets/images/opt/' + dstRel,
      width: w,
      height: h,
      bytes: webp
    };
    beforeBytes += original;
    afterBytes += webp;
  }

  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    path.join(OUT, '.gitattributes'),
    '# Generated by scripts/images.js — do not edit, do not commit.\n* binary\n',
    'utf8'
  );

  return {
    encoded: results.length,
    variants: Object.keys(manifest).length,
    beforeBytes,
    afterBytes,
    saved: beforeBytes - afterBytes,
    skipped: all.length - candidates.length
  };
}

module.exports = { build, MANIFEST, MIN_BYTES, MAX_WIDTH };

if (require.main === module) {
  const r = build({ force: process.argv.includes('--force') });
  const pct = r.beforeBytes ? ((r.saved / r.beforeBytes) * 100).toFixed(1) : '0.0';
  console.log(
    '  \u2713 images  ' +
      r.variants +
      ' WebP variants (' +
      r.encoded +
      ' encoded this run)  \u2192  ' +
      (r.beforeBytes / 1024).toFixed(0) +
      ' KB \u2192 ' +
      (r.afterBytes / 1024).toFixed(0) +
      ' KB  (-' +
      pct +
      '%)'
  );
}
