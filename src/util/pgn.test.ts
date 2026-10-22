import { Chess, DEFAULT_POSITION } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { buildPgn, pgnDate, pgnFileName, pgnResult } from './pgn';

const DATE = new Date(2026, 9, 2, 9, 5);
const SITE = 'https://chess.example';

/** Loads PGN the way a chess program would, and returns its headers and moves. */
function load(pgn: string): { headers: Record<string, string | null>; moves: string[] } {
  const game = new Chess();
  game.loadPgn(pgn);
  return { headers: game.getHeaders(), moves: game.history({ verbose: true }).map((m) => m.lan) };
}

describe('buildPgn', () => {
  it('writes a play-mode game that loads back with the same moves', () => {
    const moves = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];
    const pgn = buildPgn({
      startFen: DEFAULT_POSITION,
      moves,
      players: { mode: 'play', side: 'b', level: 'Elo 1400' },
      site: SITE,
      date: DATE,
    });
    const loaded = load(pgn);
    expect(loaded.moves).toEqual(moves);
    expect(loaded.headers).toEqual({
      Event: 'Practice game against the computer',
      Site: SITE,
      Date: '2026.10.02',
      Round: '-',
      White: 'Computer (Elo 1400)',
      Black: 'You',
      Result: '*',
    });
  });

  it('names the user White when they play White', () => {
    const pgn = buildPgn({
      startFen: DEFAULT_POSITION,
      moves: [],
      players: { mode: 'play', side: 'w', level: 'Beginner' },
      site: SITE,
      date: DATE,
    });
    expect(load(pgn).headers).toMatchObject({ White: 'You', Black: 'Computer (Beginner)' });
  });

  it('leaves the players unknown in Analyse and records the result of a finished game', () => {
    const moves = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
    const pgn = buildPgn({ startFen: DEFAULT_POSITION, moves, players: { mode: 'analysis' }, site: SITE, date: DATE });
    const loaded = load(pgn);
    expect(loaded.moves).toEqual(moves);
    expect(loaded.headers).toMatchObject({ Event: 'Analysis', White: '?', Black: '?', Result: '0-1' });
    expect(pgn.trimEnd().endsWith('0-1')).toBe(true);
  });

  it('adds SetUp and FEN for a game from another position, Black to move', () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 b - - 0 40';
    const moves = ['e8d7', 'e2e4'];
    const pgn = buildPgn({ startFen: fen, moves, players: { mode: 'analysis' }, site: SITE, date: DATE });
    const loaded = load(pgn);
    expect(loaded.headers).toMatchObject({ SetUp: '1', FEN: fen });
    expect(loaded.moves).toEqual(moves);
  });

  it('stops at the first move that does not apply', () => {
    const pgn = buildPgn({
      startFen: DEFAULT_POSITION,
      moves: ['e2e4', 'e2e4', 'e7e5'],
      players: { mode: 'analysis' },
      site: SITE,
      date: DATE,
    });
    expect(load(pgn).moves).toEqual(['e2e4']);
  });
});

describe('pgnResult', () => {
  it('scores checkmate for the side that gave it', () => {
    expect(pgnResult(new Chess('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1'))).toBe('1-0');
  });

  it('scores a draw', () => {
    expect(pgnResult(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))).toBe('1/2-1/2');
  });

  it('marks a game still going', () => {
    expect(pgnResult(new Chess())).toBe('*');
  });
});

describe('pgnDate and pgnFileName', () => {
  it('use the local date, padded', () => {
    expect(pgnDate(DATE)).toBe('2026.10.02');
    expect(pgnFileName(DATE)).toBe('chess-2026-10-02-0905.pgn');
  });
});
