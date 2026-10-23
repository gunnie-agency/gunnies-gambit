import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { chesscomArchivesUrl, chesscomTimeControl, newestArchives, parseChesscomGames } from './chesscom';
import archives from './fixtures/chesscom-hikaru-archives.json?raw';
import month from './fixtures/chesscom-hikaru-2026-10.json?raw';

const monthJson = JSON.parse(month) as { games: Record<string, unknown>[] };
const withGame = (patch: Record<string, unknown>) => ({ games: [{ ...monthJson.games[0], ...patch }] });

describe('chesscomArchivesUrl', () => {
  it('points at the archive list of the player', () => {
    expect(chesscomArchivesUrl('Hikaru')).toBe('https://api.chess.com/pub/player/Hikaru/games/archives');
  });
});

describe('newestArchives', () => {
  it('returns the newest months first', () => {
    expect(newestArchives(JSON.parse(archives))).toEqual([
      'https://api.chess.com/pub/player/hikaru/games/2026/10',
      'https://api.chess.com/pub/player/hikaru/games/2026/09',
    ]);
  });

  it('ignores anything that is not a Chess.com API URL', () => {
    expect(newestArchives({ archives: ['https://example.com/x', 42] })).toEqual([]);
    expect(newestArchives(null)).toEqual([]);
    expect(newestArchives({ archives: [] })).toEqual([]);
  });
});

describe('chesscomTimeControl', () => {
  it('reads live and daily time controls', () => {
    expect(chesscomTimeControl('180')).toBe('3+0');
    expect(chesscomTimeControl('180+2')).toBe('3+2');
    expect(chesscomTimeControl('1/86400')).toBe('1 day');
    expect(chesscomTimeControl('1/259200')).toBe('3 days');
  });
});

describe('parseChesscomGames', () => {
  it('summarises a real monthly archive from the user side', () => {
    const games = parseChesscomGames(monthJson, 'hikaru');
    expect(games.map((g) => [g.side, g.opponent, g.outcome, g.timeControl])).toEqual([
      ['w', 'crescentmoon2411', 'draw', '3+0'],
      ['w', 'BillieKimbah', 'win', '3+0'],
      ['w', 'Sina-Movahed', 'loss', '3+0'],
    ]);
    expect(games[2]?.endedAt).toBe(1792686160000);
  });

  it('keeps PGNs that the board can load, clock comments and all', () => {
    for (const game of parseChesscomGames(monthJson, 'Hikaru')) {
      const chess = new Chess();
      chess.loadPgn(game.pgn);
      expect(chess.history().length).toBeGreaterThan(10);
    }
  });

  it('drops games without a final result', () => {
    const pgn = String(monthJson.games[0]?.pgn).replace('[Result "1/2-1/2"]', '[Result "*"]');
    expect(parseChesscomGames(withGame({ pgn }), 'hikaru')).toEqual([]);
  });

  it('drops games abandoned before a move, which have nothing to review', () => {
    const tags = String(monthJson.games[0]?.pgn).split('\n\n')[0];
    expect(parseChesscomGames(withGame({ pgn: `${tags}\n\n1/2-1/2\n` }), 'hikaru')).toEqual([]);
  });

  it('drops variants and games of other players', () => {
    expect(parseChesscomGames(withGame({ rules: 'chess960' }), 'hikaru')).toEqual([]);
    expect(parseChesscomGames(monthJson, 'someone-else')).toEqual([]);
    expect(parseChesscomGames({}, 'hikaru')).toEqual([]);
  });
});
