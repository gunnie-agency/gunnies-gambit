import { defineConfig, devices } from '@playwright/test';

/**
 * The README screenshots (`npm run screenshots`), kept out of `npm run e2e`: its file name does not end in .spec.ts,
 * so the main config never picks it up. It builds nothing; run `npm run build` first. Like the e2e tests it serves
 * `dist/` with `vite preview` and takes PW_CHROMIUM_PATH for a local Chrome.
 */
// Its own port, so a preview left running for the e2e tests (of this or another checkout) is never reused.
const PREVIEW = 'http://localhost:4183/';

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'screenshots.ts',
  workers: 1,
  timeout: 120_000,
  reporter: [['list']],
  use: {
    baseURL: PREVIEW,
    colorScheme: 'dark',
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
  },
  projects: [
    {
      name: 'phone',
      grep: /@phone/,
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
    },
    {
      name: 'desktop',
      grep: /@desktop/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
    },
  ],
  webServer: {
    command: 'npx vite preview --port 4183 --strictPort',
    url: PREVIEW,
    reuseExistingServer: false,
  },
});
