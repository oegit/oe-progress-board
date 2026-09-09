// OE Progress Board — installs skills/report-progress/SKILL.md as a user-level Claude Code skill.
//
// node scripts/install-skill.mjs            copy the source to the user's skills directory
// node scripts/install-skill.mjs --check    compare instead of copying
// Exit 0 installed / identical · 1 (--check) different or absent, naming the path · 2 usage ·
// 4 the repository source is missing. Every write is idempotent. `--source` and `--target` exist
// so the test suite can point both ends at a temporary directory and never touch ~/.claude.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_SOURCE = fileURLToPath(new URL('../skills/report-progress/SKILL.md', import.meta.url));
export const DEFAULT_TARGET = join(homedir(), '.claude', 'skills', 'report-progress', 'SKILL.md');

function parseArgs(argv) {
  const opts = { check: false, source: DEFAULT_SOURCE, target: DEFAULT_TARGET };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') {
      opts.check = true;
    } else if ((arg === '--source' || arg === '--target') && argv[i + 1] !== undefined && !argv[i + 1].startsWith('-')) {
      opts[arg.slice(2)] = argv[i + 1];
      i += 1;
    } else {
      return { error: `unknown or incomplete argument ${arg}` };
    }
  }
  return opts;
}

export function main(argv) {
  const opts = parseArgs(argv);
  if (opts.error) {
    process.stderr.write(`error: ${opts.error}\nusage: node scripts/install-skill.mjs [--check] [--source <file>] [--target <file>]\n`);
    return 2;
  }
  let source;
  try {
    source = readFileSync(opts.source, 'utf8');
  } catch {
    process.stderr.write(`error: skill source ${opts.source} is missing\n`);
    return 4;
  }
  if (opts.check) {
    let installed = null;
    try {
      installed = readFileSync(opts.target, 'utf8');
    } catch {
      installed = null;
    }
    if (installed === source) {
      process.stdout.write(`ok: ${opts.target} matches the repository source\n`);
      return 0;
    }
    process.stderr.write(`error: ${opts.target} ${installed === null ? 'is not installed' : 'differs from the repository source'}; run node scripts/install-skill.mjs\n`);
    return 1;
  }
  try {
    mkdirSync(dirname(opts.target), { recursive: true });
    writeFileSync(opts.target, source);
  } catch {
    process.stderr.write(`error: could not write ${opts.target}\n`);
    return 4;
  }
  process.stdout.write(`ok: installed ${opts.target}\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
