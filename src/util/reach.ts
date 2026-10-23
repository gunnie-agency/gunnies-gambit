import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';

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
  if (piece.type === 'k') return kingReason(game, from, to);
  if (movesIgnoringChecks(game, from, to)) {
    if (game.inCheck()) return 'The king is in check: move it, block the check or capture the attacker.';
    return 'That would leave the king in check.';
  }
  return (piece.type === 'p' && pawnReason(game, from, to)) || `A ${PIECE_NAME[piece.type]} can't go there.`;
}

function kingReason(game: Chess, from: Square, to: Square): string {
  const next = Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) <= 1 && Math.abs(Number(from[1]) - Number(to[1])) <= 1;
  // A king's step to a free or enemy square next to it is only illegal when the square is attacked.
  if (next) return "The king can't move into check.";
  return castlingReason(game, from, to) ?? "A king can't go there.";
}

/** Why a castling the king on its own square taps for is not allowed, or null when the tap is no castling. */
function castlingReason(game: Chess, from: Square, to: Square): string | null {
  const color = game.turn();
  const rank = color === 'w' ? '1' : '8';
  if (from !== `e${rank}` || (to !== `g${rank}` && to !== `c${rank}`)) return null;
  const side = to.startsWith('g') ? 'k' : 'q';
  if (!game.getCastlingRights(color)[side]) return 'Castling is no longer possible: the king or that rook has moved.';
  const between = side === 'k' ? ['f', 'g'] : ['b', 'c', 'd'];
  if (between.some((file) => game.get(`${file}${rank}` as Square)))
    return 'Castling needs the squares between the king and the rook empty.';
  return "The king can't castle out of, through or into check.";
}

/** Whether the piece could make the move if its own king were not on the board, so no check could stop it. */
function movesIgnoringChecks(game: Chess, from: Square, to: Square): boolean {
  const kingless = new Chess(game.fen());
  const king = game.findPiece({ type: 'k', color: game.turn() })[0];
  if (king) kingless.remove(king);
  return kingless.moves({ square: from, verbose: true }).some((m) => m.to === to);
}

/** Why a pawn's push or en passant capture is not possible, or null when the tap is no such move. */
function pawnReason(game: Chess, from: Square, to: Square): string | null {
  const color: Color = game.turn();
  const forward = (Number(to[1]) - Number(from[1])) * (color === 'w' ? 1 : -1);
  const home = color === 'w' ? '2' : '7';
  if (from[0] === to[0] && (forward === 1 || (forward === 2 && from[1] === home))) return 'The pawn is blocked.';
  const beside = `${to[0]}${from[1]}` as Square;
  const fifth = color === 'w' ? '5' : '4';
  const enemyPawn = game.get(beside);
  const sideways = Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 1;
  if (sideways && forward === 1 && from[1] === fifth && !game.get(to) && enemyPawn?.type === 'p')
    return "En passant is only possible right after the pawn's two-square move.";
  return null;
}
