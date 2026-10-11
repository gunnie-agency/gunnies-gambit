import type { Score } from '../util/score';

export interface EngineInfo {
  depth: number;
  multipv: number;
  /** Score from the side to move's point of view, as UCI reports it. */
  score: Score;
  pv: string[];
}

/**
 * Parses a UCI `info` line. Returns null for lines without a usable score and PV
 * (`info string ...`, `currmove` updates, lowerbound/upperbound scores).
 */
export function parseInfo(line: string): EngineInfo | null {
  const t = line.trim().split(/\s+/);
  if (t[0] !== 'info') return null;
  let depth = 0;
  let multipv = 1;
  let score: Score | null = null;
  let bound = false;
  let pv: string[] = [];
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'string':
        return null;
      case 'depth':
        depth = Number(t[++i]);
        break;
      case 'multipv':
        multipv = Number(t[++i]);
        break;
      case 'score': {
        const kind = t[++i];
        const value = Number(t[++i]);
        if ((kind === 'cp' || kind === 'mate') && Number.isFinite(value)) score = { kind, value };
        if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') {
          bound = true;
          i++;
        }
        break;
      }
      case 'pv':
        pv = t.slice(i + 1);
        i = t.length;
        break;
    }
  }
  if (!score || bound || pv.length === 0 || !Number.isFinite(depth) || !(multipv >= 1)) return null;
  return { depth, multipv, score, pv };
}

/** Parses `bestmove e2e4 ponder e7e5`. Returns the move, or null for `(none)` (no legal moves). */
export function parseBestMove(line: string): { move: string | null } | null {
  const t = line.trim().split(/\s+/);
  if (t[0] !== 'bestmove') return null;
  const move = t[1];
  return { move: move && move !== '(none)' ? move : null };
}
