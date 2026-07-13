import { expect, test } from '@playwright/test';

// The vessel detail panel is shared: AIS list rows and chart markers both
// open the same app-level SlidePanel (VesselDetailHost + vesselSelectionStore).
test.describe('AIS detail panel', () => {
  test('tapping an AIS list row opens the detail panel; Escape closes it', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.ais-row--tappable').first()).toBeVisible({ timeout: 10_000 });

    await page.locator('.ais-row--tappable .ais-row__btn').first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('#ais-detail-title')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('panel works in AIS-only mode (no chart mounted)', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'AIS', exact: true }).click();
    await expect(page.locator('.ais-row--tappable').first()).toBeVisible({ timeout: 10_000 });

    await page.locator('.ais-row--tappable .ais-row__btn').first().click();
    await expect(page.getByRole('dialog').locator('#ais-detail-title')).toBeVisible();

    // Tap outside (overlay) also closes.
    await page.locator('.slide-panel-overlay').click({ position: { x: 10, y: 10 } });
    await expect(page.getByRole('dialog')).toBeHidden();
  });
});
