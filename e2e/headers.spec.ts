import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Runs against `wrangler dev`, which serves the build with the headers from public/_headers as Cloudflare does in
 * production. `vite preview` sends no CSP, so this is where a script, worker or request the policy blocks shows up.
 */

declare global {
  interface Window {
    cspViolations: string[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.cspViolations.push(`${e.effectiveDirective} blocked ${e.blockedURI || 'inline'}`);
    });
  });
});

const violations = (page: Page) => page.evaluate(() => window.cspViolations);

/** The sources the CSP allows for scripts. */
function scriptSources(csp: string): string[] {
  const directive = csp.split(';').find((part) => part.trim().startsWith('script-src '));
  return directive?.trim().split(/\s+/).slice(1) ?? [];
}

for (const path of ['./', './how-to-play']) {
  test(`every inline script on ${path} is allowed by its hash`, async ({ page }) => {
    const response = await page.goto(path);
    const csp = (await response?.headerValue('content-security-policy')) ?? '';
    const sources = scriptSources(csp);
    expect(sources).toContain("'self'");
    const inline = await page
      .locator('script:not([src]):not([type="application/ld+json"])')
      .evaluateAll((scripts) => scripts.map((script) => script.textContent ?? ''));
    expect(inline.length).toBeGreaterThan(0);
    for (const code of inline) {
      expect(sources).toContain(`'sha256-${createHash('sha256').update(code).digest('base64')}'`);
    }
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    expect(await violations(page)).toEqual([]);
  });
}

test('the engine and the game import run under the CSP', async ({ page }) => {
  const games = readFileSync('src/import/fixtures/lichess-drnykterstein.ndjson', 'utf8');
  await page.route('https://lichess.org/api/games/user/**', (route) =>
    route.fulfill({
      contentType: 'application/x-ndjson',
      body: games,
      headers: { 'access-control-allow-origin': '*' },
    }),
  );
  await page.goto('./');
  await page.locator('#modeSeg').getByRole('button', { name: 'Analyse' }).click();
  await expect(page.locator('#bestSan')).not.toHaveClass(/\bwait\b/, { timeout: 20_000 });
  await page.locator('#importGames summary').click();
  await page.locator('#importUser').fill('DrNykterstein');
  await page.getByRole('button', { name: 'Show finished games' }).click();
  await expect(page.locator('#importStatus')).toContainText('finished games of DrNykterstein on Lichess');
  expect(await violations(page)).toEqual([]);
});

test('the service worker is always revalidated', async ({ request }) => {
  const response = await request.get('./sw.js');
  expect(response.ok()).toBe(true);
  expect(response.headers()['cache-control']).toBe('no-cache');
});
