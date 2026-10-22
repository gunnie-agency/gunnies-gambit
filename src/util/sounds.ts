export type MoveSound = 'move' | 'capture' | 'check' | 'end';

/** One synthesised note: start and length in seconds, peak gain between 0 and 1. */
export interface Tone {
  freq: number;
  at: number;
  length: number;
  type: 'sine' | 'triangle' | 'square';
  gain: number;
}

/** Short clicks and a closing chord, made by oscillators so no audio file is loaded. */
export const TONES: Readonly<Record<MoveSound, readonly Tone[]>> = {
  move: [{ freq: 520, at: 0, length: 0.07, type: 'triangle', gain: 0.3 }],
  capture: [
    { freq: 180, at: 0, length: 0.12, type: 'triangle', gain: 0.35 },
    { freq: 360, at: 0, length: 0.06, type: 'square', gain: 0.08 },
  ],
  check: [
    { freq: 880, at: 0, length: 0.08, type: 'triangle', gain: 0.25 },
    { freq: 1175, at: 0.1, length: 0.1, type: 'triangle', gain: 0.25 },
  ],
  end: [
    { freq: 523.25, at: 0, length: 0.2, type: 'sine', gain: 0.25 },
    { freq: 659.25, at: 0.12, length: 0.2, type: 'sine', gain: 0.25 },
    { freq: 783.99, at: 0.24, length: 0.4, type: 'sine', gain: 0.25 },
  ],
};

/** The sound for a move just played: the game's end comes before a check, a check before a capture. */
export function moveSound(move: { san: string; captured?: string }, gameOver: boolean): MoveSound {
  if (gameOver) return 'end';
  if (move.san.includes('+')) return 'check';
  return move.captured ? 'capture' : 'move';
}
