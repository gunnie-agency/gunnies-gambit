import type { Color } from 'chess.js';

export type Site = 'lichess' | 'chesscom';

export const SITE_NAME: Record<Site, string> = { lichess: 'Lichess', chesscom: 'Chess.com' };

/** How many finished games the list shows. */
export const MAX_GAMES = 20;

export type Outcome = 'win' | 'loss' | 'draw';

/** One finished game from a user's history, as the "Your games" list shows it. */
export interface GameSummary {
  site: Site;
  id: string;
  /** The colour the user played. */
  side: Color;
  opponent: string;
  outcome: Outcome;
  /** When the game ended, in ms since the epoch. */
  endedAt: number;
  /** For example "3+2", "½+0" or "3 days". */
  timeControl: string;
  pgn: string;
}

type FinishedResult = '1-0' | '0-1' | '1/2-1/2';

/**
 * The PGN's Result tag if the game has ended. Ongoing games ("*") and games without a result are never imported:
 * reviewing a game that is still being played would be engine help in a live game.
 */
export function finishedResult(pgn: string): FinishedResult | null {
  const result = /^\[Result "([^"]*)"\]/m.exec(pgn)?.[1];
  return result === '1-0' || result === '0-1' || result === '1/2-1/2' ? result : null;
}

export function outcomeFor(result: FinishedResult, side: Color): Outcome {
  if (result === '1/2-1/2') return 'draw';
  return (result === '1-0') === (side === 'w') ? 'win' : 'loss';
}

/** The colour `username` played, matched case-insensitively, or null if they did not play this game. */
export function sideOf(username: string, white: string, black: string): Color | null {
  const name = username.toLowerCase();
  if (white.toLowerCase() === name) return 'w';
  if (black.toLowerCase() === name) return 'b';
  return null;
}

/**
 * A username as typed, trimmed, or null if no site would accept it. Both sites allow letters, digits, "_" and "-"
 * (Lichess 2 to 30 characters, Chess.com 3 to 25), so anything else is refused before a request is made.
 */
export function cleanUsername(input: string): string | null {
  const name = input.trim();
  return /^[\w-]{2,30}$/.test(name) ? name : null;
}

const FRACTIONS: Record<number, string> = { 15: '¼', 30: '½', 45: '¾' };

/** A clock as the sites show it: minutes plus increment in seconds, so 180 s + 2 s is "3+2". */
export function formatClock(initialSeconds: number, incrementSeconds: number): string {
  const minutes = FRACTIONS[initialSeconds] ?? String(Math.round((initialSeconds / 60) * 10) / 10);
  return `${minutes}+${incrementSeconds}`;
}

export function formatDays(days: number): string {
  return days === 1 ? '1 day' : `${days} days`;
}

/** The most recent games first, at most `limit`. */
export function mostRecent(games: readonly GameSummary[], limit = MAX_GAMES): GameSummary[] {
  return [...games].sort((a, b) => b.endedAt - a.endedAt).slice(0, limit);
}

export type ImportProblem = 'not-found' | 'rate-limited' | 'unavailable' | 'network';

/** Why a request with this HTTP status failed. */
export function problemForStatus(status: number): ImportProblem {
  if (status === 404) return 'not-found';
  if (status === 429) return 'rate-limited';
  return 'unavailable';
}

export function problemMessage(problem: ImportProblem, site: Site, username: string): string {
  const name = SITE_NAME[site];
  switch (problem) {
    case 'not-found':
      return `${name} has no player called ${username}. Check the spelling, or pick the other site.`;
    case 'rate-limited':
      return `${name} asks us to slow down. Wait a minute, then try again.`;
    case 'unavailable':
      return `${name} did not answer properly. Try again in a moment.`;
    case 'network':
      return `Could not reach ${name}. Check your connection and try again.`;
  }
}

/** The status line above the list. */
export function listMessage(count: number, site: Site, username: string): string {
  const name = SITE_NAME[site];
  if (count === 0) return `${username} has no recent finished games on ${name}.`;
  const games = count === 1 ? 'game' : 'games';
  return `${count} finished ${games} of ${username} on ${name}. Pick one to review it.`;
}
