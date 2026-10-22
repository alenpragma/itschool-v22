#!/usr/bin/env node
/* ==========================================================================
   tests/renderers.test.js — unit tests for src/assets/js/renderers.js
   --------------------------------------------------------------------------
   Run: npm test          (node --test tests/)

   renderers.js is a UMD module, so it can simply be `require()`d here — the
   same file the browser loads. That is the point of the design: there is no
   build-only branch to test around.

   What is worth testing here is the CONTRACT the renderers promise, not the
   exact HTML string (which would make every styling change a test failure):
     • escaping — the one place user/CMS data reaches the DOM
     • link semantics — external vs internal, target/rel
     • required structure — the class names the CSS and the gate depend on
     • degenerate input — undefined items must not throw
   ========================================================================== */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const R = require(path.join(__dirname, '..', 'src', 'assets', 'js', 'renderers.js'));

/* ------------------------------------------------------------------ escaping */

test('esc: neutralises every HTML-significant character', () => {
  assert.equal(R.esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(R.esc('a & b'), 'a &amp; b');
  assert.equal(R.esc(`it's "quoted"`), 'it&#39;s &quot;quoted&quot;');
});

test('esc: null and undefined render as empty, never as "null"/"undefined"', () => {
  assert.equal(R.esc(null), '');
  assert.equal(R.esc(undefined), '');
  assert.equal(R.esc(0), '0');
  assert.equal(R.esc(false), 'false');
});

test('esc: every renderer escapes attacker-controlled text', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const samples = [
    R.initiativeCard({ name: payload, tagline: payload, icon: 'cap', href: 'about.html' }),
    R.pillarCard({ num: '01', title: payload, text: payload }),
    R.teacherCard({ name: payload, role: payload }),
    R.noticeRow({ slug: 'x', title: payload, excerpt: payload, dateLabel: payload }),
    R.postCard({ slug: 'x', title: payload, excerpt: payload, dateLabel: payload }),
    R.eventRow({ slug: 'x', title: payload, dateLabel: payload })
  ];
  for (const html of samples) {
    assert.ok(!html.includes('<img src=x'), 'raw payload leaked into markup');
    assert.ok(html.includes('&lt;img'), 'payload was not escaped');
  }
});

/* ------------------------------------------------------------------- routing */

test('isExternal semantics via initiativeCard: http(s) opens a new tab', () => {
  const outbound = R.initiativeCard({
    name: 'Edulife Tech',
    tagline: 'Coding',
    icon: 'chip',
    url: 'https://edulife.example'
  });
  assert.match(outbound, /target="_blank"/);
  assert.match(outbound, /rel="noopener noreferrer"/);
  assert.match(outbound, /\(opens in a new tab\)/);
});

test('in-site initiative links stay plain: no target, no new-tab hint', () => {
  const internal = R.initiativeCard({
    name: 'Edulife IT',
    tagline: 'School',
    icon: 'cap',
    url: '',
    href: 'about.html'
  });
  assert.ok(!internal.includes('target="_blank"'), 'internal link must not open a new tab');
  assert.ok(!internal.includes('opens in a new tab'));
  assert.match(internal, /href="about\.html"/);
});

test('initiativeCard prefers url over href when both are present', () => {
  const html = R.initiativeCard({
    name: 'X',
    tagline: 'Y',
    icon: 'star',
    url: 'https://example.org',
    href: 'about.html'
  });
  assert.match(html, /href="https:\/\/example\.org"/);
  assert.ok(!html.includes('href="about.html"'));
});

test('initiativeCard falls back to the SVG icon when logo is absent', () => {
  const svgOnly = R.initiativeCard({ name: 'A', tagline: 'B', icon: 'apple', href: '#' });
  assert.ok(svgOnly.includes('<svg'), 'expected the inline icon fallback');
  assert.ok(!svgOnly.includes('<img'), 'no logo field means no <img>');
});

test('initiativeCard renders a raster logo with intrinsic size when present', () => {
  const withLogo = R.initiativeCard({
    name: 'A',
    tagline: 'B',
    icon: 'apple',
    logo: 'assets/images/initiatives/foodlife.png',
    href: '#'
  });
  assert.match(withLogo, /<img [^>]*width="104" height="104"/);
  assert.match(withLogo, /loading="lazy"/);
  assert.match(withLogo, /decoding="async"/);
  /* alt="" is deliberate: the name is adjacent text, so describing the logo
     would announce it twice. */
  assert.match(withLogo, /alt=""/);
});

test('detailHref switches between file routes and clean routes', () => {
  R.setLinkBase('');
  assert.equal(R.detailHref('blog', 'my-post'), 'blog/my-post.html');
  assert.equal(R.detailHref('notice', 'term-dates'), 'notice/term-dates.html');
  R.setLinkBase('/');
  assert.equal(R.detailHref('blog', 'my-post'), '/blog/my-post');
  R.setLinkBase(''); /* restore for other tests */
});

test('detailHref degrades to the listing page without a slug', () => {
  R.setLinkBase('');
  assert.equal(R.detailHref('blog', ''), 'blog.html');
  assert.equal(R.detailHref('nonsense', 'x'), '#');
});

/* --------------------------------------------------------------- structure */

test('renderList joins items and tolerates an empty/absent array', () => {
  assert.equal(R.renderList([], R.pillarCard), '');
  assert.equal(R.renderList(undefined, R.pillarCard), '');
  const two = R.renderList(
    [
      { num: '01', title: 'a', text: 'x' },
      { num: '02', title: 'b', text: 'y' }
    ],
    R.pillarCard
  );
  assert.equal((two.match(/class="pillar/g) || []).length, 2);
});

test('reveal delay classes cycle d1..d6 so no item lacks an animation slot', () => {
  const html = R.renderList(
    Array.from({ length: 8 }, (_, i) => ({ num: String(i), title: 't', text: 'x' })),
    R.pillarCard
  );
  for (let i = 1; i <= 6; i++) {
    assert.ok(html.includes('d' + i), 'missing delay class d' + i);
  }
  assert.ok(!html.includes(' d7'), 'delay class must wrap at 6');
});

test('featureCard always emits an icon, unknown names falling back to star', () => {
  const known = R.featureCard({ icon: 'book', title: 't', text: 'x' }, 0);
  assert.ok(known.includes('<svg'));
  const unknown = R.featureCard({ icon: 'no-such-icon', title: 't', text: 'x' }, 0);
  assert.ok(unknown.includes('<svg'), 'unknown icon must still render a mark');
});

test('every icon key referenced by the data layer resolves', () => {
  const site = require(path.join(__dirname, '..', 'src', 'data', 'site.json'));
  const keys = Object.keys(R.icons);
  const declared = [
    ...site.features.map((f) => f.icon),
    ...site.initiatives.items.map((i) => i.icon),
    ...site.contact.cards.map((c) => c.icon)
  ].filter(Boolean);
  for (const key of declared) {
    assert.ok(keys.includes(key), 'icon "' + key + '" is not in the icon set');
  }
});

/* ---------------------------------------------------------- degenerate input */

test('renderers do not throw on sparse items (missing optional fields)', () => {
  assert.doesNotThrow(() => R.pillarCard({}, 0));
  assert.doesNotThrow(() => R.teacherCard({}, 0));
  assert.doesNotThrow(() => R.noticeRow({}, 0));
  assert.doesNotThrow(() => R.eventRow({}, 0));
  assert.doesNotThrow(() => R.galleryItem({}, 0));
  assert.doesNotThrow(() => R.postCard({}, 0));
  assert.doesNotThrow(() => R.initiativeCard({}, 0));
  assert.doesNotThrow(() => R.classCard({}, 0));
});

test('calendarHref builds a Google Calendar template link, or # without a date', () => {
  const withDate = R.calendarHref({ date: '2026-10-14', title: 'Science Fair', venue: 'Hall' });
  assert.match(withDate, /^https:\/\/www\.google\.com\/calendar\/render\?action=TEMPLATE/);
  assert.match(withDate, /dates=20261014\/20261015/, 'end date must be the following day');
  assert.equal(R.calendarHref({ title: 'No date' }), '#');
});

test('renderDetail produces a full page body for each content family', () => {
  for (const type of ['blog', 'notice', 'event']) {
    const item = {
      slug: 'sample',
      title: 'Sample',
      date: '2026-10-14',
      dateLabel: '14 Oct 2026',
      body: ['<p>One</p>', '<p>Two</p>'],
      tags: ['a'],
      agenda: [{ time: '10:00', title: 'Start', text: 'x' }]
    };
    const html = R.renderDetail(type, item, { related: [], prev: null, next: null });
    assert.ok(html.length > 200, type + ' detail body looks empty');
    assert.ok(html.includes('article-main'), type + ' missing .article-main');
    assert.ok(!html.includes('undefined'), type + ' rendered the literal "undefined"');
  }
});

test('detailBody renders typed blocks and escapes their text', () => {
  const html = R.detailBody([
    { type: 'lead', text: 'Opening' },
    { type: 'h2', text: 'Heading' },
    { type: 'p', text: 'Body <script>alert(1)</script>' },
    { type: 'list', items: ['one', 'two'] },
    { type: 'quote', text: 'Quoted', cite: 'Someone' },
    { type: 'callout', title: 'Note', text: 'Careful' }
  ]);
  assert.ok(html.includes('class="lead'), 'lead block missing');
  assert.ok(html.includes('<h2'), 'h2 block missing');
  assert.ok(html.includes('<li>one</li>'), 'list items missing');
  assert.ok(html.includes('<cite>Someone</cite>'), 'quote citation missing');
  assert.ok(html.includes('class="callout'), 'callout block missing');
  /* Body text is escaped, never executed: the block format is typed data, not
     raw HTML, so there is no markup to preserve. */
  assert.ok(!/<script/i.test(html), 'a script tag survived into the body');
  assert.ok(html.includes('&lt;script&gt;'), 'body text was not escaped');
});
