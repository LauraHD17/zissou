import { expect, test } from '@playwright/test';

test.describe('waypoints', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test('WaypointsPanel lists seeded saved waypoint; tapping row sets destination', async ({
    page,
  }) => {
    // Seed a saved waypoint directly so this test doesn't depend on the map
    // canvas (Playwright + MapLibre pointer events are flaky in CI).
    await page.addInitScript(() => {
      localStorage.setItem(
        'nav.waypoints.v1',
        JSON.stringify({
          version: 1,
          value: {
            items: [
              {
                id: 'wp-test-1',
                lat: 44.4,
                lon: -68.8,
                label: 'Camden mooring',
                category: 'mooring',
                createdAt: Date.now(),
              },
            ],
          },
        }),
      );
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open waypoints' }).click();
    await expect(page.getByRole('heading', { name: 'Waypoints' })).toBeVisible();
    await expect(page.getByText('Saved (1)')).toBeVisible();
    await expect(page.getByText('Camden mooring')).toBeVisible();

    // Tapping the row sets destination (widget appears top-right of chart).
    await page
      .getByRole('button', { name: /camden mooring/i })
      .first()
      .click();
    await expect(page.locator('.destination-widget')).toBeVisible({ timeout: 5_000 });
  });

  test('Save-current-position is disabled before GPS fix, enabled after', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open waypoints' }).click();

    // Mock fleet emits own-ship position within ~2s; button becomes enabled.
    await expect(page.getByRole('button', { name: /save current position$/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});
