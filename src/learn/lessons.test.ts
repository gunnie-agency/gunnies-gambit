import { Chess, type PieceSymbol } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { buildPracticeLink, parsePracticeLink } from '../util/link';
import { parseUciMove } from '../util/uci';
import { LESSONS, lessonById, type Lesson } from './lessons';

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const PUZZLES = LESSONS.filter((l) => l.mode === 'puzzle');
const MATES = ['back-rank', 'smothered'];
const MATERIAL = ['knight-fork', 'queen-fork', 'pin'];

function solutionOf(lesson: Lesson | undefined): readonly string[] {
  if (!lesson?.solution?.length) throw new Error(`No puzzle ${lesson?.id}`);
  return lesson.solution;
}

function playUci(game: Chess, uci: string): void {
  const move = parseUciMove(uci);
  if (!move) throw new Error(`Not a UCI move: ${uci}`);
  game.move(move);
}

function mateInOne(game: Chess): boolean {
  return game.moves().some((san) => {
    game.move(san);
    const mate = game.isCheckmate();
    game.undo();
    return mate;
  });
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

/** White's material less Black's. */
function balance(game: Chess): number {
  let sum = 0;
  for (const piece of game.board().flat()) if (piece) sum += (piece.color === 'w' ? 1 : -1) * VALUE[piece.type];
  return sum;
}

/** The most White can win with one capture: the piece taken, less White's piece if Black can take back. */
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

describe('puzzles', () => {
  it('cover every puzzle lesson with a soundness check', () => {
    expect(PUZZLES.map((p) => p.id).sort()).toEqual([...MATES, ...MATERIAL].sort());
  });

  it.each(PUZZLES.map((p) => [p.id, p] as const))('%s starts legal, White to move, and every move is legal', (_, p) => {
    const game = new Chess(p.fen);
    const solution = solutionOf(p);
    expect(game.turn()).toBe('w');
    // The reader plays the last move.
    expect(solution.length % 2).toBe(1);
    for (const uci of solution) expect(() => playUci(game, uci)).not.toThrow();
  });

  it.each(MATES)('%s is a mate in two with a single first move, and the solution ends in mate', (id) => {
    const p = lessonById(id);
    const [key = '', ...rest] = solutionOf(p);
    const game = new Chess(p?.fen);
    expect(mateInOne(game)).toBe(false);
    const keys = game.moves().filter((san) => matesInTwo(game, san));
    playUci(game, key);
    expect(keys).toEqual([game.history().at(-1)]);
    for (const uci of rest) playUci(game, uci);
    expect(game.isCheckmate()).toBe(true);
  });

  it.each(MATERIAL)('%s wins at least a piece against every defence, and the solution does', (id) => {
    const p = lessonById(id);
    const [key = '', ...rest] = solutionOf(p);
    const game = new Chess(p?.fen);
    const start = balance(game);
    playUci(game, key);
    for (const reply of game.moves()) {
      game.move(reply);
      expect(bestCapture(game), `after ${reply}`).toBeGreaterThanOrEqual(3);
      game.undo();
    }
    for (const uci of rest) playUci(game, uci);
    expect(balance(game) - start).toBeGreaterThanOrEqual(3);
  });
});

describe('endgames', () => {
  const endgames = LESSONS.filter((l) => l.practiseAs);

  it.each(endgames.map((l) => [l.id, l] as const))('%s links to a game the app accepts', (_, lesson) => {
    const side = lesson.practiseAs ?? 'w';
    const game = new Chess(lesson.fen);
    expect(game.turn()).toBe(side);
    expect(game.isGameOver()).toBe(false);
    const link = buildPracticeLink(lesson.fen, side, 'max');
    expect(parsePracticeLink(link.slice(link.indexOf('#')))).toEqual({ fen: lesson.fen, side, level: 'max' });
  });

  it('cover the queen, the rook and the pawn ending', () => {
    expect(endgames.map((l) => l.id)).toEqual(['queen-mate', 'rook-mate', 'pawn-ending']);
  });
});
