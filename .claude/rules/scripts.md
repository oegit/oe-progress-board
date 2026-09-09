---
description: ESM, zero-dependency, purity and exit-code conventions for the generator and its tests
paths:
  - "scripts/**"
  - "tests/**"
---

# Scripts and tests

- **Every import is `node:`-prefixed (`node:fs`) or a relative path ending in `.mjs`
  (`./validate.mjs`).** No bare package specifier, no extensionless import, no path alias. Node's ESM
  resolver resolves specifiers literally in every context this project has — the app, `node --test`,
  and plain `node scripts/x.mjs` — so the literal form is the only form that works everywhere.
  `tests/repo-rules.test.mjs` fails the build on a violation.
- **Zero dependencies.** Nothing is installed, ever. If a task appears to need a package, the task is
  wrong: stop and report it.
- **`compute.mjs` and `render.mjs` are pure.** No `node:fs`, no `fetch`, no `Date.now()`, no
  `process.env`. Every input arrives as an argument — including `now`, which is a `YYYY-MM-DD` string.
  This is what makes the 14-day staleness boundary testable at all.
- **`fetch.mjs` takes its `fetch` implementation as an argument.** No test may touch the network; API
  mode is exercised with a stub that returns canned `{ status, json }` values.
- **`generate.mjs` is the only module that reads `process.env`** (only `PROGRESS_READ_TOKEN`, only in
  `--repos-from` mode) **and the only one that writes to disk.**
- **Exit codes are the interface:** `0` ok · `1` assertion or validation failure · `2` usage error ·
  `3` source error (network, auth, manifest) · `4` environment error (a required target file is
  missing). A `3` writes **nothing**: the output is assembled in memory and written last, so a failed
  fetch can never replace a good published board with a blank one.
- **Errors are named and go to stderr** as `error: <lowercase sentence>`. Never a raw stack trace, and
  never the value of a token.
- **Never assert a runtime-produced string.** No test may depend on a Node exception message, a stack
  trace, a locale-formatted date, or a float rendering — those are version-specific and would fail on
  a different Node build. `validate.mjs` catches `JSON.parse` failures and returns the project's own
  rule name `invalid_json` precisely so no gate ever reads a parse message.
- **Assert rule names and exit codes, not prose.** `rule: building_range` is a contract; the message
  beside it is not.
- **Tests write only into `os.tmpdir()` or `.tmp/`.** Never into `~/.claude`, never into the
  repository root, never into `dist/`.
- **A gate whose correct outcome is a failure asserts the specific code** — `cmd; test $? -eq 2` —
  never a bare `!` or `test $? -ne 0`, which would also pass on a usage error.
- **One responsibility per module.** If `generate.mjs` starts formatting HTML or validating fields,
  the logic belongs in `render.mjs` or `validate.mjs` instead.
