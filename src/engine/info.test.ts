import { describe, expect, it } from 'vitest';
import { parseBestMove, parseInfo } from './info';

describe('parseInfo', () => {
  it('parses a MultiPV line from Stockfish 19', () => {
    const line =
      'info depth 12 seldepth 15 multipv 2 score cp -34 nodes 108576 nps 1014728 hashfull 31 time 107 pv c7c5 g1f3 e7e6 d2d4';
    expect(parseInfo(line)).toEqual({
      depth: 12,
      multipv: 2,
      score: { kind: 'cp', value: -34 },
      pv: ['c7c5', 'g1f3', 'e7e6', 'd2d4'],
    });
  });

  it('defaults multipv to 1 and parses mate scores', () => {
    expect(parseInfo('info depth 5 score mate -2 pv h1h2')).toMatchObject({
      multipv: 1,
      score: { kind: 'mate', value: -2 },
    });
  });

  it('ignores bound scores, info strings, lines without PV and other output', () => {
    expect(parseInfo('info depth 9 multipv 1 score cp 20 lowerbound nodes 5 pv e2e4')).toBeNull();
    expect(parseInfo('info depth 9 multipv 1 score cp 20 upperbound nodes 5 pv e2e4')).toBeNull();
    expect(parseInfo('info string NNUE evaluation using nn-61e7af4bb97d.nnue')).toBeNull();
    expect(parseInfo('info depth 0 score mate 0')).toBeNull();
    expect(parseInfo('info depth 10 currmove e2e4 currmovenumber 1')).toBeNull();
    expect(parseInfo('bestmove e2e4')).toBeNull();
  });
});

describe('parseBestMove', () => {
  it('parses the move and ignores ponder', () => {
    expect(parseBestMove('bestmove e7e6 ponder b1c3')).toEqual({ move: 'e7e6' });
  });

  it('returns a null move when there is no legal move', () => {
    expect(parseBestMove('bestmove (none)')).toEqual({ move: null });
  });

  it('returns null for other lines', () => {
    expect(parseBestMove('info depth 1')).toBeNull();
  });
});
