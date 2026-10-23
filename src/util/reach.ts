import type { Chess, PieceSymbol, Square } from 'chess.js';

const PIECE_NAME: Record<PieceSymbol, string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
};

/**
 * Why the piece on `from` cannot go to `to`, for a beginner who tapped one and then the other. Null when the move is
 * legal, and when the tap is no move attempt: no piece of the side to move on `from`, or one of its own pieces on
 * `to`, which the board selects instead.
 */
export function cannotReach(game: Chess, from: Square, to: Square): string | null {
  const piece = game.get(from);
  if (!piece || piece.color !== game.turn() || from === to) return null;
  if (game.get(to)?.color === piece.color) return null;
  if (game.moves({ square: from, verbose: true }).some((m) => m.to === to)) return null;
  const next = Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) <= 1 && Math.abs(Number(from[1]) - Number(to[1])) <= 1;
  // A king's step to a free or enemy square next to it is only illegal when the square is attacked.
  if (piece.type === 'k' && next) return "The king can't move into check.";
  if (game.inCheck()) return 'Your king is in check: move it, block the check or capture the attacker.';
  return `A ${PIECE_NAME[piece.type]} can't go there.`;
}
