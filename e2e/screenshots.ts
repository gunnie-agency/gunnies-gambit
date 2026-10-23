import { mkdirSync, writeFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * The README screenshots in docs/screenshots/, taken in the dark theme from the production build
 * (`npm run screenshots`, see playwright.screenshots.config.ts). Each one seeds its game through the saved game in
 * localStorage, so it never depends on what the computer plays, and waits on the page's own text before it shoots.
 */
const OUT = 'docs/screenshots';

/** WebP quality for the browser's encoder: small files, and the board and text stay sharp. */
const QUALITY = 0.9;

/** The saved game the app opens with: only the fields that differ from the defaults (see src/state.ts). */
async function seedGame(page: Page, game: { mode: 'play' | 'analysis'; moves: string[] }): Promise<void> {
  await page.addInitScript((saved) => localStorage.setItem('gunnies-gambit.v2', JSON.stringify(saved)), game);
}

/** Takes the viewport as PNG and has the browser encode it as WebP, so no image tool is needed. */
async function shoot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ animations: 'disabled' });
  const webp = await page.evaluate(
    async ({ base64, quality }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/webp', quality });
      const out = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (const byte of out) binary += String.fromCharCode(byte);
      return btoa(binary);
    },
    { base64: png.toString('base64'), quality: QUALITY },
  );
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}.webp`, Buffer.from(webp, 'base64'));
}

/** Giuoco Piano: 1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6, White to move. */
const ITALIAN = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6'];

/** The Najdorf, English Attack: 1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3. */
const NAJDORF = ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6', 'c1e3'];

/** The Blackburne Shilling trap: White takes the e5 pawn and the f7 pawn, and is mated on move 7. */
const SHILLING = [
  ...['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'c6d4', 'f3e5', 'd8g5'],
  ...['e5f7', 'g5g2', 'h1f1', 'g2e4', 'c4e2', 'd4f3'],
];

/** Scrolls the page so the element starts a little below the top of the viewport. */
async function scrollToTop(locator: Locator): Promise<void> {
  await locator.evaluate((el) => scrollTo(0, el.getBoundingClientRect().top + scrollY - 16));
}

async function reviewGame(page: Page): Promise<void> {
  await seedGame(page, { mode: 'analysis', moves: SHILLING });
  await page.goto('./');
  // The game ends in mate, so the result panel's Review game shows instead of the one under the moves.
  await page.locator('#reviewStart').click();
  await expect(page.locator('#reviewProgressText')).toHaveText('Every move analysed.', { timeout: 60_000 });
}

test('Play, with a hint @phone', async ({ page }) => {
  await seedGame(page, { mode: 'play', moves: ITALIAN });
  await page.goto('./');
  await expect(page.locator('#status')).toContainText('Your move');
  await page.locator('#hintBtn').click();
  await expect(page.locator('#bestSan')).not.toHaveClass(/\bwait\b/, { timeout: 30_000 });
  await expect(page.locator('#arrows polygon')).not.toHaveCount(0);
  await shoot(page, 'play');
});

test('Analyse, a Najdorf @desktop', async ({ page }) => {
  await seedGame(page, { mode: 'analysis', moves: NAJDORF });
  await page.goto('./');
  await expect(page.locator('#opening')).toContainText('Najdorf');
  await expect(page.locator('#bestMeta')).toContainText('(done)', { timeout: 30_000 });
  await expect(page.locator('#lines li')).toHaveCount(3);
  await shoot(page, 'analyse');
});

test('Review, on the worst blunder @desktop', async ({ page }) => {
  await reviewGame(page);
  const move = page.locator('#reviewMove');
  const next = page.locator('#reviewNav [data-nav="mistake"]');
  await next.click();
  while (!(await move.textContent())?.includes('Nxf7')) await next.click();
  await shoot(page, 'review');
});

test('Practise my mistakes @phone', async ({ page }) => {
  await reviewGame(page);
  await page.getByRole('button', { name: 'Practise my mistakes' }).click();
  await expect(page.locator('#reviewMove')).toHaveText('Find a better move');
  await scrollToTop(page.locator('#status'));
  await shoot(page, 'practise');
});

test('How to play, a puzzle with its hint @phone', async ({ page }) => {
  await page.goto('./how-to-play');
  const lesson = page.locator('[data-lesson="knight-fork"]');
  await lesson.getByRole('button', { name: 'Hint' }).click();
  await expect(lesson.locator('[data-sq="d5"]')).toHaveClass(/\bhint\b/);
  await scrollToTop(page.locator('.lesson-row', { has: lesson }));
  await shoot(page, 'how-to-play');
});
