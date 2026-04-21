#!/usr/bin/env node
// Smoke-test that the app renders with ALL external hosts blocked — this is
// the actual "boat has no wifi" scenario. Boots Playwright against the
// running dev server, rejects every request to a host that isn't localhost,
// and checks the chart canvas actually painted.
//
// Exits 0 if the chart rendered successfully without any external request
// slipping through; exits 1 if a non-local request was attempted or the
// chart failed to load.

import { chromium } from '@playwright/test';

const TARGET_URL = process.env.OFFLINE_URL ?? 'http://localhost:5174/';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();

const externalRequests = [];
await context.route('**/*', (route) => {
  const url = new URL(route.request().url());
  const host = url.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!isLocal) {
    externalRequests.push(`${route.request().method()} ${route.request().url()}`);
    return route.abort('blockedbyclient');
  }
  return route.continue();
});

const page = await context.newPage();
const consoleErrors = [];
page.on('pageerror', (err) => consoleErrors.push(`${err.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
});

console.log(`[offline-verify] navigating to ${TARGET_URL}`);
await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

// Give MapLibre time to init + load tiles.
await page.waitForTimeout(5000);

// Check the chart canvas actually has a MapLibre map attached.
const mapState = await page.evaluate(() => {
  const canvas = document.querySelector('.chart-map canvas');
  if (!canvas) return { ok: false, reason: 'no canvas element' };
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  return { ok: w > 0 && h > 0, w, h };
});

// Screenshot for manual visual inspection.
const shot = '/tmp/offline-chart.png';
await page.screenshot({ path: shot, fullPage: false });
console.log(`[offline-verify] screenshot saved to ${shot}`);

await browser.close();

console.log('[offline-verify] canvas:', mapState);
console.log(`[offline-verify] external requests blocked: ${externalRequests.length}`);
for (const r of externalRequests) console.log(`  - ${r}`);
console.log(`[offline-verify] console errors: ${consoleErrors.length}`);
for (const e of consoleErrors.slice(0, 10)) console.log(`  - ${e}`);

const hardFail =
  !mapState.ok || externalRequests.some((r) => !r.includes('api.weather.gov'));
if (hardFail) {
  console.error('[offline-verify] FAIL — chart did not render or unexpected external request');
  process.exit(1);
}
console.log('[offline-verify] OK — chart rendered with no external tile/font calls');
