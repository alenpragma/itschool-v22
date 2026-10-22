# BACKEND.md — quick start for the developer adding an API

Read this first. It is the shortest path from "static site" to "site reading
live data", and it assumes you have not seen this codebase before.

Estimated time: **half a day** for a JSON API serving the existing content;
**two days** to add CRUD and an editor.

---

## 0. The 60-second tour

```
src/
  data/*.json      ← the content. This is what you are replacing with an API.
  pages/*.html     ← one file per page, with {{TOKENS}}
  components/      ← header, drawer, footer, lightbox
  layouts/base.html← the page shell
  assets/js/
    renderers.js   ← turns data into HTML. Shared by build AND browser.
    data-loader.js ← THE SEAM. Only this file knows where data comes from.
scripts/
  build.js         ← pages → dist/
  check.js         ← quality gate + performance/a11y budgets
  css.js           ← concatenates css/parts/ → one stylesheet
  images.js        ← generates WebP variants + manifest
tests/             ← unit + contract tests (node --test, no dependencies)
docs/API_CONTRACT.md ← the contract you are implementing
```

The key idea: **`renderers.js` is isomorphic.** The build calls it to
pre-render, and the browser calls the same functions to re-render from your API.
So you never write markup twice, and what your API returns is guaranteed to
render exactly like the static version.

---

## 1. Run it

```bash
npm install     # dev tooling only (eslint, prettier) — the build needs none
npm run build   # src/ → dist/
npm run dev     # serve dist/ at http://127.0.0.1:4173
npm test        # unit + contract tests
npm run verify  # build + gate + tests, the pre-commit check
```

`node` alone is enough to build. There is no framework, no bundler, no
transpiler — deliberately, so the school can maintain it.

---

## 2. Stand up the API

Implement the six read endpoints in [`docs/API_CONTRACT.md`](API_CONTRACT.md).
The fastest honest way to start is to **serve the fixtures as-is**:

```js
// A 20-line Express/Fastify/Hono stub that satisfies the front end today.
// Deploy it, then replace each handler's body with a real query.
app.get('/v1/site', (_, res) => res.json(require('./src/data/site.json')));
app.get('/v1/teachers', (_, res) => res.json(require('./src/data/teachers.json')));
app.get('/v1/notices', (_, res) => res.json(require('./src/data/notices.json')));
app.get('/v1/events', (_, res) => res.json(require('./src/data/events.json')));
app.get('/v1/gallery', (_, res) => res.json(require('./src/data/gallery.json')));
app.get('/v1/blog', (_, res) => res.json(require('./src/data/blog.json')));
```

You now have a contract-compliant API. Point the front end at it (next step)
and the site runs entirely from HTTP. Then migrate handlers to a database one
at a time — the front end will not notice, because the shapes do not change.

**Two rules that save you a day:**

1. Return the envelope `{ "items": [...] }`, never a bare array. The loader
   accepts both, but the envelope leaves room for `total`/`page` later.
2. `body` is an array of **typed blocks**, not HTML. See API_CONTRACT §2.1. Do
   not store sanitised HTML and hope — the renderer escapes every text value,
   so HTML would appear literally on the page.

---

## 3. Point the front end at it

Three edits in `src/assets/js/data-loader.js`:

```js
var config = {
  useStaticJson: false,                      // was true
  apiBase: 'https://api.your-school.example/v1',
  dataDir: 'data/',                          // unused once the API is on
  ...
};
```

Then tell the build the pages should hydrate at runtime. In `scripts/build.js`
the layout is handed `LIVE`, which becomes `<body data-live="…">`:

```js
LIVE: 'true'; // was 'false'
```

Nothing else changes. `renderers.js`, the pages and the CSS are untouched.

### Why `data-live` exists

The site is **pre-rendered**. With `data-live="false"` the browser keeps the
baked markup and never re-fetches — which is what makes the shipped static
build fast and resilient. With `"true"`, each `[data-source]` container is
hydrated from your API and the baked markup becomes the fallback.

You can flip it per environment without a code change:

```html
<body data-live="true">
  <!-- staging: API owns the content -->
  <body data-live="false">
    <!-- production: baked, CDN-cached, no API in the hot path -->
  </body>
</body>
```

Running production with `false` and refreshing the build on publish is a
**legitimate deployment** — not a workaround. It gives you the API's editing
model with a static site's performance.

---

## 4. What your API gets for free

The loader already handles the parts people forget:

| Concern            | Where                  | Behaviour                                                                                                                          |
| ------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Loading**        | `setLoading()`         | `aria-busy="true"` + a subtle dim. No spinner, because the content is already on screen.                                           |
| **Empty**          | `setState(el,'empty')` | A calm note; content is cleared (the collection really is empty). Override the copy per section with `data-empty="…"`.             |
| **Error**          | `setState(el,'error')` | The **last good markup stays**. A dead API never blanks a page. `console.error` names the URL and status.                          |
| **Timeout**        | `config.timeout`       | 10 s default, via `AbortController`. `fetch` has no timeout of its own — without this a hung API leaves a section loading forever. |
| **Non-JSON**       | in `load()`            | Reports "response was not JSON" instead of a confusing `Unexpected token <`. Catches the classic HTML-error-page-instead-of-JSON.  |
| **De-duplication** | `cache{}`              | Two sections reading `blog` cost one request.                                                                                      |
| **Path depth**     | `siteRoot()`           | Fixture URLs resolve from the site root, so `blog/<slug>.html` works as well as `index.html`.                                      |
| **Pagination**     | `lastPage`             | If you send `total`/`page`/`nextCursor`, they are captured. Nothing breaks if you don't.                                           |

---

## 5. Where things will bite you

- **CORS.** A wildcard `Access-Control-Allow-Origin` is fine for these `GET`s.
  The moment you add cookies you need an explicit origin and
  `credentials: 'include'` in `load()`.
- **CDN caching.** Put the six `GET`s behind a 60 s TTL with
  `stale-while-revalidate`. Invalidate on publish, or accept a minute.
- **Slugs.** They are filenames in the static build. Change one and you break
  inbound links and the sitemap — treat them as immutable, add a `movedFrom`
  redirect if you must.
- **Images.** The build ships WebP variants under `assets/images/opt/`. If your
  API returns absolute CDN URLs, they bypass that optimisation — serve WebP
  yourself, or point at the same paths.
- **Dates.** `date` is ISO 8601 and drives ordering. Sort server-side;
  `renderers.js` does not re-sort.

---

## 6. Tests you should extend

`tests/contract.test.js` validates the fixtures against the contract — required
fields, unique slugs, parseable dates, closed icon set, no markup in body text.
**Point it at your API** and you have an executable check that your backend has
not drifted:

```js
// tests/api-live.test.js — opt-in against a running API
const BASE = process.env.API_BASE;
test('live /blog matches the contract', async () => {
  const res = await fetch(BASE + '/blog');
  assert.equal(res.status, 200);
  const { items } = await res.json();
  assert.ok(items.length > 0);
  // then the same assertions as contract.test.js
});
```

Run it in CI against staging, not production.

---

## 7. Checklist before you ship

- [ ] Six endpoints live, returning the documented shapes
- [ ] `body` is typed blocks, not HTML
- [ ] `useStaticJson: false` and `apiBase` set
- [ ] `LIVE: 'true'` for the environment that should be dynamic
- [ ] Error format is JSON (`{ error: { code, message } }`), never an HTML page
- [ ] CORS allows the site origin
- [ ] Timeout + CDN TTL agreed
- [ ] `npm run verify` passes
- [ ] `tests/contract.test.js` passes against a saved API response
- [ ] Slugs treated as immutable
