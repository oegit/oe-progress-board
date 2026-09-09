// OE Progress Board — the progress.json contract as code.
//
// `validate(report)` checks the twelve rules in the order of the table in docs/CONTRACT.md and
// returns `{ ok: true }` or `{ ok: false, rule, message }`. `rule` is the contract; `message` is
// prose for humans and is never asserted. `validateText(text)` parses first and converts a parse
// failure into the rule `invalid_json`, so no runtime error text ever escapes this module.
//
// CLI: node scripts/validate.mjs <file> → exit 0 valid · 1 invalid (prints `rule: <name> — <message>`)
// · 2 usage.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = '1';
export const STAGE_IDS = Object.freeze([
  'conceptualization',
  'planning',
  'planning_audit',
  'building',
  'building_audit',
  'testing',
  'deployment',
]);
export const STAGE_STATES = Object.freeze(['pending', 'in_progress', 'done', 'blocked']);
export const KINDS = Object.freeze(['agent', 'project']);
export const RULES = Object.freeze([
  'invalid_json',
  'schema_version',
  'required_field',
  'enum_kind',
  'enum_state',
  'stages_shape',
  'stages_order',
  'stage_date',
  'building_range',
  'date_format',
  'source_commit',
  'private_info',
]);

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SEQUENCE_RE = /^(done)*(in_progress|blocked)?(pending)*$/;
const COMMIT_RE = /^[0-9a-f]{7,40}$/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PRIVATE_MARKERS = Object.freeze(['/Users/', 'github.com/oegit/', 'ghp_', 'github_pat_']);

const fail = (rule, message) => ({ ok: false, rule, message });
const isString = (v) => typeof v === 'string';
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStringArray = (v) => Array.isArray(v) && v.every(isString);
const isCount = (v) => Number.isInteger(v) && v >= 0;

// True for a real calendar date written as YYYY-MM-DD (2026-02-30 is not one).
export function isIsoDate(value) {
  if (!isString(value)) return false;
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Every string in the document, at any depth — keys included, because a key is public text too.
function collectStrings(value, out = []) {
  if (isString(value)) out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (isObject(value)) {
    for (const [key, v] of Object.entries(value)) {
      out.push(key);
      collectStrings(v, out);
    }
  }
  return out;
}

// Returns the first private marker found in the document, or null.
export function findPrivateInfo(report) {
  for (const text of collectStrings(report)) {
    const marker = PRIVATE_MARKERS.find((m) => text.includes(m));
    if (marker) return marker;
    if (EMAIL_RE.test(text)) return 'an email address';
  }
  return null;
}

// Rule `required_field`: every required field present and of the right type. Returns a message or null.
function requiredFieldProblem(report) {
  if (!isString(report.slug) || report.slug === '') return 'slug must be a non-empty string';
  if (!isString(report.name) || report.name === '') return 'name must be a non-empty string';
  if (!isString(report.kind)) return 'kind must be a string';
  if (!isString(report.public_summary) || report.public_summary === '') {
    return 'public_summary must be a non-empty string';
  }
  if (!Array.isArray(report.stages)) return 'stages must be an array';
  for (const [i, stage] of report.stages.entries()) {
    if (!isObject(stage)) return `stages[${i}] must be an object`;
    if (!isString(stage.id)) return `stages[${i}].id must be a string`;
    if (!isString(stage.state)) return `stages[${i}].state must be a string`;
    if (stage.date !== undefined && !isString(stage.date)) return `stages[${i}].date must be a string`;
    if (stage.note !== undefined && !isString(stage.note)) return `stages[${i}].note must be a string`;
  }
  if (!('building' in report)) return 'building is required (an object or null)';
  if (report.building !== null && !isObject(report.building)) return 'building must be an object or null';
  if (!isStringArray(report.features_built)) return 'features_built must be an array of strings';
  if (!isStringArray(report.features_pending)) return 'features_pending must be an array of strings';
  if (!isString(report.updated_at)) return 'updated_at must be a string';
  if (!isString(report.source_commit)) return 'source_commit must be a string';
  return null;
}

export function validate(report) {
  if (!isObject(report)) return fail('required_field', 'the report must be a JSON object');
  if (report.schema_version !== SCHEMA_VERSION) {
    return fail('schema_version', `schema_version must be the string "${SCHEMA_VERSION}"`);
  }
  const problem = requiredFieldProblem(report);
  if (problem) return fail('required_field', problem);
  if (!KINDS.includes(report.kind)) return fail('enum_kind', `kind must be one of ${KINDS.join(', ')}`);
  for (const stage of report.stages) {
    if (!STAGE_STATES.includes(stage.state)) {
      return fail('enum_state', `stage ${stage.id} has state ${stage.state}; allowed: ${STAGE_STATES.join(', ')}`);
    }
  }
  const shapeOk = report.stages.length === STAGE_IDS.length
    && report.stages.every((stage, i) => stage.id === STAGE_IDS[i]);
  if (!shapeOk) return fail('stages_shape', `stages must be exactly ${STAGE_IDS.join(', ')} in that order`);
  if (!SEQUENCE_RE.test(report.stages.map((s) => s.state).join(''))) {
    return fail('stages_order', 'stages must be done stages, then at most one in_progress or blocked stage, then pending stages');
  }
  for (const stage of report.stages) {
    if ((stage.state === 'done' || stage.state === 'blocked') && !isIsoDate(stage.date)) {
      return fail('stage_date', `stage ${stage.id} is ${stage.state} and needs a YYYY-MM-DD date`);
    }
  }
  if (report.building !== null) {
    const { done, total } = report.building;
    if (!isCount(done) || !isCount(total) || done > total) {
      return fail('building_range', 'building.done and building.total must be integers of 0 or more with done <= total');
    }
  }
  if (!isIsoDate(report.updated_at)) return fail('date_format', 'updated_at must be a real YYYY-MM-DD date');
  if (!COMMIT_RE.test(report.source_commit)) {
    return fail('source_commit', 'source_commit must be 7 to 40 lowercase hexadecimal characters');
  }
  const leak = findPrivateInfo(report);
  if (leak) return fail('private_info', `a string contains private information (${leak})`);
  return { ok: true };
}

// Parses first. A parse failure becomes the project's own rule name; the runtime's message is dropped.
export function validateText(text) {
  let report;
  try {
    report = JSON.parse(text);
  } catch {
    return fail('invalid_json', 'the file is not valid JSON');
  }
  return validate(report);
}

function main(argv) {
  if (argv.length !== 1 || argv[0].startsWith('-')) {
    process.stderr.write('error: usage: node scripts/validate.mjs <file>\n');
    return 2;
  }
  let text;
  try {
    text = readFileSync(argv[0], 'utf8');
  } catch {
    process.stderr.write(`error: could not read ${argv[0]}\n`);
    return 2;
  }
  const result = validateText(text);
  if (result.ok) {
    process.stdout.write(`ok: ${argv[0]} is a valid progress report\n`);
    return 0;
  }
  process.stdout.write(`rule: ${result.rule} — ${result.message}\n`);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
