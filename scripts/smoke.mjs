// OE Progress Board — live smoke test: is the PUBLISHED page correct, not merely reachable?
//
// node scripts/smoke.mjs [--url <url>]
// Exit 0 every assertion passed · 1 an assertion failed (each printed as `assertion failed: <name>`)
// · 2 usage · 3 the URL could not be fetched. A 404 and a broken assertion are different problems
// and never share an exit code.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPrivateInfo } from './validate.mjs';

export const DEFAULT_URL = 'https://oegit.github.io/oe-progress-board/';
const MANIFEST = fileURLToPath(new URL('../manifest.json', import.meta.url));

function parseArgs(argv) {
  let url = DEFAULT_URL;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--url' && argv[i + 1] !== undefined && !argv[i + 1].startsWith('-')) {
      url = argv[i + 1];
      i += 1;
    } else {
      return { error: `unknown or incomplete argument ${argv[i]}` };
    }
  }
  return { url };
}

const count = (text, needle) => text.split(needle).length - 1;

// Every assertion as [name, predicate(html)]. Names are the contract printed on failure.
export function assertions(unitCount) {
  return [
    ['html lang="en"', (html) => html.includes('<html lang="en">')],
    ['exactly one <h1>', (html) => count(html, '<h1') === 1],
    ['contains OE Progress Board', (html) => html.includes('OE Progress Board')],
    ['contains Data as of', (html) => html.includes('Data as of')],
    [`one card per manifest unit (${unitCount})`, (html) => count(html, '<li class="card') === unitCount],
    ['no private string', (html) => findPrivateInfo(html) === null],
  ];
}

export function check(html, unitCount) {
  return assertions(unitCount).filter(([, ok]) => !ok(html)).map(([name]) => name);
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.error) {
    process.stderr.write(`error: ${opts.error}\nusage: node scripts/smoke.mjs [--url <url>]\n`);
    return 2;
  }
  let html;
  try {
    const response = await fetch(opts.url, { headers: { 'User-Agent': 'oe-progress-board-smoke' } });
    if (response.status !== 200) {
      process.stderr.write(`error: could not fetch ${opts.url} (HTTP ${response.status})\n`);
      return 3;
    }
    html = await response.text();
  } catch {
    process.stderr.write(`error: could not fetch ${opts.url} (network)\n`);
    return 3;
  }
  const unitCount = JSON.parse(readFileSync(MANIFEST, 'utf8')).length;
  const failed = check(html, unitCount);
  for (const name of failed) {
    const detail = name === 'no private string' ? ` (found ${findPrivateInfo(html)})` : '';
    process.stderr.write(`assertion failed: ${name}${detail}\n`);
  }
  if (failed.length) return 1;
  process.stdout.write(`ok: ${assertions(unitCount).length} assertions passed against ${opts.url}\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
