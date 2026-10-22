# CSS architecture

The stylesheet is authored as **numbered partials in `parts/`** and concatenated
into a single `dist/assets/css/styles.css` by `scripts/css.js`.

```
src/assets/css/
  parts/
    00-header.css          file banner (not a layer)
    01-tokens.css          design tokens — the only place raw values live
    02-base.css            reset, element defaults, .wrap
    03..22 (utilities, header, sections, footer, behaviours)
    23-mobile-drawer.css   the drawer
    24-404.css             the 404 page
    25-closing-admission-section-initiatives.css
    26-classes-we-offer.css
    27-responsive.css      breakpoint overrides, last
    28-motion-print.css    prefers-reduced-motion + print, last
```

## Why one output file

The site ships **no bundler** and loads CSS from a `<link>` in
`layouts/base.html`. Partials are an **authoring** convenience; the browser still
fetches one file, so there is no extra request and no waterfall. `scripts/css.js`
verifies that the concatenation is byte-for-byte what the partials say, and the
quality gate fails if `parts/` is newer than the built output.

## Ordering rules

Order is load-bearing, because every selector here has the same specificity
budget (single class). Two rules keep it predictable:

1. **Tokens first.** Custom properties must be declared before any consumer.
2. **`27-responsive.css` and `28-motion-print.css` are always last.** They are the
   only files that override earlier rules at a media query. Anything added after
   them will lose to them unpredictably.

A new partial goes in **numeric position**, and its number is its cascade
position — `17a-` style insertions are not used; renumber instead.

## Naming convention

The codebase follows a **BEM-flavoured, block-scoped** convention (a "BEM-lite"
that keeps the site's original short class names rather than renaming 400
selectors, which would have been a redesign rather than a refactor):

| Kind     | Pattern                           | Examples                                             |
| -------- | --------------------------------- | ---------------------------------------------------- |
| Block    | `.block`                          | `.hero`, `.pillar`, `.initiative`, `.drawer`         |
| Element  | `.block-element`                  | `.ini-top`, `.ini-logo`, `.ini-body`, `.drawer-link` |
| Modifier | `.block.is-state` or `.block.mod` | `.pillar.is-active`, `.g-item.big`, `.tone-teal`     |
| Utility  | `.u-*` or single-purpose          | `.wrap`, `.sr-only`, `.reveal`                       |
| State    | `.is-*`                           | `.is-empty`, `.is-loading`, `.is-error`              |
| JS hook  | `data-*` only                     | `data-source`, `data-lightbox`, `data-count`         |

Rules:

- **Never style a `data-*` hook.** Attributes are for behaviour; classes are for
  appearance. This is what lets `renderers.js` and `main.js` change without CSS
  churn.
- **Never style by element when a class exists.** `nav a` is a false economy; a
  class survives markup changes.
- **No nesting illusions.** Selectors stay flat (`level-1` only) — one class per
  rule keeps the cascade predictable and makes the orphan-CSS check in
  `scripts/check.js` meaningful.

## Tokens

All colour, radius, shadow, easing and width values come from `01-tokens.css`.
Adding a raw hex anywhere else is a bug the reviewer should reject — it is how a
palette drifts. The gate reads the token block and reports orphan rules, so a
deleted component shows up as dead CSS rather than as silent debt.

## Adding a section

1. Create `parts/2X-name.css` in the right cascade position.
2. Reuse tokens; if you need a new colour, add a token and justify it.
3. Append the filename to `CSS_PARTS` in `scripts/css.js`.
4. Run `npm run verify` — the CSS check fails if the list and the directory
   disagree, so a partial can never be silently dropped from the bundle.
