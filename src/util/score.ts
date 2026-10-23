import type { Color } from 'chess.js';

/** An engine score. `cp` is in centipawns, `mate` in moves (negative: getting mated). */
export interface Score {
  kind: 'cp' | 'mate';
  value: number;
}

/** UCI scores are from the side to move; this flips them to White's point of view. */
export function toWhitePov(score: Score, sideToMove: Color): Score {
  return sideToMove === 'w' ? score : { kind: score.kind, value: -score.value };
}

/** Flips a White-POV score to the given player's point of view. */
function toPlayerPov(whiteScore: Score, player: Color): Score {
  return player === 'w' ? whiteScore : { kind: whiteScore.kind, value: -whiteScore.value };
}

const MINUS = '−';

export function formatScore(s: Score): string {
  if (s.kind === 'mate') {
    if (s.value === 0) return '#';
    return (s.value > 0 ? '+M' : `${MINUS}M`) + Math.abs(s.value);
  }
  const pawns = s.value / 100;
  return signOf(pawns) + Math.abs(pawns).toFixed(2);
}

function signOf(n: number): string {
  if (n > 0) return '+';
  return n < 0 ? MINUS : '';
}

/**
 * Winning chances from -1 (lost) to 1 (won), from the same point of view as the score. Uses Lichess's curve, fitted
 * to real games, so the review thresholds mean what they mean there. Centipawns are capped at ±1000 and a mate
 * counts as that cap; `mate 0` means the side to move has been mated.
 */
export function winningChances(s: Score): number {
  if (s.kind === 'mate') return s.value === 0 ? -1 : cpChances(Math.sign(s.value) * 1000);
  return cpChances(Math.max(-1000, Math.min(1000, s.value)));
}

function cpChances(cp: number): number {
  return 2 / (1 + Math.exp(-0.00368208 * cp)) - 1;
}

/** Height of White's part of the eval bar, 0 to 100. */
export function evalBarPercent(s: Score | null): number {
  if (!s) return 50;
  if (s.kind === 'mate') return s.value === 0 ? 50 : 50 + 50 * Math.sign(s.value);
  return 50 + 50 * winningChances(s);
}

export type Tone = 'pos' | 'neg' | 'even';

/**
 * Plain-language verdict that names the colours, for analysis, where the board is not a game of the user's: no "you"
 * and no "your opponent". The tone stays neutral for the same reason.
 */
export function colourVerdict(whiteScore: Score): { text: string; tone: Tone } {
  const ahead = whiteScore.value > 0 ? 'White' : 'Black';
  const a = Math.abs(whiteScore.value);
  if (whiteScore.kind === 'mate') return { text: a === 0 ? 'checkmate' : `${ahead} has mate in ${a}`, tone: 'even' };
  if (a < 35) return { text: 'the position is about equal', tone: 'even' };
  if (a < 110) return { text: `${ahead} is slightly better`, tone: 'even' };
  if (a < 300) return { text: `${ahead} is clearly better`, tone: 'even' };
  return { text: `${ahead} is winning`, tone: 'even' };
}

/** Plain-language verdict from the player's side, given a White-POV score. */
export function verdict(whiteScore: Score, player: Color): { text: string; tone: Tone } {
  const s = toPlayerPov(whiteScore, player);
  if (s.kind === 'mate') {
    if (s.value > 0) return { text: `you have mate in ${s.value}`, tone: 'pos' };
    return { text: `you are getting mated in ${Math.abs(s.value)}`, tone: 'neg' };
  }
  const a = Math.abs(s.value);
  if (a < 35) return { text: 'the position is about equal', tone: 'even' };
  const who = s.value > 0 ? 'you are' : 'your opponent is';
  const tone: Tone = s.value > 0 ? 'pos' : 'neg';
  if (a < 110) return { text: `${who} slightly better`, tone };
  if (a < 300) return { text: `${who} clearly better`, tone };
  return { text: `${who} winning`, tone };
}
