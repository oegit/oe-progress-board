---
name: report-progress
description: Publish or update a unit's progress.json so its card on the OE Progress Board is current. Use when closing, starting, blocking or otherwise changing a delivery stage (conceptualization, planning, planning_audit, building, building_audit, testing, deployment) in any OE agent or pack repository, when a session close moved a stage, or when Felipe says "reporta el progreso", "actualiza el progress.json" or "sube el avance al board". Runs inside the unit's own repository.
---

# Report progress to the OE Progress Board

Every unit — an agent or a pack repository under the `oegit` account — publishes one file,
`progress.json`, at the root of its repository. The board reads it every hour and renders one card
from it. This skill writes that file correctly. It runs **inside the unit's repository**, from a
session that just changed a delivery stage.

## The seven stages and the four states

Stages, always all seven, always in this order: `conceptualization`, `planning`, `planning_audit`,
`building`, `building_audit`, `testing`, `deployment`.

States: `pending`, `in_progress`, `done`, `blocked`. Joined in order, the seven states must read as
completed stages first, then at most one stage `in_progress` or `blocked`, then only `pending` ones.
A `done` stage after a `pending` one is invalid. A `done` or `blocked` stage carries the `date` it
reached that state, as `YYYY-MM-DD`.

## Procedure

1. **Count `building` mechanically.** Read every `blueprints/*/tasks.json` in this repository. Each
   is a top-level JSON array of tasks, each task carrying a `status`. `building.done` is the number
   of tasks whose `status` is `done`; `building.total` is the number of tasks. Sum across bundles
   when several exist. No bundle at all → `building` is `null`. Never estimate these numbers.

   ```bash
   node -e "const fs=require('node:fs');const files=fs.globSync('blueprints/*/tasks.json');if(!files.length){console.log('null');process.exit()}let d=0,t=0;for(const f of files){const a=JSON.parse(fs.readFileSync(f,'utf8'));t+=a.length;d+=a.filter(x=>x.status==='done').length}console.log(JSON.stringify({done:d,total:t}))"
   ```

2. **Update only what moved.** Open `progress.json` (create it from the template below when it does
   not exist). Change **only** the stage being closed or changed — its `state`, its `date` when the
   state is `done` or `blocked`, and optionally a one-clause `note` — plus the five moving fields:
   `updated_at` (today, `YYYY-MM-DD`), `source_commit` (the current short commit hash, `git rev-parse
   --short HEAD`), `building` (from step 1), `features_built` and `features_pending`. The other six
   stages keep their states and dates: they are the only history this system has.

3. **Write for the public.** The card is rendered on a public page for senior, non-technical readers.
   Never write, anywhere in the file: a local path (`~/…` or a home-directory path), an email
   address, a link to a private repository, or a token or token prefix. `public_summary` is one
   sentence saying what the unit *does*. Each item in `features_built` ("Already does") and
   `features_pending` ("Still to build") is 12 words or fewer, plain present tense, capability rather
   than implementation, no task ids, step numbers or tool names. English, always.

4. **Validate with the board's validator — the single mechanism, by absolute path.** Run, from this
   repository's root:

   ```bash
   node "/Users/felipemarquez/Documents/AI Projects/open-english/oe-progress-board/scripts/validate.mjs" progress.json
   ```

   It must exit 0. If it exits 1 it prints `rule: <name> — <message>`: fix what the named rule
   describes and run it again. Never copy validator logic into this repository; the board's file is
   the contract.

5. **Commit** `progress.json` on the working branch with the message `progress: <stage> <state>`,
   for example `progress: building in_progress`, and let it reach the default branch through the
   repository's normal pull-request flow. The board reads the default branch.

6. **Refresh the board** so the card updates now instead of at the next hourly run:

   ```bash
   gh workflow run build-board.yml -R oegit/oe-progress-board
   ```

   Then state in the hand-off which stage moved and to which state.

## Template for a repository with no `progress.json` yet

Replace every value. Keep all seven stages in this order; set the ones that have not started to
`pending` with no `date`.

```json
{
  "schema_version": "1",
  "slug": "agent-example",
  "name": "Example Agent",
  "kind": "agent",
  "public_summary": "One sentence saying what this unit does for the business.",
  "stages": [
    { "id": "conceptualization", "state": "done", "date": "2026-06-14" },
    { "id": "planning",          "state": "done", "date": "2026-06-20" },
    { "id": "planning_audit",    "state": "done", "date": "2026-06-22" },
    { "id": "building",          "state": "in_progress", "note": "Half the task bundle is closed." },
    { "id": "building_audit",    "state": "pending" },
    { "id": "testing",           "state": "pending" },
    { "id": "deployment",        "state": "pending" }
  ],
  "building": { "done": 5, "total": 10 },
  "features_built": ["Writes a shot list from a brief"],
  "features_pending": ["Renders the final cut"],
  "updated_at": "2026-08-28",
  "source_commit": "a1b2c3d"
}
```

Field notes: `schema_version` is exactly `"1"`; `slug` must equal the slug the board's manifest uses
for this repository (ask if unsure — it is normally the repository name); `kind` is `agent` or
`project`; `source_commit` is 7 to 40 hexadecimal characters.

## Do not

- Do not rewrite stages that did not move, and never remove a `date` a stage already has.
- Do not estimate `building`; count it from `blueprints/*/tasks.json` every time.
- Do not put anything private in the file — the validator rejects it and the card would read
  "Invalid report" on a public page.
- Do not skip the validation step; an invalid file is never rendered.
