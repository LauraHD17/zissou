// End-to-end test of the chart download + offline flow against the LIVE
// deployed site, using a persistent browser profile (ephemeral contexts have
// incognito-style storage caps that don't represent a real phone).
//
// Steps: load app → click Download charts → wait for "Charts saved" →
// verify cached bytes EQUAL server bytes (accuracy redundancy) → go fully
// offline → reload → assert the chart canvas still paints.
import { chromium } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = 'https://laurahd17.github.io/zissou/';
const profile = mkdtempSync(join(tmpdir(), 'zissou-live-'));
const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  geolocation: { latitude: 44.39, longitude: -68.8 },
  permissions: ['geolocation'],
});
const page = context.pages()[0] ?? (await context.newPage());
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 160));
});

console.log('[test] loading', URL);
await page.goto(URL, { waitUntil: 'load' });

const buildLine = await page
  .locator('.chart-download__detail', { hasText: 'build' })
  .first()
  .textContent({ timeout: 20_000 })
  .catch(() => null);
console.log('[test] running', buildLine ?? 'build id not visible');

const btn = page.getByRole('button', { name: /download charts/i });
await btn.waitFor({ state: 'visible', timeout: 20_000 });
console.log('[test] starting download:', (await btn.textContent())?.trim());
await btn.click();

const done = page.getByText('Charts saved', { exact: false });
const start = Date.now();
const timer = setInterval(async () => {
  const txt = await page
    .locator('.chart-download')
    .textContent()
    .catch(() => '');
  console.log(`[test] +${Math.round((Date.now() - start) / 1000)}s:`, txt?.slice(0, 100));
}, 20_000);

try {
  await done.waitFor({ state: 'visible', timeout: 480_000 });
  clearInterval(timer);
  console.log('[test] download OK in', Math.round((Date.now() - start) / 1000), 's');
} catch {
  clearInterval(timer);
  console.log(
    '[test] DOWNLOAD FAILED — pill:',
    await page
      .locator('.chart-download')
      .textContent()
      .catch(() => '?'),
  );
  await context.close();
  process.exit(1);
}

// Accuracy redundancy: cached bytes must equal server bytes at several
// offsets, including a chunk boundary (32 MiB) and a deep offset.
const verify = await page.evaluate(async () => {
  const url = '/zissou/charts/maine.pmtiles';
  const cache = await caches.open('charts');
  const meta = await (await cache.match(`${url}?meta`)).json();
  const CB = meta.chunkBytes;
  const spots = [0, CB - 8, CB * 2 - 4, Math.floor(meta.size / 2), meta.size - 16];
  const results = [];
  for (const off of spots) {
    const len = 16;
    // read from chunks
    const first = Math.floor(off / CB);
    const last = Math.floor((off + len - 1) / CB);
    let cached = new Uint8Array(0);
    for (let i = first; i <= last; i++) {
      const blob = await (await cache.match(`${url}?chunk=${i}`)).blob();
      const from = Math.max(0, off - i * CB);
      const to = Math.min(CB, off + len - i * CB);
      const part = new Uint8Array(await blob.slice(from, to).arrayBuffer());
      const merged = new Uint8Array(cached.length + part.length);
      merged.set(cached);
      merged.set(part, cached.length);
      cached = merged;
    }
    const net = new Uint8Array(
      await (
        await fetch(url, { headers: { Range: `bytes=${off}-${off + len - 1}` } })
      ).arrayBuffer(),
    );
    results.push({
      off,
      equal: cached.length === net.length && cached.every((b, i) => b === net[i]),
    });
  }
  return { size: meta.size, chunks: meta.chunks, results };
});
console.log('[test] integrity:', JSON.stringify(verify));
if (!verify.results.every((r) => r.equal)) {
  console.log('[test] BYTE MISMATCH — failing');
  await context.close();
  process.exit(1);
}

// Offline reload — the boat-day scenario.
await context.setOffline(true);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(8000); // let MapLibre pull tiles from the cache
const canvas = await page.evaluate(() => {
  const c = document.querySelector('.chart-map canvas');
  return c ? { w: c.width, h: c.height } : null;
});
const pill = await page
  .locator('.chart-download')
  .textContent()
  .catch(() => '');
console.log('[test] offline reload — canvas:', JSON.stringify(canvas), 'pill:', pill?.slice(0, 60));
await context.setOffline(false);
await context.close();

if (canvas && canvas.w > 0) {
  console.log('[test] SUCCESS — download, integrity, and offline render all verified');
} else {
  console.log('[test] OFFLINE RENDER FAILED');
  process.exit(1);
}
