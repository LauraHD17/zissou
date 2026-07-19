import { expect, test } from '@playwright/test';

test.describe('smoke', () => {
  test('app loads with vessel name + GPS pill + AIS rows + chart canvas', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      // External-API failures (NOAA tide refresh, NWS weather) are the test
      // environment's network, not app bugs — Chromium's console TEXT for a
      // failed resource has no URL, so judge by the resource's origin.
      const src = m.location()?.url ?? '';
      if (src && !src.includes('localhost')) return;
      // Tile 404s and OpenFreeMap network noise are environmental, not app bugs.
      if (/openfreemap|\.pbf|tile|maplibre|maine-nh-ma\.pmtiles/i.test(t)) return;
      errors.push(`console: ${t}`);
    });

    await page.goto('/');

    await expect(page.getByText('Sisu', { exact: true })).toBeVisible();
    await expect(page.getByText('GPS OK')).toBeVisible();

    // Mock fleet emits an AIS card within ~2s of load.
    await expect(page.locator('.ais-row').first()).toBeVisible({ timeout: 10_000 });

    // Chart canvas mounts (own-ship marker shows up after first SignalK delta).
    await expect(page.locator('.chart-map')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('view-mode toggle hides/shows columns', async ({ page }) => {
    await page.goto('/');

    // Default: split — both columns visible.
    await expect(page.locator('.ais-column')).toBeVisible();
    await expect(page.locator('.chart-column')).toBeVisible();

    // AIS only.
    await page.getByRole('button', { name: 'AIS', exact: true }).click();
    await expect(page.locator('.chart-column')).toBeHidden();

    // Chart only.
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await expect(page.locator('.ais-column')).toBeHidden();

    // Back to split.
    await page.getByRole('button', { name: 'Split', exact: true }).click();
    await expect(page.locator('.ais-column')).toBeVisible();
    await expect(page.locator('.chart-column')).toBeVisible();
  });

  test('AIS filter (All vs Active only) changes visible rows', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.ais-row').first()).toBeVisible({ timeout: 10_000 });

    const allCount = await page.locator('.ais-row').count();
    expect(allCount).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Active only' }).click();
    const activeCount = await page.locator('.ais-row').count();

    // Mock fleet has 3 archetypes that always fail "active" (stale, wild coords, positionless).
    expect(activeCount).toBeLessThan(allCount);
  });
});
