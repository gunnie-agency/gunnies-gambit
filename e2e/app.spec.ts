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

test('practising my mistakes after a review finds the mate I missed', async ({ page }) => {
  await page.goto('./');
  await page.locator('#modeSeg').getByRole('button', { name: 'Analyse' }).click();
  await page.locator('#sideSeg').getByRole('button', { name: 'White' }).click();
  // 4. Qg4 hangs the queen and misses 4. Qxf7#.
  for (const move of ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qg4', 'Nxg4']) {
    await page.locator('#moveInput').fill(move);
    await page.locator('#moveInput').press('Enter');
  }
  await page.locator('#reviewBtn').click();
  await expect(page.locator('#reviewProgressText')).toHaveText('Every move analysed.', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Practise my mistakes' }).click();

  const message = page.locator('#reviewPracticeText');
  const skip = page.locator('#reviewPractice').getByRole('button', { name: 'Skip' });
  // Any earlier mistake of White's comes first; Black's are never in the list.
  while (!(await message.textContent())?.includes('you played Qg4')) await skip.click();
  await expect(page.locator('#reviewMove')).toHaveText('Find a better move');
  // A typed move the review never searched is searched now; a3 still leaves the queen hanging.
  await page.locator('#reviewPracticeInput').fill('a3');
  await page.locator('#reviewPracticeInput').press('Enter');
  await expect(message).toHaveText('a3: not quite, try again.', { timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Show the best move' })).toBeVisible();
  await square(page, 'h5').click();
  await square(page, 'f7').click();
  await expect(message).toHaveText(/^Good: Qxf7# is the engine’s best move\. In the game you played Qg4\./);
  await page
    .locator('#reviewPractice')
    .getByRole('button', { name: /^(Next|See the result)$/ })
    .click();
  while (await skip.isVisible()) await skip.click();
  await expect(page.locator('#reviewMove')).toHaveText(/^You found 1 of \d+$/);
  await page.getByRole('button', { name: 'Back to the review' }).click();
  await expect(page.getByRole('button', { name: 'Practise my mistakes' })).toBeFocused();
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

test("How to play: a Black-to-move puzzle is solved from Black's side and stays solved", async ({ page }) => {
  await page.goto('./how-to-play');
  const lesson = page.locator('[data-lesson="skewer"]');
  const message = lesson.locator('.lesson-msg');
  const progress = page.locator('#tactics .lesson-progress');
  await expect(progress).toHaveText(/^0 of \d+ solved$/);
  // Black is at the bottom, so h1 is the top-left square.
  await expect(lesson.locator('[data-sq]').first()).toHaveAttribute('data-sq', 'h1');
  await lesson.locator('[data-sq="a4"]').click();
  await lesson.locator('[data-sq="c6"]').click();
  await expect(message).toHaveText('White answered Ke3. Your move.');
  await lesson.locator('[data-sq="c6"]').click();
  await lesson.locator('[data-sq="h1"]').click();
  await expect(message).toHaveText(/^Solved\./);
  await expect(lesson.locator('.lesson-solved')).toBeVisible();
  await expect(progress).toHaveText(/^1 of \d+ solved$/);
  await page.reload();
  await expect(progress).toHaveText(/^1 of \d+ solved$/);
  await expect(lesson.locator('.lesson-solved')).toBeVisible();
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

const analyse = (page: Page) => page.locator('#modeSeg').getByRole('button', { name: 'Analyse' }).click();

async function typeMoves(page: Page, moves: string[]): Promise<void> {
  for (const move of moves) {
    await page.locator('#moveInput').fill(move);
    await page.locator('#moveInput').press('Enter');
  }
}

async function openTools(page: Page): Promise<void> {
  const tools = page.locator('details.tools');
  if (!(await tools.evaluate((d: HTMLDetailsElement) => d.open))) await tools.locator('summary').click();
}

async function loadFen(page: Page, fen: string): Promise<void> {
  await openTools(page);
  await page.locator('#fenInput').fill(fen);
  await page.locator('#loadFen').click();
}

test.describe('the promotion picker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await analyse(page);
  });

  test('closes when the mode changes, so no move is played for the computer', async ({ page }) => {
    await page.locator('#modeSeg').getByRole('button', { name: 'Play' }).click();
    await page.locator('#levelSelect').selectOption('max'); // thinks for 2 seconds before it moves
    await analyse(page);
    await loadFen(page, 'k7/8/8/8/8/8/4p3/K7 b - - 0 1');
    await square(page, 'e2').click();
    await square(page, 'e1').click();
    await expect(page.locator('#promo')).toBeVisible();
    await page.locator('#modeSeg').getByRole('button', { name: 'Play' }).click();
    await expect(page.locator('#promo')).toBeHidden({ timeout: 1000 });
  });

  test('closes when the side changes', async ({ page }) => {
    await loadFen(page, 'k7/8/8/8/8/8/4p3/K7 b - - 0 1');
    await square(page, 'e2').click();
    await square(page, 'e1').click();
    await expect(page.locator('#promo')).toBeVisible();
    await page.locator('#sideSeg').getByRole('button', { name: 'Black' }).click();
    await expect(page.locator('#promo')).toBeHidden();
    await expect(page.locator('#moves .m')).toHaveCount(0);
  });

  test('closes when a review starts', async ({ page }) => {
    await loadFen(page, 'k7/8/8/8/8/8/4p3/K7 w - - 0 1');
    await typeMoves(page, ['Kb2']);
    await square(page, 'e2').click();
    await square(page, 'e1').click();
    await expect(page.locator('#promo')).toBeVisible();
    await page.locator('#reviewBtn').click();
    await expect(page.locator('#promo')).toBeHidden();
    await page.locator('#reviewExit').click();
    await expect(page.locator('#moves .m')).toHaveText(['Kb2']);
  });
});

test.describe('lines in Analyse', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await analyse(page);
  });

  test('playing the move that followed again keeps the rest of the line', async ({ page }) => {
    await typeMoves(page, ['e4', 'e5', 'Nf3', 'Nc6']);
    await page.locator('#moves').getByRole('button', { name: '1. e4' }).click();
    await typeMoves(page, ['e5']);
    await expect(page.locator('#moves .m')).toHaveText(['e4', 'e5', 'Nf3', 'Nc6']);
    await expect(page.locator('#moves [aria-current="true"]')).toHaveAccessibleName(/^1… e5/);
    await expect(page.locator('#moveHint')).not.toContainText('New line');
  });
});
