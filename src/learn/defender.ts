import type { Chess, Move, PieceSymbol, Square } from 'chess.js';

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** How many squares lie between a square and the nearest edge of the board: 0 on the edge, 3 in the centre. */
export function edgeDistance(square: Square): number {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]) - 1;
  return Math.min(file, 7 - file, rank, 7 - rank);
}

/** True when the side to move can checkmate at once: SAN marks a mating move with `#`. */
function canMate(game: Chess): boolean {
  return game.moves().some((san) => san.endsWith('#'));
}

/** What a move is worth to the defender, compared field by field: material first, then safety, then the centre. */
function score(game: Chess, move: Move): [number, number, number] {
  game.move(move);
  const safe = canMate(game) ? 0 : 1;
  game.undo();
  return [move.captured ? VALUE[move.captured] : 0, safe, edgeDistance(move.to)];
}

function better(a: readonly number[], b: readonly number[]): boolean {
  const i = a.findIndex((v, k) => v !== b[k]);
  return i !== -1 && (a[i] ?? 0) > (b[i] ?? 0);
}

/**
 * The move a simple defender plays in the mating endgames: it takes a piece left hanging, avoids a mate in one when
 * it can, and otherwise keeps its king as far from the edge as possible. Enough to make the reader use the technique,
 * without an engine. Null when the side to move has no move.
 */
export function defend(game: Chess): Move | null {
  let best: Move | null = null;
  let bestScore: [number, number, number] = [-1, -1, -1];
  for (const move of game.moves({ verbose: true })) {
    const s = score(game, move);
    if (better(s, bestScore)) [best, bestScore] = [move, s];
  }
  return best;
}
