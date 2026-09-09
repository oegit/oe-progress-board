// OE Progress Board — generator entry point.
//
// Step 1 stub: argument parsing, usage, exit codes and the --placeholder page. Step 6 (E2-T4)
// completes the --from and --repos-from modes; --help and --placeholder must keep working forever,
// because step 1's gate re-runs them.
//
// Exit codes (the interface): 0 ok · 2 usage error, nothing written · 4 output error.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

const PLACEHOLDER_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OE Progress Board</title>
<link rel="stylesheet" href="board.css">
</head>
<body>
<main id="main">
<h1>OE Progress Board</h1>
<p>No units are configured yet.</p>
</main>
</body>
</html>
`;

// Returns { help: true } | { placeholder: true, out } | { error: '<usage message>' }.
function parseArgs(argv) {
  const opts = { placeholder: false, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help') return { help: true };
    if (arg === '--placeholder') {
      opts.placeholder = true;
    } else if (arg === '--out') {
      if (argv[i + 1] === undefined) return { error: '--out needs a directory' };
      opts.out = argv[i + 1];
      i += 1;
    } else {
      return { error: `unknown or unsupported argument ${arg}` };
    }
  }
  if (!opts.placeholder) return { error: 'exactly one of --placeholder, --from, --repos-from must be given' };
  if (opts.out === null) return { error: '--out <dir> is required' };
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (opts.error) {
    process.stderr.write(`error: ${opts.error} (run with --help for usage)\n`);
    return 2;
  }
  try {
    mkdirSync(opts.out, { recursive: true });
    writeFileSync(join(opts.out, 'index.html'), PLACEHOLDER_HTML);
    writeFileSync(join(opts.out, 'board.css'), '');
  } catch {
    process.stderr.write(`error: could not write the output directory ${opts.out}\n`);
    return 4;
  }
  return 0;
}

process.exitCode = main();
