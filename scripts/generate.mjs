// OE Progress Board — generator entry point. Everything else is a module it imports.
//
// The only module that reads process.env (PROGRESS_READ_TOKEN, --repos-from mode only) and the only
// one that writes to disk. The whole output is assembled in memory first and written last, so a
// source error exits 3 having written nothing: a failed fetch can never replace a good published
// board with a blank one.
//
// Exit codes (the interface): 0 ok · 2 usage error · 3 source error · 4 output error.
// --help and --placeholder are permanent: step 1's gate re-runs them forever.

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SourceError, fetchFromApi, fetchFromDir, readManifest } from './fetch.mjs';
import { computeBoard } from './compute.mjs';
import { render } from './render.mjs';

const STYLESHEET = fileURLToPath(new URL('../site/board.css', import.meta.url));
const MODES = ['--placeholder', '--from', '--repos-from'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const USAGE = `Usage: node scripts/generate.mjs [--placeholder | --from <dir> | --repos-from <file>] --out <dir>
                                 [--manifest <file>] [--now <YYYY-MM-DD>] [--help]

  --help              Print this usage and exit 0.
  --placeholder       Render a data-free page (title, explanation, no cards). PERMANENT flag: the
                      bootstrap deploy in step 1 uses it and step 1's gate re-runs it forever.
  --from <dir>        Local mode. Read <dir>/<slug>/progress.json for every manifest unit.
  --repos-from <file> API mode. Read the manifest at <file> and fetch each unit's progress.json over
                      the GitHub Contents API using PROGRESS_READ_TOKEN.
  --manifest <file>   Manifest path for --placeholder and --from. Default: manifest.json
  --out <dir>         Output directory. Required unless --help.
  --now <YYYY-MM-DD>  Clock override for staleness. Default: today.

Exactly one of --placeholder, --from, --repos-from must be given.

Exit: 0  wrote <out>/index.html, <out>/board.css and <out>/data/board.json
      2  usage error — nothing written
      3  source error — manifest missing or invalid, PROGRESS_READ_TOKEN unset in API mode, or a
         manifest repository could not be reached. NOTHING IS WRITTEN: a blank board is never
         published over a good one.
      4  output error — <out> could not be created or written
`;

const usageError = (message) => ({ error: message });

// Returns { help: true } | { mode, source, out, manifest, now } | { error }.
export function parseArgs(argv) {
  const opts = { mode: null, source: null, out: null, manifest: 'manifest.json', now: null };
  const value = (i, flag) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('-')) return null;
    return v;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help') return { help: true };
    if (MODES.includes(arg)) {
      if (opts.mode !== null) return usageError(`exactly one of ${MODES.join(', ')} must be given`);
      opts.mode = arg;
      if (arg !== '--placeholder') {
        opts.source = value(i, arg);
        if (opts.source === null) return usageError(`${arg} needs a value`);
        i += 1;
      }
    } else if (arg === '--out' || arg === '--manifest' || arg === '--now') {
      const v = value(i, arg);
      if (v === null) return usageError(`${arg} needs a value`);
      if (arg === '--now' && !DATE_RE.test(v)) return usageError('--now must be a YYYY-MM-DD date');
      opts[arg.slice(2)] = v;
      i += 1;
    } else {
      return usageError(`unknown or unsupported argument ${arg}`);
    }
  }
  if (opts.mode === null) return usageError(`exactly one of ${MODES.join(', ')} must be given`);
  if (opts.out === null) return usageError('--out <dir> is required');
  return opts;
}

const today = () => new Date().toISOString().slice(0, 10);

// Reads, fetches, computes and renders. Throws SourceError on a source problem; writes nothing.
async function build(opts, env, fetchImpl) {
  let manifest = [];
  let results = [];
  if (opts.mode === '--from') {
    manifest = readManifest(opts.manifest);
    let isDir = false;
    try {
      isDir = statSync(opts.source).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) throw new SourceError(`--from directory ${opts.source} does not exist`);
    results = fetchFromDir(opts.source, manifest);
  } else if (opts.mode === '--repos-from') {
    manifest = readManifest(opts.source);
    results = await fetchFromApi(manifest, env.PROGRESS_READ_TOKEN, fetchImpl);
  }
  const board = computeBoard({ manifest, results, now: opts.now ?? today(), generatedAt: new Date().toISOString() });
  return { html: render(board), json: `${JSON.stringify(board, null, 2)}\n` };
}

function write(out, artifacts) {
  const css = readFileSync(STYLESHEET, 'utf8');
  mkdirSync(join(out, 'data'), { recursive: true });
  writeFileSync(join(out, 'index.html'), artifacts.html);
  writeFileSync(join(out, 'board.css'), css);
  writeFileSync(join(out, 'data', 'board.json'), artifacts.json);
}

export async function main(argv, env = process.env, fetchImpl = globalThis.fetch) {
  const opts = parseArgs(argv);
  if (opts.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (opts.error) {
    process.stderr.write(`error: ${opts.error} (run with --help for usage)\n`);
    return 2;
  }
  let artifacts;
  try {
    artifacts = await build(opts, env, fetchImpl);
  } catch (error) {
    if (error instanceof SourceError) {
      process.stderr.write(`error: ${error.message}\n`);
      return 3;
    }
    process.stderr.write(`error: the build failed before writing (${error && error.name})\n`);
    return 4;
  }
  try {
    write(opts.out, artifacts);
  } catch {
    process.stderr.write(`error: could not write the output directory ${opts.out}\n`);
    return 4;
  }
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
