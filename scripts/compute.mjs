// OE Progress Board — the board's arithmetic, in one pure function.
//
// computeBoard({ manifest, results, now }) → BoardView. No filesystem, network, clock or environment
// access: `now` is an injected YYYY-MM-DD string, which is what makes the 14-day staleness
// boundary testable and the suite identical on any day.

import { STAGE_IDS, validateText } from './validate.mjs';

export const PORTFOLIO_BUCKETS = Object.freeze([...STAGE_IDS, 'deployed', 'no_report']);
const DAY_MS = 86_400_000;
const STALE_AFTER_DAYS = 14;

// Strictly more than 14 days old is stale; exactly 14 days is fresh.
export function isStale(updatedAt, now) {
  return (Date.parse(now) - Date.parse(updatedAt)) / DAY_MS > STALE_AFTER_DAYS;
}

// Math.round(done / total * 100); null when there is no bundle or total is 0.
export function buildingPct(building) {
  if (building === null || building === undefined || building.total === 0) return null;
  return Math.round((building.done / building.total) * 100);
}

// First stage that is not done, or `deployed` when all seven are.
export function currentStage(stages) {
  const first = stages.find((stage) => stage.state !== 'done');
  return first ? first.id : 'deployed';
}

function unitView(entry, result, now) {
  const view = {
    slug: entry.slug,
    name: entry.slug,
    kind: entry.kind,
    status: 'missing',
    rule: null,
    stages_done: 0,
    current_stage: null,
    building_pct: null,
    stale: false,
    public_summary: null,
    stages: null,
    building: null,
    features_built: [],
    features_pending: [],
    updated_at: null,
  };
  if (!result || result.state !== 'found') return view;
  const checked = validateText(result.raw);
  if (!checked.ok) return { ...view, status: 'invalid', rule: checked.rule };
  const report = JSON.parse(result.raw);
  return {
    ...view,
    name: report.name,
    kind: report.kind,
    status: 'ok',
    stages_done: report.stages.filter((stage) => stage.state === 'done').length,
    current_stage: currentStage(report.stages),
    building_pct: buildingPct(report.building),
    stale: isStale(report.updated_at, now),
    public_summary: report.public_summary,
    stages: report.stages,
    building: report.building,
    features_built: report.features_built,
    features_pending: report.features_pending,
    updated_at: report.updated_at,
  };
}

export function computeBoard({ manifest, results, now, generatedAt = now }) {
  const units = manifest.map((entry) => unitView(entry, results.find((r) => r.slug === entry.slug), now));
  const portfolio = Object.fromEntries(PORTFOLIO_BUCKETS.map((bucket) => [bucket, 0]));
  for (const unit of units) portfolio[unit.status === 'ok' ? unit.current_stage : 'no_report'] += 1;
  const dates = units.filter((unit) => unit.status === 'ok').map((unit) => unit.updated_at);
  const data_as_of = dates.length ? dates.reduce((max, d) => (d > max ? d : max)) : null;
  return { generated_at: generatedAt, data_as_of, units, portfolio };
}
