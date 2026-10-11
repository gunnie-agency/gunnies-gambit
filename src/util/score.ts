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
  const sign = pawns > 0 ? '+' : pawns < 0 ? MINUS : '';
  return sign + Math.abs(pawns).toFixed(2);
}

/** Height of White's part of the eval bar, 0 to 100. */
export function evalBarPercent(s: Score | null): number {
  if (!s) return 50;
  if (s.kind === 'mate') return s.value > 0 ? 100 : s.value < 0 ? 0 : 50;
  return 50 + 50 * (2 / (1 + Math.exp(-0.0042 * s.value)) - 1);
}

export type Tone = 'pos' | 'neg' | 'even';

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
