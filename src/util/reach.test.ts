import { Chess, DEFAULT_POSITION } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { cannotReach } from './reach';

describe('cannotReach', () => {
  const start = new Chess(DEFAULT_POSITION);

  it('names the piece that cannot go to the square', () => {
    expect(cannotReach(start, 'g1', 'g4')).toBe("A knight can't go there.");
    expect(cannotReach(start, 'e2', 'e5')).toBe("A pawn can't go there.");
    expect(cannotReach(start, 'c1', 'h6')).toBe("A bishop can't go there.");
  });

  it('is null for a legal move and for taps that are no move attempt', () => {
    expect(cannotReach(start, 'g1', 'f3')).toBeNull();
    expect(cannotReach(start, 'g1', 'e2')).toBeNull(); // own piece: selects it
    expect(cannotReach(start, 'e7', 'e5')).toBeNull(); // not the side to move
    expect(cannotReach(start, 'e4', 'e5')).toBeNull(); // empty square
    expect(cannotReach(start, 'g1', 'g1')).toBeNull();
  });

  it('tells a king step into check apart from a move that ignores a check', () => {
    const check = new Chess('4k3/8/8/8/8/8/P7/r3K3 w - - 0 1');
    expect(cannotReach(check, 'e1', 'd1')).toBe("The king can't move into check.");
    expect(cannotReach(check, 'a2', 'a3')).toBe(
      'The king is in check: move it, block the check or capture the attacker.',
    );
    expect(cannotReach(check, 'e1', 'e2')).toBeNull();
  });
});
