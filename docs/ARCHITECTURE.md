# Architecture — Edulife IT School

How the layers fit together, and why they are arranged this way. Read this before changing
`scripts/build.js`; everything else in the project follows from the contract described here.

---

## 1. The stack, stated plainly

**Plain HTML + CSS + vanilla JavaScript, assembled by a custom Node static-site generator.**

- No React. No Next.js. No Vue. No bundler, no transpiler, no CSS preprocessor.
- No runtime dependency. `scripts/build.js` uses only `fs`, `path` and `crypto`.
- `npm install` is **not** required to build, preview or run the quality gate. It is only
  needed for `npm run lint` and `npm run format`.

The only tool is Node (>= 18, per `package.json > engines`; `.nvmrc` pins the tested version).

---

## 2. The four layers

```
  src/data/*.json          CONTENT        the only layer a non-developer edits
        |
  src/components/*.html    PARTIALS       header, drawer, footer, lightbox
  src/layouts/base.html    SHELL          <head>, slots, script tags
  src/pages/*.html         BODIES         tokens + {{BLOCK_*}} placeholders
  src/assets/css/parts/    STYLES         30 numbered partials
  src/assets/images/       MEDIA          originals + generated opt/*.webp
        |
  scripts/build.js         GENERATOR      reads the above, writes dist/
  scripts/css.js           CSS BUNDLER    parts/ -> one stylesheet
  scripts/images.js        IMAGER         WebP variants + manifest
        |
  dist/                    OUTPUT         the publishable site
```

The build is **one-way and deterministic**: same inputs, same bytes out. Nothing in `dist/`
is written by hand, and nothing in `dist/` feeds back into a later build.

---

## 3. How one page is assembled

For each entry in the `PAGES` array in `scripts/build.js`:

1. **Read the body** — `src/pages/<src>`.
2. **Build the shared tokens** via `baseTokens(page.key)`. This is what makes the header
   show `class="active"` on the right nav item: the page's `key` is matched against
   `site.nav[].key`.
3. **Expand blocks** — every `{{BLOCK_*}}` the body references is called and its HTML
   substituted from the JSON via a renderer.
4. **Substitute tokens** — `{{TOKEN}}` replacement is a plain global string split/join, not
   a regex, so a value containing `$&` or backslashes cannot corrupt the output.
5. **Strip leftovers** — any `{{TOKEN}}` a page did not use is removed and recorded as a
   build warning, so a stray placeholder can never reach the browser.
6. **Wrap in the layout** — `src/layouts/base.html` with `{{CONTENT}}` replaced.
7. **Stamp assets** — every `assets/css/*.css` and `assets/js/*.js` reference gains
   `?v=<stamp>`.
8. **Write** to `dist/<out>`.

### The cache-busting stamp

```js
function assetVersion() {
  const h = crypto.createHash('sha1');
  LOCAL_ASSETS.forEach((f) => h.update(fs.readFileSync(path.join(SRC, f))));
  return h.digest('hex').slice(0, 8);
}
```

One SHA-1 over the concatenated bytes of every local CSS/JS file, truncated to 8 hex chars.
Every page in a build shares the stamp. **Consequence:** editing any CSS or JS file changes
the stamp on every page, which is what makes `immutable` caching on `/assets/*` safe — a
changed file always gets a new URL. Editing only `src/data/*.json` or a page body leaves the
stamp alone, because no asset byte changed.

### Detail pages

`src/pages/detail.html` is **one template for all three families** (blog, notice, event). It
carries a single token, `{{DETAIL_CONTENT}}`, filled by `R.renderDetail(type, item, {...})`.

Because detail pages live one directory down (`blog/<slug>.html`), a root-relative href such
as `assets/css/styles.css` would resolve against `blog/` and 404. Rather than maintain a
second set of templates, each generated detail page is run through `rebase(html, 1)`, which
prefixes relative URLs with the correct number of `../` hops. Absolute URLs (`http:`,
`mailto:`, `tel:`, `data:`), protocol-relative (`//`), in-page anchors (`#`) and
already-relative paths (`./`, `../`) are all left untouched.

This is why the project needs **no `<base href>`** and works equally at a domain root and at
a sub-path such as `https://user.github.io/repo/`.

### Why comments are NOT stripped before substitution

An earlier draft of this document claimed `stripComments()` ran before `apply()`. **It does
not**, and measurement on the v19 build showed the consequences were subtler than expected
to reason about:

- `apply()` substitutes globally, comments included.
- When a comment documents a token whose value is plain text (a nav `href`, a footer note),
  the injected copy stays inside the comment and renders nothing. Harmless, and several
  component headers depend on it to stay self-documenting.
- When a comment documents a token whose value is a large markup block, that block is also
  injected inside the comment — invisible, but present. On the v19 build every one of the 20
  detail pages carried a second copy of its whole article (≈7.7 KB each) because
  `pages/detail.html` spelled out its content token in the header comment.

So the rule is now enforced by measurement rather than by documentation: the gate counts
**visible** structural elements per page and fails if any page renders more than one
`article-main` or one `page-hero`. Counting visible markup is what matters — a raw `<h1>`
count is misleading here, because a comment that quotes the tag (or an injected block)
makes the raw count wrong in both directions.

---

## 4. Why source and output are separate directories

`dist/` is **gitignored and wiped at the start of every build**:

```js
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
```

That clean step is not cosmetic. Without it, renaming or deleting a page leaves the old file
in place, and it keeps resolving on the host forever — a 404 that never fires and a sitemap
that advertises a page nobody maintains.

The split also means a reviewer reads `src/`, and CI validates generated output, instead of
both parties staring at 31 files of generated markup.

---

## 5. The data layer and the REST seam

`src/data/*.json` is the content layer. `build.js` reads it at build time; the browser can
_also_ read it at runtime, which is the migration path to a backend.

| Layer         | File                     | Runtime location          |
| ------------- | ------------------------ | ------------------------- |
| Site / global | `src/data/site.json`     | `dist/data/site.json`     |
| Teachers      | `src/data/teachers.json` | `dist/data/teachers.json` |
| Notices       | `src/data/notices.json`  | `dist/data/notices.json`  |
| Events        | `src/data/events.json`   | `dist/data/events.json`   |
| Gallery       | `src/data/gallery.json`  | `dist/data/gallery.json`  |
| Blog          | `src/data/blog.json`     | `dist/data/blog.json`     |

The build copies `src/data/` into `dist/data/` deliberately. `src/assets/js/data-loader.js`
holds the seam, and it is the **only** file that knows where content comes from:

```js
var config = {
  useStaticJson: true, // flip to false to read an API
  apiBase: '', // e.g. 'https://api.school.example/v1'
  dataDir: 'data/',
  timeout: 10000, // fetch has no default timeout
  endpoints: {/* key -> { json, api } */}
};
```

Three edits — `useStaticJson: false`, a real `apiBase`, and `<body data-live="true">` — move
the site onto a live backend with no change to `renderers.js`, the pages or the CSS. The
request/response contract a backend must satisfy is `docs/API_CONTRACT.md`; the half-day
walkthrough is `BACKEND.md`.

Because `build.js` already wrote real cards into the HTML, the pages are fully readable and
crawlable **before** that switch is thrown — the runtime fetch is an enhancement, never a
prerequisite. The loader is explicit about the three states:

| State   | Trigger            | Visitor sees                                            |
| ------- | ------------------ | ------------------------------------------------------- |
| loading | request in flight  | baked markup + `aria-busy`, dimmed slightly; no spinner |
| empty   | `items: []`        | a calm note, content cleared (the collection is empty)  |
| error   | non-2xx / bad JSON | **last good markup kept** + an alert note               |

The error path is the important one: a dead API must never blank a pre-rendered page.

---

## 6. Renderers: shared by Node and the browser

`src/assets/js/renderers.js` is written as a UMD-style module so the _same_ functions produce
markup in both environments:

- `build.js` does `require('src/assets/js/renderers.js')` and calls `renderList`,
  `renderDetail`, `esc`.
- The browser loads it with a plain `<script>` tag and uses the identical functions for the
  data-loader path.

One implementation means the static output and the runtime output cannot drift apart. Every
value passes through `esc()`, so text from a JSON file can never inject markup.

---

## 7. The quality gate

`scripts/check.js` runs structural assertions over `dist/` (generated output only — scanning
templates would produce hundreds of false dead links):

- HTML tag balance across every generated page
- no unresolved `{{TOKEN}}` anywhere in `dist/`
- the full link graph resolves (no dead internal links or asset paths)
- nav/class-dropdown data stays in sync
- no orphan CSS rules
- logotype and initiative-logo contracts (file exists, and is genuinely PNG/JPEG bytes)
- the CSS bundle matches `css/parts/` exactly (a stale bundle cannot ship)
- no page renders a duplicated article body or hero

**Performance and accessibility budgets** are asserted in the same pass, because both regress
silently. These are the numbers that actually move a Lighthouse score:

| Budget          | Ceiling | Rationale                                            |
| --------------- | ------- | ---------------------------------------------------- |
| total `dist/`   | 12 MB   | catches runaway assets                               |
| images          | 9 MB    | the dominant cost                                    |
| CSS bundle      | 90 KB   | one stylesheet, uncompressed                         |
| JS              | 140 KB  | five classic scripts, uncompressed                   |
| any single file | 700 KB  | one unoptimised photo is what ruins first load       |
| `alt`           | 100%    | presence, not text: `alt=""` is valid for decorative |
| `<h1>`          | 1/page  | two flattens the outline; zero leaves no title       |
| `<html lang>`   | every   | screen-reader pronunciation                          |
| WebP coverage   | 100%    | every manifest variant must exist in `dist/`         |

The GitHub Pages workflow runs the gate **before** deploying, so a build that fails it never
reaches production. `npm run verify` is build + gate + tests locally; `npm run ci` adds lint
and format check, which is exactly what `.github/workflows/ci.yml` runs on every pull request.

---

## 8. Build, preview, deploy

| Command           | Does                                                    |
| ----------------- | ------------------------------------------------------- |
| `npm run build`   | `node scripts/build.js` → rebuilds `dist/`              |
| `npm run check`   | quality gate over `dist/`                               |
| `npm test`        | unit + contract tests via `node --test`                 |
| `npm run verify`  | build, gate, tests                                      |
| `npm run ci`      | lint, format check, build, gate, tests                  |
| `npm run dev`     | serves `dist/` on localhost:4173                        |
| `npm run images`  | regenerates the WebP variants + manifest                |
| `npm run css`     | rebuilds the stylesheet bundle from `css/parts/`        |
| `npm run clean`   | deletes `dist/`                                         |
| `npm run publish` | optional: mirrors `dist/` to the repo root (gitignored) |

`scripts/serve.js` is a zero-dependency preview server: correct MIME types, directory index,
clean-URL resolution and a `404.html` fallback, so local behaviour matches a real host.

All three hosting configs publish **`dist/`**:

- `.github/workflows/deploy-pages.yml` — build → gate → `upload-pages-artifact` of `dist/`
- `netlify.toml` — `publish = "dist"`, `command = "node scripts/build.js"`
- `vercel.json` — `outputDirectory: "dist"`, same build command

---

## 9. Invariants

Breaking any of these breaks the build contract:

1. **Never edit `dist/`** — it is wiped on the next build.
2. **Never add `<base href>`** — it would break the relative `blog/` / `notice/` / `event/`
   routes that `rebase()` produces.
3. **All internal links stay relative** — no leading `/`. This is what makes the site work at
   a sub-path with no configuration.
4. **New page body → register it in `PAGES`** — the array is the page manifest; a file in
   `src/pages/` that is not listed is never built.
5. **New asset → it must be in `LOCAL_ASSETS`** — otherwise it is silently left out of the
   cache-busting hash.
6. **New content list → JSON + renderer + `data-loader.js > VIEWS` + a `BLOCK_*` entry.**
   Adding a blog post, notice or event needs none of that: add one object with a `slug` and a
   `body` to the JSON and the page generates itself.
7. **New CSS partial → add it to `CSS_PARTS` in `scripts/css.js` at its cascade position.**
   A partial that is not listed is silently dropped from the bundle; the gate fails on the
   mismatch, which is the point of keeping the list explicit.
8. **New photograph → run `npm run images`** before building, or it ships as an unoptimised
   original. Logos, the seal and initiative marks stay out of the pipeline on purpose: their
   pixel dimensions and transparency are asserted by the gate.
9. **Never write a markup token with braces inside an HTML comment.** `apply()` substitutes
   globally, comments included, so it injects that block a second time. Name the token in
   prose instead. The gate counts visible `article-main` / `page-hero` per page to catch it.
10. **Never format HTML templates with Prettier.** They are whitespace-sensitive: formatting
    `pages/index.html` and `components/header.html` changed 323 lines of rendered output. The
    templates are in `.prettierignore` for that reason.
