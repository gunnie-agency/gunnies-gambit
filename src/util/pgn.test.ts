import { Chess, DEFAULT_POSITION } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { buildPgn, keptTags, pgnDate, pgnFileName, pgnResult, readPgn } from './pgn';

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

  it('keeps the tags of a loaded game and its result while the moves do not decide it', () => {
    const tags = { White: 'Alice', Black: 'Bob', Date: '2026.01.02', Result: '0-1', BlackElo: '1500' };
    const pgn = buildPgn({
      startFen: DEFAULT_POSITION,
      moves: ['e2e4'],
      players: { mode: 'analysis' },
      site: SITE,
      date: DATE,
      tags,
    });
    expect(load(pgn).headers).toEqual({
      Event: 'Analysis',
      Site: SITE,
      Date: '2026.01.02',
      Round: '-',
      White: 'Alice',
      Black: 'Bob',
      Result: '0-1',
      BlackElo: '1500',
    });
    expect(pgn.trimEnd().endsWith('1. e4 0-1')).toBe(true);
  });

  it('scores a checkmate on the board over the loaded result', () => {
    const moves = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
    const tags = { Result: '1/2-1/2' };
    const pgn = buildPgn({
      startFen: DEFAULT_POSITION,
      moves,
      players: { mode: 'analysis' },
      site: SITE,
      date: DATE,
      tags,
    });
    expect(load(pgn).headers.Result).toBe('0-1');
  });

  it('escapes quotes and backslashes in tag values', () => {
    const tags = { White: 'Alice "A"', Black: 'C:\\games' };
    const pgn = buildPgn({
      startFen: DEFAULT_POSITION,
      moves: [],
      players: { mode: 'analysis' },
      site: SITE,
      date: DATE,
      tags,
    });
    expect(pgn).toContain('[White "Alice \\"A\\""]');
    expect(readPgn(pgn)?.headers).toMatchObject(tags);
  });

  it('names the opening', () => {
    const opening = { eco: 'C40', name: "King's Knight Opening" };
    const pgn = buildPgn({
      startFen: DEFAULT_POSITION,
      moves: ['e2e4', 'e7e5', 'g1f3'],
      players: { mode: 'analysis' },
      site: SITE,
      date: DATE,
      opening,
    });
    expect(load(pgn).headers).toMatchObject({ ECO: 'C40', Opening: "King's Knight Opening" });
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

describe('readPgn', () => {
  it('reads the start position, the moves and the tags', () => {
    expect(readPgn('[White "Alice"][Black "Bob"][Result "0-1"] 1. e4 e5 2. Nf3 0-1')).toEqual({
      startFen: DEFAULT_POSITION,
      moves: ['e2e4', 'e7e5', 'g1f3'],
      headers: { White: 'Alice', Black: 'Bob', Result: '0-1' },
    });
  });

  it('accepts escaped quotes and backslashes in a tag, as the PGN standard allows', () => {
    const read = readPgn('[White "Alice \\"A\\""]\n[Black "C:\\\\games"]\n[Result "1-0"]\n\n1. e4 1-0');
    expect(read?.headers).toEqual({ White: 'Alice "A"', Black: 'C:\\games', Result: '1-0' });
    expect(read?.moves).toEqual(['e2e4']);
  });

  it('starts from the FEN tag and keeps promotions', () => {
    const fen = '8/4P1k1/8/8/8/8/8/4K3 w - - 0 1';
    expect(readPgn(`[SetUp "1"]\n[FEN "${fen}"]\n\n1. e8=Q *`)).toMatchObject({ startFen: fen, moves: ['e7e8q'] });
  });

  it('refuses text that is not a game', () => {
    expect(readPgn('1. e4 e4')).toBeNull();
  });
});

describe('keptTags', () => {
  it('keeps the tags that describe the game, and only a valid result', () => {
    const headers = {
      Event: 'Rated blitz game',
      White: 'Alice',
      FEN: 'x',
      SetUp: '1',
      Annotator: 'me',
      TimeControl: '180+2',
    };
    expect(keptTags(headers)).toEqual({ Event: 'Rated blitz game', White: 'Alice', TimeControl: '180+2' });
    expect(keptTags({ Result: '1-0' })).toEqual({ Result: '1-0' });
    expect(keptTags({ Result: 'White won' })).toEqual({});
  });
});
