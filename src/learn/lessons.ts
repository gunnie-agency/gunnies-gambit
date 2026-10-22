import type { Chess, Color, Move, PieceSymbol } from 'chess.js';

/**
 * How a practice board behaves after a move.
 *
 * - `free`: White is to move again after every move, so the reader can keep moving a piece around.
 * - `task`: the board waits for one White move, says what it did, and stays put until it is reset.
 * - `game`: both sides take turns, as in a real game.
 * - `puzzle`: the reader plays the moves of `solution` for the side to move, and the board answers with the other
 *   side's, until it is solved. The board is turned so the reader's side is at the bottom.
 */
export type LessonMode = 'free' | 'task' | 'game' | 'puzzle';

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
  /** A puzzle's moves in UCI, the reader's and the other side's in turn. Any checkmate also solves it. */
  solution?: readonly string[];
  /** What to say once a puzzle is solved. */
  solved?: string;
  /** The side the reader takes when they play this position out against the computer, from the board's link. */
  practiseAs?: Color;
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
  {
    id: 'knight-fork',
    mode: 'puzzle',
    fen: '4k3/5ppp/q7/3N4/8/8/5PPP/6K1 w - - 0 1',
    solution: ['d5c7', 'e8d8', 'c7a6'],
    solved: 'Solved. The knight checked the king and attacked the queen at once, so the queen was lost.',
  },
  {
    id: 'queen-fork',
    mode: 'puzzle',
    fen: 'r5k1/p5pp/8/8/8/8/5PPP/3Q2K1 w - - 0 1',
    solution: ['d1d5', 'g8h8', 'd5a8'],
    solved: 'Solved. The queen checked along one diagonal and hit the rook along the other.',
  },
  {
    id: 'pin',
    mode: 'puzzle',
    fen: '4k3/5ppp/4q3/8/8/8/5PPP/R4K2 w - - 0 1',
    solution: ['a1e1', 'e8d8', 'e1e6'],
    solved: 'Solved. The queen could not leave the line to its king, so your rook took it.',
  },
  {
    id: 'back-rank',
    mode: 'puzzle',
    fen: '2r3k1/pp3ppp/8/8/8/8/3R1PPP/3R2K1 w - - 0 1',
    solution: ['d2d8', 'c8d8', 'd1d8'],
    solved: 'Checkmate. The first rook pulled the defender away, and the second mates on the back row.',
  },
  {
    id: 'smothered',
    mode: 'puzzle',
    fen: '5r1k/pp4pp/7N/8/2Q5/8/PP3PPP/6K1 w - - 0 1',
    solution: ['c4g8', 'f8g8', 'h6f7'],
    solved: 'Checkmate. The queen lured the rook onto g8, and the king is smothered by its own pieces.',
  },
  {
    id: 'discovered-attack',
    mode: 'puzzle',
    fen: '3k3q/8/8/8/3N4/8/1B3PPP/6K1 w - - 0 1',
    solution: ['d4e6', 'd8d7', 'b2h8'],
    solved: 'Solved. The knight gave check and opened the long diagonal, so the bishop took the queen.',
  },
  {
    id: 'double-check',
    mode: 'puzzle',
    fen: '3qkb2/5ppp/8/8/4N3/8/5PPP/4R1K1 w - - 0 1',
    solution: ['e4f6'],
    solved: 'Checkmate. Knight and rook both give check, so only a king move could help, and the king has no square.',
  },
  {
    id: 'skewer',
    mode: 'puzzle',
    fen: '8/6k1/8/8/b3K3/8/8/7Q b - - 0 1',
    solution: ['a4c6', 'e4e3', 'c6h1'],
    solved: 'Solved. The king had to step off the diagonal, and the bishop took the queen behind it.',
  },
  {
    id: 'remove-defender',
    mode: 'puzzle',
    fen: '4r1k1/p4pp1/7p/8/1b2B3/2N5/PP3PPP/6K1 b - - 0 1',
    solution: ['b4c3', 'b2c3', 'e8e4'],
    solved: 'Solved. Without the knight nothing guarded the bishop, and your rook took it.',
  },
  {
    id: 'arabian',
    mode: 'puzzle',
    fen: '6k1/5ppp/8/8/8/5n2/PP2r3/3R3K b - - 0 1',
    solution: ['e2h2'],
    solved: 'Checkmate. The knight guards the rook and the square next to the king; the rook does the rest.',
  },
  {
    id: 'anastasia',
    mode: 'puzzle',
    fen: '5r1k/4N1pp/8/7Q/8/3R4/5PPP/6K1 w - - 0 1',
    solution: ['h5h7', 'h8h7', 'd3h3'],
    solved: "Checkmate. The queen opened the h-file, and the knight covers the king's last squares.",
  },
  {
    id: 'ladder',
    mode: 'puzzle',
    fen: '8/6k1/R7/8/8/8/5PPP/1R4K1 w - - 0 1',
    solution: ['b1b7', 'g7g8', 'a6a8'],
    solved: 'Checkmate. One rook holds a row while the other checks on the next, step by step to the edge.',
  },
  { id: 'queen-mate', mode: 'game', fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1', practiseAs: 'w' },
  { id: 'rook-mate', mode: 'game', fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1', practiseAs: 'w' },
  { id: 'pawn-ending', mode: 'game', fen: '8/4k3/8/4K3/8/4P3/8/8 w - - 0 1', practiseAs: 'w' },
];

export function lessonById(id: string | undefined): Lesson | undefined {
  return LESSONS.find((lesson) => lesson.id === id);
}
