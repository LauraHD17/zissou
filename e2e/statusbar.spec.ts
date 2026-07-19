import { expect, test } from '@playwright/test';

test.describe('StatusBar', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test('Settings panel updates the nameplate', async ({ page }) => {
    // Note: localStore round-trip persistence is covered in Vitest
    // (src/storage/localStore.test.ts). This test validates the UI flow:
    // open Settings, type a name, Save → nameplate updates.
    await page.goto('/');
    await page.getByRole('button', { name: 'Open settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    await page.getByLabel('Boat name').fill('Nautilus');
    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(page.locator('.statusbar__nameplate')).toHaveText('Nautilus');
  });

  test('MOB two-tap confirm activates and auto-switches to chart', async ({ page }) => {
    await page.goto('/');
    // Default view is split.
    await expect(page.locator('.chart-column')).toBeVisible();
    await expect(page.locator('.ais-column')).toBeVisible();

    // Tap MOB → confirm panel.
    await page.getByRole('button', { name: 'Man overboard. Tap to confirm.' }).click();
    await expect(page.getByRole('heading', { name: 'Man overboard' })).toBeVisible();

    // Confirm.
    await page.getByRole('button', { name: /confirm — drop mob waypoint/i }).click();

    // Button becomes clear-variant.
    await expect(page.getByRole('button', { name: /mob active/i })).toBeVisible();
    // Auto-switched to chart-only view.
    await expect(page.locator('.ais-column')).toBeHidden();
    await expect(page.locator('.chart-column')).toBeVisible();
  });

  test('theme toggle opens picker and applies Night mode', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /display mode:/i }).click();
    await expect(page.getByRole('heading', { name: 'Display mode' })).toBeVisible();

    // Radio's accessible name includes the description; match by text.
    await page.getByText('Night', { exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  });
});

// Regression: the bar's swipe-collapse must ignore touches inside an open
// slide panel. Scrolling Settings down (finger up) used to read as swipe-up,
// collapse the bar, and UNMOUNT the panel mid-read — reported repeatedly
// from the water before the cause was found.
test.describe('collapse gesture vs slide panels', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('touch-scrolling the Settings panel neither closes it nor collapses the bar', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open settings and help' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 200, y: 600 }],
    });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 200, y: 600 - i * 40 }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
