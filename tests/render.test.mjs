// render() over the fixture board at now = 2026-09-01: structure, the three card variants, escaping.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeBoard } from '../scripts/compute.mjs';
import { fetchFromDir, readManifest } from '../scripts/fetch.mjs';
import { STATE_GLYPHS, STATE_WORDS, escapeHtml, render } from '../scripts/render.mjs';
import { STAGE_IDS } from '../scripts/validate.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = readManifest(join(root, 'manifest.json'));
const NOW = '2026-09-01';
const board = computeBoard({ manifest, results: fetchFromDir(join(root, 'tests/fixtures/units'), manifest), now: NOW });
const html = render(board);
const count = (text, needle) => text.split(needle).length - 1;
const cardOf = (slug, doc = html) => {
  const marker = doc.indexOf(`data-slug="${slug}"`);
  assert.ok(marker > -1, `card ${slug} is rendered`);
  const start = doc.lastIndexOf('<li class="card', marker);
  const end = doc.indexOf('<li class="card', marker);
  return doc.slice(start, end === -1 ? doc.indexOf('</ul>', start) : end);
};

test('render.mjs is pure and carries no colour literal or locale formatting', () => {
  const source = readFileSync(join(root, 'scripts/render.mjs'), 'utf8');
  for (const forbidden of ['node:fs', 'fetch(', 'Date.now', 'process.env', 'toLocale', 'Intl.']) {
    assert.ok(!source.includes(forbidden), `render.mjs must not contain ${forbidden}`);
  }
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(source), 'no #hex in render.mjs');
});

test('document structure: lang, one h1, main#main, skip link, title, stylesheets in order, no script', () => {
  assert.ok(html.startsWith('<!doctype html>\n<html lang="en">'));
  assert.equal(count(html, '<h1'), 1);
  assert.equal(count(html, '<main id="main">'), 1);
  assert.ok(html.includes('<a class="skip" href="#main">'));
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.ok(html.indexOf('oe-ui-kit/v1/base.css') < html.indexOf('href="./board.css"'));
  assert.equal(count(html, '<script'), 0);
  assert.ok(html.includes('<header'));
  assert.ok(html.includes('<footer>'));
});

test('heading levels never skip and the unit list is a ul of li cards', () => {
  const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  levels.reduce((prev, level) => {
    assert.ok(level <= prev + 1, `heading jumps from h${prev} to h${level}`);
    return level;
  }, 0);
  assert.equal(count(html, '<li class="card'), 12);
  assert.ok(html.includes('<ul class="cards">'));
});

test('missing units render No report yet, 8 times, with an all-unknown stepper', () => {
  assert.equal(count(html, 'No report yet'), 8);
  const pack = cardOf('oe-pack-ugc');
  assert.ok(pack.includes('<h3>oe-pack-ugc</h3>'));
  assert.ok(pack.includes('Project'));
  assert.equal(count(pack, 'class="step unknown"'), 7);
  assert.equal(count(pack, STATE_WORDS.unknown), 7);
});

test('the invalid unit renders Invalid report with the rule name, once', () => {
  assert.equal(count(html, 'Invalid report'), 1);
  const video = cardOf('agent-video-studio');
  assert.ok(video.includes('building_range'));
  assert.ok(video.includes('class="card is-invalid"'));
});

test('a stale unit renders Stale beside Updated <date>; a fresh one does not', () => {
  const web = cardOf('agent-web-developer');
  assert.ok(web.includes('Updated 2026-08-01'));
  assert.ok(web.includes('>Stale<'));
  assert.ok(web.includes('is-deployed'));
  const ugc = cardOf('agent-ugc');
  assert.ok(ugc.includes('Updated 2026-08-28'));
  assert.ok(!ugc.includes('Stale'));
  const creative = cardOf('agent-creative-director');
  assert.ok(creative.includes('Updated 2026-08-18'));
  assert.ok(!creative.includes('Stale'));
});

test('every stage state renders a glyph, the stage label and the state word as text', () => {
  const ugc = cardOf('agent-ugc');
  assert.ok(ugc.includes(`>${STATE_GLYPHS.done}<`) && ugc.includes(`>${STATE_WORDS.done}<`));
  assert.ok(ugc.includes(`>${STATE_GLYPHS.in_progress}<`) && ugc.includes(`>${STATE_WORDS.in_progress}<`));
  assert.ok(ugc.includes(`>${STATE_GLYPHS.pending}<`) && ugc.includes(`>${STATE_WORDS.pending}<`));
  assert.ok(ugc.includes('Planning audit') && ugc.includes('Building audit'));
  assert.ok(ugc.includes('Half the task bundle is closed.'));
  const blocked = computeBoard({
    manifest: manifest.slice(6, 7),
    results: [{ slug: 'agent-ugc', state: 'found', raw: JSON.stringify({ ...JSON.parse(fetchFromDir(join(root, 'tests/fixtures/units'), manifest.slice(6, 7))[0].raw), stages: STAGE_IDS.map((id, i) => (i < 3 ? { id, state: 'done', date: '2026-06-14' } : i === 3 ? { id, state: 'blocked', date: '2026-08-20' } : { id, state: 'pending' })) }) }],
    now: NOW,
  });
  const out = render(blocked);
  assert.equal(blocked.units[0].status, 'ok');
  assert.ok(out.includes(`>${STATE_GLYPHS.blocked}<`) && out.includes(`>${STATE_WORDS.blocked}<`));
});

test('the ring label is a percentage or —, never NaN or null; counts are printed as words', () => {
  assert.ok(cardOf('agent-ugc').includes('<p class="ring-label">50%</p>'));
  assert.ok(cardOf('agent-ugc').includes('5 of 10 tasks · 3 of 7 stages'));
  assert.ok(cardOf('agent-web-developer').includes('<p class="ring-label">100%</p>'));
  assert.ok(cardOf('agent-creative-director').includes('<p class="ring-label">—</p>'));
  assert.ok(cardOf('agent-creative-director').includes('No task bundle yet'));
  assert.ok(!/\bNaN\b/.test(html));
  assert.ok(!/>null</.test(html));
  assert.ok(!/\bundefined\b/.test(html));
});

test('the header states data_as_of and the portfolio legend prints every bucket with its count', () => {
  assert.ok(html.includes('Data as of 2026-08-28'));
  assert.ok(html.includes('Building 1'));
  assert.ok(html.includes('Deployed 1'));
  assert.ok(html.includes('No report 9'));
  assert.ok(html.includes('aria-labelledby="portfolio-h"'));
  const svgs = html.match(/<svg[^>]*>/g);
  assert.ok(svgs.length > 0);
  for (const svg of svgs) assert.ok(svg.includes('aria-hidden="true"'), svg);
});

test('every dynamic string is HTML-escaped', () => {
  assert.equal(escapeHtml(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  const hostile = computeBoard({
    manifest: [{ slug: 'x', repo: 'oegit/x', kind: 'agent' }],
    results: [{ slug: 'x', state: 'found', raw: JSON.stringify({
      schema_version: '1', slug: 'x', name: '<script>alert(1)</script>', kind: 'agent',
      public_summary: 'Says "hi" & <b>more</b>.',
      stages: STAGE_IDS.map((id) => ({ id, state: 'pending', note: '<img src=x>' })),
      building: null, features_built: ['<i>x</i>'], features_pending: [], updated_at: '2026-08-28', source_commit: 'abcdef1',
    }) }],
    now: NOW,
  });
  const out = render(hostile);
  assert.equal(hostile.units[0].status, 'ok');
  assert.equal(count(out, '<script'), 0);
  assert.ok(out.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(out.includes('Says &quot;hi&quot; &amp; &lt;b&gt;more&lt;/b&gt;.'));
  assert.ok(!out.includes('<img'));
});

test('an empty board still renders the header, footer and the empty sentence', () => {
  const out = render(computeBoard({ manifest: [], results: [], now: NOW }));
  assert.equal(count(out, '<h1'), 1);
  assert.ok(out.includes('No units are configured yet.'));
  assert.ok(out.includes('Data as of — no unit has reported yet'));
  assert.equal(count(out, '<li class="card'), 0);
});
