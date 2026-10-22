import { Chess, DEFAULT_POSITION, type Color } from 'chess.js';
import { DEFAULT_LEVEL_ID, LEVELS } from './engine/levels';
import type { PositionEval } from './review/classify';
import { fenProblem } from './util/moves';
import { parseUciMove } from './util/uci';

export type Mode = 'play' | 'analysis';

export const THINK_TIMES = [1000, 3000, 8000] as const;

export interface Settings {
  mode: Mode;
  /** The side the user plays. */
  side: Color;
  /** Which side is at the bottom of the board. */
  orient: Color;
  /** Analysis search time in ms. */
  think: number;
  /** Opponent strength in play mode. */
  level: string;
  /** In play mode: show the evaluation (eval bar, score, verdict) all the time. */
  showEval: boolean;
  /** In play mode: show the best move, arrows and engine lines all the time instead of only on request. */
  showBest: boolean;
}

export interface SavedGame extends Settings {
  startFen: string;
  moves: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'play',
  side: 'w',
  orient: 'w',
  think: 3000,
  level: DEFAULT_LEVEL_ID,
  showEval: false,
  showBest: false,
};

const KEY = 'gunnies-gambit.v2';

/** Reads the saved game. Storage is a per-browser convenience, so anything odd falls back to defaults. */
export function loadSaved(): SavedGame | null {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<Record<keyof SavedGame, unknown>>;
  const color = (v: unknown, fallback: Color): Color => (v === 'w' || v === 'b' ? v : fallback);
  const side = color(s.side, DEFAULT_SETTINGS.side);
  return {
    mode: s.mode === 'analysis' ? 'analysis' : 'play',
    side,
    orient: color(s.orient, side),
    think: THINK_TIMES.includes(s.think as (typeof THINK_TIMES)[number]) ? (s.think as number) : DEFAULT_SETTINGS.think,
    level: LEVELS.some((l) => l.id === s.level) ? (s.level as string) : DEFAULT_SETTINGS.level,
    showEval: s.showEval === true,
    showBest: s.showBest === true,
    startFen: typeof s.startFen === 'string' ? s.startFen : DEFAULT_POSITION,
    moves: leadingStrings(s.moves),
  };
}

/** The strings at the start of `v`. Dropping a bad entry from the middle instead would replay a different game. */
function leadingStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const end = v.findIndex((m) => typeof m !== 'string');
  return (end === -1 ? v : v.slice(0, end)) as string[];
}

export function settingsOf(saved: SavedGame): Settings {
  const { mode, side, orient, think, level, showEval, showBest } = saved;
  return { mode, side, orient, think, level, showEval, showBest };
}

/** Stores the game as its start position and UCI moves, with the settings. */
export function saveGame(startFen: string, moves: readonly string[], settings: Settings): void {
  const saved: SavedGame = { ...settings, startFen, moves: [...moves] };
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // Private mode or storage full: the game just isn't remembered.
  }
}

/**
 * Rebuilds a game from a start position and UCI moves, stopping at the first move that does not apply. A start
 * position that cannot be played (see {@link fenProblem}) is replaced by the standard one.
 */
export function replay(startFen: string, moves: readonly string[]): { game: Chess; startFen: string } {
  const fen = fenProblem(startFen) === null ? startFen : DEFAULT_POSITION;
  const game = new Chess(fen);
  for (const uci of moves) {
    const move = parseUciMove(uci);
    if (!move) break;
    try {
      game.move(move);
    } catch {
      break;
    }
  }
  return { game, startFen: fen };
}

const REVIEW_KEY = 'gunnies-gambit.review.v1';

function isPositionEval(v: unknown): v is PositionEval {
  if (!v || typeof v !== 'object') return false;
  const { score, best } = v as Partial<Record<keyof PositionEval, unknown>>;
  if (!score || typeof score !== 'object') return false;
  const { kind, value } = score as Record<string, unknown>;
  return (kind === 'cp' || kind === 'mate') && Number.isFinite(value) && (best === null || typeof best === 'string');
}

/** Engine results of the last reviewed game, by cache key, so reopening its review needs no new searches. */
export function loadReviewCache(): Map<string, PositionEval> {
  const cache = new Map<string, PositionEval>();
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(REVIEW_KEY) ?? '[]');
  } catch {
    return cache;
  }
  if (!Array.isArray(raw)) return cache;
  for (const entry of raw) {
    if (Array.isArray(entry) && typeof entry[0] === 'string' && isPositionEval(entry[1])) cache.set(entry[0], entry[1]);
  }
  return cache;
}

/** Stores the given cache entries in place of the previous review's. */
export function saveReviewCache(entries: ReadonlyArray<[string, PositionEval]>): void {
  try {
    localStorage.setItem(REVIEW_KEY, JSON.stringify(entries));
  } catch {
    // Not remembered; the review is just searched again next time.
  }
}
