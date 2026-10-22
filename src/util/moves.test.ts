import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { fenProblem, gameEnd, parseTypedMove, uniqueMoveTo } from './moves';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const CASTLE = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';

describe('parseTypedMove', () => {
  it('reads SAN, sloppy SAN and UCI', () => {
    expect(parseTypedMove(START, 'Nf3')).toEqual({ from: 'g1', to: 'f3' });
    expect(parseTypedMove(START, ' e4 ')).toEqual({ from: 'e2', to: 'e4' });
    expect(parseTypedMove(START, 'g1f3')).toEqual({ from: 'g1', to: 'f3' });
    expect(parseTypedMove(START, 'Ng1f3')).toEqual({ from: 'g1', to: 'f3' });
  });

  it('reads castling with letters or zeros, in either case', () => {
    expect(parseTypedMove(CASTLE, 'O-O')).toEqual({ from: 'e1', to: 'g1' });
    expect(parseTypedMove(CASTLE, '0-0-0')).toEqual({ from: 'e1', to: 'c1' });
    expect(parseTypedMove(CASTLE, 'o-o')).toEqual({ from: 'e1', to: 'g1' });
    expect(parseTypedMove(CASTLE, 'o-o-o')).toEqual({ from: 'e1', to: 'c1' });
    expect(parseTypedMove(CASTLE, 'O-O+')).toEqual({ from: 'e1', to: 'g1' });
    expect(parseTypedMove(START, 'o-o')).toBeNull();
  });

  it('reads promotions', () => {
    const fen = '8/4P1k1/8/8/8/8/8/4K3 w - - 0 1';
    expect(parseTypedMove(fen, 'e8=N')).toEqual({ from: 'e7', to: 'e8', promotion: 'n' });
    expect(parseTypedMove(fen, 'e7e8q')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' });
    expect(parseTypedMove(fen, 'e7e8R')).toEqual({ from: 'e7', to: 'e8', promotion: 'r' });
  });

  it('reads UCI before sloppy SAN, so a promotion without a piece is a queen', () => {
    const fen = 'k7/4P3/8/8/8/8/8/K7 w - - 0 1';
    expect(parseTypedMove(fen, 'e7e8')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' });
    expect(parseTypedMove(fen, 'e7-e8')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' });
    expect(parseTypedMove(fen, 'e8')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' });
    expect(parseTypedMove(fen, 'e8+')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' });
  });

  it('reads promotion pieces in lower case, with or without =', () => {
    const fen = 'k7/4P3/8/8/8/8/8/K7 w - - 0 1';
    expect(parseTypedMove(fen, 'e8q')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' });
    expect(parseTypedMove(fen, 'e8=q')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' });
    expect(parseTypedMove(fen, 'e8n')).toEqual({ from: 'e7', to: 'e8', promotion: 'n' });
    expect(parseTypedMove(fen, 'e8=b+')).toEqual({ from: 'e7', to: 'e8', promotion: 'b' });
    const black = '4k3/8/8/8/8/8/3p4/K1R5 b - - 0 1';
    expect(parseTypedMove(black, 'dxc1r')).toEqual({ from: 'd2', to: 'c1', promotion: 'r' });
    expect(parseTypedMove(black, 'd1')).toEqual({ from: 'd2', to: 'd1', promotion: 'q' });
  });

  it('rejects a promotion piece on a move that does not promote', () => {
    expect(parseTypedMove(START, 'e2e4q')).toBeNull();
    expect(parseTypedMove(START, 'e2e5')).toBeNull();
  });

  it('returns null for illegal or empty input', () => {
    expect(parseTypedMove(START, 'e5')).toBeNull();
    expect(parseTypedMove(START, 'Ke2')).toBeNull();
    expect(parseTypedMove(START, '')).toBeNull();
    expect(parseTypedMove(START, 'hello')).toBeNull();
  });
});

describe('uniqueMoveTo', () => {
  it('finds the only piece that can reach a square', () => {
    const game = new Chess(START);
    expect(uniqueMoveTo(game, 'f3')).toBeNull(); // pawn f2 and knight g1
    expect(uniqueMoveTo(game, 'a3')).toBeNull(); // pawn a2 and knight b1
    expect(uniqueMoveTo(game, 'e4')).toEqual({ from: 'e2', to: 'e4', promotion: false });
    expect(uniqueMoveTo(game, 'd4')).toEqual({ from: 'd2', to: 'd4', promotion: false });
    expect(uniqueMoveTo(game, 'e5')).toBeNull();
  });

  it('treats the four promotion choices as one candidate', () => {
    const game = new Chess('8/4P1k1/8/8/8/8/8/4K3 w - - 0 1');
    expect(uniqueMoveTo(game, 'e8')).toEqual({ from: 'e7', to: 'e8', promotion: true });
  });
});

describe('fenProblem', () => {
  it('accepts legal positions', () => {
    expect(fenProblem(START)).toBeNull();
    expect(fenProblem('4k3/8/8/8/8/8/4R3/4K3 b - - 0 1')).toBeNull(); // black to move, in check
  });

  it('rejects malformed FENs and positions where the side not to move is in check', () => {
    expect(fenProblem('not a fen')).not.toBeNull();
    expect(fenProblem('4k3/8/8/8/8/8/4R3/4K3 w - - 0 1')).toMatch(/not to move is in check/);
  });
});

describe('gameEnd', () => {
  it('detects checkmate and stalemate', () => {
    expect(gameEnd(new Chess('8/8/8/8/8/5k2/8/5K1q w - - 0 1'))).toBe('checkmate');
    expect(gameEnd(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))).toBe('stalemate');
    expect(gameEnd(new Chess('8/8/8/8/8/5k2/8/5K2 w - - 0 1'))).toBe('insufficient');
    expect(gameEnd(new Chess(START))).toBeNull();
  });
});
