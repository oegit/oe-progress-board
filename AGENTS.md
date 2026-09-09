# OE Progress Board — agent instructions

One public page showing where every Open English agent and project stands, built by a Node script in
GitHub Actions and published to GitHub Pages. Zero dependencies, no framework, no client JavaScript.

## Commands

| Task | Command |
|---|---|
| Install | none — this project has **zero dependencies** |
| Syntax gate | `npm run check` |
| Tests | `npm test` · one file: `node --test tests/compute.test.mjs` |
| Build (local, offline) | `node scripts/generate.mjs --from tests/fixtures/units --now 2026-09-01 --out .tmp/gen` |
| Build (real data) | `node scripts/generate.mjs --repos-from manifest.json --out dist` — CI only, needs `PROGRESS_READ_TOKEN` |
| Validate one report | `node scripts/validate.mjs progress.json` |
| Live smoke test | `node scripts/smoke.mjs` |
| Force a refresh | `gh workflow run build-board.yml -R oegit/oe-progress-board` |

**Gate:** `npm run check && npm test` must pass before any task is marked done.
Runtime major is pinned in `.nvmrc`. There is no lockfile because there are no dependencies.

## Non-negotiable

1. Never add a dependency, a build step, or a client-side script to this project.
2. Never publish anything private: no local path, email address, repository URL or token can reach
   `dist/`. The `private_info` rule in `scripts/validate.mjs` enforces it.
3. Never edit `dist/` by hand or commit it — it is generated on every run and gitignored.
4. Never mark a task done with a failing `npm run check` or `npm test`.
5. Never remove the `--placeholder` flag or the `--now` option: both are load-bearing for gates that
   already passed.
6. Never let a single broken unit report fail the build — a missing report renders "No report yet" and
   an invalid one renders "Invalid report"; only a manifest or transport failure exits non-zero.

Every import is `node:`-prefixed or a relative path ending in `.mjs`. Never assert a runtime-produced
string (exception messages, stack traces, locale-formatted dates) in a test.

Full architecture, boundaries, design tokens and working conventions: see `CLAUDE.md` in this
directory. Area conventions: `.claude/rules/*.md`.
