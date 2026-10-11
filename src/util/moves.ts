import { Chess, validateFen, type Move, type Square } from 'chess.js';
import { parseUciMove, type UciMove } from './uci';

/**
 * Reads a move typed by the user: SAN (`Nf3`, `exd5`), sloppy SAN (`Ng1f3`), castling with zeros (`0-0`)
 * or UCI (`e7e8q`). Returns the move without playing it, or null when it is not legal in `fen`.
 */
export function parseTypedMove(fen: string, text: string): UciMove | null {
  const raw = text.trim();
  if (!raw) return null;
  const normalised = raw.replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O');
  const game = new Chess(fen);
  const attempts: Array<string | UciMove> = [normalised];
  const uci = parseUciMove(normalised);
  if (uci) attempts.push(uci);
  for (const attempt of attempts) {
    try {
      const m = game.move(attempt, { strict: false });
      return toMove(m);
    } catch {
      // try the next interpretation
    }
  }
  return null;
}

/** Legal moves that land on `square`. */
function movesTo(game: Chess, square: Square): Move[] {
  return game.moves({ verbose: true }).filter((m) => m.to === square);
}

/**
 * For tapping only a destination square: the single piece that can move there, or null when none or several can.
 * Promotions count as one candidate (the caller asks which piece).
 */
export function uniqueMoveTo(game: Chess, square: Square): { from: Square; to: Square; promotion: boolean } | null {
  const candidates = movesTo(game, square);
  const first = candidates[0];
  if (!first || candidates.some((m) => m.from !== first.from)) return null;
  return { from: first.from, to: square, promotion: candidates.some((m) => m.promotion) };
}

/**
 * Why a FEN cannot be played, or null when it can. On top of chess.js's syntax checks, rejects positions where the
 * side that is not to move is in check: chess.js accepts those, but they cannot arise in a game and engines
 * behave unpredictably on them.
 */
export function fenProblem(fen: string): string | null {
  const check = validateFen(fen);
  if (!check.ok) return check.error ?? 'unknown error';
  const fields = fen.trim().split(/\s+/);
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  fields[3] = '-';
  if (new Chess(fields.join(' ')).inCheck()) return 'the side that is not to move is in check';
  return null;
}

export type GameEnd = 'checkmate' | 'stalemate' | 'threefold' | 'insufficient' | 'fifty-moves';

export function gameEnd(game: Chess): GameEnd | null {
  if (game.isCheckmate()) return 'checkmate';
  if (game.isStalemate()) return 'stalemate';
  if (game.isThreefoldRepetition()) return 'threefold';
  if (game.isInsufficientMaterial()) return 'insufficient';
  if (game.isDrawByFiftyMoves()) return 'fifty-moves';
  return null;
}

function toMove(m: Move): UciMove {
  const out: UciMove = { from: m.from, to: m.to };
  if (m.promotion) out.promotion = m.promotion as UciMove['promotion'];
  return out;
}
