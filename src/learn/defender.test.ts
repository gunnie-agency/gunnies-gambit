import { Chess, SQUARES, type Move } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { defend, edgeDistance } from './defender';

/**
 * Whether `move` lets White mate at once. chess.js marks a mating move's SAN with `#`, from the same check as
 * isCheckmate(); reading it instead of playing every reply keeps the test at a few hundred milliseconds rather than
 * seconds, which had made it time out on a busy machine.
 */
function allowsMate(game: Chess, move: Move): boolean {
  game.move(move);
  const mate = game.moves().some((reply) => reply.endsWith('#'));
  game.undo();
  return mate;
}

/** Every position with the black king to move against White's king and one piece, on squares where it may stand. */
function positions(white: string): Chess[] {
  const games: Chess[] = [];
  for (const sq of SQUARES) {
    const setup = new Chess(white.replace(' w ', ' b '), { skipValidation: true });
    if (setup.get(sq) || !setup.put({ type: 'k', color: 'b' }, sq)) continue;
    const game = new Chess(setup.fen());
    const whiteKing = game.findPiece({ type: 'k', color: 'w' })[0];
    if (whiteKing && !game.isAttacked(whiteKing, 'b') && !game.isGameOver()) games.push(game);
  }
  return games;
}

describe('edgeDistance', () => {
  it('is 0 on the edge and 3 in the centre', () => {
    expect(edgeDistance('a1')).toBe(0);
    expect(edgeDistance('h5')).toBe(0);
    expect(edgeDistance('b7')).toBe(1);
    expect(edgeDistance('c4')).toBe(2);
    expect(edgeDistance('e5')).toBe(3);
  });
});

describe('defend', () => {
  it('takes a piece left hanging', () => {
    expect(defend(new Chess('8/8/8/4k3/3Q4/8/8/4K3 b - - 0 1'))?.san).toBe('Kxd4');
  });

  it('has no move when it is mated or stalemated', () => {
    expect(defend(new Chess('k1Q5/8/1K6/8/8/8/8/8 b - - 0 1'))).toBeNull();
    expect(defend(new Chess('k7/2Q5/1K6/8/8/8/8/8 b - - 0 1'))).toBeNull();
  });

  it.each([
    ['queen', '8/8/8/3Q4/8/4K3/8/8 w - - 0 1'],
    ['rook', '8/8/8/8/2R5/4K3/8/8 w - - 0 1'],
  ])('with a %s: takes it when it can, else avoids a mate in one and heads for the centre', (_, white) => {
    const games = positions(white);
    expect(games.length).toBeGreaterThan(30);
    for (const game of games) {
      const moves = game.moves({ verbose: true });
      const choice = defend(game);
      const capture = moves.find((m) => m.captured);
      if (capture) {
        expect(choice?.san).toBe(capture.san);
        continue;
      }
      const safe = moves.filter((m) => !allowsMate(game, m));
      const pool = safe.length ? safe : moves;
      expect(
        pool.map((m) => m.san),
        game.fen(),
      ).toContain(choice?.san);
      const best = Math.max(...pool.map((m) => edgeDistance(m.to)));
      expect(edgeDistance(choice?.to ?? 'a1'), game.fen()).toBe(best);
    }
  });
});
