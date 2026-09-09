# OE Progress Board

One public page showing where every Open English agent and project stands. Built by a Node script in
GitHub Actions, published to GitHub Pages. Read by senior, non-technical stakeholders.

## Commands

| Task | Command |
|---|---|
| Install | none — this project has **zero dependencies** |
| Syntax gate | `npm run check` — `node --check` over every `scripts/*.mjs` |
| Tests | `npm test` — `node --test 'tests/**/*.test.mjs'` · one file: `node --test tests/compute.test.mjs` |
| Build (local, offline) | `node scripts/generate.mjs --from tests/fixtures/units --now 2026-09-01 --out .tmp/gen` |
| Build (real data) | `node scripts/generate.mjs --repos-from manifest.json --out dist` — needs `PROGRESS_READ_TOKEN`; only CI runs this |
| Placeholder page | `node scripts/generate.mjs --placeholder --out .tmp/step1` |
| Validate one report | `node scripts/validate.mjs progress.json` — 0 valid · 1 invalid · 2 usage |
| Live smoke test | `node scripts/smoke.mjs` |
| Force a refresh | `gh workflow run build-board.yml -R oegit/oe-progress-board` |
| Install the reporting skill | `node scripts/install-skill.mjs` · verify with `--check` |
| Regenerate hand-offs | `node scripts/make-handoffs.mjs` |

**Gate:** `npm run check && npm test` must pass before any task is marked done. Steps that touch the
published site also run `node scripts/smoke.mjs`.

**The test command names a quoted glob, not a directory.** `node --test tests/` does **not** work:
the runner treats a bare directory argument as a single test file and fails it, running zero tests
while exiting 1. `'tests/**/*.test.mjs'` stays quoted so the runner expands it — never the shell — and
the pattern is rooted at `tests/`, so it can never reach `blueprints/`.

Runtime version is pinned in `.nvmrc` (`24`). There is no lockfile because there are no dependencies:
**never add one without a decision recorded in `blueprints/oe-progress-board/blueprint.md` §20.3.**

## Stack

Node 24 · ESM `.mjs`, standard library only · plain CSS with custom properties · JSON documents in git
· GitHub Actions · GitHub Pages. No framework, no bundler, no formatter, no TypeScript.

## Architecture

**One request path, one direction.** The hourly workflow runs
`node scripts/generate.mjs --repos-from manifest.json --out dist`, which walks:

`manifest.json` → `scripts/fetch.mjs` (GitHub Contents API, one `GET /repos/{repo}/contents/progress.json`
per unit) → `scripts/validate.mjs` (per report) → `scripts/compute.mjs` (view model) →
`scripts/render.mjs` (HTML string) → `dist/index.html` + `dist/board.css` + `dist/data/board.json` →
`actions/upload-pages-artifact` → `actions/deploy-pages`.

Locally the same pipeline runs with `--from tests/fixtures/units`, which replaces only the first hop.

**Boundaries.** Cross one the wrong way and the build breaks:

| Module | May do | Must never |
|---|---|---|
| `scripts/compute.mjs`, `scripts/render.mjs` | Pure functions of their arguments | Touch `node:fs`, `fetch`, or `Date.now()` — `now` is always injected |
| `scripts/fetch.mjs` | Read unit files, call the API through an **injected** `fetchImpl` | Read `process.env` |
| `scripts/generate.mjs` | Read `process.env.PROGRESS_READ_TOKEN` (API mode only), write the output dir | Contain rendering or validation logic |
| `tests/**` | Import any script, write into `os.tmpdir()` or `.tmp/` | Touch the network, the real `~/.claude` files, or the current date |

**Where things live.**

| Concern | Single source of truth |
|---|---|
| The report contract | `docs/CONTRACT.md` + `scripts/validate.mjs` — change both together, and bump `schema_version` |
| The unit list | `manifest.json` — 12 entries; use the `add-unit` skill to change it |
| Design tokens | `site/board.css` `:root` — no colour literal anywhere else, in CSS or in `render.mjs` |
| The Node major | `.nvmrc` — the workflows read it with `node-version-file`, never a second literal |
| The output directory | `dist` in CI (set by `build-board.yml`), `.tmp/*` locally. They are two different values, not one written twice |
| Operations, the token, rotation | `docs/OPERATIONS.md` |

## Code rules

1. **Every import is `node:`-prefixed or a relative path ending in `.mjs`.** No bare package
   specifier, no extensionless import, no path alias. `tests/repo-rules.test.mjs` fails the build on a
   violation.
2. **Zero dependencies.** If a task seems to need a package, it is the wrong task — say so and stop.
3. **`compute` and `render` are pure.** I/O lives in `fetch.mjs` and `generate.mjs`, nowhere else.
4. **Never assert a runtime-produced string.** No test may depend on a Node exception message, a stack
   trace, a locale-formatted date or a float rendering. `validate.mjs` converts `JSON.parse` failures
   into the rule name `invalid_json` for exactly this reason.
5. **Dates are printed verbatim as `YYYY-MM-DD`.** Never `toLocaleDateString` — its output depends on
   the runtime's ICU data and would make the page differ between machines.
6. **Exit codes are the interface:** 0 ok · 1 assertion/validation failure · 2 usage · 3 source error
   (network, auth, manifest) · 4 environment error. A source error writes **nothing**, so a broken
   fetch never publishes a blank board over a good one.
7. **Every dynamic string is HTML-escaped in `render.mjs`.** A unit repository is a semi-trusted input.
8. **A broken unit never breaks the page.** Missing report → "No report yet". Invalid report →
   "Invalid report" plus the rule name. Only a manifest or transport failure exits non-zero.

## Design system

Tokens are defined once in `site/board.css` `:root`. Components reference token names only.

| Role | Value | Used for |
|---|---|---|
| Background | `#f0f0ed` | Page |
| Surface | `#ffffff` | Cards, portfolio panel |
| Text | `#16181d` | Body and headings |
| Muted text | `#626772` | Kind label, "Updated", unreached stages |
| Border (decorative) | `#e7e7e4` | Card edges, ring track |
| Border (perceivable) | `#888a8e` | Stepper outlines, badge borders |
| Accent | `#3385ff` | Focus ring, filled ring arc |
| Accent text | `#296ccf` on `#ffffff` only · `#2868c7` on `#f0f0ed` | Emphasis text |
| Success text | `#017b4f` on `#e6fbf4` | "Done" |
| Warning text | `#8f6800` on `#fff8e6` | "Stale" |
| Destructive text | `#c61818` on `#fee8e8` | "Blocked", "Invalid report" |

- **Type:** `"Helvetica Neue", Helvetica, Arial, sans-serif`, system stack, **no webfont request**.
- **Scale:** 40 / 29 / 20 / 17 / 15 / 13 / 11 px. Label 11px is uppercase, tracking `0.08em`.
- **Spacing:** 4 / 8 / 12 / 16 / 24 / 32 / 44 px as `--s1`…`--s7`. No arbitrary values.
- **Radius:** 8px chips · 12px cards · 20px the portfolio panel. **Elevation: flat — borders only.**
- **Motion:** none. Nothing changes after paint; the `prefers-reduced-motion` block exists anyway.
- **Layout:** max width 1240px; one column below 720px, two to 1080px, three above. Mobile-first.
- **Colour never carries meaning alone.** Every state renders a glyph (`✓ ● ■ ○`), the stage label and
  the state word. `#01db8c`, `#ffb800` and `#f41d1d` are decorative marks only — they do not meet 3:1.

## Environment

| Variable | Required | Used by | Source |
|---|---|---|---|
| `PROGRESS_READ_TOKEN` | Only in CI, only in `--repos-from` mode | `scripts/generate.mjs` | Fine-grained PAT, owner `oegit`, **Contents: Read-only** on the 12 manifest repositories. Set with `gh secret set PROGRESS_READ_TOKEN -R oegit/oe-progress-board` |

**There is no `.env` and no `.env.example` in this project, deliberately.** No local command reads an
environment variable; the workflow injects the one secret with an `env:` block on a single step.

## Rules

Deferred conventions — read the matching file before editing that area:

| File | Applies to |
|---|---|
| `.claude/rules/scripts.md` | `scripts/**`, `tests/**` |
| `.claude/rules/site.md` | `site/**`, `scripts/render.mjs` |
| `.claude/rules/public-text.md` | `README.md`, `docs/**`, `progress.json`, `manifest.json`, `skills/**` |
| `.claude/rules/workflows.md` | `.github/workflows/**` |

## Working with Felipe

- **Chat in neutral Latin American Spanish, using `tú`** — never voseo. **Every file written to disk is
  in English**, including this one, hand-offs, docs and commit messages.
- **Absolute paths in every instruction**, e.g.
  `/Users/felipemarquez/Documents/AI Projects/open-english/oe-progress-board`. He does not work from the terminal's
  current directory.
- **Never work directly on `main`.** Work on `architect/blueprint`, push, open a PR, wait for `ci.yml`
  to go green with `gh pr checks --watch --fail-fast`, then merge. Pushing, opening and merging that PR
  is pre-authorised; force-pushing, deleting anything and setting a secret are not.
- **Every claim about state carries the command that proves it, run in this same turn.** If it was not
  run, say `no verificado`. Never present an expected output as an actual one.
- **No `TODO`, no "simple for now".** An open item is closed in the same commit or it is reported.

## Non-negotiable

1. Never add a dependency, a build step, or a client-side script to this project.
2. Never publish anything private: no local path, email address, repository URL or token can reach
   `dist/`. The `private_info` validator rule is the enforcement, not a reminder.
3. Never edit `dist/` by hand or commit it — it is generated on every run and gitignored.
4. Never mark a task done with a failing `npm run check` or `npm test`.
5. Never remove the `--placeholder` flag or the `--now` option: both are load-bearing for gates that
   already passed.
6. Never let a single broken unit report fail the build — that asymmetry is the availability design.
