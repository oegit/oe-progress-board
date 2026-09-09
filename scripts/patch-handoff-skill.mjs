// OE Progress Board — wires progress reporting into the one routine every session already runs:
// the hand-off at session close. Appends one section to the user-level `handoff` skill, once.
//
// node scripts/patch-handoff-skill.mjs [--target <file>]
// Exit 0 applied, or `already applied` and nothing changed · 2 usage · 4 the target is missing
// (never created: guessing another skill's content is worse than failing). Before the first
// application the pristine file is copied to <target>.bak-2026-09-03, and that backup is never
// overwritten, so a re-run cannot replace the clean copy with an already-patched one.

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_TARGET = join(homedir(), '.claude', 'skills', 'handoff', 'SKILL.md');
export const BACKUP_SUFFIX = '.bak-2026-09-03';
export const MARKER = '## Session close → report progress';
export const SECTION = `${MARKER}

When a session closes and a delivery stage of the repository it worked in changed — a stage
started, finished, or became blocked — invoke the \`report-progress\` skill in that repository
**before** writing the hand-off, so the OE Progress Board carries the change. Then state in the
hand-off which stage moved and to which state, for example "building → in_progress". If no stage
changed, say so in one line and skip the skill.
`;

// Pure. Appends the section once; a text that already carries the marker comes back unchanged.
export function patch(text) {
  if (text.includes(MARKER)) return text;
  const base = text.endsWith('\n') ? text : `${text}\n`;
  return `${base}\n${SECTION}`;
}

function parseArgs(argv) {
  const opts = { target: DEFAULT_TARGET };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--target' && argv[i + 1] !== undefined && !argv[i + 1].startsWith('-')) {
      opts.target = argv[i + 1];
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
    process.stderr.write(`error: ${opts.error}\nusage: node scripts/patch-handoff-skill.mjs [--target <file>]\n`);
    return 2;
  }
  if (!existsSync(opts.target)) {
    process.stderr.write(`error: handoff SKILL.md not found at ${opts.target}\n`);
    return 4;
  }
  const text = readFileSync(opts.target, 'utf8');
  if (text.includes(MARKER)) {
    process.stdout.write('already applied\n');
    return 0;
  }
  const backup = `${opts.target}${BACKUP_SUFFIX}`;
  if (!existsSync(backup)) copyFileSync(opts.target, backup);
  writeFileSync(opts.target, patch(text));
  process.stdout.write(`applied: ${opts.target} (backup at ${backup})\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
