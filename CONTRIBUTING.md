# Contributing to the Edulife IT School website

Thanks for helping improve the school site. This project is a **plain static
site** — HTML, CSS and vanilla JavaScript assembled by a small Node build
script. There is no framework, no bundler and no runtime dependency, and we
would like to keep it that way.

## Prerequisites

- **Node.js 18 or newer** (see `.nvmrc`; `nvm use` picks the right version)
- No global installs required — the build uses only Node built-ins

## Getting started

```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
npm install          # optional: only for the lint/format dev tools
npm run build        # assemble the site into dist/
npm run dev          # preview at http://localhost:4173/
```

## Project layout

```
src/        all sources — pages, components, layouts, data, assets
            assets/css/parts/  the 30 numbered stylesheet partials
tests/      node:test suites; no dependencies, run with `npm test`
public/     files copied verbatim to the output (robots.txt)
scripts/    build.js · css.js · images.js · check.js · serve.js
dist/       GENERATED output — never edit by hand, never commit
docs/       ARCHITECTURE.md · API_CONTRACT.md · PUSH-TO-GITHUB.md
```

Full detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Adding a backend?
Read [`BACKEND.md`](BACKEND.md).

## The one rule that matters

**Never edit anything in `dist/`.** It is deleted and regenerated on every
build. Edit the source in `src/` (or `public/`) and rebuild.

## Making a change

1. **Content** (text, teachers, notices, events, blog posts, classes) lives in
   `src/data/*.json`. Edit the JSON — no markup changes needed.
2. **Markup** for a page lives in `src/pages/<name>.html`. Shared chrome lives
   in `src/components/` and `src/layouts/base.html`.
3. **Styling** lives in `src/assets/css/parts/` — 30 numbered partials that
   `scripts/css.js` concatenates into one bundle. Design tokens are CSS custom
   properties in `00-preamble.css`; prefer changing a token over hard-coding a
   colour. Add a new partial by creating it **and** adding it to `CSS_PARTS` in
   `scripts/css.js` at its cascade position — an unlisted partial is silently
   dropped. Naming convention: `src/assets/css/README.md`.
4. **Behaviour** lives in `src/assets/js/`. `renderers.js` is _isomorphic_: the
   same file runs in Node (during the build) and in the browser. **Any change to
   it needs a test** — see `tests/renderers.test.js`.

Then:

```bash
npm run verify       # build + quality gate + tests
```

`npm run verify` must pass before you open a pull request. The gate checks tag
balance, unresolved `{{TOKEN}}`s, the internal link graph, the CSS bundle,
orphaned CSS, and the performance/accessibility budgets. `npm test` covers the
renderers, the loader states and the data contract.

## Before opening a pull request

- [ ] `npm run ci` passes — that is lint, format check, build, gate and tests in one command
- [ ] You did **not** commit `dist/` or `node_modules/`
- [ ] New pages were added to the `PAGES` manifest in `scripts/build.js`
- [ ] New CSS partials were added to `CSS_PARTS` in `scripts/css.js`
- [ ] New photographs were processed with `npm run images`
- [ ] New images are real files (check the size — a failed download can leave a
      tiny HTML error page named `*.jpg` that still returns HTTP 200; the gate
      now catches this by reading the file signature)
- [ ] You did not run `npm run format` over the HTML templates — they are
      whitespace-sensitive and intentionally excluded from Prettier

## Commit messages

Short imperative subject line, then a blank line and a body if the change needs
explanation:

```
Add winter concert to the events data

Adds the December concert to src/data/events.json and a matching
gallery entry. No markup changes — the renderers pick it up.
```

## Reporting a problem

Open an issue with the page URL, what you expected, what happened, and your
browser/OS. Screenshots help a lot for layout problems.

## Code style

Formatting is owned by Prettier (`.prettierrc`) and correctness by ESLint
(`eslint.config.js`). Run `npm run format` before committing and let the tools
settle style debates — **except** over `src/pages/`, `src/components/` and
`src/layouts/`, which are in `.prettierignore` because reformatting them changes
rendered output.

## Adding a test

Tests use `node:test` and `node:assert` — no dependency to install. Add a file to
`tests/` and it is picked up by `npm test` automatically. `tests/data-loader.test.js`
contains a small DOM stub if you need to exercise the loader without a browser.
