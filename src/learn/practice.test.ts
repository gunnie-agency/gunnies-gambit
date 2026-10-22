import type { Square } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { LESSONS, lessonById, type Lesson } from './lessons';
import { Practice } from './practice';

function practice(id: string): Practice {
  const lesson = lessonById(id);
  if (!lesson) throw new Error(`No lesson ${id}`);
  return new Practice(lesson);
}

/** Taps the two squares of a move, as a reader would. */
function tapMove(p: Practice, from: Square, to: Square) {
  p.tap(from);
  return p.tap(to);
}

describe('lessons', () => {
  it('have unique ids and positions that load', () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
    for (const lesson of LESSONS) expect(() => new Practice(lesson)).not.toThrow();
  });
});

describe('Practice', () => {
  it('selects only pieces of the side to move, and a second tap deselects', () => {
    const p = practice('start');
    p.tap('e7');
    expect(p.selected).toBeNull();
    p.tap('e2');
    expect(p.selected).toBe('e2');
    p.tap('e2');
    expect(p.selected).toBeNull();
  });

  it('moves the selected piece, or switches to another own piece', () => {
    const p = practice('start');
    p.tap('e2');
    p.tap('g1');
    expect(p.selected).toBe('g1');
    p.tap('f3');
    expect(p.game.get('f3')?.type).toBe('n');
    expect(p.last).toEqual({ from: 'g1', to: 'f3' });
    expect(p.message).toBe('White played Nf3. Black to move.');
  });

  it('keeps White to move on a free board', () => {
    const p = practice('knight');
    tapMove(p, 'd4', 'f5');
    expect(p.game.turn()).toBe('w');
    expect(p.message).toBe('The knight moved to f5.');
    tapMove(p, 'f5', 'g7');
    expect(p.game.get('g7')?.type).toBe('n');
  });

  it('lets the rook capture but not pass its own pawn', () => {
    const p = practice('rook');
    p.tap('d4');
    const targets = p.game.moves({ square: 'd4', verbose: true }).map((m) => m.to);
    expect(targets).toContain('d7');
    expect(targets).not.toContain('d8');
    expect(targets).toContain('f4');
    expect(targets).not.toContain('g4');
  });

  it('ends a task after one move until it is reset', () => {
    const p = practice('checkmate');
    tapMove(p, 'd1', 'd8');
    expect(p.done).toBe(true);
    expect(p.message).toMatch(/^Checkmate\./);
    p.tap('g1');
    expect(p.selected).toBeNull();
    p.reset();
    expect(p.done).toBe(false);
    expect(p.message).toBeNull();
    expect(p.game.get('d1')?.type).toBe('r');
  });

  it('tells a check that is not mate apart from mate', () => {
    const p = practice('checkmate');
    tapMove(p, 'd1', 'd2');
    expect(p.message).toMatch(/does not attack the king/);
  });

  it('names the three ways out of check', () => {
    const cases: Array<[Square, Square, RegExp]> = [
      ['b5', 'e8', /captured/],
      ['e1', 'd1', /moved the king/],
      ['a2', 'e2', /blocked the check: the rook/],
      ['b5', 'e2', /blocked the check: the bishop/],
    ];
    for (const [from, to, message] of cases) {
      const p = practice('check');
      tapMove(p, from, to);
      expect(p.message).toMatch(message);
    }
  });

  it('separates the mate from the stalemate', () => {
    const mate = practice('stalemate');
    tapMove(mate, 'c1', 'c8');
    expect(mate.message).toMatch(/^Checkmate with Qc8#/);
    const stalemate = practice('stalemate');
    tapMove(stalemate, 'c1', 'c7');
    expect(stalemate.message).toMatch(/^Stalemate\./);
  });

  it('explains both castling moves and a king that moved one square', () => {
    const kingside = practice('castling');
    tapMove(kingside, 'e1', 'g1');
    expect(kingside.message).toMatch(/castled kingside/);
    const queenside = practice('castling');
    tapMove(queenside, 'e1', 'c1');
    expect(queenside.message).toMatch(/castled queenside/);
    const step = practice('castling');
    tapMove(step, 'e1', 'f2');
    expect(step.message).toMatch(/no longer castle/);
  });

  it('shows the double step before en passant, and recognises the capture', () => {
    const p = practice('en-passant');
    expect(p.last).toEqual({ from: 'd7', to: 'd5' });
    tapMove(p, 'e5', 'd6');
    expect(p.message).toMatch(/^En passant/);
    expect(p.game.get('d5')).toBeUndefined();
  });

  it('asks for the promotion piece, then names it', () => {
    const p = practice('promotion');
    expect(tapMove(p, 'e7', 'e8')).toEqual({ from: 'e7', to: 'e8' });
    p.play('e7', 'e8', 'n');
    expect(p.game.get('e8')?.type).toBe('n');
    expect(p.message).toMatch(/became a knight/);
  });

  it('takes back a wrong puzzle move and lets the reader try again', () => {
    const p = practice('knight-fork');
    tapMove(p, 'd5', 'b6');
    expect(p.message).toBe('Not quite: Nb6 is not the move here. Try again.');
    expect(p.game.get('d5')?.type).toBe('n');
    expect(p.game.turn()).toBe('w');
    expect(p.last).toBeUndefined();
    expect(p.done).toBe(false);
  });

  it('answers a right puzzle move with the scripted reply, then accepts the solution', () => {
    const p = practice('knight-fork');
    tapMove(p, 'd5', 'c7');
    expect(p.waiting).toBe(true);
    expect(p.message).toMatch(/^Nc7\+\. Good/);
    p.tap('g1');
    expect(p.selected).toBeNull();
    p.reply();
    expect(p.waiting).toBe(false);
    expect(p.game.get('d8')?.type).toBe('k');
    expect(p.last).toEqual({ from: 'e8', to: 'd8' });
    expect(p.message).toBe('Black answered Kd8. Your move.');
    tapMove(p, 'c7', 'a6');
    expect(p.done).toBe(true);
    expect(p.message).toMatch(/^Solved\./);
    p.reset();
    expect(p.game.get('d5')?.type).toBe('n');
    expect(p.done).toBe(false);
  });

  it('points a hint at the piece to move, and clears it on the next move', () => {
    const p = practice('smothered');
    p.showHint();
    expect(p.hint).toBe('c4');
    expect(p.message).toBe('Hint: move your queen.');
    tapMove(p, 'c4', 'g8');
    expect(p.hint).toBeNull();
    p.reply();
    p.showHint();
    expect(p.hint).toBe('h6');
    tapMove(p, 'h6', 'f7');
    expect(p.game.isCheckmate()).toBe(true);
    expect(p.done).toBe(true);
    p.showHint();
    expect(p.hint).toBeNull();
  });

  it('accepts any checkmate in a puzzle, not only the planned one', () => {
    const lesson: Lesson = {
      id: 'two-mates',
      mode: 'puzzle',
      fen: '6k1/5ppp/8/8/8/8/5PPP/R2R2K1 w - - 0 1',
      solution: ['d1d8'],
    };
    const p = new Practice(lesson);
    tapMove(p, 'a1', 'a8');
    expect(p.done).toBe(true);
    expect(p.message).toBe('Solved.');
  });
});
