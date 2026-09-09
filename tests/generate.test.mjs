// The CLI end to end, in a child process, fixtures → three artifacts in a temp directory.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = () => mkdtempSync(join(tmpdir(), 'oe-gen-'));
const count = (text, needle) => text.split(needle).length - 1;
function run(args, envOverride = {}) {
  const env = { ...process.env, ...envOverride };
  for (const [k, v] of Object.entries(envOverride)) if (v === undefined) delete env[k];
  return spawnSync(process.execPath, ['scripts/generate.mjs', ...args], { cwd: root, encoding: 'utf8', env });
}

test('--from fixtures writes the three artifacts with the expected unit mix', () => {
  const out = join(scratch(), 'gen');
  const r = run(['--from', 'tests/fixtures/units', '--now', '2026-09-01', '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  for (const f of ['index.html', 'board.css', 'data/board.json']) assert.ok(existsSync(join(out, f)), f);
  const board = JSON.parse(readFileSync(join(out, 'data/board.json'), 'utf8'));
  const by = (s) => board.units.filter((u) => u.status === s).length;
  assert.equal(board.units.length, 12);
  assert.deepEqual([by('ok'), by('invalid'), by('missing')], [3, 1, 8]);
  assert.equal(board.data_as_of, '2026-08-28');
  assert.equal(typeof board.generated_at, 'string');
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  assert.equal(count(html, 'No report yet'), 8);
  assert.equal(count(html, 'Invalid report'), 1);
  assert.ok(html.includes('OE Progress Board'));
  assert.equal(readFileSync(join(out, 'board.css'), 'utf8'), readFileSync(join(root, 'site/board.css'), 'utf8'));
});

test('--now defaults to today without failing', () => {
  const out = join(scratch(), 'gen');
  assert.equal(run(['--from', 'tests/fixtures/units', '--out', out]).status, 0);
  assert.ok(existsSync(join(out, 'index.html')));
});

test('usage errors exit 2 and write nothing', () => {
  const dir = scratch();
  const cases = [
    ['--from', 'tests/fixtures/units'],
    ['--out', join(dir, 'a')],
    ['--placeholder', '--from', 'x', '--out', join(dir, 'b')],
    ['--from', 'tests/fixtures/units', '--now', 'yesterday', '--out', join(dir, 'c')],
    ['--from', '--out', join(dir, 'd')],
    ['--bogus'],
    [],
  ];
  for (const args of cases) {
    const r = run(args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, /^error: /);
  }
  assert.deepEqual(readdirSync(dir), []);
});

test('a source error exits 3 having written nothing', () => {
  const dir = scratch();
  const noDir = run(['--from', join(dir, 'nope'), '--out', join(dir, 'out1')]);
  assert.equal(noDir.status, 3);
  assert.match(noDir.stderr, /^error: /);
  const noManifest = run(['--from', 'tests/fixtures/units', '--manifest', join(dir, 'missing.json'), '--out', join(dir, 'out2')]);
  assert.equal(noManifest.status, 3);
  const noToken = run(['--repos-from', 'manifest.json', '--out', join(dir, 'out3')], { PROGRESS_READ_TOKEN: undefined });
  assert.equal(noToken.status, 3);
  assert.match(noToken.stderr, /PROGRESS_READ_TOKEN/);
  const emptyToken = run(['--repos-from', 'manifest.json', '--out', join(dir, 'out4')], { PROGRESS_READ_TOKEN: '' });
  assert.equal(emptyToken.status, 3);
  assert.deepEqual(readdirSync(dir), []);
});

test('--help exits 0 with the usage; --placeholder writes the data-free page', () => {
  const help = run(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^Usage: node scripts\/generate.mjs/);
  const out = join(scratch(), 'placeholder');
  assert.equal(run(['--placeholder', '--out', out]).status, 0);
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  assert.ok(html.includes('OE Progress Board'));
  assert.ok(html.includes('No units are configured yet.'));
  assert.equal(count(html, '<li class="card'), 0);
  assert.ok(existsSync(join(out, 'board.css')));
  assert.equal(JSON.parse(readFileSync(join(out, 'data/board.json'), 'utf8')).units.length, 0);
});
