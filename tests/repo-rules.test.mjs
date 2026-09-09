// The rules this project cannot afford to lose once the build is over: every import is node:-prefixed
// or a relative .mjs path (zero dependencies as a gate, not a promise); no committed public text
// carries a private string; and no CLI script runs on import.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const files = (pattern) => globSync(pattern, { cwd: root }).sort();

test('every import specifier under scripts/ and tests/ is node:-prefixed or a relative .mjs path', () => {
  const sources = [...files('scripts/*.mjs'), ...files('tests/*.test.mjs')];
  assert.ok(sources.length >= 12, `scanned ${sources.length} files`);
  const bad = [];
  for (const file of sources) {
    const text = read(file);
    const specs = [
      ...[...text.matchAll(/^import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]),
      ...[...text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
    ];
    for (const spec of specs) {
      const ok = spec.startsWith('node:') || ((spec.startsWith('./') || spec.startsWith('../')) && spec.endsWith('.mjs'));
      if (!ok) bad.push(`${file}: ${spec}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('no committed public text carries a local path, an email address or a token prefix', () => {
  const targets = ['README.md', 'progress.json', 'manifest.json', ...files('docs/*.md'), ...files('skills/**/*.md')];
  assert.ok(targets.length >= 7, `scanned ${targets.length} files`);
  // The markers are assembled at runtime so this file itself passes the same sweep.
  const markers = ['/Us' + 'ers/', 'gh' + 'p_', 'github_' + 'pat_'];
  const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  // Documented exception: the report-progress skill must name the board's validator by absolute
  // path (it runs from other repositories), so its lines that invoke scripts/validate.mjs may carry
  // the home-directory path. Nothing else may.
  const validatorLine = /scripts\/validate\.mjs" progress\.json/;
  const hits = [];
  for (const file of targets) {
    read(file).split('\n').forEach((line, i) => {
      for (const marker of markers) {
        if (!line.includes(marker)) continue;
        if (marker === markers[0] && file === 'skills/report-progress/SKILL.md' && validatorLine.test(line)) continue;
        hits.push(`${file}:${i + 1}: ${marker}`);
      }
      if (email.test(line)) hits.push(`${file}:${i + 1}: email address`);
    });
  }
  assert.deepEqual(hits, []);
  const skill = read('skills/report-progress/SKILL.md');
  assert.equal(skill.split(markers[0]).length - 1, 1, 'the skill carries the home-directory path exactly once, on the validator line');
});

test('every CLI script runs main() only when executed directly, never on import', () => {
  const guard = 'if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))';
  for (const file of files('scripts/*.mjs')) {
    const text = read(file);
    if (!/^(async )?function main\(/m.test(text)) continue;
    assert.ok(text.includes(guard), `${file} guards its main()`);
    assert.ok(!/^process\.exitCode = /m.test(text), `${file} has no unguarded top-level exitCode assignment`);
  }
});

test('non-goals stay un-built: no client script in the rendered page, no lockfile, no second stylesheet', () => {
  assert.deepEqual(files('site/*'), ['site/board.css']);
  assert.deepEqual(files('package-lock.json'), []);
  assert.deepEqual(files('node_modules'), []);
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
});
