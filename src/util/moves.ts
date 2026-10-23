import { Chess, validateFen, type Move, type Square } from 'chess.js';
import type { UciMove } from './uci';

const UCI_LIKE = /^([a-h][1-8])-?([a-h][1-8])=?([qrbn])?[+#]?$/i;
const CASTLING = /^[0o]-[0o](-[0o])?([+#]?)$/i;
const PROMOTION_PIECE = /([a-h][18])=?([qrbn])([+#]?)$/i;
const PROMOTION_SQUARE = /([a-h][18])([+#]?)$/;
/** A piece letter typed in lower case at the start of a move, such as the `n` of `nf3`. */
const LOWER_PIECE = /^[kqrbn]/;

/**
 * Reads a move typed by the user: SAN (`Nf3`, `exd5`, `e8=Q`, `e8q`), sloppy SAN (`Ng1f3`), castling with letters
 * or zeros in either case (`O-O`, `o-o`, `0-0-0`) or UCI (`e7e8q`). A promotion without a piece is a queen, and a
 * piece letter may be lower case (`nf3`). A leading `b` is read as a pawn on the b-file first, as SAN writes pawn
 * moves, and as a bishop only when no such pawn move is legal (`bxc3`).
 * Returns the move without playing it, or null when it is not legal in `fen`.
 */
export function parseTypedMove(fen: string, text: string): UciMove | null {
  const raw = text.trim();
  if (!raw) return null;
  const game = new Chess(fen);

  // UCI first: chess.js's sloppy SAN parser would read `e7e8` as an underpromotion.
  const uci = UCI_LIKE.exec(raw);
  if (uci) return uciMove(game, uci[1] as Square, uci[2] as Square, uci[3]?.toLowerCase());

  const castling = CASTLING.exec(raw);
  if (castling) return sanMove(game, `${castling[1] ? 'O-O-O' : 'O-O'}${castling[2] ?? ''}`);

  return sanWithPromotion(game, raw) ?? (LOWER_PIECE.test(raw) ? sanWithPromotion(game, capitalise(raw)) : null);
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A SAN move, with a lower-case or missing promotion piece read as SAN expects it. */
function sanWithPromotion(game: Chess, raw: string): UciMove | null {
  const san = raw.replace(PROMOTION_PIECE, (_, sq: string, piece: string, mark: string) => {
    return `${sq}=${piece.toUpperCase()}${mark}`;
  });
  const queen = san.replace(PROMOTION_SQUARE, '$1=Q$2');
  return sanMove(game, san) ?? (queen === san ? null : sanMove(game, queen));
}

/** The legal move from `from` to `to`. A promotion takes `piece`, or a queen when none is given. */
function uciMove(game: Chess, from: Square, to: Square, piece: string | undefined): UciMove | null {
  const candidates = game.moves({ square: from, verbose: true }).filter((m) => m.to === to);
  const promotion = candidates.some((m) => m.promotion) ? (piece ?? 'q') : piece;
  const move = candidates.find((m) => m.promotion === promotion);
  return move ? toMove(move) : null;
}

function sanMove(game: Chess, san: string): UciMove | null {
  try {
    return toMove(game.move(san, { strict: false }));
  } catch {
    return null;
  }
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
