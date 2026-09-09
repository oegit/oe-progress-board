# OE Progress Board

**One public page showing where every Open English agent and project stands:**
**https://oegit.github.io/oe-progress-board/**

The board answers one question for a senior, non-technical reader: for each unit — an AI agent or a
project pack — how far along is it, what does it already do, and what is still to build. It is a
static page: no login, no scripts, nothing to install.

## How it updates

Every unit publishes a small report, `progress.json`, in its own repository. The board rebuilds
itself from those reports every hour, on demand when a unit publishes, and on every change to the
board's own code. The line **Data as of `<date>`** at the top of the page is the date of the newest
report, so the page never implies more freshness than it has.

## What a card shows

- **The name and kind** of the unit (Agent or Project) and one sentence saying what it does.
- **A seven-stage stepper:** Conceptualization, Planning, Planning audit, Building, Building audit,
  Testing, Deployment. Each stage shows a glyph, its name and its state in words — Done, In progress,
  Blocked or Not started — so no state depends on colour alone.
- **Building progress** as a ring and as words ("5 of 10 tasks", "3 of 7 stages"). A dash means the
  unit has no task bundle to count yet.
- **Already does** and **Still to build**: plain-language lists written for a stakeholder.
- **Updated `<date>`**: the day the unit last reported.

The panel at the top, **Where the portfolio stands**, counts every unit once at the stage it is
working on now.

## What the three special states mean

- **No report yet** — the unit has not published a report. The card still renders, with all seven
  stages shown as unknown, so silence is visible instead of hidden.
- **Invalid report** — the unit published a file that breaks the report contract; the card names the
  rule it broke so the unit's owner can fix it. Every other card is unaffected.
- **Stale** — the report is more than 14 days old. The card still shows its content, with a Stale
  badge beside the date, so an unattended unit is legible at a glance.

## How a unit publishes a report

The contract for `progress.json` is in [`docs/CONTRACT.md`](docs/CONTRACT.md). A Claude Code
session working in a unit's repository publishes or updates the report with the `report-progress`
skill, validates it with this repository's validator, commits it, and triggers a refresh of the board.
Which units still owe their first report is tracked in [`docs/BACKFILL.md`](docs/BACKFILL.md).

## Nothing on the page is private

Every report is validated before it can be rendered, and the validator rejects any local file path,
email address, link into a private repository, or access token. The page links to no private
repository. Operating notes — the read token, its rotation, forcing a refresh — are in
[`docs/OPERATIONS.md`](docs/OPERATIONS.md).

## For developers

Node 24, zero dependencies. `npm run check` is the syntax gate, `npm test` the suite, and
`node scripts/generate.mjs --from tests/fixtures/units --now 2026-09-01 --out .tmp/gen` builds the
whole board offline from fixtures. See `CLAUDE.md` for the architecture and the rules.
