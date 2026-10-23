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

  test('a typed move may be in lower case', async ({ page }) => {
    await page.locator('#modeSeg').getByRole('button', { name: 'Analyse' }).click();
    await page.locator('#moveInput').fill('nf3');
    await page.locator('#moveInput').press('Enter');
    await expect(page.locator('#moves .m')).toHaveText(['Nf3']);
  });

  test('the computer answers a move', async ({ page }) => {
    await square(page, 'e2').click();
    await square(page, 'e4').click();
    const moves = page.locator('#moves .m');
    await expect(moves.first()).toHaveText('e4');
    await expect(moves).toHaveCount(2, { timeout: 20_000 });
    await expect(page.locator('#status')).toContainText('Your move');
  });

  test('a hint in Play shows the move without the search depth', async ({ page }) => {
    await page.locator('#hintBtn').click();
    await expect(page.locator('#bestSan')).not.toHaveClass(/\bwait\b/, { timeout: 20_000 });
    await expect(page.locator('#bestMeta')).toHaveText('The engine’s suggestion');
  });

  test('Analyse shows a best move, worded as analysis of the position', async ({ page }) => {
    await page.locator('#modeSeg').getByRole('button', { name: 'Analyse' }).click();
    const best = page.locator('#bestSan');
    await expect(best).not.toHaveClass(/\bwait\b/, { timeout: 20_000 });
    await expect(best).toHaveText(/^[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8]|^O-O/);
    await expect(page.locator('#lines li')).not.toHaveCount(0);
    await expect(page.locator('#status')).toContainText('White to move');
    await expect(page.locator('#bestLabel')).toHaveText('Best move for White');
    await page.locator('#moveInput').fill('e4');
    await page.locator('#moveInput').press('Enter');
    await expect(page.locator('#status')).toContainText('Black to move');
    await expect(page.locator('#bestLabel')).toHaveText('Best move for Black');
    await expect(page.locator('#playBest')).toHaveText('Play it');
    await expect(page.locator('#bestMeta')).toContainText('depth');
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
    // Analyse names the colours: the review has no "you" and no "your opponent".
    await expect(page.locator('#reviewTitle')).toHaveText('Move 1, Black');
    await expect(page.locator('#reviewSummary th')).toHaveText(['White', 'Black']);
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

test('How to play: the notation board names a tapped square, and the first game starts at Beginner', async ({
  page,
}) => {
  await page.goto('./how-to-play');
  const lesson = page.locator('[data-lesson="squares"]');
  const message = lesson.locator('.lesson-msg');
  await lesson.locator('[data-sq="e4"]').click();
  await expect(message).toHaveText('e4: file e, rank 4. The square is empty.');
  await lesson.locator('[data-sq="g1"]').click();
  await expect(message).toHaveText('g1: file g, rank 1, with a white knight. Its letter is N.');
  await expect(page.locator('.first-game')).toHaveAttribute('href', /&side=w&level=beginner&goal=first$/);
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

async function loadPgn(page: Page, pgn: string): Promise<void> {
  await openTools(page);
  await page.locator('#pgnInput').fill(pgn);
  await page.locator('#loadPgn').click();
}

async function downloadedPgn(page: Page): Promise<string> {
  await openTools(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#downloadPgn').click()]);
  return readFileSync(await download.path(), 'utf8');
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

  test('Undo no longer brings back a replaced line after switching to Play', async ({ page }) => {
    await typeMoves(page, ['e4', 'e5', 'Nf3']);
    await page.locator('#moves').getByRole('button', { name: '1. e4' }).click();
    await typeMoves(page, ['c5']);
    await expect(page.locator('#moves .m')).toHaveText(['e4', 'c5']);
    await page.locator('#modeSeg').getByRole('button', { name: 'Play' }).click();
    await page.locator('#undoBtn').click();
    await expect(page.locator('#moves .m')).toHaveCount(0);
  });
});

test('Undo stops the computer thinking about a move that was taken back', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#engineName')).toHaveText('Engine ready');
  await page.locator('#levelSelect').selectOption('max');
  await square(page, 'e2').click();
  await square(page, 'e4').click();
  await expect(page.locator('#engineName')).toHaveText('Thinking…');
  await page.locator('#undoBtn').click();
  // The strongest level thinks for 2 seconds; a cancelled search ends at once.
  await expect(page.locator('#engineName')).toHaveText('Engine ready', { timeout: 1000 });
});

test('the engine chip says idle when no engine is needed', async ({ page }) => {
  await page.goto('./');
  await analyse(page);
  await loadFen(page, '7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');
  await page.reload();
  await expect(page.locator('#status')).toContainText('Checkmate');
  await expect(page.locator('#engineName')).toHaveText('Engine idle');
  await expect(page.locator('#engineChip')).not.toHaveClass(/\bready\b/);
});

test.describe('an imported PGN', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await analyse(page);
  });

  test('keeps its players and result, also after a reload, until the game changes', async ({ page }) => {
    await loadPgn(page, '[White "Alice"][Black "Bob"][Result "0-1"] 1. e4 e5 2. Nf3 0-1');
    await expect(page.locator('#toolsHint')).toHaveText('Imported 3 moves.');
    await expect(page.locator('#opening')).not.toBeEmpty(); // the opening names have loaded
    let pgn = await downloadedPgn(page);
    expect(pgn).toContain('[White "Alice"]');
    expect(pgn).toContain('[Black "Bob"]');
    expect(pgn).toContain('[Result "0-1"]');
    expect(pgn).toMatch(/\[ECO "C\d\d"\]/);
    expect(pgn).toContain('[Opening "King');
    expect(pgn).toMatch(/2\. Nf3 0-1\s*$/);

    await page.reload();
    expect(await downloadedPgn(page)).toContain('[White "Alice"]');

    await typeMoves(page, ['Nc6']);
    pgn = await downloadedPgn(page);
    expect(pgn).toContain('[White "?"]');
    expect(pgn).toContain('[Result "*"]');
  });

  test('may have escaped quotes in a tag', async ({ page }) => {
    await loadPgn(page, '[White "Alice \\"A\\""]\n[Result "1-0"]\n\n1. e4 1-0');
    await expect(page.locator('#toolsHint')).toHaveText('Imported 1 moves.');
    expect(await downloadedPgn(page)).toContain('[White "Alice \\"A\\""]');
  });
});

test('Resign ends the game as a loss, with one button to review it', async ({ page }) => {
  await page.goto('./');
  const resign = page.locator('#resignBtn');
  await expect(resign).toBeDisabled();
  await square(page, 'e2').click();
  await square(page, 'e4').click();
  await expect(page.locator('#moves .m')).toHaveCount(2, { timeout: 20_000 });
  page.once('dialog', (dialog) => void dialog.accept());
  await resign.click();
  const status = page.locator('#status');
  await expect(status).toContainText('Resigned. The computer wins.');
  await expect(status).toContainText('Review game shows where it went wrong.');
  await expect(resign).toBeDisabled();
  await expect(page.locator('#reviewBtn')).toBeHidden();
  await page.reload();
  await expect(status).toContainText('Resigned.');
  expect(await downloadedPgn(page)).toContain('[Result "0-1"]');
  // Taking the other side keeps who resigned: White did, so the user, now Black, wins.
  await page.locator('#sideSeg button[data-v="b"]').click();
  await expect(status).toContainText('White resigned. You win.');
  const swapped = await downloadedPgn(page);
  expect(swapped).toContain('[Result "0-1"]');
  expect(swapped).toContain('[Black "You"]');
  await page.locator('#sideSeg button[data-v="w"]').click();
  await expect(status).toContainText('Resigned. The computer wins.');
  await page.locator('#reviewStart').click();
  await expect(page.locator('#review')).toBeVisible();
  await expect(page.locator('#reviewProgressText')).toHaveText('Every move analysed.', { timeout: 30_000 });
  await page.locator('#reviewExit').click();
  await expect(page.locator('#reviewStart')).toBeFocused();
  await page.locator('#undoBtn').click(); // takes back the resignation with the last two moves
  await expect(status).toContainText('Your move');
  await expect(page.locator('#moves .m')).toHaveCount(0);
});

test.describe('a tap that moves nothing', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('says why in the status line, without moving the board', async ({ page }) => {
    await page.goto('./');
    const status = page.locator('#status');
    const boardTop = () => page.locator('#board').evaluate((b) => b.getBoundingClientRect().top + scrollY);
    const top = await boardTop();
    await square(page, 'g1').click();
    await square(page, 'g4').click();
    await expect(status).toContainText("A knight can't go there.");
    expect(await boardTop()).toBe(top);
    await square(page, 'g1').click();
    await expect(status).not.toContainText("can't go there");

    await analyse(page);
    await loadFen(page, '4k3/8/8/8/8/8/P7/r3K3 w - - 0 1');
    await square(page, 'e1').click();
    await square(page, 'd1').click();
    await expect(status).toContainText("The king can't move into check.");
    await square(page, 'a2').click();
    await square(page, 'a3').click();
    await expect(status).toContainText('The king is in check: move it, block the check or capture the attacker.');
    expect(await boardTop()).toBe(top);
  });
});

test.describe('practice links', () => {
  const QUEEN_MATE = `./#fen=${encodeURIComponent('8/8/8/4k3/8/8/8/3QK3 w - - 0 1')}&mode=play&side=w&level=max`;

  test('say what the game is for in the status line', async ({ page }) => {
    await page.goto(`${QUEEN_MATE}&goal=mate`);
    const status = page.locator('#status');
    await expect(status).toHaveText(/^Your move\s*Practice: mate the lone king\.$/);
    await page.reload();
    await expect(status).toContainText('Practice: mate the lone king.');
    await page.locator('#newBtn').click();
    await expect(status).not.toContainText('Practice');

    await page.goto('./how-to-play');
    await page.locator('.first-game').click();
    await expect(status).toContainText('Your first game, at the Beginner level.');
  });

  test('set the side and level for that game only', async ({ page }) => {
    await page.goto('./');
    await page.locator('#sideSeg').getByRole('button', { name: 'Black' }).click();
    await page.locator('#levelSelect').selectOption('novice');
    await page.goto(QUEEN_MATE);
    await expect(page.locator('#status')).toContainText('Practice position, against the computer (Full strength)');
    await page.reload(); // mid-practice: still the link's game
    await expect(page.locator('#status')).toContainText('Full strength');
    await expect(page.locator('#levelSelect')).toHaveValue('max');
    await page.locator('#newBtn').click();
    await expect(page.locator('#levelSelect')).toHaveValue('novice');
    await expect(page.locator('#sideSeg').getByRole('button', { name: 'Black' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#status')).toContainText('Novice');
    await page.reload();
    await expect(page.locator('#levelSelect')).toHaveValue('novice');
  });
});
