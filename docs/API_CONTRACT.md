# API contract

Everything the front end needs from a backend, in one file. Implement these six
endpoints and the site runs live with **no view-layer changes**.

The static build already renders every page from `src/data/*.json`, so the site
works with no backend at all. The contract below is what you implement when you
want content to be editable without a redeploy.

- **Base URL** — `https://api.example.com/v1` (configure once, see
  [Wiring it up](#wiring-it-up))
- **Transport** — HTTPS, JSON only (`Content-Type: application/json`)
- **Auth** — none for `GET` on the six read endpoints. Writes (not part of this
  contract) should use bearer tokens; the front end never sends credentials.
- **CORS** — must allow the site origin. Every request is a simple `GET` with
  `credentials: 'same-origin'`, so a wildcard `Access-Control-Allow-Origin` is
  fine unless you add cookies later.

---

## 1. Endpoints at a glance

| #   | Method | Path        | Replaces             | Returns                     |
| --- | ------ | ----------- | -------------------- | --------------------------- |
| 1   | `GET`  | `/site`     | `data/site.json`     | one object                  |
| 2   | `GET`  | `/teachers` | `data/teachers.json` | `{ leadership[], staff[] }` |
| 3   | `GET`  | `/notices`  | `data/notices.json`  | `{ items[] }`               |
| 4   | `GET`  | `/events`   | `data/events.json`   | `{ items[] }`               |
| 5   | `GET`  | `/gallery`  | `data/gallery.json`  | `{ items[] }`               |
| 6   | `GET`  | `/blog`     | `data/blog.json`     | `{ items[] }`               |

Two more are optional and only needed if you want server-side detail routing
(§8): `GET /blog/:slug`, `GET /notices/:slug`, `GET /events/:slug`.

**Rule that keeps this simple:** a list endpoint returns the _envelope_
(`{ items: [...] }`), never a bare array. That leaves room to add `total`,
`page` and `nextCursor` later without breaking the current front end.

---

## 2. Conventions

### Field names

`camelCase`, exactly as in `src/data/*.json`. The renderers read these names
directly, so a rename on the server is a front-end change.

### Types

| Type             | Format                                                 | Example                          |
| ---------------- | ------------------------------------------------------ | -------------------------------- |
| `string`         | UTF-8                                                  | `"Notice Board"`                 |
| `stringDate`     | ISO 8601 date                                          | `"2026-10-14"`                   |
| `stringDateTime` | ISO 8601 with offset                                   | `"2026-10-14T09:00:00+06:00"`    |
| `stringHref`     | site-relative (`about.html`) or absolute (`https://…`) | `"about.html"`                   |
| `stringImage`    | site-relative path, or absolute URL                    | `"assets/images/t-rafia.jpg"`    |
| `stringSlug`     | `[a-z0-9-]`, unique within its collection              | `"reading-at-home"`              |
| `number`         | integer, no separator                                  | `1200`                           |
| `boolean`        | `true` / `false`                                       | `true`                           |
| `block[]`        | array of typed body blocks, see §2.1                   | `[{ "type": "p", "text": "…" }]` |

**There is no raw-HTML field anywhere in this contract.** Article bodies are
structured blocks, not sanitised HTML strings. That is deliberate: a backend or
CMS author therefore _cannot_ inject a `<script>` through a body field, because
the renderer escapes every `text` value. The trade-off is that rich text has to
be expressed as blocks — which is also what makes it portable to an app or a
PDF export later.

### 2.1 Body blocks

`body` on a notice, event or blog post is an **array of objects**. Each block
has a `type` from a closed set; unknown types are skipped (never rendered as
raw text, never thrown):

| `type`      | Fields                                      | Renders as                                 |
| ----------- | ------------------------------------------- | ------------------------------------------ |
| `lead`      | `text`                                      | `<p class="lead">` — the opening paragraph |
| `h2` / `h3` | `text`                                      | section heading                            |
| `p`         | `text`                                      | paragraph                                  |
| `list`      | `items: string[]`                           | `<ul>` with one `<li>` per entry           |
| `quote`     | `text`, optional `cite`                     | `<blockquote>` + `<cite>`                  |
| `callout`   | `text`, optional `title`                    | `<aside class="callout">`                  |
| `image`     | `image`, optional `alt`, optional `caption` | `<figure>` + `<figcaption>`                |

```json
"body": [
  { "type": "lead", "text": "Applications for 2027 are now open." },
  { "type": "h2",   "text": "What you need to bring" },
  { "type": "list", "items": ["A completed form", "Birth certificate"] },
  { "type": "quote", "text": "…", "cite": "A parent" },
  { "type": "image", "image": "assets/images/u-lab.jpg", "alt": "Coding lab" }
]
```

Every `text` value is **plain text**. Markup is escaped, so a `<strong>` inside a
body string shows up literally on the page. `tests/contract.test.js` asserts
that no fixture carries markup in a `text` field, which catches the common
mistake of pasting HTML into a block.

### Images

Send a path relative to the site root (`assets/images/…`) or an absolute CDN URL.
The renderers pass it straight to `<img src>`. Serve WebP where you can; the
build ships a `srcset` for the static assets and an absolute URL is used as-is.

### Slugs and dates

- `slug` is required on every item in `notices`, `events` and `blog`. It becomes
  the detail-page filename, so it must be stable — changing it breaks inbound
  links and the sitemap.
- `date` drives ordering and the "upcoming" split on `/events`. Items are
  rendered in the order you return them; **sort on the server** (newest first
  for notices/blog, soonest first for events).

---

## 3. `GET /site`

One object. This is the biggest payload; it is fetched once per page load and
cached by `data-loader.js` for the life of the page.

```json
{
  "brand": { "name": "Edulife IT School", "description": "…" },
  "nav": [ { "key": "home", "label": "Home", "href": "index.html" } ],
  "contact": {
    "phone": "+880 …", "phoneHref": "tel:+880…",
    "email": "…", "emailHref": "mailto:…",
    "hours": "…", "replyTime": "…",
    "cards": [ { "icon": "pin", "title": "…", "text": "…" } ]
  },
  "campuses": [ { "name": "…", "address": "…", "phone": "…", "email": "…" } ],
  "hero": {
    "eyebrow": "…", "titleLead": "…", "titleAccent": "…", "titleTail": "…",
    "lead": "…", "image": "assets/images/…", "imageAlt": "…",
    "tags": ["…"], "floatCards": [ { "style": "…", "label": "…", "value": "…" } ],
    "primaryAction":   { "label": "…", "href": "…" },
    "secondaryAction": { "label": "…", "href": "…" }
  },
  "pillars":  [ { "num": "01", "title": "…", "text": "…" } ],
  "stats":    [ { "value": "1200", "suffix": "+", "label": "…" } ],
  "features": [ { "icon": "book", "title": "…", "text": "…" } ],
  "marquee":  ["…"],
  "admissionSteps": [ { "…" } ],
  "classes":  { "eyebrow": "…", "title": "…", "text": "…", "badge": "…",
                "items": [ { "name": "Nursery", "…": "…" } ] },
  "initiatives": { "eyebrow": "…", "title": "…", "text": "…",
                   "items": [ { "id": "edulife-it", "name": "…", "tagline": "…",
                                "icon": "cap", "logo": "assets/images/initiatives/edulife-it.png",
                                "tone": "teal", "url": "https://…", "href": "" } ] },
  "primaryCta": { "label": "…", "href": "…" },
  "ctaSteps":   { "eyebrow": "…", "title": "…", "text": "…", "formTitle": "…",
                  "submit": "…", "note": "…", "success": "…" },
  "footer": { "note": "…", "strap": "…",
              "columns": [ { "title": "…", "links": [ { "label": "…", "href": "…" } ] } ] },
  "social": [ { "icon": "facebook", "label": "…", "href": "…" } ]
}
```

`icon` values are a closed set — see `renderers.js` `icons` keys
(`book`, `mic`, `monitor`, `check`, `users`, `star`, `pin`, `phone`, `mail`,
`clock`, `calendar`, `tag`, `alert`, `cap`, `pen`, `balloon`, `pages`, `apple`,
`chip`). An unknown key falls back to `star`; it never throws.

`initiatives.items[].url` is the initiative's own website. When present the card
links out with `target="_blank"`, and `href` is ignored. Leave `url` empty to
fall back to the in-site `href`.

---

## 4. `GET /teachers`

```json
{
  "leadership": [{ "name": "…", "role": "…", "image": "…", "bio": "…" }],
  "staff": [{ "name": "…", "role": "…", "image": "…", "room": "…" }]
}
```

Two arrays, not one with a flag — the page renders them as two distinct
sections. Omitting `leadership` renders an empty leadership block rather than
failing (see §7).

---

## 5–6. `GET /notices`, `/events`, `/gallery`, `/blog`

```json
{ "items": [/* … */] }
```

### `notices.items[]`

| Field        | Type                                          | Notes                              |
| ------------ | --------------------------------------------- | ---------------------------------- |
| `slug`       | `stringSlug`                                  | required, unique                   |
| `title`      | `string`                                      | required                           |
| `excerpt`    | `string`                                      | 1–2 sentences, used by cards       |
| `date`       | `stringDate`                                  | drives ordering                    |
| `dateLabel`  | `string`                                      | display form, e.g. `"14 Oct 2026"` |
| `department` | `string`                                      | shown in the detail toolbar        |
| `category`   | `string`                                      | filter chip key                    |
| `priority`   | `"high" \| "normal"`                          | renders a priority chip            |
| `body`       | `block[]`                                     | typed blocks, see §2.1             |
| `attachment` | `{ "label": string, "href": string } \| null` | optional                           |

### `events.items[]`

| Field      | Type                                                      | Notes                          |
| ---------- | --------------------------------------------------------- | ------------------------------ |
| `slug`     | `stringSlug`                                              | required                       |
| `title`    | `string`                                                  | required                       |
| `date`     | `stringDate`                                              | upcoming/past split            |
| `time`     | `string`                                                  | e.g. `"10:00 – 13:00"`         |
| `venue`    | `string`                                                  |                                |
| `excerpt`  | `string`                                                  |                                |
| `image`    | `stringImage`                                             |                                |
| `category` | `string`                                                  |                                |
| `body`     | `block[]`                                                 | typed blocks, see §2.1         |
| `agenda`   | `[ { "time": string, "title": string, "text": string } ]` | optional, renders ordered list |

### `gallery.items[]`

| Field      | Type                    | Notes                     |
| ---------- | ----------------------- | ------------------------- |
| `image`    | `stringImage`           | required                  |
| `title`    | `string`                | required                  |
| `alt`      | `string`                | falls back to `title`     |
| `category` | `string`                | filter + lightbox caption |
| `size`     | `"" \| "big" \| "wide"` | masonry emphasis          |

### `blog.items[]`

| Field       | Type          | Notes                    |
| ----------- | ------------- | ------------------------ |
| `slug`      | `stringSlug`  | required                 |
| `title`     | `string`      | required                 |
| `excerpt`   | `string`      |                          |
| `date`      | `stringDate`  |                          |
| `dateLabel` | `string`      |                          |
| `readTime`  | `string`      | e.g. `"5 min read"`      |
| `author`    | `string`      | display name on the card |
| `image`     | `stringImage` | card + hero image        |
| `tags`      | `string[]`    |                          |
| `body`      | `block[]`     | typed blocks, see §2.1   |

The **first** item in `blog.items` is rendered as the large feature card on the
Journal page, so order matters: return the one you want featured first.

---

## 7. Pagination

Not needed today — the pages render whole collections, and the school's volume
(eight posts, a handful of notices) does not warrant it.

It is designed for, though, so you can add it without a breaking change:

1. List endpoints already return `{ items: [...] }`. Add sibling fields:
   ```json
   { "items": [ … ], "total": 132, "page": 1, "pageSize": 20, "nextCursor": "eyJvZmYiOjIwfQ" }
   ```
2. `data-loader.js` ignores unknown envelope keys, so adding them is
   **backwards compatible** — nothing breaks before you use them.
3. To consume them, read `EDU.lastPage` (set after each load) and pass
   `?page=` / `?cursor=` through `EDU.load(key, { page: 2 })`.

Recommended server defaults: `pageSize=20`, max `100`, cursor-based for
notices/blog (stable ordering under inserts), page-based for gallery.

### Filtering and search

The pages filter client-side on `category` today. For server-side filtering,
accept repeatable `?category=` params and return the same envelope. The front
end sends no filter params unless you add `EDU.config.filters`.

---

## 8. Detail endpoints (optional)

The static build writes a real file per item (`blog/<slug>.html`). If you want
one route served by a backend instead, implement:

```
GET /blog/:slug     -> 200 { item }          (same shape as blog.items[n])
GET /notices/:slug  -> 200 { item }
GET /events/:slug   -> 200 { item }
```

`article.js` already reads `?type=&slug=` on `article.html`, so this is the
route it expects. Set `linkBase` in `renderers.js` to `'/'`
(`R.setLinkBase('/')`) to emit `/blog/<slug>` clean URLs instead of
`.html` filenames.

---

## 9. Error format

Return a **JSON object** for every error, with the HTTP status carrying the
class of failure. Never return an HTML error page — the loader would try to
`JSON.parse` it and report a confusing parse error instead of yours.

```json
{ "error": { "code": "NOT_FOUND", "message": "No notice with that slug.", "field": null } }
```

| Status | `code`              | When                          |
| ------ | ------------------- | ----------------------------- |
| `400`  | `VALIDATION_FAILED` | malformed query (`?page=abc`) |
| `401`  | `UNAUTHORIZED`      | writes / admin only           |
| `403`  | `FORBIDDEN`         |                               |
| `404`  | `NOT_FOUND`         | unknown slug or endpoint      |
| `429`  | `RATE_LIMITED`      | include `Retry-After`         |
| `500`  | `INTERNAL`          | unexpected — log a request id |
| `503`  | `UNAVAILABLE`       | deploy / maintenance          |

`error.message` is developer-facing; it is logged to the console, not shown to
visitors. What the visitor sees is described next.

### How the front end degrades

`data-loader.js` handles three states without any backend cooperation:

| State       | Trigger                                       | What a visitor sees                                                                                                         |
| ----------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **loading** | request in flight                             | the build-time markup stays on screen; containers get `aria-busy="true"`, no spinner, no layout shift                       |
| **empty**   | `items: []`                                   | a calm inline message (`.is-empty`), never a blank gap                                                                      |
| **error**   | non-2xx, network failure, or unparseable JSON | the build-time content is **kept**, container marked `.is-error`, message rendered, `console.error` with the URL and status |

This is deliberate: the page is pre-rendered, so a dead API must never blank a
section. Something is always readable.

---

## 10. Wiring it up

Three edits, all in **`src/assets/js/data-loader.js`** (the single seam):

```js
var config = {
  useStaticJson: false, // 1. read the API, not the fixtures
  apiBase: 'https://api.example.com/v1', // 2. your base URL, no trailing slash
  dataDir: 'data/' //    (unused once the API is on)
};
```

3. Make sure the pages hydrate: `layouts/base.html` passes `{{LIVE}}`, and
   `build.js` sets it to `'false'` for a static deploy. Set it to `'true'` when
   you want the API to own the content — or add `data-live="true"` to `<body>`.

Nothing else changes: `renderers.js` is shared by build and browser, so the
markup an API response produces is identical to the markup the build produces.

### Caching, in the order it happens to a visitor

1. **Build time** — content baked into HTML. Fastest; nothing to fetch.
2. **Page load** — one request per collection, de-duplicated in `cache{}` so two
   sections reading `blog` cost one request.
3. **CDN** — put the six `GET`s behind a short TTL (60 s) with
   `stale-while-revalidate`. Content changes rarely; a minute of staleness is
   invisible to a school audience and removes the backend from the hot path.
4. **Writes** — invalidate your CDN on publish, or accept the TTL.

---

## 11. Contract tests

`tests/contract.test.js` validates every fixture in `src/data/` against the
shapes above — required fields present, slugs unique, dates parseable, `icon`
keys in the closed set, no markup in any body `text`. Run it against a live API
by pointing it at a saved response:

```bash
npm test                              # fixtures
node --test tests/contract.test.js    # same assertions, in CI
```

A green contract test on real API output is the cheapest possible assurance
that the backend matches this document.
