# Operations

How the OE Progress Board is kept running. Everything here is public-safe: it names the secret and
the workflow, never a secret value.

## How the board updates

The `build-board` workflow runs every hour, on every push to `main`, and on demand. It reads
`progress.json` from each repository listed in `manifest.json` through the GitHub Contents API,
validates each report, renders the page and publishes it to GitHub Pages at
`https://oegit.github.io/oe-progress-board/`.

A unit with no report renders as "No report yet". A unit whose report breaks the contract renders as
"Invalid report" with the failing rule name. Neither fails the build. Only a manifest problem or a
transport or authentication failure fails the build, and a failed build publishes nothing: the
previously deployed page keeps serving.

## Force a refresh

After a unit publishes a new report, or after rotating the token:

```
gh workflow run build-board.yml -R oegit/oe-progress-board
```

Then watch it:

```
gh run watch "$(gh run list -R oegit/oe-progress-board -w build-board --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

The page is live about two minutes after the run succeeds (Pages CDN propagation).

## The read token: `PROGRESS_READ_TOKEN`

The unit repositories are private, so the workflow's default `GITHUB_TOKEN` cannot read them. The
generator authenticates with a fine-grained personal access token stored as a single GitHub Actions
repository secret named `PROGRESS_READ_TOKEN`. It is never committed, never written to a local file,
and appears in the workflow on the generate step only.

### Create it

1. Open `https://github.com/settings/personal-access-tokens/new` while signed in to the `oegit`
   account.
2. Token name `oe-progress-board read`, resource owner `oegit`, expiry 90 days.
3. Repository access: **Only select repositories**, then select the 8 repositories listed in
   `manifest.json`.
4. Repository permissions: **Contents: Read-only**. Nothing else.
5. Generate the token and copy its value.
6. From the board repository's root, run
   `gh secret set PROGRESS_READ_TOKEN -R oegit/oe-progress-board` and paste the value at the prompt.

Confirm with `gh secret list -R oegit/oe-progress-board`, which lists the secret's name and the date
it was last updated, then force a refresh (above) and confirm the run succeeds.

### Rotate it (every 90 days)

The token expires 90 days after creation. GitHub emails the account owner before expiry. To rotate:

1. Create a new token exactly as above (a new expiry date, the same 8 repositories, the same
   read-only permission).
2. Run `gh secret set PROGRESS_READ_TOKEN -R oegit/oe-progress-board` with the new value. The old value
   is overwritten; nothing else changes.
3. Force a refresh and confirm the run succeeds.
4. Delete the old token in the GitHub UI.

The rotation date is the `Updated` column of `gh secret list`. If the token expires before rotation,
every hourly run fails with an authentication error naming the first repository it could not read,
and the last good page keeps serving until the secret is replaced.

### When a repository is added to the manifest

The token is scoped to specific repositories, so a new unit is unreadable until the token covers it:
edit the token's repository access in the GitHub UI to add the new repository (or create a new token
that includes it and set the secret again), then force a refresh.

## Generator exit codes and what they mean for the published page

The generate step runs `node scripts/generate.mjs --repos-from manifest.json --out dist`.

| Exit | Meaning | Effect on the page |
|---|---|---|
| 0 | The board was built | The workflow publishes the new page |
| 2 | Usage error: a wrong or missing argument in the workflow's command line | Nothing is written; the run fails; the last good page keeps serving. Fix the workflow file |
| 3 | Source error: the manifest is missing or malformed, `PROGRESS_READ_TOKEN` is unset or empty, or a repository could not be read (expired token, missing permission, network) | Nothing is written; the run fails; the last good page keeps serving. Check the secret first, then the manifest |
| 4 | Output error: the output directory could not be written | Nothing is published; the run fails. A runner problem, not a data problem; re-run the workflow |

A single unit's missing or invalid report is never an error: it renders as "No report yet" or
"Invalid report" and the run exits 0.

## Rollback

- **A unit published a bad report.** Nothing to roll back here: the validator already renders that
  card as "Invalid report". The unit fixes its own file, then anyone forces a refresh.
- **The generator itself broke.** Revert the merge commit on `main` and push; the workflow rebuilds
  from the previous code within about a minute, plus CDN propagation. While a build fails, the
  previously published page keeps serving.
