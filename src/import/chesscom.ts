import { hasMoves } from '../util/pgn';
import { finishedResult, formatClock, formatDays, outcomeFor, sideOf, type GameSummary } from './games';

const API = 'https://api.chess.com/pub/player/';

/** The list of the user's monthly game archives, oldest first. */
export function chesscomArchivesUrl(username: string): string {
  return `${API}${encodeURIComponent(username)}/games/archives`;
}

/**
 * The newest `count` monthly archive URLs, newest first. Only URLs on the Chess.com API are kept, so a response can
 * never send the next request anywhere else.
 */
export function newestArchives(json: unknown, count = 2): string[] {
  const archives = (json as { archives?: unknown } | null)?.archives;
  if (!Array.isArray(archives)) return [];
  return archives
    .filter((url): url is string => typeof url === 'string' && url.startsWith(API))
    .slice(-count)
    .reverse();
}

interface ChesscomPlayer {
  username?: unknown;
}

interface ChesscomGame {
  uuid?: unknown;
  url?: unknown;
  pgn?: unknown;
  time_control?: unknown;
  end_time?: unknown;
  rules?: unknown;
  white?: ChesscomPlayer;
  black?: ChesscomPlayer;
}

/** Chess.com writes "180+2" for live games and "1/259200" (seconds per move) for daily games. */
export function chesscomTimeControl(value: string): string {
  const daily = /^1\/(\d+)$/.exec(value);
  if (daily) return formatDays(Math.round(Number(daily[1]) / 86400));
  const live = /^(\d+)(?:\+(\d+))?$/.exec(value);
  if (live) return formatClock(Number(live[1]), Number(live[2] ?? 0));
  return value;
}

function summary(game: ChesscomGame, username: string): GameSummary | null {
  if (typeof game.pgn !== 'string' || game.rules !== 'chess') return null;
  const result = finishedResult(game.pgn);
  if (!result) return null;
  if (!hasMoves(game.pgn)) return null; // abandoned before the first move: nothing to review
  const white = typeof game.white?.username === 'string' ? game.white.username : '';
  const black = typeof game.black?.username === 'string' ? game.black.username : '';
  const side = sideOf(username, white, black);
  if (!side) return null;
  const id = [game.uuid, game.url].find((v): v is string => typeof v === 'string');
  if (!id) return null;
  return {
    site: 'chesscom',
    id,
    side,
    opponent: side === 'w' ? black : white,
    outcome: outcomeFor(result, side),
    endedAt: typeof game.end_time === 'number' ? game.end_time * 1000 : 0,
    timeControl: typeof game.time_control === 'string' ? chesscomTimeControl(game.time_control) : '',
    pgn: game.pgn,
  };
}

/** Finished standard games of `username` from one Chess.com monthly archive. */
export function parseChesscomGames(json: unknown, username: string): GameSummary[] {
  const games = (json as { games?: unknown } | null)?.games;
  if (!Array.isArray(games)) return [];
  return games.flatMap((game: unknown) => {
    const parsed = game && typeof game === 'object' ? summary(game as ChesscomGame, username) : null;
    return parsed ? [parsed] : [];
  });
}
