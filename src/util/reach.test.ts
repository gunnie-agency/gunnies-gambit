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

  it('says a move that ignores a pin would leave the king in check', () => {
    const pinned = new Chess('4k3/4r3/8/8/8/8/4N3/4K3 w - - 0 1');
    expect(cannotReach(pinned, 'e2', 'c3')).toBe('That would leave the king in check.');
    expect(cannotReach(pinned, 'e2', 'e4')).toBe("A knight can't go there.");
  });

  it('explains why the king cannot castle', () => {
    const attacked = new Chess('4k3/8/8/8/8/8/5r2/4K2R w K - 0 1');
    expect(cannotReach(attacked, 'e1', 'g1')).toBe("The king can't castle out of, through or into check.");
    const moved = new Chess('4k3/8/8/8/8/8/5r2/4K2R w - - 0 1');
    expect(cannotReach(moved, 'e1', 'g1')).toBe('Castling is no longer possible: the king or that rook has moved.');
    const blocked = new Chess('4k3/8/8/8/8/8/8/4KB1R w K - 0 1');
    expect(cannotReach(blocked, 'e1', 'g1')).toBe('Castling needs the squares between the king and the rook empty.');
    expect(cannotReach(new Chess('4k3/8/8/8/8/8/8/RN2K3 w Q - 0 1'), 'e1', 'c1')).toBe(
      'Castling needs the squares between the king and the rook empty.',
    );
    expect(cannotReach(start, 'e1', 'e3')).toBe("A king can't go there.");
  });

  it('says a pawn is blocked', () => {
    const blocked = new Chess('4k3/8/8/8/4p3/8/4P3/4K3 w - - 0 1');
    expect(cannotReach(blocked, 'e2', 'e4')).toBe('The pawn is blocked.');
    const ahead = new Chess('4k3/8/8/8/8/4n3/4P3/4K3 w - - 0 1');
    expect(cannotReach(ahead, 'e2', 'e3')).toBe('The pawn is blocked.');
    expect(cannotReach(ahead, 'e2', 'e4')).toBe('The pawn is blocked.');
  });

  it('says en passant is only possible right after the two-square move', () => {
    const late = new Chess('4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1');
    expect(cannotReach(late, 'e5', 'd6')).toBe("En passant is only possible right after the pawn's two-square move.");
    expect(cannotReach(late, 'e5', 'f6')).toBe("A pawn can't go there.");
    expect(cannotReach(new Chess('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1'), 'e5', 'd6')).toBeNull();
  });
});
