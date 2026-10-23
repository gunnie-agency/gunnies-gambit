import { hasMoves } from '../util/pgn';
import { finishedResult, formatClock, formatDays, MAX_GAMES, outcomeFor, sideOf, type GameSummary } from './games';

/** Variants the board can replay: standard chess, possibly from a set-up position (the PGN then carries a FEN). */
const VARIANTS = new Set(['standard', 'fromPosition']);

/** The user's most recent finished games, as NDJSON with the PGN of each game included. */
export function lichessGamesUrl(username: string, max = MAX_GAMES): string {
  const params = new URLSearchParams({
    max: String(max),
    finished: 'true',
    ongoing: 'false',
    pgnInJson: 'true',
  });
  return `https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params}`;
}

interface LichessPlayer {
  user?: { name?: unknown };
  aiLevel?: unknown;
}

interface LichessGame {
  id?: unknown;
  variant?: unknown;
  status?: unknown;
  createdAt?: unknown;
  lastMoveAt?: unknown;
  players?: { white?: LichessPlayer; black?: LichessPlayer };
  clock?: { initial?: unknown; increment?: unknown };
  daysPerTurn?: unknown;
  pgn?: unknown;
}

function playerName(player: LichessPlayer | undefined): string {
  if (typeof player?.user?.name === 'string') return player.user.name;
  if (typeof player?.aiLevel === 'number') return `Lichess AI level ${player.aiLevel}`;
  return 'Anonymous';
}

function timeControl(game: LichessGame): string {
  const { initial, increment } = game.clock ?? {};
  if (typeof initial === 'number' && typeof increment === 'number') return formatClock(initial, increment);
  if (typeof game.daysPerTurn === 'number') return formatDays(game.daysPerTurn);
  return 'Unlimited';
}

function summary(game: LichessGame, username: string): GameSummary | null {
  if (typeof game.id !== 'string' || typeof game.pgn !== 'string') return null;
  if (typeof game.variant !== 'string' || !VARIANTS.has(game.variant)) return null;
  if (game.status === 'created' || game.status === 'started') return null;
  const result = finishedResult(game.pgn);
  if (!result) return null;
  if (!hasMoves(game.pgn)) return null; // abandoned before the first move: nothing to review
  const white = playerName(game.players?.white);
  const black = playerName(game.players?.black);
  const side = sideOf(username, white, black);
  if (!side) return null;
  const ended = typeof game.lastMoveAt === 'number' ? game.lastMoveAt : game.createdAt;
  return {
    site: 'lichess',
    id: game.id,
    side,
    opponent: side === 'w' ? black : white,
    outcome: outcomeFor(result, side),
    endedAt: typeof ended === 'number' ? ended : 0,
    timeControl: timeControl(game),
    pgn: game.pgn,
  };
}

/** Finished standard games of `username` from a Lichess NDJSON export; unreadable lines are skipped. */
export function parseLichessGames(ndjson: string, username: string): GameSummary[] {
  const games: GameSummary[] = [];
  for (const line of ndjson.split('\n')) {
    if (!line.trim()) continue;
    let game: unknown;
    try {
      game = JSON.parse(line);
    } catch {
      continue;
    }
    const parsed = game && typeof game === 'object' ? summary(game as LichessGame, username) : null;
    if (parsed) games.push(parsed);
  }
  return games;
}
