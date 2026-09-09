// The report-progress skill source and its installer. The installer is exercised against a temp
// directory only: the suite never touches the real ~/.claude files.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { STAGE_IDS, STAGE_STATES, validate } from '../scripts/validate.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourcePath = join(root, 'skills/report-progress/SKILL.md');
const skill = readFileSync(sourcePath, 'utf8');
const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n/);
const body = skill.slice(frontmatter[0].length);
const prose = body.replace(/\s+/g, ' '); // line wrapping is not content
const run = (...args) => spawnSync(process.execPath, ['scripts/install-skill.mjs', ...args], { cwd: root, encoding: 'utf8' });

test('frontmatter carries name: report-progress and a non-empty description', () => {
  assert.ok(frontmatter, 'YAML frontmatter present');
  assert.match(frontmatter[1], /^name: report-progress$/m);
  const description = frontmatter[1].match(/^description: (.+)$/m);
  assert.ok(description && description[1].trim().length > 40);
});

test('the body names all 7 stage ids, the 4 states and the tasks.json counting rule', () => {
  for (const id of STAGE_IDS) assert.ok(body.includes(`\`${id}\``), id);
  for (const state of STAGE_STATES) assert.ok(body.includes(`\`${state}\``), state);
  assert.ok(body.includes('`blueprints/*/tasks.json`'));
  assert.match(body, /`status` is `done`/);
  assert.match(body, /`building\.total` is the number of tasks/);
  assert.ok(body.includes('`building` is `null`'));
});

test('the body states the four write-as-public prohibitions, the validate command and the refresh', () => {
  for (const phrase of ['local path', 'email address', 'private repository', 'token']) assert.ok(prose.includes(phrase), phrase);
  assert.ok(body.includes('node "/Users/felipemarquez/Documents/AI Projects/open-english/oe-progress-board/scripts/validate.mjs" progress.json'));
  assert.ok(body.includes('must exit 0'));
  assert.ok(body.includes('gh workflow run build-board.yml -R oegit/oe-progress-board'));
  assert.ok(body.includes('progress: <stage> <state>'));
});

test('the body carries no vendored validator', () => {
  for (const forbidden of ['function validate', 'invalid_json', 'stages_order', 'building_range', 'private_info', 'export ']) {
    assert.ok(!body.includes(forbidden), `skill must not contain ${forbidden}`);
  }
});

test('the template in the skill is a valid report', () => {
  const block = body.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(block, 'a json template block exists');
  assert.deepEqual(validate(JSON.parse(block[1])), { ok: true });
});

test('installer: install, --check identical, --check different, --check absent, usage, missing source', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oe-skill-'));
  const target = join(dir, 'nested', 'report-progress', 'SKILL.md');
  assert.equal(run('--target', target).status, 0);
  assert.equal(readFileSync(target, 'utf8'), skill);
  assert.equal(run('--check', '--target', target).status, 0);
  writeFileSync(target, `${skill}\nextra line\n`);
  const differs = run('--check', '--target', target);
  assert.equal(differs.status, 1);
  assert.ok(differs.stderr.includes(target));
  const absent = run('--check', '--target', join(dir, 'missing', 'SKILL.md'));
  assert.equal(absent.status, 1);
  assert.ok(absent.stderr.includes('missing'));
  assert.equal(run('--target', target).status, 0, 'reinstall overwrites');
  assert.equal(run('--check', '--target', target).status, 0);
  assert.equal(run('--bogus').status, 2);
  assert.equal(run('--target').status, 2);
  assert.equal(run('--source', join(dir, 'nope.md'), '--target', target).status, 4);
});
