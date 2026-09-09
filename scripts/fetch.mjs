// OE Progress Board — the first hop of the pipeline: manifest → one raw report text per unit.
//
// Three exports and no environment access. `fetchFromDir` is local mode (fixtures, dogfood);
// `fetchFromApi` is CI mode and takes its `fetch` implementation as a parameter so the tests never
// touch the network. A missing report is data (`state: "missing"`), never an error; a manifest
// problem or a transport/auth failure throws a SourceError, which generate.mjs maps to exit 3.

import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KINDS } from './validate.mjs';

const SLUG_RE = /^[a-z0-9-]+$/;
const REPO_RE = /^oegit\/[a-z0-9-]+$/;
export const API_VERSION = '2022-11-28';
export const USER_AGENT = 'oe-progress-board';

export class SourceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SourceError';
  }
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Structural check of a parsed manifest. Throws a SourceError naming the offending index.
export function checkManifest(manifest, label = 'manifest') {
  if (!Array.isArray(manifest)) throw new SourceError(`${label} must be a JSON array`);
  const seen = new Set();
  manifest.forEach((entry, i) => {
    if (!isObject(entry)) throw new SourceError(`${label} entry ${i} must be an object`);
    if (typeof entry.slug !== 'string' || !SLUG_RE.test(entry.slug)) {
      throw new SourceError(`${label} entry ${i}: slug must match ${SLUG_RE}`);
    }
    if (seen.has(entry.slug)) throw new SourceError(`${label} entry ${i}: duplicate slug ${entry.slug}`);
    seen.add(entry.slug);
    if (typeof entry.repo !== 'string' || !REPO_RE.test(entry.repo)) {
      throw new SourceError(`${label} entry ${i}: repo must match ${REPO_RE}`);
    }
    if (!KINDS.includes(entry.kind)) {
      throw new SourceError(`${label} entry ${i}: kind must be one of ${KINDS.join(', ')}`);
    }
  });
  return manifest;
}

export function readManifest(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new SourceError(`manifest ${file} could not be read`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SourceError(`manifest ${file} is not valid JSON`);
  }
  return checkManifest(parsed, `manifest ${file}`);
}

// Local mode: <dir>/<slug>/progress.json per entry. A missing file is `missing`, not an error.
export function fetchFromDir(dir, manifest) {
  return manifest.map(({ slug }) => {
    try {
      return { slug, state: 'found', raw: readFileSync(join(dir, slug, 'progress.json'), 'utf8') };
    } catch (error) {
      if (error && error.code === 'ENOENT') return { slug, state: 'missing' };
      throw new SourceError(`${slug}: progress.json could not be read from ${dir}`);
    }
  });
}

// API mode: one GET /repos/{repo}/contents/progress.json per entry through the injected fetchImpl.
export async function fetchFromApi(manifest, token, fetchImpl) {
  if (typeof token !== 'string' || token === '') throw new SourceError('PROGRESS_READ_TOKEN is not set');
  if (typeof fetchImpl !== 'function') throw new SourceError('a fetch implementation is required');
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': API_VERSION,
    'User-Agent': USER_AGENT,
  };
  const results = [];
  for (const { slug, repo } of manifest) {
    const url = `https://api.github.com/repos/${repo}/contents/progress.json`;
    let response;
    try {
      response = await fetchImpl(url, { headers });
    } catch {
      throw new SourceError(`${repo}: the request could not be completed (network)`);
    }
    if (response.status === 404) {
      results.push({ slug, state: 'missing' });
    } else if (response.status === 200) {
      const body = await response.json();
      if (!isObject(body) || typeof body.content !== 'string') {
        throw new SourceError(`${repo}: HTTP 200 without a content field`);
      }
      const raw = Buffer.from(body.content.replace(/\n/g, ''), 'base64').toString('utf8');
      results.push({ slug, state: 'found', raw });
    } else if (response.status === 401 || response.status === 403) {
      throw new SourceError(`${repo}: HTTP ${response.status} — the token is missing, expired, or lacks Contents: read on this repository`);
    } else {
      throw new SourceError(`${repo}: HTTP ${response.status} — unexpected status`);
    }
  }
  return results;
}
