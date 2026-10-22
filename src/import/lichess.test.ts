import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/lichess-drnykterstein.ndjson?raw';
import { lichessGamesUrl, parseLichessGames } from './lichess';

const first = fixture.split('\n')[0] as string;
/** The first fixture game with some fields replaced. */
const changed = (patch: Record<string, unknown>) => JSON.stringify({ ...JSON.parse(first), ...patch });

describe('lichessGamesUrl', () => {
  it('asks for the latest finished games with their PGN', () => {
    const url = new URL(lichessGamesUrl('Dr Nyk'));
    expect(url.origin + url.pathname).toBe('https://lichess.org/api/games/user/Dr%20Nyk');
    expect(url.searchParams.get('max')).toBe('20');
    expect(url.searchParams.get('finished')).toBe('true');
    expect(url.searchParams.get('ongoing')).toBe('false');
    expect(url.searchParams.get('pgnInJson')).toBe('true');
  });
});

describe('parseLichessGames', () => {
  it('summarises a real export from the user side', () => {
    const games = parseLichessGames(fixture, 'drnykterstein');
    expect(games).toHaveLength(3);
    expect(games[0]).toMatchObject({
      site: 'lichess',
      id: 'HqjDTU4A',
      side: 'w',
      opponent: 'Night-King96',
      outcome: 'win',
      endedAt: 1792001402854,
      timeControl: '3+0',
    });
    expect(games[1]).toMatchObject({ side: 'b', opponent: 'oasenegre', outcome: 'win' });
    expect(games[2]).toMatchObject({ timeControl: '1+0' });
  });

  it('keeps PGNs that the board can load', () => {
    for (const game of parseLichessGames(fixture, 'DrNykterstein')) {
      const chess = new Chess();
      chess.loadPgn(game.pgn);
      expect(chess.history().length).toBeGreaterThan(10);
    }
  });

  it('drops games that have not ended', () => {
    const ongoing = changed({ status: 'started', pgn: '[Result "*"]\n\n1. e4 *' });
    const noResult = changed({ status: 'resign', pgn: '[Event "x"]\n\n1. e4' });
    expect(parseLichessGames([ongoing, noResult].join('\n'), 'drnykterstein')).toEqual([]);
  });

  it('drops variants the board cannot play and games of other players', () => {
    expect(parseLichessGames(changed({ variant: 'chess960' }), 'drnykterstein')).toEqual([]);
    expect(parseLichessGames(first, 'someone-else')).toEqual([]);
  });

  it('names computer opponents and reads correspondence clocks', () => {
    const game = JSON.parse(first);
    game.players.black = { aiLevel: 3 };
    delete game.clock;
    game.daysPerTurn = 2;
    const [summary] = parseLichessGames(JSON.stringify(game), 'drnykterstein');
    expect(summary).toMatchObject({ opponent: 'Lichess AI level 3', timeControl: '2 days' });
  });

  it('skips lines that are not JSON', () => {
    expect(parseLichessGames(`not json\n\n${first}\n`, 'drnykterstein')).toHaveLength(1);
  });
});
