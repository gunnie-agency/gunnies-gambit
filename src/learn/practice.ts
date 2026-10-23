import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { parseUciMove, toUci, type PromotionPiece, type UciMove } from '../util/uci';
import { defend } from './defender';
import { PIECE_NAME, type Lesson } from './lessons';

/** A move the reader has chosen but that still needs a promotion piece. */
export interface PendingMove {
  from: Square;
  to: Square;
}

const COLOR_NAME = { w: 'White', b: 'Black' } as const;

const TRY_AGAIN = 'Start again to have another go.';

/** Why a game that is over without a checkmate is drawn. */
function drawReason(game: Chess): string {
  if (game.isStalemate()) return 'Stalemate: Black is not in check but has no legal move, so the game is drawn.';
  if (game.isInsufficientMaterial()) return 'Only the kings are left, so the game is drawn.';
  if (game.isThreefoldRepetition()) return 'The same position came up three times, so the game is drawn.';
  return 'Fifty moves passed without a capture or a pawn move, so the game is drawn.';
}

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
  /** The side the reader plays: the side to move once the setup moves are played. The board shows it at the bottom. */
  side!: Color;
  selected: Square | null = null;
  last: { from: Square; to: Square } | undefined;
  /** What the board says after a move; null while the page's intro text applies. */
  message: string | null = null;
  /** A task lesson after its move, or a solved puzzle: the board takes no input until it is reset. */
  done = false;
  /** The lesson's goal is reached: the puzzle is solved. */
  solved = false;
  /** A puzzle waiting for the other side's scripted reply, which `reply` plays. */
  waiting = false;
  /** The square of the piece a puzzle's hint points at. */
  hint: Square | null = null;
  /** How far into a puzzle's solution the board is. */
  private ply = 0;

  constructor(readonly lesson: Lesson) {
    this.reset();
  }

  reset(): void {
    // Free boards hold a single piece without kings, which normal validation rejects.
    this.game = new Chess(this.lesson.fen, { skipValidation: this.lesson.mode === 'free' });
    for (const san of this.lesson.setup ?? []) this.game.move(san);
    const last = this.game.history({ verbose: true }).at(-1);
    this.last = last && { from: last.from, to: last.to };
    this.side = this.game.turn();
    this.selected = null;
    this.message = null;
    this.done = false;
    this.solved = false;
    this.waiting = false;
    this.hint = null;
    this.ply = 0;
  }

  /**
   * Handles a tap or click on a square: selects a piece of the side to move, or moves the selected piece there. A
   * square the selected piece cannot reach gets a message saying so, and nothing moves.
   * Returns the move when it is a promotion, so the caller can ask which piece; `play` then finishes it.
   */
  tap(square: Square): PendingMove | null {
    if (this.done || this.waiting) return null;
    const from = this.selected;
    if (from && from !== square) {
      const moves = this.game.moves({ square: from, verbose: true }).filter((m) => m.to === square);
      if (moves.some((m) => m.isPromotion())) return { from, to: square };
      if (moves.length) {
        this.play(from, square);
        return null;
      }
      const moving = this.game.get(from);
      if (moving && this.game.get(square)?.color !== this.game.turn())
        this.message = this.cannotGo(moving.type, from, square);
    }
    const piece = this.game.get(square);
    this.selected = from !== square && piece?.color === this.game.turn() ? square : null;
    return null;
  }

  /** Why the selected piece cannot go to a square it was tapped to. Nothing moves. */
  private cannotGo(piece: PieceSymbol, from: Square, to: Square): string {
    const next = Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) <= 1 && Math.abs(Number(from[1]) - Number(to[1])) <= 1;
    // A king's step to a free or enemy square next to it is only illegal when the square is attacked.
    if (piece === 'k' && next) return "The king can't move into check.";
    if (this.game.inCheck()) return 'Your king is in check: move it, block the check or capture the attacker.';
    return `A ${PIECE_NAME[piece]} can't go there.`;
  }

  /** Plays a move. An illegal one, such as a promotion picked after the position changed, is ignored. */
  play(from: Square, to: Square, promotion?: PromotionPiece): void {
    let move: Move;
    try {
      move = this.game.move({ from, to, promotion });
    } catch {
      return;
    }
    this.selected = null;
    if (this.lesson.mode === 'puzzle') {
      this.judge(move);
      return;
    }
    if (this.lesson.mode === 'mate') {
      this.afterMateMove(move);
      return;
    }
    if (this.lesson.mode === 'task') {
      this.answer(move);
      return;
    }
    this.last = { from, to };
    if (this.lesson.mode === 'free') {
      this.message = `The ${PIECE_NAME[move.piece]} moved to ${to}.`;
      this.game = new Chess(whiteToMove(this.game.fen()), { skipValidation: true });
    } else {
      this.message = this.gameMessage(move.san);
    }
  }

  /** A task says what the move did. A wrong move is taken back at once; a right one ends the task until reset. */
  private answer(move: Move): void {
    const feedback = this.lesson.respond?.(move, this.game);
    this.message = feedback?.text ?? move.san;
    if (feedback?.retry) {
      this.game.undo();
      return;
    }
    this.last = { from: move.from, to: move.to };
    this.done = true;
  }

  /** Points at the piece the puzzle's next move is made with. */
  showHint(): void {
    const next = this.nextMove();
    if (this.done || this.waiting || !next) return;
    this.hint = next.from;
    this.selected = null;
    const piece = this.game.get(next.from);
    this.message = piece ? `Hint: move your ${PIECE_NAME[piece.type]}.` : null;
  }

  /** Plays the other side's answer: the scripted one in a puzzle, the defender's in a mating endgame. */
  reply(): void {
    if (!this.waiting) return;
    const next = this.lesson.mode === 'mate' ? defend(this.game) : this.nextMove();
    if (!next) return;
    const move = this.game.move(next);
    this.ply++;
    this.waiting = false;
    this.last = { from: move.from, to: move.to };
    const answered = `${COLOR_NAME[move.color]} answered ${move.san}.`;
    this.message = `${answered} Your move.`;
    if (this.game.isDraw()) {
      this.done = true;
      this.message = `${answered} ${drawReason(this.game)} ${TRY_AGAIN}`;
    }
  }

  private nextMove(): UciMove | null {
    return parseUciMove(this.lesson.solution?.[this.ply] ?? '');
  }

  /** A puzzle move is right when it is the solution's move or checkmates; a wrong one is taken back at once. */
  private judge(move: Move): void {
    const solution = this.lesson.solution ?? [];
    this.hint = null;
    if (!this.game.isCheckmate() && toUci(move) !== solution[this.ply]) {
      this.game.undo();
      this.message = `Not quite: ${move.san} is not the move here. Try again.`;
      return;
    }
    this.ply++;
    this.last = { from: move.from, to: move.to };
    if (this.game.isCheckmate() || this.ply >= solution.length) {
      this.done = true;
      this.solved = true;
      this.message = this.lesson.solved ?? 'Solved.';
    } else {
      this.waiting = true;
      this.message = `${move.san}. Good, now see what ${COLOR_NAME[this.game.turn()]} does.`;
    }
  }

  /** In a mating endgame the reader's move mates, ends in a draw, or waits for the defender. */
  private afterMateMove(move: Move): void {
    this.last = { from: move.from, to: move.to };
    if (this.game.isCheckmate()) {
      const moves = Math.ceil(this.game.history().length / 2);
      this.done = true;
      this.solved = true;
      this.message = `Checkmate in ${moves} ${moves === 1 ? 'move' : 'moves'}. ${this.lesson.solved ?? ''}`.trim();
    } else if (this.game.isDraw()) {
      this.done = true;
      this.message = `${move.san}. ${drawReason(this.game)} ${TRY_AGAIN}`;
    } else {
      this.waiting = true;
      this.message = this.gameMessage(move.san);
    }
  }

  private gameMessage(san: string): string {
    const mover = COLOR_NAME[this.game.turn() === 'w' ? 'b' : 'w'];
    if (this.game.isCheckmate()) return `${mover} played ${san}. Checkmate.`;
    if (this.game.isDraw()) return `${mover} played ${san}. The game is drawn.`;
    const check = this.game.inCheck() ? ', check' : '';
    return `${mover} played ${san}${check}. ${COLOR_NAME[this.game.turn()]} to move.`;
  }
}
