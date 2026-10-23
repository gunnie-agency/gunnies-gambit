import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Cumulative layout shift while a page loads, at a phone and a desktop size: the web fonts arriving, the app script
 * filling in the settings, the move list and the engine's advice must not move what is already on screen. The pages
 * are built so the score is 0; the bound leaves room for sub-pixel noise only.
 *
 * The sizes are set here rather than taken from the projects: Chrome's mobile emulation (the phone project) does not
 * report the shift a late web font causes, so a plain 375px window, the narrowest common phone and where the header
 * and the advice panel are tightest, is what catches it. The desktop project runs both sizes.
 */
const MAX_CLS = 0.01;

/** A returning Analyse user: 30 moves (60 plies) of legal play saved, the evaluation on. */
const SAVED_ANALYSIS = {
  mode: 'analysis',
  showEval: true,
  startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moves: [
    'b1a3 b8c6 a3b5 a7a6 b5a7 a8b8 a2a4 e7e5 h2h3 g8e7 c2c4 f7f6 a4a5 e7d5 e2e3 b8a8 d1g4 a8b8 a1b1 f8e7',
    'g4g5 b7b5 g5f6 h8g8 f2f3 b8b7 f6g5 e8f8 d2d4 d8e8 e1d2 b7a7 d2d1 d5f6 g5f6 g7f6 d4d5 e7d8 e3e4 c6b8',
    'c1h6 f8f7 f1d3 c7c6 f3f4 g8g4 b2b4 e8e7 d3c2 a7c7 c2a4 g4g5 d1c1 b5c4 g1e2 c7a7 a4d1 a7a8 c1c2 a8a7',
  ]
    .join(' ')
    .split(' '),
};

/** Starts summing layout shifts that no user input caused, from before the page's first paint. */
async function observeLayoutShift(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { cls: number };
    w.cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!entry.hadRecentInput) w.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

/** The shift so far, once the fonts are in and two more frames have been laid out and reported. */
async function layoutShift(page: Page): Promise<number> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
  });
  return page.evaluate(() => (window as unknown as { cls: number }).cls);
}

const SIZES = {
  phone: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
};

for (const [name, viewport] of Object.entries(SIZES)) {
  test.describe(`layout shift on load, ${name} size`, () => {
    test.use({ viewport });
    // Not in the phone project: its mobile emulation hides the font shift (see above), and the desktop project already
    // runs this size.
    test.skip(({ isMobile }) => isMobile, 'the desktop project runs both sizes');

    test.beforeEach(async ({ page }) => {
      await observeLayoutShift(page);
    });

    test('the app, first visit', async ({ page }) => {
      await page.goto('./');
      await expect(page.locator('#engineChip')).toHaveClass(/\bready\b/, { timeout: 20_000 });
      expect(await layoutShift(page)).toBeLessThan(MAX_CLS);
    });

    test('the app, returning Analyse user with a saved game', async ({ page }) => {
      await page.addInitScript((saved) => {
        localStorage.setItem('gunnies-gambit.v2', JSON.stringify(saved));
      }, SAVED_ANALYSIS);
      await page.goto('./');
      await expect(page.locator('#moves .m')).toHaveCount(SAVED_ANALYSIS.moves.length);
      await expect(page.locator('#lines li')).toHaveCount(3, { timeout: 20_000 });
      expect(await layoutShift(page)).toBeLessThan(MAX_CLS);
    });

    test('How to play', async ({ page }) => {
      await page.goto('./how-to-play');
      await expect(page.locator('.learn h1')).toBeVisible();
      expect(await layoutShift(page)).toBeLessThan(MAX_CLS);
    });
  });
}
