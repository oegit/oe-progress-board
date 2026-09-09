// The backfill hand-off generator, run into a temp directory. Expectations derive from manifest.json.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readManifest } from '../scripts/fetch.mjs';
import { BOARD_SLUG, handoffText, localFolder } from '../scripts/make-handoffs.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = readManifest(join(root, 'manifest.json'));
const others = manifest.filter((e) => e.slug !== BOARD_SLUG);
const LABELS = ['Model:', 'Effort:', 'Mode:', 'Exact folder:', 'Branch:', 'Worktree:'];
const run = (...args) => spawnSync(process.execPath, ['scripts/make-handoffs.mjs', ...args], { cwd: root, encoding: 'utf8' });

test('writes one file per manifest entry except the board, and a second run is byte-identical', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'oe-handoffs-')), 'handoffs');
  assert.equal(run('--out', out).status, 0);
  const names = readdirSync(out).sort();
  assert.deepEqual(names, others.map((e) => `${e.repo.split('/')[1]}.md`).sort());
  assert.equal(names.length, manifest.length - 1);
  const before = Object.fromEntries(names.map((n) => [n, readFileSync(join(out, n), 'utf8')]));
  assert.equal(run('--out', out).status, 0);
  for (const n of names) assert.equal(readFileSync(join(out, n), 'utf8'), before[n], n);
});

test('every hand-off carries the six launcher labels with values, Branch: main, and the git-evidence rule', () => {
  for (const entry of others) {
    const text = handoffText(entry);
    for (const label of LABELS) assert.match(text, new RegExp(`^\\d\\. ${label} \\S`, 'm'), `${entry.slug} ${label}`);
    assert.match(text, /^5\. Branch: main$/m);
    assert.match(text, /^6\. Worktree: on$/m);
    assert.match(text, /^1\. Model: Fable$/m);
    assert.match(text, /^3\. Mode: Plan$/m);
    assert.ok(text.includes('git evidence'));
    assert.ok(text.includes('leave that stage pending'));
    assert.ok(text.includes('report-progress'));
    assert.ok(text.includes('scripts/validate.mjs" progress.json'));
    assert.ok(text.includes('gh workflow run build-board.yml -R oegit/oe-progress-board'));
    assert.ok(text.includes(`slug "${entry.slug}"`));
    assert.ok(text.includes(`4. Exact folder: ${localFolder(entry)}`));
  }
});

test('local folders: agents follow the pattern, the three packs come from the literal map, anything else throws', () => {
  assert.ok(localFolder({ repo: 'oegit/agent-ugc' }).endsWith('/Claude Agents/agent-ugc'));
  assert.ok(localFolder({ repo: 'oegit/oe-pack-ugc' }).endsWith('/open-english/ugc'));
  assert.ok(localFolder({ repo: 'oegit/oe-pack-social-studio' }).endsWith('/open-english/social-media-studio'));
  assert.ok(localFolder({ repo: 'oegit/oe-pack-video-studio' }).endsWith('/open-english/video-studio'));
  assert.throws(() => localFolder({ repo: 'oegit/something-else' }), { name: 'SourceError' });
  for (const entry of others) assert.doesNotThrow(() => localFolder(entry), entry.repo);
});

test('usage errors exit 2', () => {
  assert.equal(run('--bogus').status, 2);
  assert.equal(run('--out').status, 2);
});
