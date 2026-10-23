import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { reviewMove, type PositionEval } from './classify';
import { describeMove, materialLoss, moveFacts, spellScore } from './describe';

const cp = (value: number, best: string | null): PositionEval => ({ score: { kind: 'cp', value }, best });
const mate = (value: number, best: string | null): PositionEval => ({ score: { kind: 'mate', value }, best });

function fenAfter(...sans: string[]): string {
  const game = new Chess();
  for (const san of sans) game.move(san);
  return game.fen();
}

/** The review text of a move from the position `fen`, with the engine's views before and after it. */
function text(fen: string, played: string, before: PositionEval, after: PositionEval, san: string, best: string) {
  const color = new Chess(fen).turn();
  const r = reviewMove(0, color, played, before, after);
  return describeMove(r, moveFacts(fen, r, before, after), { who: 'You', san, best });
}

// 1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6: Qg4 now hangs the queen to the knight.
const QUEEN_HANGS = fenAfter('e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6');
// 1. f3 e5: g4 allows Qh4#.
const FOOLS_MATE = fenAfter('f3', 'e5');

describe('materialLoss', () => {
  it('counts a piece the reply takes for free', () => {
    expect(materialLoss(QUEEN_HANGS, 'h5g4', 'f6g4')).toEqual({
      reply: 'Nxg4',
      piece: 'q',
      square: 'g4',
      free: true,
      points: 9,
    });
  });

  it('counts the recapture, so a fair exchange costs nothing', () => {
    // 1. e4 d5 2. exd5 Qxd5: a pawn each.
    expect(materialLoss(fenAfter('e4', 'd5'), 'e4d5', 'd8d5')?.points).toBe(0);
    // The queen walks into the knight, which the b-pawn takes back: a queen for a knight.
    const loss = materialLoss('4k3/8/8/3n4/8/8/1PQ5/4K3 w - - 0 1', 'c2c3', 'd5c3');
    expect(loss).toMatchObject({ reply: 'Nxc3', piece: 'q', free: false, points: 6 });
  });

  it('is null when the reply takes nothing or a move is illegal', () => {
    expect(materialLoss(QUEEN_HANGS, 'h5g4', 'd7d6')).toBeNull();
    expect(materialLoss(QUEEN_HANGS, 'h5h8', 'f6g4')).toBeNull();
  });
});

describe('moveFacts', () => {
  it('notes material lost from 3 points, only for moves that are not the engine’s choice', () => {
    const before = cp(300, 'h5f7');
    const after = cp(600, 'f6g4');
    const r = reviewMove(0, 'w', 'h5g4', before, after);
    expect(moveFacts(QUEEN_HANGS, r, before, after).loss?.points).toBe(9);
    const best = reviewMove(0, 'w', 'h5g4', cp(300, 'h5g4'), after);
    expect(moveFacts(QUEEN_HANGS, best, cp(300, 'h5g4'), after).loss).toBeNull();
    // Nxe5 Nxe5 loses a knight for a pawn: 2 points, not noted.
    const fen = fenAfter('e4', 'e5', 'Nf3', 'Nc6');
    const small = reviewMove(0, 'w', 'f3e5', cp(30, 'f1b5'), cp(150, 'c6e5'));
    expect(materialLoss(fen, 'f3e5', 'c6e5')?.points).toBe(2);
    expect(moveFacts(fen, small, cp(30, 'f1b5'), cp(150, 'c6e5')).loss).toBeNull();
  });

  it('finds checkmate, mate in one for the opponent and decided games', () => {
    const r = reviewMove(0, 'w', 'g2g4', cp(-80, 'b1c3'), mate(1, 'd8h4'));
    expect(moveFacts(FOOLS_MATE, r, cp(-80, 'b1c3'), mate(1, 'd8h4'))).toMatchObject({
      checkmate: false,
      mateReply: 'Qh4#',
      decided: false,
      loss: null,
    });
    const mated = reviewMove(0, 'b', 'd8h4', mate(1, 'd8h4'), mate(0, null));
    expect(moveFacts(fenAfter('f3', 'e5', 'g4'), mated, mate(1, 'd8h4'), mate(0, null)).checkmate).toBe(true);
    expect(moveFacts(QUEEN_HANGS, r, cp(-500, null), cp(0, null)).decided).toBe(true);
    expect(moveFacts(QUEEN_HANGS, r, mate(-6, null), cp(0, null)).decided).toBe(true);
    expect(moveFacts(QUEEN_HANGS, r, cp(499, null), cp(0, null)).decided).toBe(false);
  });
});

describe('describeMove', () => {
  it('says checkmate for any mating move, never what the engine preferred', () => {
    // As in a real game: the engine picked the queen promotion, but the rook promotion mated just the same.
    const fen = '6k1/8/8/8/8/8/6p1/6KR b - - 0 1';
    expect(text(fen, 'g2h1r', mate(1, 'g2h1q'), mate(0, null), 'gxh1=R#', 'gxh1=Q#')).toBe('Checkmate.');
  });

  it('names a hung piece next to the judgement', () => {
    expect(text(QUEEN_HANGS, 'h5g4', cp(300, 'h5f7'), cp(600, 'f6g4'), 'Qg4', 'Qxf7#')).toBe(
      'You played Qg4, a blunder. This leaves the queen on g4 to be taken for free (Nxg4). ' +
        'Better was Qxf7#, shown by the arrow.',
    );
  });

  it('warns about mate in one whatever the judgement', () => {
    // Already lost, so the mate rules only call it an inaccuracy.
    expect(text(FOOLS_MATE, 'g2g4', cp(-1500, 'b1c3'), mate(1, 'd8h4'), 'g4', 'Nc3')).toBe(
      'You played g4, an inaccuracy. This allows checkmate in one (Qh4#). Better was Nc3, shown by the arrow.',
    );
  });

  it('does not praise unmarked moves once the game is decided', () => {
    // Up a queen for Black already; Qg4 hands over another.
    expect(text(QUEEN_HANGS, 'h5g4', cp(-1200, 'h5f7'), cp(1500, 'f6g4'), 'Qg4', 'Qxf7#')).toBe(
      'The game was already decided; this changes little. This leaves the queen on g4 to be taken for free (Nxg4). ' +
        'The engine preferred Qxf7#.',
    );
  });

  it('keeps the plain texts for good moves and the engine’s choice', () => {
    const fen = new Chess().fen();
    expect(text(fen, 'd2d4', cp(30, 'e2e4'), cp(-25, 'd7d5'), 'd4', 'e4')).toBe(
      'A good move. The engine preferred e4.',
    );
    expect(text(fen, 'e2e4', cp(30, 'e2e4'), cp(-25, 'e7e5'), 'e4', 'e4')).toBe('The engine’s first choice.');
  });

  it('explains a sacrifice the review does not mark', () => {
    expect(text(QUEEN_HANGS, 'h5g4', cp(100, 'h5f7'), cp(-100, 'f6g4'), 'Qg4', 'Qxf7#')).toBe(
      'This leaves the queen on g4 to be taken for free (Nxg4). ' +
        'The winning chances stay about the same, so it is not marked.',
    );
  });
});

describe('spellScore', () => {
  it('spells out mates and keeps centipawn scores compact', () => {
    expect(spellScore({ kind: 'mate', value: -1 })).toBe('mate in 1 for Black');
    expect(spellScore({ kind: 'mate', value: 3 })).toBe('mate in 3 for White');
    expect(spellScore({ kind: 'cp', value: 35 })).toBe('+0.35');
  });
});
