import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const square = (page: Page, sq: string) => page.locator(`#board [data-sq="${sq}"]`);

test.describe('play and analyse', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
  });

  test('the engine loads', async ({ page }) => {
    await expect(page.locator('#engineChip')).toHaveClass(/\bready\b/);
    await expect(page.locator('#engineName')).toHaveText('Engine ready');
  });

  test('the computer answers a move', async ({ page }) => {
    await square(page, 'e2').click();
    await square(page, 'e4').click();
    const moves = page.locator('#moves .m');
    await expect(moves.first()).toHaveText('e4');
    await expect(moves).toHaveCount(2, { timeout: 20_000 });
    await expect(page.locator('#status')).toContainText('Your move');
  });

  test('Analyse shows a best move', async ({ page }) => {
    await page.locator('#modeSeg').getByRole('button', { name: 'Analyse' }).click();
    const best = page.locator('#bestSan');
    await expect(best).not.toHaveClass(/\bwait\b/, { timeout: 20_000 });
    await expect(best).toHaveText(/^[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8]|^O-O/);
    await expect(page.locator('#lines li')).not.toHaveCount(0);
  });
});

test.describe('the move list', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await page.locator('#modeSeg').getByRole('button', { name: 'Analyse' }).click();
    for (const move of ['e4', 'e5', 'Nf3']) {
      await page.locator('#moveInput').fill(move);
      await page.locator('#moveInput').press('Enter');
    }
  });

  test('steps back with the keyboard, and a move there starts a line that Undo takes back', async ({ page }) => {
    const moves = page.locator('#moves');
    const opening = page.locator('#opening');
    await expect(opening).not.toBeEmpty();
    const liveOpening = await opening.textContent();
    await moves.getByRole('button', { name: '2. Nf3' }).focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    const current = moves.locator('[aria-current="true"]');
    await expect(current).toHaveAccessibleName('1. e4');
    await expect(current).toBeFocused();
    await expect(page.locator('#status')).toContainText('After 1. e4');
    await expect(page.locator('#liveBtn')).toBeVisible();
    await expect(opening).not.toHaveText(liveOpening ?? ''); // the opening follows the shown position

    await page.locator('#moveInput').fill('c5');
    await page.locator('#moveInput').press('Enter');
    await expect(moves.locator('.m')).toHaveText(['e4', 'c5']);
    await page.locator('#undoBtn').click();
    await expect(moves.locator('.m')).toHaveText(['e4', 'e5', 'Nf3']);

    await page.locator('#liveBtn').click();
    await expect(current).toHaveAccessibleName('2. Nf3');
    await expect(page.locator('#liveBtn')).toBeHidden();
  });

  test('a review completes and keeps focus on a move picked with the keyboard', async ({ page }) => {
    await page.locator('#reviewBtn').click();
    const moves = page.locator('#moves');
    await moves.getByRole('button', { name: /^1… e5/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#reviewProgressText')).toHaveText('Every move analysed.', { timeout: 30_000 });
    const current = moves.locator('[aria-current="true"]');
    await expect(current).toHaveAccessibleName(/^1… e5/);
    await expect(current).toBeFocused();
  });

  test('downloads the game as PGN', async ({ page }) => {
    await page.locator('details.tools summary').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#downloadPgn').click()]);
    expect(download.suggestedFilename()).toMatch(/^chess-\d{4}-\d{2}-\d{2}-\d{4}\.pgn$/);
    const pgn = readFileSync(await download.path(), 'utf8');
    expect(pgn).toContain('[Event "Analysis"]');
    expect(pgn).toContain('[Result "*"]');
    expect(pgn).toMatch(/1\. e4 e5 2\. Nf3 \*\s*$/);
  });
});

test('the theme switch is remembered across a reload', async ({ page }) => {
  await page.goto('./');
  const root = page.locator('html');
  const button = page.locator('#themeBtn');
  await expect(root).not.toHaveAttribute('data-theme');
  await button.click();
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect(button).toHaveAttribute('aria-label', 'Switch to dark theme');
  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'light');
  await button.click();
  await expect(root).not.toHaveAttribute('data-theme');
});

test('How to play: a puzzle gives a hint and turns down a wrong move', async ({ page }) => {
  await page.goto('./how-to-play');
  const lesson = page.locator('[data-lesson="knight-fork"]');
  const message = lesson.locator('.lesson-msg');
  await lesson.getByRole('button', { name: 'Hint' }).click();
  await expect(message).toHaveText('Hint: move your knight.');
  await expect(lesson.locator('[data-sq="d5"]')).toHaveClass(/\bhint\b/);
  await lesson.locator('[data-sq="d5"]').click();
  await lesson.locator('[data-sq="b6"]').click();
  await expect(message).toHaveText(/^Not quite: Nb6 is not the move here/);
});

test('Your games lists finished games from Lichess', async ({ page }) => {
  const games = readFileSync('src/import/fixtures/lichess-drnykterstein.ndjson', 'utf8');
  await page.route('https://lichess.org/api/games/user/**', (route) =>
    route.fulfill({
      contentType: 'application/x-ndjson',
      body: games,
      headers: { 'access-control-allow-origin': '*' },
    }),
  );
  await page.goto('./');
  await page.locator('#importGames summary').click();
  await page.locator('#importUser').fill('DrNykterstein');
  await page.getByRole('button', { name: 'Show finished games' }).click();
  await expect(page.locator('#importStatus')).toContainText('finished games of DrNykterstein on Lichess');
  await page.locator('#importList button').first().click();
  await expect(page.locator('#review')).toBeVisible();
});

test('works offline once the service worker is installed', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.locator('#engineName')).toHaveText('Engine ready');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  const response = await page.reload();
  expect(response?.fromServiceWorker()).toBe(true);
  await expect(page.locator('#engineName')).toHaveText('Engine ready');
  await page.locator('#modeSeg').getByRole('button', { name: 'Analyse' }).click();
  await expect(page.locator('#bestSan')).not.toHaveClass(/\bwait\b/, { timeout: 20_000 });
  await page.goto('./how-to-play');
  await expect(page.locator('[data-lesson="start"] [data-sq="e1"]')).toBeVisible();
  await context.setOffline(false);
});
