---
description: GitHub Actions conventions — action pinning, Pages permissions, and secret handling
paths:
  - ".github/workflows/**"
---

# Workflows

Two workflows, and no third without a decision recorded in
`blueprints/oe-progress-board/blueprint.md` §20.3.

| File | Triggers | Job |
|---|---|---|
| `ci.yml` | `pull_request`, `workflow_dispatch` | checkout → setup-node → `npm run check` → `npm test`. This is the required check every publish waits on with `gh pr checks --watch --fail-fast` |
| `build-board.yml` | hourly `schedule`, `workflow_dispatch`, `push` to `main` | **build:** checkout → setup-node → generate → configure-pages → upload-pages-artifact. **deploy:** `needs: build` → deploy-pages |

- **Action versions are pinned by major and never downgraded:** `actions/checkout@v7`,
  `actions/setup-node@v7`, `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`,
  `actions/deploy-pages@v5`. All five run on the node24 runtime. Node 20 was removed from GitHub
  runners on 2026-09-23, so an older major is a broken build, not a conservative choice. The release
  each major resolved to on 2026-09-03 is recorded in the blueprint's §11.
- **The Node version comes from `.nvmrc`**, always as `node-version-file: .nvmrc`. Never write a
  second literal version into a workflow: that is one value in two places waiting to disagree.
- **`build-board.yml` carries exactly these permissions:** `contents: read`, `pages: write`,
  `id-token: write`. Nothing else, ever — the build has no reason to write to this repository.
- **The deploy job carries `environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }`**
  and the workflow carries `concurrency: { group: "pages", cancel-in-progress: false }`. Never cancel
  a Pages deployment in flight.
- **`PROGRESS_READ_TOKEN` appears on the generate step only**, as
  `env: PROGRESS_READ_TOKEN: ${{ secrets.PROGRESS_READ_TOKEN }}`. Never at job level, never at
  workflow level, never in a `run:` line, and never echoed.
- **The artifact path is `dist`**, the same literal the generate step passes to `--out`. Change one
  and you must change the other in the same commit.
- **The generate step in CI is always API mode:** `node scripts/generate.mjs --repos-from
  manifest.json --out dist`. `--from` reads local directories that do not exist on a runner.
- **A failed generate publishes nothing.** The generator exits 3 without writing, the job fails, and
  the previously deployed page keeps serving. Never add a fallback that uploads a partial or empty
  `dist`.
