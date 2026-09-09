// patch() on text and the CLI on a temporary copy. The real ~/.claude/skills/handoff file is never
// touched by this suite.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BACKUP_SUFFIX, MARKER, patch } from '../scripts/patch-handoff-skill.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const FIXTURE = '---\nname: handoff\ndescription: test copy\n---\n\n# Hand-off\n\n## Closing a Pase\n- last line';
const count = (text, needle) => text.split(needle).length - 1;
const run = (...args) => spawnSync(process.execPath, ['scripts/patch-handoff-skill.mjs', ...args], { cwd: root, encoding: 'utf8' });

test('patch() appends the section once and is idempotent byte for byte', () => {
  const once = patch(FIXTURE);
  assert.ok(once.startsWith(FIXTURE));
  assert.equal(count(once, MARKER), 1);
  assert.ok(once.includes('report-progress'));
  assert.equal(patch(once), once);
  assert.equal(patch(`${FIXTURE}\n`), once, 'a trailing newline is normalised, not doubled');
});

test('CLI: applies, then reports already applied, keeps one heading and never overwrites the backup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oe-handoff-'));
  const target = join(dir, 'SKILL.md');
  writeFileSync(target, FIXTURE);
  const first = run('--target', target);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /^applied/);
  assert.equal(readFileSync(`${target}${BACKUP_SUFFIX}`, 'utf8'), FIXTURE);
  const second = run('--target', target);
  assert.equal(second.status, 0);
  assert.equal(second.stdout, 'already applied\n');
  const patched = readFileSync(target, 'utf8');
  assert.equal(count(patched, `\n${MARKER}\n`), 1);
  assert.ok(patched.includes('report-progress'));
  // Remove the marker, run again: the backup from the first run must survive untouched.
  writeFileSync(target, FIXTURE.replace('# Hand-off', '# Hand-off (edited)'));
  assert.equal(run('--target', target).status, 0);
  assert.equal(readFileSync(`${target}${BACKUP_SUFFIX}`, 'utf8'), FIXTURE);
});

test('CLI: a missing target exits 4 naming the file; bad usage exits 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oe-handoff-'));
  const missing = join(dir, 'SKILL.md');
  const r = run('--target', missing);
  assert.equal(r.status, 4);
  assert.match(r.stderr, /^error: handoff SKILL.md not found/);
  assert.ok(r.stderr.includes(missing));
  assert.ok(!existsSync(missing), 'never created');
  assert.equal(run('--bogus').status, 2);
  assert.equal(run('--target').status, 2);
});
