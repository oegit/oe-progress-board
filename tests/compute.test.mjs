// computeBoard() from the fixtures with the clock pinned at 2026-09-01.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORTFOLIO_BUCKETS, buildingPct, computeBoard, currentStage, isStale } from '../scripts/compute.mjs';
import { fetchFromDir, readManifest } from '../scripts/fetch.mjs';
import { STAGE_IDS } from '../scripts/validate.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = readManifest(join(root, 'manifest.json'));
const NOW = '2026-09-01';
const board = () => computeBoard({ manifest, results: fetchFromDir(join(root, 'tests/fixtures/units'), manifest), now: NOW });
const unit = (slug) => board().units.find((u) => u.slug === slug);

test('compute.mjs is pure: no filesystem, network, clock or environment access', () => {
  const source = readFileSync(join(root, 'scripts/compute.mjs'), 'utf8');
  for (const forbidden of ['node:fs', 'fetch(', 'Date.now', 'process.env', 'toLocale']) {
    assert.ok(!source.includes(forbidden), `compute.mjs must not contain ${forbidden}`);
  }
});

test('building_pct is 50 for 5/10, 100 for 12/12, null for a null bundle and for total 0', () => {
  assert.equal(unit('agent-ugc').building_pct, 50);
  assert.equal(unit('agent-web-developer').building_pct, 100);
  assert.equal(unit('agent-creative-director').building_pct, null);
  assert.equal(buildingPct({ done: 0, total: 0 }), null);
  assert.equal(buildingPct({ done: 1, total: 3 }), 33);
});

test('current_stage is the first stage not done, or deployed when all seven are', () => {
  assert.equal(unit('agent-ugc').current_stage, 'building');
  assert.equal(unit('agent-creative-director').current_stage, 'planning_audit');
  assert.equal(unit('agent-web-developer').current_stage, 'deployed');
  assert.equal(unit('agent-web-developer').stages_done, 7);
  assert.equal(unit('agent-ugc').stages_done, 3);
  assert.equal(currentStage(STAGE_IDS.map((id) => ({ id, state: 'pending' }))), 'conceptualization');
});

test('stale is strictly more than 14 days: 31 days stale, 4 days fresh, exactly 14 fresh, 15 stale', () => {
  assert.equal(unit('agent-web-developer').stale, true);
  assert.equal(unit('agent-ugc').stale, false);
  assert.equal(unit('agent-creative-director').stale, false); // 2026-08-18 → exactly 14 days
  assert.equal(isStale('2026-08-18', NOW), false);
  assert.equal(isStale('2026-08-17', NOW), true);
  assert.equal(isStale(NOW, NOW), false);
});

test('an invalid report is included with its rule and everything else is still computed', () => {
  const video = unit('agent-video-studio');
  assert.equal(video.status, 'invalid');
  assert.equal(video.rule, 'building_range');
  assert.equal(video.current_stage, null);
  assert.equal(video.name, 'agent-video-studio');
  assert.equal(video.kind, 'agent');
  assert.equal(board().units.filter((u) => u.status === 'ok').length, 3);
});

test('a manifest entry with no report is missing, with the manifest kind and the slug as name', () => {
  const pack = unit('oe-pack-ugc');
  assert.equal(pack.status, 'missing');
  assert.equal(pack.rule, null);
  assert.equal(pack.name, 'oe-pack-ugc');
  assert.equal(pack.kind, 'project');
  assert.equal(pack.building_pct, null);
  assert.equal(board().units.filter((u) => u.status === 'missing').length, 8);
});

test('units keep manifest order and the ok unit carries the passthrough fields verbatim', () => {
  const b = board();
  assert.deepEqual(b.units.map((u) => u.slug), manifest.map((e) => e.slug));
  const ugc = b.units.find((u) => u.slug === 'agent-ugc');
  assert.equal(ugc.name, 'UGC Agent');
  assert.equal(ugc.updated_at, '2026-08-28');
  assert.equal(ugc.public_summary, 'Turns a product brief into ready-to-post creator videos.');
  assert.equal(ugc.features_built.length, 2);
  assert.equal(ugc.stages.length, 7);
});

test('the portfolio has the 9 buckets, sums to the unit count, and data_as_of is the max updated_at', () => {
  const b = board();
  assert.deepEqual(Object.keys(b.portfolio), [...PORTFOLIO_BUCKETS]);
  assert.equal(Object.values(b.portfolio).reduce((a, n) => a + n, 0), manifest.length);
  assert.equal(b.portfolio.building, 1);
  assert.equal(b.portfolio.planning_audit, 1);
  assert.equal(b.portfolio.deployed, 1);
  assert.equal(b.portfolio.no_report, 9);
  assert.equal(b.data_as_of, '2026-08-28');
  assert.equal(b.generated_at, NOW);
});

test('with no ok unit data_as_of is null and every unit is no_report', () => {
  const b = computeBoard({ manifest, results: [], now: NOW, generatedAt: '2026-09-01T10:00:00Z' });
  assert.equal(b.data_as_of, null);
  assert.equal(b.portfolio.no_report, 12);
  assert.equal(b.generated_at, '2026-09-01T10:00:00Z');
});
