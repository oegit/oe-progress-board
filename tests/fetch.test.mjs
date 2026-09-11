// Both fetch modes. API mode runs against a stub fetchImpl: no test here touches the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { API_VERSION, USER_AGENT, checkManifest, fetchFromApi, fetchFromDir, readManifest } from '../scripts/fetch.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = readManifest(join(root, 'manifest.json'));

// A stub fetch: `plan` maps a repo to { status, content? }; `calls` records every request.
function stub(plan) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const repo = manifest.find((e) => url === `https://api.github.com/repos/${e.repo}/contents/progress.json`)?.repo;
    const entry = plan[repo] ?? { status: 404 };
    return { status: entry.status, json: async () => ({ content: entry.content, encoding: 'base64' }) };
  };
  return { fetchImpl, calls };
}
const wrap = (text) => Buffer.from(text, 'utf8').toString('base64').replace(/(.{60})/g, '$1\n');

test('manifest.json has 8 valid entries with the board first', () => {
  assert.equal(manifest.length, 8);
  assert.equal(manifest[0].slug, 'oe-progress-board');
  assert.equal(new Set(manifest.map((e) => e.slug)).size, 8);
});

test('readManifest / checkManifest name the offending index', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oe-manifest-'));
  const bad = join(dir, 'manifest.json');
  writeFileSync(bad, JSON.stringify([manifest[0], { slug: 'x', repo: 'someone/x', kind: 'agent' }]));
  assert.throws(() => readManifest(bad), (e) => e.name === 'SourceError' && /entry 1/.test(e.message));
  assert.throws(() => readManifest(join(dir, 'missing.json')), { name: 'SourceError' });
  writeFileSync(bad, '{ not json');
  assert.throws(() => readManifest(bad), { name: 'SourceError' });
  assert.throws(() => checkManifest([manifest[0], manifest[0]]), /entry 1: duplicate slug/);
  assert.throws(() => checkManifest([{ slug: 'x', repo: 'oegit/x', kind: 'tool' }]), /entry 0: kind/);
  assert.throws(() => checkManifest({}), { name: 'SourceError' });
});

test('fetchFromDir over the fixtures: 8 results, 4 found, 4 missing, no throw', () => {
  const results = fetchFromDir(join(root, 'tests/fixtures/units'), manifest);
  assert.equal(results.length, 8);
  assert.equal(results.filter((r) => r.state === 'found').length, 4);
  assert.equal(results.filter((r) => r.state === 'missing').length, 4);
  assert.deepEqual(results.map((r) => r.slug), manifest.map((e) => e.slug));
  const ugc = results.find((r) => r.slug === 'agent-ugc');
  assert.equal(JSON.parse(ugc.raw).slug, 'agent-ugc');
  assert.equal(results.find((r) => r.slug === 'oe-progress-board').raw, undefined);
});

test('fetchFromApi: 404 is missing and the walk continues', async () => {
  const { fetchImpl, calls } = stub({ 'oegit/agent-ugc': { status: 200, content: wrap('{"slug":"agent-ugc"}') } });
  const results = await fetchFromApi(manifest, 'token-value', fetchImpl);
  assert.equal(results.length, 8);
  assert.equal(calls.length, 8);
  assert.equal(results.filter((r) => r.state === 'missing').length, 7);
  assert.equal(results.find((r) => r.slug === 'agent-ugc').state, 'found');
});

test('fetchFromApi: 200 strips newlines and base64-decodes content into raw', async () => {
  const text = JSON.stringify({ slug: 'agent-ugc', note: 'long enough to wrap the base64 over several lines' });
  const content = wrap(text);
  assert.ok(content.includes('\n'));
  const { fetchImpl } = stub({ 'oegit/agent-ugc': { status: 200, content } });
  const results = await fetchFromApi(manifest, 'token-value', fetchImpl);
  assert.equal(results.find((r) => r.slug === 'agent-ugc').raw, text);
});

test('fetchFromApi sends the documented headers and never leaks the token in an error', async () => {
  const { fetchImpl, calls } = stub({});
  await fetchFromApi(manifest.slice(0, 1), 'secret-token-value', fetchImpl);
  const { headers } = calls[0].init;
  assert.equal(headers.Authorization, 'Bearer secret-token-value');
  assert.equal(headers.Accept, 'application/vnd.github+json');
  assert.equal(headers['X-GitHub-Api-Version'], API_VERSION);
  assert.equal(headers['User-Agent'], USER_AGENT);
  const denied = stub({ 'oegit/agent-ugc': { status: 403 } });
  await assert.rejects(fetchFromApi(manifest, 'secret-token-value', denied.fetchImpl), (e) => !e.message.includes('secret-token-value'));
});

test('fetchFromApi: 401, 403 and other statuses throw a named error with repo and status', async () => {
  for (const status of [401, 403, 500]) {
    const { fetchImpl } = stub({ 'oegit/agent-video-studio': { status } });
    await assert.rejects(
      fetchFromApi(manifest, 'token-value', fetchImpl),
      (e) => e.name === 'SourceError' && e.message.includes('oegit/agent-video-studio') && e.message.includes(String(status)),
    );
  }
  const network = async () => { throw new Error('boom'); };
  await assert.rejects(fetchFromApi(manifest, 'token-value', network), { name: 'SourceError' });
});

test('fetchFromApi with an empty token throws before any request', async () => {
  for (const token of ['', undefined, null]) {
    const { fetchImpl, calls } = stub({});
    await assert.rejects(fetchFromApi(manifest, token, fetchImpl), { name: 'SourceError', message: 'PROGRESS_READ_TOKEN is not set' });
    assert.equal(calls.length, 0);
  }
});
