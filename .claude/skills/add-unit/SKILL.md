---
name: add-unit
description: Add a repository to the OE Progress Board so it gets a card. Use when someone says "add a repo to the board", "a new agent needs a card", "put X on the progress board", or when a new agent or pack repository is created under the oegit account. Runs inside the oe-progress-board repository only.
---

# Add a unit to the board

## When to use

- A new agent or pack repository exists under `oegit` and should appear on the board.
- An existing unit was renamed, so its `repo` or `slug` changed.
- A unit is retired and its card should stop rendering.

Do **not** use this to update a unit's progress — that is the user-level `report-progress` skill, and
it runs inside the *unit's* repository, not this one.

## Steps

1. Confirm the repository exists and that the read token can see it:
   `gh api repos/oegit/<name> --jq .name` exits 0.
2. Edit `manifest.json`. Append `{ "slug": "<slug>", "repo": "oegit/<name>", "kind": "agent" }` —
   `kind` is `agent` for a Claude agent, `project` for a pack or a tool. Keep `oe-progress-board`
   first; add new units at the end so existing card order does not shuffle.
   **`slug` must equal the `slug` the unit's own `progress.json` will carry.**
3. Update the two counted facts that live in prose, in the same commit: the unit count in
   `README.md` and the row list in `docs/BACKFILL.md`.
4. Regenerate the backfill hand-offs so the new unit gets one:
   `node scripts/make-handoffs.mjs`. If the unit's local folder is not one the script already maps,
   add it to the literal map inside `scripts/make-handoffs.mjs` first.
5. If the unit's repository is private, extend the fine-grained PAT's repository selection to include
   it — otherwise its card will read "No report yet" forever. Procedure: `docs/OPERATIONS.md`.
6. Commit on `architect/blueprint`, push, open a PR, wait for `ci.yml`, merge. The hourly build picks
   it up; force it with `gh workflow run build-board.yml -R oegit/oe-progress-board`.

## Verify

```bash
node -e "const m=JSON.parse(require('node:fs').readFileSync('manifest.json','utf8'));if(new Set(m.map(e=>e.slug)).size!==m.length)throw new Error('duplicate slug');for(const e of m){if(!/^oegit\/[a-z0-9-]+$/.test(e.repo))throw new Error('bad repo '+e.repo);if(e.kind!=='agent'&&e.kind!=='project')throw new Error('bad kind '+e.kind)}"   # expect: exit 0
npm test                                                        # expect: exit 0 — the manifest-shape test still passes
rm -rf .tmp/addunit
node scripts/generate.mjs --from tests/fixtures/units --now 2026-09-01 --out .tmp/addunit   # expect: exit 0
node -e "const fs=require('node:fs');const m=JSON.parse(fs.readFileSync('manifest.json','utf8'));const j=JSON.parse(fs.readFileSync('.tmp/addunit/data/board.json','utf8'));if(j.units.length!==m.length)throw new Error('the board renders '+j.units.length+' cards for '+m.length+' manifest units')"   # expect: exit 0
node scripts/make-handoffs.mjs                                  # expect: exit 0
```

## Do not

- Do not add a standalone skill as a unit. A skill is a feature *inside* a unit and appears in that
  unit's `features_built` list — listing skills separately triples the card count and dilutes the
  answer the board exists to give.
- Do not hard-code a new count anywhere. Every gate above compares the rendered card count against
  `manifest.json`'s own length, so nothing has to be updated in two places.
- Do not add a unit whose repository the token cannot read and then "fix it later": the card will show
  "No report yet" indefinitely and look like a reporting failure instead of a permission one.
- Do not reorder existing entries. Card order is manifest order, and stakeholders learn positions.
