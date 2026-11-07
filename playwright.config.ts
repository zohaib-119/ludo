import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests: real browsers, real game server, real web app.
 * Ports differ from the dev defaults so a running dev setup doesn't interfere.
 * PW_CHROMIUM_PATH can point at an already-installed Chromium.
 */
const SERVER_PORT = 2580;
const WEB_PORT = 5180;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `PORT=${SERVER_PORT} npm run server`,
      url: `http://localhost:${SERVER_PORT}/healthz`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      cwd: 'apps/web',
      url: `http://localhost:${WEB_PORT}`,
      env: { VITE_SERVER_URL: `http://localhost:${SERVER_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
