// One assertion per validator rule, plus the CLI's exit codes. Assertions name rules and exit codes,
// never the prose beside them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RULES, STAGE_IDS, validate, validateText } from '../scripts/validate.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = (rel) => readFileSync(new URL(`./fixtures/${rel}`, import.meta.url), 'utf8');
const unit = (slug) => JSON.parse(fixture(`units/${slug}/progress.json`));

test('the three valid unit fixtures validate', () => {
  for (const slug of ['agent-ugc', 'agent-web-developer', 'agent-creative-director']) {
    assert.deepEqual(validate(unit(slug)), { ok: true }, slug);
  }
});

test('agent-video-studio is invalid on building_range and nothing earlier', () => {
  const result = validate(unit('agent-video-studio'));
  assert.equal(result.ok, false);
  assert.equal(result.rule, 'building_range');
});

test('every invalid fixture fails its own rule', () => {
  assert.equal(RULES.length, 12);
  for (const rule of RULES) {
    const result = validateText(fixture(`invalid/${rule}.json`));
    assert.equal(result.ok, false, rule);
    assert.equal(result.rule, rule);
    assert.equal(typeof result.message, 'string');
  }
});

test('invalid_json never exposes the runtime parse error', () => {
  const result = validateText('{ not json');
  assert.equal(result.rule, 'invalid_json');
  // The message is this module's own fixed sentence, so a Node upgrade cannot change it.
  assert.equal(result.message, validateText('').message);
  assert.equal(result.message, validateText('[1,').message);
});

test('a non-object document is a required_field failure', () => {
  for (const doc of [null, 7, 'text', [1, 2]]) assert.equal(validate(doc).rule, 'required_field');
});

test('stages_shape rejects a reordering as well as a wrong count', () => {
  const report = unit('agent-ugc');
  [report.stages[0], report.stages[1]] = [report.stages[1], report.stages[0]];
  report.stages[0].date = '2026-06-14';
  assert.equal(validate(report).rule, 'stages_shape');
  assert.equal(STAGE_IDS.length, 7);
});

test('stages_order rejects a done stage after a pending one and two in-progress stages', () => {
  const late = unit('agent-ugc');
  late.stages[4] = { id: 'building_audit', state: 'done', date: '2026-08-01' };
  late.stages[3] = { id: 'building', state: 'pending' };
  assert.equal(validate(late).rule, 'stages_order');
  const twice = unit('agent-ugc');
  twice.stages[4] = { id: 'building_audit', state: 'in_progress' };
  assert.equal(validate(twice).rule, 'stages_order');
});

test('building_range covers negatives, non-integers and done > total; null building is valid', () => {
  for (const building of [{ done: -1, total: 3 }, { done: 1.5, total: 3 }, { done: 4, total: 3 }, { done: '2', total: 3 }]) {
    assert.equal(validate({ ...unit('agent-ugc'), building }).rule, 'building_range');
  }
  assert.deepEqual(validate({ ...unit('agent-ugc'), building: null }), { ok: true });
  assert.deepEqual(validate({ ...unit('agent-ugc'), building: { done: 0, total: 0 } }), { ok: true });
});

test('date_format needs a real calendar date', () => {
  for (const updated_at of ['2026-02-30', '28/08/2026', '2026-8-28', '2026-08-28T00:00:00Z']) {
    assert.equal(validate({ ...unit('agent-ugc'), updated_at }).rule, 'date_format');
  }
});

test('private_info catches every marker anywhere in the document', () => {
  // The markers are assembled at runtime so the repository sweep (tests/repo-rules.test.mjs, step 13)
  // finds zero literal occurrences in committed files: these are test inputs, not leaks.
  const markers = [
    '/Us' + 'ers/someone/Documents',
    'someone' + '@' + 'example.com',
    'gh' + 'p_0123456789',
    'github_' + 'pat_0123456789',
    'github.com/' + 'oegit/agent-ugc',
  ];
  for (const marker of markers) {
    const inFeature = unit('agent-ugc');
    inFeature.features_pending.push(`Reads ${marker}`);
    assert.equal(validate(inFeature).rule, 'private_info', marker);
    const inNote = unit('agent-ugc');
    inNote.stages[3].note = marker;
    assert.equal(validate(inNote).rule, 'private_info', marker);
  }
});

test('CLI exit codes: 0 valid, 1 invalid naming the rule, 2 usage', () => {
  const run = (...args) => spawnSync(process.execPath, ['scripts/validate.mjs', ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(run('tests/fixtures/units/agent-ugc/progress.json').status, 0);
  const invalid = run('tests/fixtures/units/agent-video-studio/progress.json');
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /^rule: building_range /);
  assert.equal(run().status, 2);
  assert.equal(run('tests/fixtures/does-not-exist.json').status, 2);
});
