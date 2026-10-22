import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { moveSound, TONES } from './sounds';

describe('moveSound', () => {
  it('clicks for a quiet move', () => {
    expect(moveSound(new Chess().move('e4'), false)).toBe('move');
  });

  it('uses the capture sound for a capture', () => {
    const game = new Chess('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1');
    expect(moveSound(game.move('exd5'), false)).toBe('capture');
  });

  it('prefers check over capture', () => {
    const game = new Chess('4k3/8/8/8/8/8/4q3/4RK2 w - - 0 1');
    expect(moveSound(game.move('Rxe2+'), false)).toBe('check');
  });

  it('plays the end sound when the move ends the game, also by checkmate', () => {
    const game = new Chess('7k/8/6K1/8/8/8/8/Q7 w - - 0 1');
    const mate = game.move('Qa8#');
    expect(moveSound(mate, true)).toBe('end');
  });
});

describe('TONES', () => {
  it('keeps every sound short and quiet enough to repeat each move', () => {
    for (const tones of Object.values(TONES)) {
      expect(tones.length).toBeGreaterThan(0);
      for (const t of tones) {
        expect(t.at + t.length).toBeLessThanOrEqual(0.7);
        expect(t.gain).toBeGreaterThan(0);
        expect(t.gain).toBeLessThanOrEqual(0.5);
      }
    }
  });
});
