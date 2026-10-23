import { readFileSync } from 'node:fs';
import { Chess, type Color, type PieceSymbol } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../engine/levels';
import { buildPracticeLink, parsePracticeLink } from '../util/link';
import { parseUciMove } from '../util/uci';
import { FIRST_GAME, LESSONS, lessonById, type Lesson } from './lessons';
import { hasGoal } from './progress';

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const PUZZLES = LESSONS.filter((l) => l.mode === 'puzzle');
/** Each mating puzzle with the number of moves the reader needs to mate. */
const MATES: Record<string, 1 | 2> = {
  'back-rank': 2,
  smothered: 2,
  'double-check': 1,
  arabian: 1,
  anastasia: 2,
  ladder: 2,
};
const MATERIAL = ['knight-fork', 'queen-fork', 'pin', 'discovered-attack', 'skewer', 'remove-defender'];

function solutionOf(lesson: Lesson | undefined): readonly string[] {
  if (!lesson?.solution?.length) throw new Error(`No puzzle ${lesson?.id}`);
  return lesson.solution;
}

function playUci(game: Chess, uci: string): void {
  const move = parseUciMove(uci);
  if (!move) throw new Error(`Not a UCI move: ${uci}`);
  game.move(move);
}

function matesAtOnce(game: Chess, san: string): boolean {
  game.move(san);
  const mate = game.isCheckmate();
  game.undo();
  return mate;
}

function mateInOne(game: Chess): boolean {
  return game.moves().some((san) => matesAtOnce(game, san));
}

/** True when `san` mates at once, or every reply to it allows a mate in one. */
function matesInTwo(game: Chess, san: string): boolean {
  game.move(san);
  const mates =
    game.isCheckmate() ||
    (!game.isGameOver() &&
      game.moves().every((reply) => {
        game.move(reply);
        const mate = mateInOne(game);
        game.undo();
        return mate;
      }));
  game.undo();
  return mates;
}

/** The material of `side` less the other side's. */
function balance(game: Chess, side: Color): number {
  let sum = 0;
  for (const piece of game.board().flat()) if (piece) sum += (piece.color === side ? 1 : -1) * VALUE[piece.type];
  return sum;
}

/** The most the side to move can win with one capture: the piece taken, less its own piece if it can be taken back. */
function bestCapture(game: Chess): number {
  let best = 0;
  for (const move of game.moves({ verbose: true }).filter((m) => m.captured)) {
    game.move(move);
    const retake = game.moves({ verbose: true }).some((m) => m.to === move.to);
    game.undo();
    best = Math.max(best, VALUE[move.captured as PieceSymbol] - (retake ? VALUE[move.piece] : 0));
  }
  return best;
}

/** The text under each board in how-to-play.html before the script runs, by lesson id. */
function introTexts(): Map<string, string> {
  const html = readFileSync('how-to-play.html', 'utf8');
  const intros = new Map<string, string>();
  for (const [, id = '', text = ''] of html.matchAll(/data-lesson="([^"]+)"[\s\S]*?class="lesson-msg"[^>]*>([^<]*)</g))
    intros.set(id, text.replace(/\s+/g, ' ').trim());
  return intros;
}

describe('puzzles', () => {
  it('cover every puzzle lesson with a soundness check', () => {
    expect(PUZZLES.map((p) => p.id).sort()).toEqual([...Object.keys(MATES), ...MATERIAL].sort());
  });

  it('include some with Black to move', () => {
    expect(PUZZLES.filter((p) => new Chess(p.fen).turn() === 'b').length).toBeGreaterThanOrEqual(3);
  });

  it.each(PUZZLES.map((p) => [p.id, p] as const))('%s starts legal and every move is legal', (_, p) => {
    const game = new Chess(p.fen);
    const solution = solutionOf(p);
    expect(game.isGameOver()).toBe(false);
    // The reader plays the last move.
    expect(solution.length % 2).toBe(1);
    for (const uci of solution) expect(() => playUci(game, uci)).not.toThrow();
  });

  it.each(PUZZLES.map((p) => [p.id, p] as const))('%s names the side to move on the page', (_, p) => {
    const side = new Chess(p.fen).turn() === 'w' ? 'White' : 'Black';
    expect(introTexts().get(p.id)).toMatch(new RegExp(`^${side} to move`));
  });

  it('are counted per section on the page before the script runs', () => {
    const sections = readFileSync('how-to-play.html', 'utf8').split('<section').slice(1);
    const counted = sections.flatMap((html) => {
      const line = /<p class="lesson-progress"(?: data-label="([^"]+)")?>0 of (\d+) ([^<]+)<\/p>/.exec(html);
      expect(line?.[3], html.slice(0, 80)).toBe(line ? (line[1] ?? 'solved') : undefined);
      const ids = [...html.matchAll(/data-lesson="([^"]+)"/g)].map((m) => m[1]).filter((id) => hasGoal(lessonById(id)));
      expect(line ? Number(line[2]) : 0, html.slice(0, 80)).toBe(ids.length);
      return ids;
    });
    expect(counted.sort()).toEqual(
      LESSONS.filter(hasGoal)
        .map((l) => l.id)
        .sort(),
    );
  });

  it.each(Object.entries(MATES))('%s mates in %i with a single first move, and the solution ends in mate', (id, n) => {
    const p = lessonById(id);
    const solution = solutionOf(p);
    const [key = '', ...rest] = solution;
    const game = new Chess(p?.fen);
    expect(solution).toHaveLength(2 * n - 1);
    if (n === 2) expect(mateInOne(game)).toBe(false);
    const keys = game.moves().filter((san) => (n === 1 ? matesAtOnce(game, san) : matesInTwo(game, san)));
    playUci(game, key);
    expect(keys).toEqual([game.history().at(-1)]);
    for (const uci of rest) playUci(game, uci);
    expect(game.isCheckmate()).toBe(true);
  });

  it.each(MATERIAL)('%s wins at least a piece against every defence, and the solution does', (id) => {
    const p = lessonById(id);
    const [key = '', ...rest] = solutionOf(p);
    const game = new Chess(p?.fen);
    const side = game.turn();
    const start = balance(game, side);
    playUci(game, key);
    for (const reply of game.moves()) {
      game.move(reply);
      // What the key move already won, plus what the reader can take now.
      expect(balance(game, side) - start + bestCapture(game), `after ${reply}`).toBeGreaterThanOrEqual(3);
      game.undo();
    }
    for (const uci of rest) playUci(game, uci);
    expect(balance(game, side) - start).toBeGreaterThanOrEqual(3);
  });
});

describe('endgames', () => {
  const endgames = LESSONS.filter((l) => l.practiseAs);

  it.each(endgames.map((l) => [l.id, l] as const))('%s links to a game the app accepts', (_, lesson) => {
    const side = lesson.practiseAs ?? 'w';
    const game = new Chess(lesson.fen);
    expect(game.turn()).toBe(side);
    expect(game.isGameOver()).toBe(false);
    expect(lesson.practiceGoal).toBeDefined();
    const link = buildPracticeLink(lesson.fen, side, 'max', lesson.practiceGoal);
    const goal = lesson.practiceGoal;
    expect(parsePracticeLink(link.slice(link.indexOf('#')))).toEqual({ fen: lesson.fen, side, level: 'max', goal });
  });

  it('cover the queen, the rook and the pawn ending', () => {
    expect(endgames.map((l) => l.id)).toEqual(['queen-mate', 'rook-mate', 'pawn-ending']);
  });
});

describe('first game', () => {
  it('opens the level the page names, as White from the start position', () => {
    const link = buildPracticeLink(FIRST_GAME.fen, FIRST_GAME.side, FIRST_GAME.level, FIRST_GAME.goal);
    expect(parsePracticeLink(link.slice(link.indexOf('#')))).toEqual({ ...FIRST_GAME });
    const label = LEVELS.find((level) => level.id === FIRST_GAME.level)?.label;
    expect(readFileSync('how-to-play.html', 'utf8')).toContain(`Play the ${label} level as White`);
  });
});
