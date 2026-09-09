# Backfill — which units still owe a first report

The board renders one card per unit in `manifest.json`. A unit whose repository has no
`progress.json` yet reads "No report yet". Each such unit gets its first report from its own
repository, in its own session, by following the `report-progress` skill: every stage state is
derived from git evidence (commits, tags, merged pull requests, files on disk), and a stage with no
evidence stays `pending`. Nothing here is edited from the board's repository.

`node scripts/make-handoffs.mjs` writes one ready-to-paste hand-off per row below into `handoffs/`
on the operator's machine. Those files are not committed: they carry local machine paths.

| # | Unit (slug) | Kind | First report landed |
|---|---|---|---|
| 1 | `agent-art-director` | agent | no |
| 2 | `agent-creative-director` | agent | no |
| 3 | `agent-email-developer` | agent | no |
| 4 | `agent-social-media-factory` | agent | no |
| 5 | `agent-social-media-studio` | agent | no |
| 6 | `agent-ugc` | agent | no |
| 7 | `agent-video-studio` | agent | no |
| 8 | `agent-web-developer` | agent | no |
| 9 | `oe-pack-ugc` | project | no |
| 10 | `oe-pack-social-studio` | project | no |
| 11 | `oe-pack-video-studio` | project | no |

The board itself (`oe-progress-board`) published its own report first, as the proving run of the
skill. Update a row to "yes" with the date when that unit's card stops reading "No report yet".

Before a private repository's report can be read, the board's read token must cover that repository;
see `docs/OPERATIONS.md`.
