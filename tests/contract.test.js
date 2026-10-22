#!/usr/bin/env node
/* ==========================================================================
   tests/contract.test.js — validates src/data/*.json against docs/API_CONTRACT.md
   --------------------------------------------------------------------------
   Run: npm test

   WHY THIS IS THE MOST USEFUL TEST HERE
   The fixtures are the reference implementation of the backend contract. If a
   fixture satisfies these assertions, a backend that returns the same shapes
   will render correctly. So this suite is simultaneously:
     • a guard that an editor cannot break the build by omitting a required field
     • an executable specification for whoever writes the API

   It asserts SHAPE, not content: it never hard-codes a teacher's name, so the
   school can edit the data freely without touching a test.
   ========================================================================== */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'src', 'data');
/* Image existence is checked per reference via assertImageExists(). */

const read = (name) => JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));

/* The closed icon set, read from the renderer itself so this test cannot drift
   out of sync with the implementation. */
const R = require(path.join(ROOT, 'src', 'assets', 'js', 'renderers.js'));
const ICON_KEYS = Object.keys(R.icons);

/* --------------------------------------------------------------- helpers --- */

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const isSlug = (v) => typeof v === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v);
const isISODate = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isImageRef = (v) => isNonEmptyString(v) && /\.(png|jpe?g|webp|avif|svg)$/i.test(v);

/** Every image path referenced by the data must exist on disk. */
function assertImageExists(ref, where) {
  const rel = ref.replace(/^\/+/, '');
  const file = path.join(ROOT, 'src', rel);
  assert.ok(fs.existsSync(file), where + ' -> image missing on disk: ' + ref);
  const size = fs.statSync(file).size;
  assert.ok(size > 1000, where + ' -> image looks like a stub (' + size + ' bytes): ' + ref);
}

/** data/metrics blocks: text is typed, never raw HTML, so nothing should look
    like markup at all. */
function assertSafeBody(blocks, where) {
  assert.ok(Array.isArray(blocks), where + ' -> body must be an array of blocks');
  const KNOWN = ['lead', 'h2', 'h3', 'p', 'list', 'quote', 'callout', 'image'];
  for (const block of blocks) {
    assert.equal(typeof block, 'object', where + ' -> block entries must be objects');
    assert.ok(KNOWN.includes(block.type), where + ' -> unknown block type: ' + block.type);
    if (block.type === 'list') {
      assert.ok(
        Array.isArray(block.items) && block.items.length > 0,
        where + ' -> list block needs items'
      );
      for (const li of block.items) {
        assert.equal(typeof li, 'string', where + ' -> list items must be strings');
      }
    } else if (block.type === 'image') {
      assert.ok(isImageRef(block.image), where + ' -> image block needs an image');
    } else {
      assert.ok(isNonEmptyString(block.text), where + ' -> ' + block.type + ' block needs text');
    }
    /* The renderer escapes text, so no block should ever CONTAIN markup. If one
       does, the author expected it to render as HTML and it will not. */
    const text = String(block.text || '');
    assert.ok(!/<[a-z][^>]*>/i.test(text), where + ' -> raw markup in ' + block.type + ' text');
    assert.ok(!/javascript:/i.test(text), where + ' -> javascript: URL in body');
  }
}

/* -------------------------------------------------------------- the tests --- */

test('site.json: brand, nav and contact are complete', () => {
  const site = read('site.json');
  assert.ok(isNonEmptyString(site.brand.name), 'brand.name required');
  assert.ok(isNonEmptyString(site.brand.description), 'brand.description required');
  assert.ok(Array.isArray(site.nav) && site.nav.length >= 8, 'nav should list every main page');
  for (const item of site.nav) {
    assert.ok(isNonEmptyString(item.key), 'nav item needs a key');
    assert.ok(isNonEmptyString(item.label), 'nav item needs a label');
    assert.ok(isNonEmptyString(item.href), 'nav item needs an href');
  }
  for (const field of ['phone', 'phoneHref', 'email', 'emailHref', 'hours', 'replyTime']) {
    assert.ok(isNonEmptyString(site.contact[field]), 'contact.' + field + ' required');
  }
  assert.match(site.contact.phoneHref, /^tel:/, 'phoneHref must be a tel: URL');
  assert.match(site.contact.emailHref, /^mailto:/, 'emailHref must be a mailto: URL');
});

test('site.json: campuses each carry the fields the footer renders', () => {
  const site = read('site.json');
  assert.equal(site.campuses.length, 2, 'the build reads campuses[0] and [1] by index');
  for (const campus of site.campuses) {
    for (const field of ['name', 'address', 'phone', 'email']) {
      assert.ok(isNonEmptyString(campus[field]), 'campus.' + field + ' required');
    }
  }
});

test('site.json: hero image exists and has alt text', () => {
  const site = read('site.json');
  assert.ok(isImageRef(site.hero.image), 'hero.image must be an image path');
  assert.ok(isNonEmptyString(site.hero.imageAlt), 'hero.imageAlt is required for accessibility');
  assertImageExists(site.hero.image, 'hero.image');
});

test('site.json: stats carry displayable values and a countable number', () => {
  const site = read('site.json');
  assert.ok(site.stats.length >= 3);
  for (const stat of site.stats) {
    /* `value` is a STRING because the counter animation reads its digits
       verbatim ("2015" must not become "2,015"). Assert exactly that. */
    assert.equal(typeof stat.value, 'string', 'stats[].value must be a string');
    assert.match(stat.value, /^\d+$/, 'stats[].value must be digits only: ' + stat.value);
    assert.ok(isNonEmptyString(stat.label));
  }
});

test('site.json: initiatives honour the logo/url/icon contract', () => {
  const site = read('site.json');
  assert.equal(site.initiatives.items.length, 6, 'six initiatives are rendered');
  for (const it of site.initiatives.items) {
    assert.ok(isSlug(it.id), 'initiative id must be a slug: ' + it.id);
    assert.ok(isNonEmptyString(it.name), 'initiative needs a name');
    assert.ok(isNonEmptyString(it.tagline), 'initiative needs a tagline');
    assert.ok(ICON_KEYS.includes(it.icon), 'unknown fallback icon: ' + it.icon);
    assert.ok(['teal', 'amber', 'coral'].includes(it.tone), 'tone must be a known colour');
    assert.ok(isImageRef(it.logo), it.id + ' needs a raster logo');
    assertImageExists(it.logo, 'initiatives.' + it.id);
    /* url is the initiative's own site; href is the in-site fallback. One of
       them must be present or the card links nowhere. */
    assert.ok(
      isNonEmptyString(it.url) || isNonEmptyString(it.href),
      it.id + ' needs a url or an href'
    );
  }
});

test('site.json: the class list drives both dropdowns, so names must be complete', () => {
  const site = read('site.json');
  assert.ok(Array.isArray(site.classes.items) && site.classes.items.length >= 7);
  for (const cls of site.classes.items) {
    assert.ok(isNonEmptyString(cls.name), 'class needs a name');
  }
});

test('site.json: footer columns resolve to real links', () => {
  const site = read('site.json');
  assert.ok(Array.isArray(site.footer.columns) && site.footer.columns.length >= 2);
  for (const col of site.footer.columns) {
    assert.ok(isNonEmptyString(col.title), 'footer column needs a title');
    assert.ok(Array.isArray(col.links) && col.links.length > 0);
    for (const link of col.links) {
      assert.ok(isNonEmptyString(link.label));
      assert.ok(isNonEmptyString(link.href));
    }
  }
});

test('teachers.json: leadership and staff are separate, complete collections', () => {
  const teachers = read('teachers.json');
  assert.ok(Array.isArray(teachers.leadership), 'leadership must be an array');
  assert.ok(Array.isArray(teachers.staff), 'staff must be an array');
  assert.ok(teachers.staff.length >= 6, 'the homepage shows 8 staff cards');
  for (const person of [...teachers.leadership, ...teachers.staff]) {
    assert.ok(isNonEmptyString(person.name), 'teacher needs a name');
    assert.ok(isNonEmptyString(person.role), person.name + ' needs a role');
    if (person.image) {
      assertImageExists(person.image, 'teachers.' + person.name);
    }
  }
});

for (const [file, , required] of [
  ['notices.json', 'notices', ['slug', 'title', 'date']],
  ['events.json', 'events', ['slug', 'title', 'date']],
  ['blog.json', 'blog', ['slug', 'title', 'date']]
]) {
  test(file + ': every item has a unique slug and a parseable date', () => {
    const payload = read(file);
    assert.ok(Array.isArray(payload.items), file + ' must return { items: [...] }');
    assert.ok(payload.items.length > 0, file + ' should not be empty');
    const seen = new Set();
    for (const item of payload.items) {
      for (const field of required) {
        assert.ok(isNonEmptyString(item[field]), file + ' item missing ' + field);
      }
      assert.ok(isSlug(item.slug), file + ' bad slug: ' + item.slug);
      assert.ok(!seen.has(item.slug), file + ' duplicate slug: ' + item.slug);
      seen.add(item.slug);
      assert.ok(isISODate(item.date), file + ' unparseable date on ' + item.slug);
      if (item.image) {
        assertImageExists(item.image, file + '.' + item.slug);
      }
      if (item.body) {
        assertSafeBody(item.body, file + '.' + item.slug);
      }
    }
  });
}

test('gallery.json: every tile points at a real image with alt text', () => {
  const gallery = read('gallery.json');
  assert.ok(Array.isArray(gallery.items) && gallery.items.length >= 5);
  for (const item of gallery.items) {
    assert.ok(isImageRef(item.image), 'gallery item needs an image');
    assert.ok(isNonEmptyString(item.title), 'gallery item needs a title');
    assertImageExists(item.image, 'gallery.' + item.title);
    assert.ok(['', 'big', 'wide'].includes(item.size || ''), 'size must be "", big or wide');
  }
});

test('blog.json: the first item is a complete feature card (it renders large)', () => {
  const blog = read('blog.json');
  const feature = blog.items[0];
  assert.ok(isNonEmptyString(feature.excerpt), 'featured post needs an excerpt');
  assert.ok(isImageRef(feature.image), 'featured post needs an image');
  /* `author` is a display name string; `authorMeta` (if present) is the
     portrait. Keep the assertion on the field the card actually renders. */
  assert.ok(isNonEmptyString(feature.author), 'featured post needs an author name');
  assert.ok(isNonEmptyString(feature.readTime), 'featured post needs a read time');
  assert.ok(Array.isArray(feature.tags) && feature.tags.length > 0, 'featured post needs tags');
});

test('data layer: no fixture references a removed asset', () => {
  const removed = ['u-milestone.jpg', 'logo-lockup.png', 'notice.png'];
  for (const file of fs.readdirSync(DATA).filter((f) => f.endsWith('.json'))) {
    const raw = fs.readFileSync(path.join(DATA, file), 'utf8');
    for (const name of removed) {
      assert.ok(!raw.includes(name), file + ' still references the purged asset ' + name);
    }
  }
});
