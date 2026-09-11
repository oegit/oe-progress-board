// Accessibility gate, entirely offline. Half one recomputes WCAG contrast from site/board.css —
// it computes, it does not trust the numbers in the blueprint. Half two checks the rendered
// fixture board's semantic structure.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeBoard } from '../scripts/compute.mjs';
import { fetchFromDir, readManifest } from '../scripts/fetch.mjs';
import { STATE_GLYPHS, STATE_WORDS, render } from '../scripts/render.mjs';
import { check } from '../scripts/smoke.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(join(root, 'site/board.css'), 'utf8');
const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('}'));
const tokens = Object.fromEntries([...rootBlock.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]));

// WCAG 2.x relative luminance and contrast ratio.
function luminance(hex) {
  const channel = (i) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
export function ratio(fg, bg) {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

// Every foreground/background pair board.css actually uses, plus the blueprint's table.
const TEXT_PAIRS = [
  ['fg', 'bg'], ['fg', 'surface'], ['muted', 'bg'], ['muted', 'surface'],
  ['deep', 'bg'], ['deep', 'surface'], ['deep', 'accent-soft'],
  ['accent-text', 'surface'],
  ['good-text', 'good-soft'], ['warn-text', 'warn-soft'], ['bad-text', 'bad-soft'], ['bad-text', 'surface'],
  ['pending-text', 'pending-soft'],
  ['fg', 'good-soft'], ['fg', 'accent-soft'], ['fg', 'bad-soft'], ['fg', 'pending-soft'], ['muted', 'pending-soft'],
];
const BOUNDARY_PAIRS = [
  ['accent', 'surface'], ['accent', 'bg'], ['accent', 'accent-soft'],
  ['control-line', 'surface'], ['control-line', 'bg'],
  ['control-line', 'good-soft'], ['bad-text', 'bad-soft'], ['control-line', 'pending-soft'], ['control-line', 'warn-soft'],
];

test('the :root block defines every token the pairs name, as 6-digit hex', () => {
  for (const pair of [...TEXT_PAIRS, ...BOUNDARY_PAIRS]) {
    for (const name of pair) assert.ok(tokens[name], `token --${name} is defined in :root`);
  }
  assert.equal(ratio('#000000', '#ffffff').toFixed(0), '21');
});

test('every text pair meets 4.5:1', () => {
  const failures = TEXT_PAIRS.filter(([fg, bg]) => ratio(tokens[fg], tokens[bg]) < 4.5)
    .map(([fg, bg]) => `--${fg} on --${bg} = ${ratio(tokens[fg], tokens[bg]).toFixed(2)}`);
  assert.deepEqual(failures, []);
});

test('every focus-ring and perceivable-boundary pair meets 3.0:1', () => {
  const failures = BOUNDARY_PAIRS.filter(([fg, bg]) => ratio(tokens[fg], tokens[bg]) < 3)
    .map(([fg, bg]) => `--${fg} on --${bg} = ${ratio(tokens[fg], tokens[bg]).toFixed(2)}`);
  assert.deepEqual(failures, []);
});

test('--accent-text fails on the page background, so the stylesheet never uses it there', () => {
  assert.ok(ratio(tokens['accent-text'], tokens.bg) < 4.5);
  const body = css.slice(css.indexOf('}') + 1);
  assert.ok(!body.includes('var(--accent-text)'), 'board.css does not use --accent-text outside :root');
  assert.ok(body.includes(':focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }'));
  assert.ok(body.includes('prefers-reduced-motion: reduce'));
});

const manifest = readManifest(join(root, 'manifest.json'));
const html = render(computeBoard({ manifest, results: fetchFromDir(join(root, 'tests/fixtures/units'), manifest), now: '2026-09-01' }));
const count = (text, needle) => text.split(needle).length - 1;

test('semantic structure of the rendered fixture board', () => {
  assert.ok(html.includes('<html lang="en">'));
  assert.equal(count(html, '<h1'), 1);
  assert.equal(count(html, '<main id="main">'), 1);
  assert.ok(html.includes('<a class="skip" href="#main">'));
  assert.match(html, /<title>[^<\s][^<]*<\/title>/);
  const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  levels.reduce((prev, level) => {
    assert.ok(level <= prev + 1, `heading jumps from h${prev} to h${level}`);
    return level;
  }, 0);
  assert.deepEqual(check(html, manifest.length), [], 'the smoke assertions pass offline too');
});

test('every <svg> is aria-hidden or carries a <title>', () => {
  for (const svg of html.matchAll(/<svg[^>]*>[\s\S]*?<\/svg>/g)) {
    assert.ok(svg[0].includes('aria-hidden="true"') || svg[0].includes('<title>'), svg[0].slice(0, 80));
  }
});

test('no stage state is signalled by colour alone: each step carries its glyph and its word', () => {
  const steps = [...html.matchAll(/<li class="step ([a-z_]+)">([\s\S]*?)<\/li>/g)];
  assert.equal(steps.length, manifest.length * 7);
  for (const [, state, inner] of steps) {
    assert.ok(STATE_WORDS[state], `known state ${state}`);
    assert.ok(inner.includes(`>${STATE_WORDS[state]}<`), `state word for ${state}`);
    assert.ok(inner.includes(`>${STATE_GLYPHS[state]}<`), `glyph for ${state}`);
    assert.ok(inner.includes('class="stage"'), 'stage label');
  }
});
