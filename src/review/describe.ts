import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { formatScore, type Score } from '../util/score';
import { parseUciMove } from '../util/uci';
import type { Judgement, MoveReview, PositionEval } from './classify';

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};
const COLOR_NAME: Record<Color, string> = { w: 'White', b: 'Black' };
export const JUDGEMENT_NAME: Record<Judgement, string> = {
  inaccuracy: 'an inaccuracy',
  mistake: 'a mistake',
  blunder: 'a blunder',
};

/** From this many centipawns either way, or with a forced mate on the board, the game counts as decided. */
const DECIDED_CP = 500;
/** Material losses from this many points (pawn 1, knight and bishop 3, rook 5, queen 9) get a note. */
const NOTED_LOSS = 3;

/** Material the opponent's best reply wins, as far as the reply and one recapture show it. */
export interface MaterialLoss {
  /** The opponent's best reply, in SAN. */
  reply: string;
  /** The piece the reply takes, and where. */
  piece: PieceSymbol;
  square: Square;
  /** Whether the mover cannot take back on that square. */
  free: boolean;
  /** Points the mover is down after the move, the reply and the best recapture, compared to before the move. */
  points: number;
}

/** Facts about a move that the judgement alone does not tell a beginner. */
export interface MoveFacts {
  /** The move gives checkmate. */
  checkmate: boolean;
  /** The opponent's mating reply in SAN, when the move allows checkmate in one. */
  mateReply: string | null;
  /** The game was already decided before the move: a big material edge or a forced mate. */
  decided: boolean;
  /** A loss of at least {@link NOTED_LOSS} points of material, for a move that was not the engine's choice. */
  loss: MaterialLoss | null;
}

/**
 * Works out the facts about a reviewed move from the position before it and the engine's view of the positions
 * before and after it. `after.best` is the opponent's best reply.
 */
export function moveFacts(fenBefore: string, review: MoveReview, before: PositionEval, after: PositionEval): MoveFacts {
  const checkmate = after.score.kind === 'mate' && after.score.value === 0;
  const mateInOne = after.score.kind === 'mate' && after.score.value === 1 && after.best !== null;
  const mateReply = mateInOne && after.best ? replySan(fenBefore, review.played, after.best) : null;
  const decided = before.score.kind === 'mate' || Math.abs(before.score.value) >= DECIDED_CP;
  const loss =
    checkmate || mateReply || review.played === review.best || !after.best
      ? null
      : materialLoss(fenBefore, review.played, after.best);
  return { checkmate, mateReply, decided, loss: loss && loss.points >= NOTED_LOSS ? loss : null };
}

/**
 * The material the mover is down after playing `played` and the opponent answering `reply`, when the reply is a
 * capture. If the mover can take back on the capture square, the capturing piece counts as won back, so a fair
 * exchange is no loss. Null when the reply captures nothing or either move is illegal.
 */
export function materialLoss(fen: string, played: string, reply: string): MaterialLoss | null {
  const game = new Chess(fen);
  const mover = game.turn();
  const start = balance(game, mover);
  const answer = play(game, played) ? play(game, reply) : null;
  if (!answer?.captured) return null;
  const recapture = game.moves({ verbose: true }).find((m) => m.to === answer.to && m.captured);
  const regained = recapture?.captured ? VALUE[recapture.captured] : 0;
  return {
    reply: answer.san,
    piece: answer.captured,
    square: answer.to,
    free: !recapture,
    points: start - balance(game, mover) - regained,
  };
}

/** The mover's material minus the opponent's. */
function balance(game: Chess, mover: Color): number {
  let sum = 0;
  for (const piece of game.board().flat()) {
    if (piece) sum += piece.color === mover ? VALUE[piece.type] : -VALUE[piece.type];
  }
  return sum;
}

function play(game: Chess, uci: string) {
  const move = parseUciMove(uci);
  try {
    return move ? game.move(move) : null;
  } catch {
    return null;
  }
}

function replySan(fen: string, played: string, reply: string): string | null {
  const game = new Chess(fen);
  return play(game, played) ? (play(game, reply)?.san ?? null) : null;
}

/** What the review text needs besides the review and its facts. */
export interface MoveWords {
  /** Who made the move: "You", "The computer" or "Your opponent". */
  who: string;
  /** The move played, in SAN. */
  san: string;
  /** The engine's choice in SAN, or null when there is none. */
  best: string | null;
}

/** What the review says about a move, in plain sentences. */
export function describeMove(r: MoveReview, facts: MoveFacts, words: MoveWords): string {
  if (facts.checkmate) return 'Checkmate.';
  const notes = [
    facts.mateReply ? `This allows checkmate in one (${facts.mateReply}).` : '',
    facts.loss ? lossText(facts.loss) : '',
  ].filter(Boolean);
  if (r.judgement) {
    const better = words.best ? `Better was ${words.best}, shown by the arrow.` : '';
    return [`${words.who} played ${words.san}, ${JUDGEMENT_NAME[r.judgement]}.`, ...notes, better]
      .filter(Boolean)
      .join(' ');
  }
  if (r.played === r.best) return 'The engine’s first choice.';
  const preferred = words.best ? `The engine preferred ${words.best}.` : '';
  if (facts.decided)
    return ['The game was already decided; this changes little.', ...notes, preferred].filter(Boolean).join(' ');
  if (notes.length) return [...notes, 'The winning chances stay about the same, so it is not marked.'].join(' ');
  return ['A good move.', preferred].filter(Boolean).join(' ');
}

function lossText(loss: MaterialLoss): string {
  const piece = PIECE_NAME[loss.piece];
  if (loss.free) return `This leaves the ${piece} on ${loss.square} to be taken for free (${loss.reply}).`;
  return `This loses material: after ${loss.reply} and taking back, it costs ${loss.points} points.`;
}

/** An evaluation from White's view in words for the detail text: "mate in 1 for Black", or the score as "+0.35". */
export function spellScore(white: Score): string {
  if (white.kind === 'mate' && white.value !== 0)
    return `mate in ${Math.abs(white.value)} for ${COLOR_NAME[white.value > 0 ? 'w' : 'b']}`;
  return formatScore(white);
}
