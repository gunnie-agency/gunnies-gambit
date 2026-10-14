import { Chess, type Square } from 'chess.js';
import type { PromotionPiece } from '../util/uci';
import { PIECE_NAME, type Lesson } from './lessons';

/** A move the reader has chosen but that still needs a promotion piece. */
export interface PendingMove {
  from: Square;
  to: Square;
}

const COLOR_NAME = { w: 'White', b: 'Black' } as const;

/** The same position with White to move again, so a free practice board never runs out of turns. */
function whiteToMove(fen: string): string {
  const fields = fen.split(' ');
  fields[1] = 'w';
  fields[3] = '-';
  return fields.join(' ');
}

/**
 * The state of one practice board: the position, the selected square, the last move and what the board says. No DOM,
 * so the behaviour of every lesson can be tested directly.
 */
export class Practice {
  game!: Chess;
  selected: Square | null = null;
  last: { from: Square; to: Square } | undefined;
  /** What the board says after a move; null while the page's intro text applies. */
  message: string | null = null;
  /** A task lesson after its move: the board takes no input until it is reset. */
  done = false;

  constructor(readonly lesson: Lesson) {
    this.reset();
  }

  reset(): void {
    // Free boards hold a single piece without kings, which normal validation rejects.
    this.game = new Chess(this.lesson.fen, { skipValidation: this.lesson.mode === 'free' });
    for (const san of this.lesson.setup ?? []) this.game.move(san);
    const last = this.game.history({ verbose: true }).at(-1);
    this.last = last && { from: last.from, to: last.to };
    this.selected = null;
    this.message = null;
    this.done = false;
  }

  /**
   * Handles a tap or click on a square: selects a piece of the side to move, or moves the selected piece there.
   * Returns the move when it is a promotion, so the caller can ask which piece; `play` then finishes it.
   */
  tap(square: Square): PendingMove | null {
    if (this.done) return null;
    const from = this.selected;
    if (from && from !== square) {
      const moves = this.game.moves({ square: from, verbose: true }).filter((m) => m.to === square);
      if (moves.some((m) => m.isPromotion())) return { from, to: square };
      if (moves.length) {
        this.play(from, square);
        return null;
      }
    }
    const piece = this.game.get(square);
    this.selected = from !== square && piece?.color === this.game.turn() ? square : null;
    return null;
  }

  play(from: Square, to: Square, promotion?: PromotionPiece): void {
    const move = this.game.move({ from, to, promotion });
    this.selected = null;
    this.last = { from, to };
    this.message = this.lesson.respond?.(move, this.game) ?? null;
    const { mode } = this.lesson;
    if (mode === 'task') this.done = true;
    if (mode === 'free') {
      this.message ??= `The ${PIECE_NAME[move.piece]} moved to ${to}.`;
      this.game = new Chess(whiteToMove(this.game.fen()), { skipValidation: true });
    }
    if (mode === 'game') this.message ??= this.gameMessage(move.san);
  }

  private gameMessage(san: string): string {
    const mover = COLOR_NAME[this.game.turn() === 'w' ? 'b' : 'w'];
    if (this.game.isCheckmate()) return `${mover} played ${san}. Checkmate.`;
    if (this.game.isDraw()) return `${mover} played ${san}. The game is drawn.`;
    const check = this.game.inCheck() ? ', check' : '';
    return `${mover} played ${san}${check}. ${COLOR_NAME[this.game.turn()]} to move.`;
  }
}
