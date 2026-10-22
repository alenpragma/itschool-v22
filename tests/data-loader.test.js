#!/usr/bin/env node
/* ==========================================================================
   tests/data-loader.test.js — unit tests for src/assets/js/data-loader.js
   --------------------------------------------------------------------------
   Run: npm test

   data-loader.js is the backend seam, so its URL resolution, payload
   normalisation and state transitions are the most valuable things in the
   project to pin down. Only the PURE helpers are exercised here; `load()` and
   `hydrate()` need a live fetch and a DOM, and are covered structurally by the
   gate instead (see scripts/check.js).

   The stub element below implements just enough DOM for setState/clearState:
   classList, ownerDocument.createElement, and appendChild/removeChild.
   ========================================================================== */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const L = require(path.join(__dirname, '..', 'src', 'assets', 'js', 'data-loader.js'));

/* --------------------------------------------------------------- test DOM --- */

function makeEl(attrs) {
  const classes = new Set();
  const children = [];
  const el = {
    attrs: attrs || {},
    children,
    _html: '',
    get innerHTML() {
      return el._html;
    },
    /* Assigning innerHTML replaces children, exactly as the real DOM does —
       otherwise a stub would keep stale note nodes and hide a real bug in
       clearState(). */
    set innerHTML(value) {
      el._html = value;
      children.length = 0;
    },
    getAttribute(name) {
      return name in el.attrs ? el.attrs[name] : null;
    },
    setAttribute(name, value) {
      el.attrs[name] = value;
    },
    removeAttribute(name) {
      delete el.attrs[name];
    },
    classList: {
      add: (...names) => names.forEach((c) => classes.add(c)),
      /* The real classList.remove() takes several names, and clearState() relies
         on that to drop all three state classes in one call. */
      remove: (...names) => names.forEach((c) => classes.delete(c)),
      contains: (c) => classes.has(c),
      get value() {
        return [...classes].join(' ');
      }
    },
    appendChild(node) {
      children.push(node);
      node.parentNode = el;
      return node;
    },
    removeChild(node) {
      const i = children.indexOf(node);
      if (i !== -1) children.splice(i, 1);
      return node;
    },
    querySelectorAll(sel) {
      if (sel === '.data-note') return children.filter((c) => c.className === 'data-note');
      return [];
    },
    ownerDocument: {
      createElement(tag) {
        return {
          tagName: tag.toUpperCase(),
          className: '',
          textContent: '',
          attrs: {},
          setAttribute(n, v) {
            this.attrs[n] = v;
          },
          parentNode: null
        };
      }
    }
  };
  return el;
}

/* ------------------------------------------------------------ resolveUrl --- */

test('resolveUrl: static mode joins the site root with the fixture folder', () => {
  const cfg = {
    useStaticJson: true,
    dataDir: 'data/',
    apiBase: '',
    endpoints: { blog: { json: 'blog.json', api: '/blog' } }
  };
  assert.equal(L.resolveUrl('blog', cfg, 'https://site.test/'), 'https://site.test/data/blog.json');
});

test('resolveUrl: a detail page one level down keeps the same target', () => {
  const cfg = {
    useStaticJson: true,
    dataDir: 'data/',
    apiBase: '',
    endpoints: { blog: { json: 'blog.json', api: '/blog' } }
  };
  /* siteRoot() strips its own path, so blog/<slug>.html still resolves to the
     site root rather than to blog/data/blog.json. */
  assert.equal(L.resolveUrl('blog', cfg, 'https://site.test/'), 'https://site.test/data/blog.json');
});

test('resolveUrl: api mode uses apiBase + the mapped route', () => {
  const cfg = {
    useStaticJson: false,
    dataDir: 'data/',
    apiBase: 'https://api.test/v1',
    endpoints: { blog: { json: 'blog.json', api: '/blog' } }
  };
  assert.equal(L.resolveUrl('blog', cfg, ''), 'https://api.test/v1/blog');
});

test('resolveUrl: api mode without a base URL fails loudly, not silently', () => {
  const cfg = {
    useStaticJson: false,
    dataDir: 'data/',
    apiBase: '',
    endpoints: { blog: { json: 'blog.json', api: '/blog' } }
  };
  assert.throws(() => L.resolveUrl('blog', cfg, ''), /apiBase is empty/);
});

test('resolveUrl: an unknown source name throws rather than fetching nonsense', () => {
  assert.throws(() => L.resolveUrl('nope', L.config, ''), /unknown data source/);
});

test('every declared endpoint has both a json file and an api route', () => {
  for (const [key, ep] of Object.entries(L.config.endpoints)) {
    assert.ok(ep.json, key + ' is missing a json fixture name');
    assert.ok(ep.api, key + ' is missing an api route');
    assert.match(ep.api, /^\//, key + ' api route should start with a slash');
  }
});

/* ------------------------------------------------------------------ pick --- */

test('pick: reads the documented envelope', () => {
  assert.deepEqual(L.pick({ items: [1, 2] }, 'items'), [1, 2]);
});

test('pick: reads a nested path', () => {
  assert.deepEqual(L.pick({ classes: { items: ['a'] } }, 'classes.items'), ['a']);
});

test('pick: accepts a bare array payload', () => {
  assert.deepEqual(L.pick([1, 2], undefined), [1, 2]);
});

test('pick: returns null (not []) when the path is missing or not an array', () => {
  assert.equal(L.pick({}, 'items'), null);
  assert.equal(L.pick({ items: 'nope' }, 'items'), null);
  assert.equal(L.pick(null, 'items'), null);
  assert.equal(L.pick({ a: { b: null } }, 'a.b.c'), null);
});

/* ------------------------------------------------------------- limitList --- */

test('limitList: caps a collection', () => {
  assert.deepEqual(L.limitList([1, 2, 3, 4], 2), [1, 2]);
});

test('limitList: 0 / negative / NaN / absent all mean "no cap"', () => {
  const all = [1, 2, 3];
  assert.deepEqual(L.limitList(all, 0), all);
  assert.deepEqual(L.limitList(all, -1), all);
  assert.deepEqual(L.limitList(all, 'abc'), all);
  assert.deepEqual(L.limitList(all, undefined), all);
  assert.deepEqual(L.limitList(all, null), all);
});

test('limitList: parses a string limit, as it arrives from a data attribute', () => {
  assert.deepEqual(L.limitList([1, 2, 3], '2'), [1, 2]);
});

/* ---------------------------------------------------------- viewRenderer --- */

test('viewRenderer: every declared view maps to a real renderer', () => {
  const R = require(path.join(__dirname, '..', 'src', 'assets', 'js', 'renderers.js'));
  const names = Object.keys(L.VIEWS);
  assert.ok(names.length >= 12, 'expected the full view map');
  for (const view of names) {
    assert.equal(
      typeof L.viewRenderer(view, R),
      'function',
      'view "' + view + '" points at a missing renderer "' + L.VIEWS[view] + '"'
    );
  }
});

test('viewRenderer: unknown view or missing namespace yields null, never throws', () => {
  const R = require(path.join(__dirname, '..', 'src', 'assets', 'js', 'renderers.js'));
  assert.equal(L.viewRenderer('no-such-view', R), null);
  assert.equal(L.viewRenderer('blog', null), null);
});

/* ----------------------------------------------------------------- paint --- */

test('paint: renders a list into the container and reports ok', () => {
  const R = require(path.join(__dirname, '..', 'src', 'assets', 'js', 'renderers.js'));
  const el = makeEl({});
  const outcome = L.paint(
    el,
    { items: [{ num: '01', title: 'A', text: 'x' }] },
    { pick: 'items', view: 'pillars' },
    R
  );
  assert.equal(outcome, 'ok');
  assert.match(el.innerHTML, /class="pillar/);
});

test('paint: an empty collection reports "empty" and leaves markup untouched', () => {
  const R = require(path.join(__dirname, '..', 'src', 'assets', 'js', 'renderers.js'));
  const el = makeEl({});
  el.innerHTML = 'BUILD-TIME CONTENT';
  const outcome = L.paint(el, { items: [] }, { pick: 'items', view: 'pillars' }, R);
  assert.equal(outcome, 'empty');
  assert.equal(el.innerHTML, 'BUILD-TIME CONTENT', 'paint must not wipe on empty');
});

test('paint: a malformed payload reports "skipped" and wipes nothing', () => {
  const R = require(path.join(__dirname, '..', 'src', 'assets', 'js', 'renderers.js'));
  const el = makeEl({});
  el.innerHTML = 'BUILD-TIME CONTENT';
  const outcome = L.paint(el, { nope: true }, { pick: 'items', view: 'pillars' }, R);
  assert.equal(outcome, 'skipped');
  assert.equal(el.innerHTML, 'BUILD-TIME CONTENT');
});

test('paint: applies the data-limit cap', () => {
  const R = require(path.join(__dirname, '..', 'src', 'assets', 'js', 'renderers.js'));
  const el = makeEl({});
  const items = Array.from({ length: 5 }, (_, i) => ({ num: String(i), title: 't', text: 'x' }));
  L.paint(el, { items }, { pick: 'items', view: 'pillars', limit: '2' }, R);
  assert.equal((el.innerHTML.match(/class="pillar/g) || []).length, 2);
});

/* ------------------------------------------------------------ state layer --- */

test('setLoading: adds is-loading and aria-busy', () => {
  const el = makeEl({});
  L.setLoading(el);
  assert.ok(el.classList.contains('is-loading'));
  assert.equal(el.getAttribute('aria-busy'), 'true');
});

test('clearState: removes every state class and the note', () => {
  const el = makeEl({});
  L.setLoading(el);
  L.setState(el, 'error', 'boom', false);
  L.clearState(el);
  assert.ok(!el.classList.contains('is-error'));
  assert.ok(!el.classList.contains('is-loading'));
  assert.equal(el.getAttribute('aria-busy'), null);
  assert.equal(el.children.length, 0);
});

test('setState error: keeps existing content — a dead API must not blank a page', () => {
  const el = makeEl({});
  el.innerHTML = 'BUILD-TIME CONTENT';
  L.setState(el, 'error', 'oops', false);
  assert.equal(el.innerHTML, 'BUILD-TIME CONTENT');
  assert.ok(el.classList.contains('is-error'));
  assert.equal(el.children.length, 1, 'one message node expected');
  assert.equal(el.children[0].attrs.role, 'alert');
});

test('setState empty: wipes content, because the collection really is empty', () => {
  const el = makeEl({});
  el.innerHTML = 'BUILD-TIME CONTENT';
  L.setState(el, 'empty', 'Nothing yet', true);
  assert.equal(el.innerHTML, '');
  assert.ok(el.classList.contains('is-empty'));
  assert.equal(el.children[0].attrs.role, 'status');
});

test('setState: repeated calls do not accumulate message nodes', () => {
  const el = makeEl({});
  L.setState(el, 'error', 'a', false);
  L.setState(el, 'error', 'b', false);
  L.setState(el, 'error', 'c', false);
  assert.equal(el.children.length, 1, 'stale notes must be cleared');
});

/* ------------------------------------------------------------ config shape --- */

test('config: ships in static mode with a six-source endpoint map', () => {
  assert.equal(L.config.useStaticJson, true, 'the shipped default must work with no backend');
  assert.deepEqual(Object.keys(L.config.endpoints).sort(), [
    'blog',
    'events',
    'gallery',
    'notices',
    'site',
    'teachers'
  ]);
});

test('reset: clears the cache and the pagination envelope', () => {
  L.reset();
  assert.equal(L.getLastPage(), null);
});
