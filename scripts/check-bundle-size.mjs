#!/usr/bin/env node
// Compares built bundle sizes against `.bundle-baseline.json` limits.
// Exits non-zero on regressions so CI fails the PR.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(repoRoot, 'dist', 'assets');
const baseline = JSON.parse(readFileSync(join(repoRoot, '.bundle-baseline.json'), 'utf8'));
const limits = baseline.limits;

const files = readdirSync(distDir);

const measured = {
  main_js: pickLargest(files.filter((f) => f.startsWith('index-') && f.endsWith('.js'))),
  main_css: pickLargest(files.filter((f) => f.startsWith('index-') && f.endsWith('.css'))),
  chart_chunk_js: pickLargest(files.filter((f) => f.startsWith('ChartPage-') && f.endsWith('.js'))),
  chart_chunk_css: pickLargest(files.filter((f) => f.startsWith('ChartPage-') && f.endsWith('.css'))),
  total_js: files
    .filter((f) => f.endsWith('.js'))
    .reduce((sum, f) => sum + statSync(join(distDir, f)).size, 0),
};

function pickLargest(matches) {
  if (matches.length === 0) return 0;
  return Math.max(...matches.map((f) => statSync(join(distDir, f)).size));
}

let failed = false;
for (const [key, limit] of Object.entries(limits)) {
  const actual = measured[key] ?? 0;
  const pct = ((actual / limit) * 100).toFixed(0);
  const status = actual <= limit ? '✓' : '✗';
  console.log(`${status} ${key.padEnd(20)} ${formatBytes(actual)} / ${formatBytes(limit)} (${pct}%)`);
  if (actual > limit) failed = true;
}

if (failed) {
  console.error('\nBundle size limit exceeded. Investigate, then either trim or update .bundle-baseline.json deliberately.');
  process.exit(1);
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
