import type { Square } from 'chess.js';

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export interface UciMove {
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
}

const UCI_RE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;

/** Parses a UCI move such as `e2e4` or `e7e8q`. Returns null for anything else, including `(none)`. */
export function parseUciMove(text: string): UciMove | null {
  const m = UCI_RE.exec(text.trim().toLowerCase());
  if (!m) return null;
  const move: UciMove = { from: m[1] as Square, to: m[2] as Square };
  if (m[3]) move.promotion = m[3] as PromotionPiece;
  return move;
}

export function toUci(move: { from: string; to: string; promotion?: string | undefined }): string {
  return move.from + move.to + (move.promotion ?? '');
}
