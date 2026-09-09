// OE Progress Board — render(board) → one complete HTML document, as a string.
//
// Pure: no I/O, no clock, no environment. Every dynamic string is HTML-escaped, every date is printed
// verbatim as the YYYY-MM-DD the report wrote, and no colour literal appears here — colours are
// custom properties owned by site/board.css.

import { STAGE_IDS } from './validate.mjs';
import { PORTFOLIO_BUCKETS } from './compute.mjs';

export const UI_KIT_CSS = 'https://oegit.github.io/oe-ui-kit/v1/base.css';
export const TITLE = 'OE Progress Board';

export const STAGE_LABELS = Object.freeze({
  conceptualization: 'Conceptualization',
  planning: 'Planning',
  planning_audit: 'Planning audit',
  building: 'Building',
  building_audit: 'Building audit',
  testing: 'Testing',
  deployment: 'Deployment',
});
const BUCKET_LABELS = Object.freeze({ ...STAGE_LABELS, deployed: 'Deployed', no_report: 'No report' });
export const STATE_GLYPHS = Object.freeze({ done: '✓', in_progress: '●', blocked: '■', pending: '○', unknown: '○' });
export const STATE_WORDS = Object.freeze({
  done: 'Done',
  in_progress: 'In progress',
  blocked: 'Blocked',
  pending: 'Not started',
  unknown: 'Unknown',
});
const KIND_LABELS = Object.freeze({ agent: 'Agent', project: 'Project' });
const RING_RADIUS = 24;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

function step(id, state, note) {
  const glyph = STATE_GLYPHS[state];
  const word = STATE_WORDS[state];
  const noteHtml = note ? `<span class="note">${escapeHtml(note)}</span>` : '';
  return `<li class="step ${state}"><span class="glyph" aria-hidden="true">${glyph}</span>`
    + `<span class="stage">${STAGE_LABELS[id]}</span><span class="state">${word}</span>${noteHtml}</li>`;
}

function stepper(stages) {
  const items = stages
    ? stages.map((s) => step(s.id, s.state, s.note))
    : STAGE_IDS.map((id) => step(id, 'unknown'));
  return `<ol class="stepper">${items.join('')}</ol>`;
}

function ring(pct) {
  const filled = pct === null ? 0 : (pct / 100) * RING_CIRCUMFERENCE;
  return `<svg class="ring" viewBox="0 0 56 56" aria-hidden="true">`
    + `<circle class="track" cx="28" cy="28" r="${RING_RADIUS}"></circle>`
    + `<circle class="arc" cx="28" cy="28" r="${RING_RADIUS}" stroke-dasharray="${filled.toFixed(1)} ${RING_CIRCUMFERENCE.toFixed(1)}"></circle>`
    + `</svg>`;
}

function progress(unit) {
  const label = unit.building_pct === null ? '—' : `${unit.building_pct}%`;
  const tasks = unit.building === null ? 'No task bundle yet' : `${unit.building.done} of ${unit.building.total} tasks`;
  return `<div class="progress">${ring(unit.building_pct)}<div>`
    + `<p class="ring-label">${label}</p>`
    + `<p class="counts">${tasks} · ${unit.stages_done} of ${STAGE_IDS.length} stages</p>`
    + `</div></div>`;
}

function featureList(heading, items) {
  const body = items.length
    ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : `<p class="none">Nothing listed.</p>`;
  return `<h4>${heading}</h4>${body}`;
}

function card(unit) {
  const classes = ['card', `is-${unit.status}`];
  if (unit.status === 'ok' && unit.current_stage === 'deployed') classes.push('is-deployed');
  if (unit.stale) classes.push('is-stale');
  const head = `<h3>${escapeHtml(unit.name)}</h3><p class="kind label">${KIND_LABELS[unit.kind]}</p>`;
  let body;
  if (unit.status === 'missing') {
    body = `<p class="notice">No report yet — this unit has not published progress.</p>${stepper(null)}`;
  } else if (unit.status === 'invalid') {
    body = `<p class="notice">Invalid report — the last published file broke the contract `
      + `(<span class="rule">${escapeHtml(unit.rule)}</span>).</p>${stepper(null)}`;
  } else {
    const stale = unit.stale ? `<span class="badge stale">Stale</span>` : '';
    body = `<p class="summary">${escapeHtml(unit.public_summary)}</p>`
      + stepper(unit.stages)
      + progress(unit)
      + `<div class="lists">${featureList('Already does', unit.features_built)}`
      + `${featureList('Still to build', unit.features_pending)}</div>`
      + `<p class="updated">Updated ${escapeHtml(unit.updated_at)}${stale}</p>`;
  }
  return `<li class="${classes.join(' ')}" data-slug="${escapeHtml(unit.slug)}">${head}${body}</li>`;
}

function portfolio(board) {
  const total = board.units.length;
  const segments = PORTFOLIO_BUCKETS
    .filter((bucket) => board.portfolio[bucket] > 0)
    .map((bucket) => {
      const width = ((board.portfolio[bucket] / total) * 100).toFixed(2);
      return `<div class="seg seg-${bucket}" style="width: ${width}%"></div>`;
    });
  const legend = PORTFOLIO_BUCKETS
    .map((bucket) => `<li><span class="swatch seg-${bucket}" aria-hidden="true"></span>`
      + `${BUCKET_LABELS[bucket]} ${board.portfolio[bucket]}</li>`);
  return `<section class="portfolio" aria-labelledby="portfolio-h">`
    + `<h2 id="portfolio-h">Where the portfolio stands</h2>`
    + `<p>${total} units. Each unit is counted once, at the stage it is working on now.</p>`
    + (total ? `<div class="bar" aria-hidden="true">${segments.join('')}</div>` : '')
    + `<ul class="legend">${legend.join('')}</ul>`
    + `</section>`;
}

export function render(board) {
  const asOf = board.data_as_of === null
    ? 'Data as of — no unit has reported yet'
    : `Data as of ${escapeHtml(board.data_as_of)}`;
  const cards = board.units.length
    ? `<ul class="cards">${board.units.map(card).join('')}</ul>`
    : `<p class="empty">No units are configured yet.</p>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${TITLE}</title>
<link rel="stylesheet" href="${UI_KIT_CSS}">
<link rel="stylesheet" href="./board.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="page-head">
<h1>${TITLE}</h1>
<p class="as-of">${asOf}</p>
${portfolio(board)}
</header>
<main id="main">
<h2 class="sr-only">Units</h2>
${cards}
</main>
<footer>
<p>How this updates: every unit publishes its own progress report, and this page is rebuilt from those reports every hour. A unit whose report is more than 14 days old is marked Stale.</p>
</footer>
</body>
</html>
`;
}
