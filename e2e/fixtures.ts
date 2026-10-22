import { expect, test as base } from '@playwright/test';

/** Cloudflare Web Analytics: the beacon script and where it reports. The only third party the pages load. */
const ANALYTICS = /^https:\/\/(?:static\.)?cloudflareinsights\.com\//;

const isLocal = (url: URL) => url.hostname === 'localhost' || url.hostname === '127.0.0.1';

/**
 * Every test runs with the outside world cut off, so the suite never depends on, or counts visits at, another
 * site: the analytics beacon gets an empty answer and any other request off this machine fails. Tests that need an
 * outside answer (the game import) route it themselves. Each test also fails on any console error or uncaught
 * exception, except a failing analytics beacon (expected when a test goes offline).
 */
export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error' && !ANALYTICS.test(message.location().url)) errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route(
        (url) => !isLocal(url),
        (route) => route.abort('blockedbyclient'),
      );
      await page.route(ANALYTICS, (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
