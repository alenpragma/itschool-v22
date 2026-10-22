# Changelog

All notable changes to this project. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions are cut when the **structure or contract** changes, not for content
edits — editing `src/data/*.json` is a content change and needs no release.

---

## [2.1.1] — 2026-10-22

Copy change to the hero admissions badge, plus the wrapping rule the longer
wording needs. No structural or contract change.

### Changed

- **Hero badge wording** is now `Admissions open for 2027 · limited seats`
  (39 chars, up from 22). Still a single value at
  `src/data/site.json → hero.admissionsBadge.text`; no markup was touched.
- **The badge now wraps cleanly below 340px.** The longer label is one line at
  every width down to 340px; under that it needs two lines, and a plain wrap
  left `seats` orphaned alone (measured **211px + 34px** at 320px). Added
  `text-wrap:balance` (**125px + 121px**, two even lines) and `max-width:100%`
  so the pill can never widen the hero column past the viewport. Neither rule
  has any effect at 340px and above.
- Badge geometry, colour, contrast (8.9:1) and the pulsing dot are unchanged.

### Verified

- Quality gate ALL PASS, 58/58 tests, ESLint/Prettier clean.
- Live: **101/101 files HTTP 200**. Measured one line at 1440/768/375px, two
  balanced lines at 320px, **0px** document overflow at every width.

---

## [2.1.0] — 2026-10-22

Visual refinement of two homepage areas. No structural or contract change; the
data layer gains one optional field.

### Changed

- **Initiative cards: the logo marks are much larger.** The mark rendered at
  **26px inside a 52px plate**, which put the actual glyph at roughly 14–20px
  once each source file's own transparent padding was counted — unreadable at a
  glance. The plate is now **104px** (80px on one column) and the image fills
  **80%** of it, so the tray supplies the breathing room instead of the
  artwork's negative space doing all the work. Measured: **26px → 80px, a 3.1×
  increase** (24px → 62px on mobile). The image is still a **downscale** from
  its source, so it cannot blur.
- **The six logo files were re-cut to 384px.** Each was cropped to its alpha
  bounding box and re-centred at a uniform 82% optical fill, so all six now read
  as one family at the same weight instead of six differently-padded icons. The
  glyph colours are unchanged (`#0A5F52`, `#8A5A00`, `#E4572E`).
- Plate radius scaled with the plate (`15px → 28px`; `14px → 22px` mobile) so
  the shape keeps its proportions rather than turning into a hard square.

### Added

- **Hero admissions badge** — "Admissions open · 2027" as an amber pill above
  the eyebrow, linking to the admissions notice. New optional data field
  `hero.admissionsBadge: { text, href }` in `src/data/site.json`; leave `text`
  empty and the badge disappears with no code change.
- `.hero-badge` / `.hb-dot` rules in `07-hero-home.css`, including a
  `prefers-reduced-motion` opt-out for the pulse.

### Hierarchy note

The badge is deliberately **secondary** to the headline and the primary CTA:
12.5px text against a 73.6px `h1` (5.9×), a measured 38px height against the
primary button's 56px, and it is the only filled element in the hero's text
column — noticed without competing. Ink-on-amber contrast is **8.9:1** (AAA).

### Fixed

- `check.js` and `tests/renderers.test.js` assertions moved from the old
  52/26/24 sizes to 104/80/62, so the gate and the tests still prove the mark
  sizing rather than silently passing on stale numbers.

---

## [2.0.0] — 2026-10-21

The "backend-ready" release. No visual change to the site: every page renders
pixel-identically to 1.0.0 apart from the images now being served as WebP.

### Added

- **`docs/API_CONTRACT.md`** — endpoints, request/response shapes, field types,
  pagination, error format, and the degradation behaviour per state. Written so
  a backend developer can implement it without reading the front end.
- **`BACKEND.md`** — a half-day quick start: stand up a stub API from the
  fixtures, flip three values, then migrate handlers to a database one at a
  time.
- **`tests/`** — 58 tests with `node:test` and **zero dependencies**:
  `renderers.test.js` (escaping, link semantics, degenerate input),
  `data-loader.test.js` (URL resolution, payload normalisation, state
  transitions), `contract.test.js` (fixtures validated against the API
  contract).
- **CI on pull requests** (`.github/workflows/ci.yml`, alongside the existing
  deploy workflow) running lint, format check, build, quality gate, tests, and a
  live HTTP 200 sweep of all 31 pages.
- **Image pipeline** (`scripts/images.js`) — WebP variants with a generated
  manifest, wired into the build so each photo becomes a `<picture>` with a
  WebP `<source>` and the original as fallback.
- **Performance and accessibility budgets** in the quality gate: total size,
  image/CSS/JS budgets, a per-asset ceiling, `alt` presence on every `<img>`,
  exactly one `<h1>` per page, `<html lang>`, and WebP variant coverage.
- **CSS partials** — `src/assets/css/parts/`, 30 numbered files, with
  `src/assets/css/README.md` documenting the cascade order and the naming
  convention.
- **Publishing script** (`scripts/publish.js`) — copies `dist/` over the
  served root for hosts that serve from there.
- **`CHANGELOG.md`** (this file).

### Changed

- **The built site is no longer committed at the repository root.** `src/` is
  the only source of truth; `dist/` is generated and gitignored. This removes
  the duplicate copy that made "why is live different from source?" a recurring
  question.
- `data-loader.js` rewritten around a single `config` object
  (`useStaticJson`, `apiBase`, `dataDir`, `timeout`, `endpoints`) with explicit
  loading / empty / error states, request de-duplication, an `AbortController`
  timeout, and a clear "response was not JSON" error. The pure helpers
  (`resolveUrl`, `pick`, `limitList`, `paint`, `viewRenderer`) are exported and
  unit-tested.
- `check.js` reads the **bundled** stylesheet rather than a source file, so a
  CSS assertion can only pass if the rule actually ships.
- Prettier now covers JS, JSON, CSS and Markdown. **HTML templates are
  deliberately excluded**: they are whitespace-sensitive and formatting them
  changed 323 lines of rendered output.

### Fixed

- **`src/pages/detail.html` injected a duplicate article.** Its header comment
  spelled out the `DETAIL_CONTENT` token, and `apply()` substitutes globally —
  comments included — so the full article markup was emitted a second time
  (~7.7 KB of dead weight on each of the 20 detail pages). The duplicate stayed
  inside the comment so nothing visible broke, which is why it went unnoticed.
  The gate now asserts no page renders more than one article body or hero.
- **Three dead assets removed** (1.85 MB): `u-milestone.jpg` was a 29-byte
  `404` HTML page saved with a `.jpg` extension; `logo-lockup.png` and
  `notice.png` were unreferenced.
- **`classroom.png` re-encoded as JPEG** — a photograph stored as PNG at
  1,551 KB. Now 183 KB at the same dimensions.
- **`permit-khagrachari.jpg` downscaled** 1240×1755 → 989×1400: 749 KB → 189 KB.
- **ESLint errors fixed** (3 unused bindings; the UMD `module`/`self` globals
  are now declared). `npm run lint` passes with 0 errors.
- **Detail pages carried two `<h1>` in the raw source** (one visible) and now
  carry one.

### Removed

- `src/assets/css/styles.css` — replaced by `parts/`. The split is
  **byte-identical**: the concatenation of the partials reproduced the original
  70,259-byte file exactly, so there is no visual regression by construction.

---

## [1.0.0] — 2026-10-13

First structured release: multi-page static site built from `src/` by a
dependency-free Node script, with a shared data layer, a quality gate, deploy
configs for GitHub Pages / Netlify / Vercel, and documentation.

Contents at that point: 31 pages (11 main + 20 generated detail pages), six
JSON collections, one isomorphic renderer module, 30+ automated assertions in
the quality gate.
