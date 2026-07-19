import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Escape hatch for environments with a system Chromium but no
        // Playwright-downloaded browsers (e.g. sandboxed CI-less runners):
        //   CHROMIUM_EXECUTABLE=/path/to/chrome npm run test:e2e
        // Unset (the normal case, incl. GitHub CI) → Playwright's own build.
        launchOptions: process.env.CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
          : {},
      },
    },
  ],
});
