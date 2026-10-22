import type { Color } from 'chess.js';
import { LEVELS } from '../engine/levels';
import { fenProblem } from './moves';

/** A position to play out against the computer, as passed from the How to play page to the app. */
export interface PracticeLink {
  fen: string;
  /** The side the reader plays; the computer takes the other. */
  side: Color;
  /** A level id from `LEVELS`. */
  level: string;
}

/** A link to the app that starts a game from `fen`, for example `./#fen=...&mode=play&side=w&level=max`. */
export function buildPracticeLink(fen: string, side: Color, level: string): string {
  return `./#fen=${encodeURIComponent(fen)}&mode=play&side=${side}&level=${encodeURIComponent(level)}`;
}

/** Reads a practice link from a location hash. Returns null unless every part is present and valid. */
export function parsePracticeLink(hash: string): PracticeLink | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const fen = params.get('fen');
  const side = params.get('side');
  const level = params.get('level');
  if (params.get('mode') !== 'play' || fen === null || level === null) return null;
  if (side !== 'w' && side !== 'b') return null;
  if (!LEVELS.some((l) => l.id === level)) return null;
  if (fenProblem(fen) !== null) return null;
  return { fen, side, level };
}
