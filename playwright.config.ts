import { defineConfig, devices } from '@playwright/test';

const port = 4173;
const base = process.env.BASE_PATH ?? '/Blendon-Web/';
// Optional: run against an already installed Chromium instead of Playwright's own download.
const chromiumPath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  // The Scene view renders in software WebGL on CI-class machines; a slow one needs the headroom.
  timeout: 60_000,
  reporter: 'list',
  use: { baseURL: `http://localhost:${port}${base}`, trace: 'retain-on-failure' },
  webServer: {
    command: `pnpm build && pnpm preview --port ${port} --strictPort`,
    url: `http://localhost:${port}${base}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: chromiumPath ? { executablePath: chromiumPath } : {} },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
