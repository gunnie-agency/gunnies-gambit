import { chesscomArchivesUrl, newestArchives, parseChesscomGames } from './chesscom';
import { MAX_GAMES, mostRecent, problemForStatus, type GameSummary, type ImportProblem, type Site } from './games';
import { lichessGamesUrl, parseLichessGames } from './lichess';

export class ImportError extends Error {
  constructor(readonly problem: ImportProblem) {
    super(problem);
    this.name = 'ImportError';
  }
}

/** A plain GET without cookies or referrer, so the site learns the username and nothing else. */
async function get(url: string, accept: string, signal: AbortSignal): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: accept },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal,
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new ImportError('network');
  }
  if (!response.ok) throw new ImportError(problemForStatus(response.status));
  try {
    return await response.text();
  } catch (err) {
    if (signal.aborted) throw err;
    throw new ImportError('network');
  }
}

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const text = await get(url, 'application/json', signal);
  try {
    return JSON.parse(text);
  } catch {
    throw new ImportError('unavailable');
  }
}

async function lichessGames(username: string, signal: AbortSignal): Promise<GameSummary[]> {
  return parseLichessGames(await get(lichessGamesUrl(username), 'application/x-ndjson', signal), username);
}

/** The newest monthly archive, plus the one before when the newest holds too few finished games. */
async function chesscomGames(username: string, signal: AbortSignal): Promise<GameSummary[]> {
  const archives = newestArchives(await getJson(chesscomArchivesUrl(username), signal));
  const games: GameSummary[] = [];
  for (const url of archives) {
    games.push(...parseChesscomGames(await getJson(url, signal), username));
    if (games.length >= MAX_GAMES) break;
  }
  return games;
}

/**
 * The user's most recent finished games on the chosen site, newest first, fetched once on request. Throws an
 * ImportError for an unknown user, rate limiting, a failing site or no connection; an empty list means no games.
 */
export async function fetchFinishedGames(site: Site, username: string, signal: AbortSignal): Promise<GameSummary[]> {
  const games = site === 'lichess' ? await lichessGames(username, signal) : await chesscomGames(username, signal);
  return mostRecent(games);
}
