import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests against the production build (`npm run build` first; `npm run e2e` does both). The app projects use
 * `vite preview`; the `cloudflare` project serves the same build with `wrangler dev`, which applies public/_headers,
 * to check the CSP and caching headers. Without a downloaded Chromium (`npx playwright install chromium`), point
 * PW_CHROMIUM_PATH at a local Chrome, e.g. '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'.
 */
const CI = Boolean(process.env.CI);
const PREVIEW = 'http://localhost:4173/';
const WORKERS = 'http://127.0.0.1:8788/';
const HEADERS_SPEC = /headers\.spec\.ts$/;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
  },
  projects: [
    { name: 'desktop', testIgnore: HEADERS_SPEC, use: { ...devices['Desktop Chrome'], baseURL: PREVIEW } },
    { name: 'phone', testIgnore: HEADERS_SPEC, use: { ...devices['Pixel 7'], baseURL: PREVIEW } },
    { name: 'cloudflare', testMatch: HEADERS_SPEC, use: { ...devices['Desktop Chrome'], baseURL: WORKERS } },
  ],
  webServer: [
    {
      command: 'npx vite preview --port 4173 --strictPort',
      url: PREVIEW,
      reuseExistingServer: !CI,
    },
    {
      command: 'npx wrangler dev --ip 127.0.0.1 --port 8788',
      url: WORKERS,
      reuseExistingServer: !CI,
      env: { WRANGLER_SEND_METRICS: 'false' },
    },
  ],
});
