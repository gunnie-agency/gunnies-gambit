import type { Chess, Move, PieceSymbol } from 'chess.js';

/**
 * How a practice board behaves after a move.
 *
 * - `free`: White is to move again after every move, so the reader can keep moving a piece around.
 * - `task`: the board waits for one White move, says what it did, and stays put until it is reset.
 * - `game`: both sides take turns, as in a real game.
 */
export type LessonMode = 'free' | 'task' | 'game';

/** One practice board on the How to play page. Its intro text lives in the page, next to the board. */
export interface Lesson {
  /** Matches the board's `data-lesson` attribute in how-to-play.html. */
  id: string;
  mode: LessonMode;
  fen: string;
  /** Moves played from `fen` before the reader starts, so the board shows how the position came about. */
  setup?: string[];
  /** What to say about the reader's move. Without it the board names the move. */
  respond?(move: Move, after: Chess): string;
}

export const PIECE_NAME: Record<PieceSymbol, string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
};

const TRY_AGAIN = 'Start again to try a different move.';

export const LESSONS: readonly Lesson[] = [
  { id: 'start', mode: 'game', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
  { id: 'king', mode: 'free', fen: '8/8/8/8/4K3/8/8/8 w - - 0 1' },
  { id: 'queen', mode: 'free', fen: '8/8/8/8/3Q4/8/8/8 w - - 0 1' },
  { id: 'rook', mode: 'free', fen: '8/3p4/8/8/3R2P1/8/8/8 w - - 0 1' },
  { id: 'bishop', mode: 'free', fen: '8/8/5n2/8/3B4/8/1P6/8 w - - 0 1' },
  { id: 'knight', mode: 'free', fen: '8/8/8/2PPP3/2PNP3/2PPP3/8/8 w - - 0 1' },
  { id: 'pawn', mode: 'free', fen: '8/8/8/3pp3/4P3/8/2P5/8 w - - 0 1' },
  {
    id: 'check',
    mode: 'task',
    fen: 'k3r3/8/8/1B6/8/8/R7/4K3 w - - 0 1',
    respond: (move) => {
      if (move.isCapture()) return `You captured the rook that gave check. ${TRY_AGAIN}`;
      if (move.piece === 'k') return `You moved the king off the rook's line. ${TRY_AGAIN}`;
      return `You blocked the check: the ${PIECE_NAME[move.piece]} stands between the rook and the king. ${TRY_AGAIN}`;
    },
  },
  {
    id: 'checkmate',
    mode: 'task',
    fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
    respond: (move, after) => {
      if (after.isCheckmate())
        return `Checkmate. ${move.san} attacks the king, and its own pawns leave it no square to escape to.`;
      if (after.inCheck()) return `Check, but Black can still get out of it. ${TRY_AGAIN}`;
      return `That does not attack the king. Look at the row the black king stands on. ${TRY_AGAIN}`;
    },
  },
  {
    id: 'stalemate',
    mode: 'task',
    fen: 'k7/8/1K6/8/8/8/8/2Q5 w - - 0 1',
    respond: (move, after) => {
      if (after.isCheckmate()) return `Checkmate with ${move.san}. You found the win and avoided the stalemate.`;
      if (after.isStalemate())
        return `Stalemate. Black is not in check but has no legal move, so the game is a draw. ${TRY_AGAIN}`;
      if (after.inCheck()) return `Check, but the black king can still move. ${TRY_AGAIN}`;
      return `Black still has a legal move, so the game goes on. ${TRY_AGAIN}`;
    },
  },
  {
    id: 'castling',
    mode: 'task',
    fen: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1',
    respond: (move) => {
      if (move.isKingsideCastle())
        return 'You castled kingside: the king moved two squares towards the h1 rook, and the rook jumped over it to f1.';
      if (move.isQueensideCastle())
        return 'You castled queenside: the king moved two squares towards the a1 rook, and the rook jumped over it to d1.';
      if (move.piece === 'k')
        return `The king moved one square, so it may no longer castle in this game. Tap the king and move it two squares instead. ${TRY_AGAIN}`;
      return `That rook has moved, so the king may no longer castle on its side. ${TRY_AGAIN}`;
    },
  },
  {
    id: 'en-passant',
    mode: 'task',
    fen: 'k7/3p4/8/4P3/8/8/8/K7 b - - 0 1',
    setup: ['d5'],
    respond: (move) => {
      if (move.isEnPassant()) return 'En passant: your pawn took the black pawn as if it had moved only one square.';
      if (move.piece === 'p') return `You moved past the black pawn without taking it. ${TRY_AGAIN}`;
      return `The chance is gone: en passant is only allowed straight away. ${TRY_AGAIN}`;
    },
  },
  {
    id: 'promotion',
    mode: 'task',
    fen: 'k7/4P3/8/8/8/8/8/K7 w - - 0 1',
    respond: (move) => {
      if (move.promotion === 'q') return 'Your pawn became a queen, the strongest piece. That is the usual choice.';
      if (move.promotion)
        return `Your pawn became a ${PIECE_NAME[move.promotion]}. Usually a queen is best, but now and then another piece is the better choice.`;
      return `The king moved, and the pawn is still waiting. ${TRY_AGAIN}`;
    },
  },
];

export function lessonById(id: string | undefined): Lesson | undefined {
  return LESSONS.find((lesson) => lesson.id === id);
}
