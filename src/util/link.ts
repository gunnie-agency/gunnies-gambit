import type { Color } from 'chess.js';
import { LEVELS } from '../engine/levels';
import { fenProblem } from './moves';

/** What a practice game is for, so the app can say it: mate a lone king, promote a pawn, or a first game. */
export const PRACTICE_GOALS = ['mate', 'promote', 'first'] as const;
export type PracticeGoal = (typeof PRACTICE_GOALS)[number];

/** A position to play out against the computer, as passed from the How to play page to the app. */
export interface PracticeLink {
  fen: string;
  /** The side the reader plays; the computer takes the other. */
  side: Color;
  /** A level id from `LEVELS`. */
  level: string;
  /** Only when the link names a known goal. */
  goal?: PracticeGoal;
}

export function isPracticeGoal(v: unknown): v is PracticeGoal {
  return PRACTICE_GOALS.includes(v as PracticeGoal);
}

/** A link to the app that starts a game from `fen`, for example `./#fen=...&mode=play&side=w&level=max&goal=mate`. */
export function buildPracticeLink(fen: string, side: Color, level: string, goal?: PracticeGoal): string {
  const link = `./#fen=${encodeURIComponent(fen)}&mode=play&side=${side}&level=${encodeURIComponent(level)}`;
  return goal ? `${link}&goal=${goal}` : link;
}

/**
 * Reads a practice link from a location hash. Returns null unless every required part is present and valid; an
 * unknown goal is left out, so an older or newer link still opens its position.
 */
export function parsePracticeLink(hash: string): PracticeLink | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const fen = params.get('fen');
  const side = params.get('side');
  const level = params.get('level');
  const goal = params.get('goal');
  if (params.get('mode') !== 'play' || fen === null || level === null) return null;
  if (side !== 'w' && side !== 'b') return null;
  if (!LEVELS.some((l) => l.id === level)) return null;
  if (fenProblem(fen) !== null) return null;
  return { fen, side, level, ...(isPracticeGoal(goal) && { goal }) };
}
