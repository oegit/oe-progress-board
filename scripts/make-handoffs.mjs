// OE Progress Board — writes one self-contained backfill hand-off per unit repository (every
// manifest entry except the board itself) into handoffs/<repo-name>.md.
//
// The files carry absolute local paths, so handoffs/ is gitignored: this script, docs/BACKFILL.md
// and the test are committed; the seven generated files never are. Idempotent: a second run
// rewrites byte-identical files and exits 0.
//
// node scripts/make-handoffs.mjs [--out <dir>]   exit 0 · 2 usage · 3 manifest problem · 4 write error

import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SourceError, readManifest } from './fetch.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DEFAULT_OUT = join(ROOT, 'handoffs');
export const BOARD_SLUG = 'oe-progress-board';
export const BOARD_ROOT = ROOT;
const AGENTS_HOME = join(homedir(), 'Documents', 'AI Agents', 'Claude Agents');

// Every unit besides the board is an agent living under AGENTS_HOME. Anything else is an error,
// never a guess: extend this function before adding a non-agent unit to the manifest.
export function localFolder(entry) {
  const name = entry.repo.split('/')[1];
  if (name.startsWith('agent-')) return join(AGENTS_HOME, name);
  throw new SourceError(`no local folder is known for ${entry.repo}; extend localFolder in scripts/make-handoffs.mjs`);
}

export function handoffText(entry) {
  const name = entry.repo.split('/')[1];
  const validator = join(BOARD_ROOT, 'scripts', 'validate.mjs');
  return `# Backfill hand-off — ${name}

Session title (paste into the App): \`${name} — first progress report for the OE Progress Board, derived from git evidence\`

## Launcher fields

1. Model: Fable
2. Effort: High
3. Mode: Plan
4. Exact folder: ${localFolder(entry)}
5. Branch: main
6. Worktree: on

\`Branch:\` is the BASE branch. That field selects an existing branch; the prompt below creates the working one.

## Prompt

\`\`\`
Write this repository's first progress.json for the OE Progress Board, using the installed
report-progress skill (/Users/…/.claude/skills/report-progress/SKILL.md is already installed;
invoke it as the skill "report-progress"). Work on a new branch progress/first-report cut from main.

The unit: slug "${entry.slug}", kind "${entry.kind}", repository ${name}.

Derive every one of the seven stage states — conceptualization, planning, planning_audit, building,
building_audit, testing, deployment — from git evidence only: commits, tags, merged pull requests and
files that exist in this working tree. Cite the evidence for each stage you mark done or in_progress
(commit hash, tag, PR number or file path) in your plan before writing. Never use memory, a prior
session's summary, or what a tasks.json claims: a tasks.json whose tasks are all done says nothing
about whether this unit was audited, tested or deployed. When the evidence for a stage is absent,
leave that stage pending. A done stage after a pending one is invalid and will be rejected.

Count building mechanically from blueprints/*/tasks.json (tasks with status "done" against the
task count, summed across bundles); no bundle means building is null. Write public_summary,
features_built and features_pending for a senior, non-technical stakeholder: one sentence, twelve
words or fewer per bullet, capability not implementation, English, nothing private (no local path,
no email address, no repository URL, no token).

Validate with the board's validator by absolute path and require exit 0:
node "${validator}" progress.json
Then commit progress.json with the message "progress: <stage> <state>", push, open a pull request
against main, merge it when its checks are green, and refresh the board:
gh workflow run build-board.yml -R oegit/oe-progress-board
Report, with evidence, which stage states you set and why, and confirm the unit's card on
https://oegit.github.io/oe-progress-board/ no longer reads "No report yet".
\`\`\`
`;
}

function parseArgs(argv) {
  const opts = { out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out' && argv[i + 1] !== undefined && !argv[i + 1].startsWith('-')) {
      opts.out = argv[i + 1];
      i += 1;
    } else {
      return { error: `unknown or incomplete argument ${argv[i]}` };
    }
  }
  return opts;
}

export function main(argv) {
  const opts = parseArgs(argv);
  if (opts.error) {
    process.stderr.write(`error: ${opts.error}\nusage: node scripts/make-handoffs.mjs [--out <dir>]\n`);
    return 2;
  }
  let files;
  try {
    const manifest = readManifest(join(ROOT, 'manifest.json'));
    files = manifest
      .filter((entry) => entry.slug !== BOARD_SLUG)
      .map((entry) => [join(opts.out, `${entry.repo.split('/')[1]}.md`), handoffText(entry)]);
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    return 3;
  }
  try {
    mkdirSync(opts.out, { recursive: true });
    for (const [path, text] of files) writeFileSync(path, text);
  } catch {
    process.stderr.write(`error: could not write into ${opts.out}\n`);
    return 4;
  }
  process.stdout.write(`ok: wrote ${files.length} hand-offs into ${opts.out}\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
