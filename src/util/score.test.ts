import { describe, expect, it } from 'vitest';
import { evalBarPercent, formatScore, toWhitePov, verdict, winningChances } from './score';

describe('toWhitePov', () => {
  it('keeps scores when White is to move and flips them when Black is', () => {
    expect(toWhitePov({ kind: 'cp', value: 40 }, 'w')).toEqual({ kind: 'cp', value: 40 });
    expect(toWhitePov({ kind: 'cp', value: 40 }, 'b')).toEqual({ kind: 'cp', value: -40 });
    expect(toWhitePov({ kind: 'mate', value: 3 }, 'b')).toEqual({ kind: 'mate', value: -3 });
  });
});

describe('formatScore', () => {
  it('formats pawns with a sign and two decimals', () => {
    expect(formatScore({ kind: 'cp', value: 25 })).toBe('+0.25');
    expect(formatScore({ kind: 'cp', value: -150 })).toBe('−1.50');
    expect(formatScore({ kind: 'cp', value: 0 })).toBe('0.00');
  });

  it('formats mates', () => {
    expect(formatScore({ kind: 'mate', value: 2 })).toBe('+M2');
    expect(formatScore({ kind: 'mate', value: -4 })).toBe('−M4');
    expect(formatScore({ kind: 'mate', value: 0 })).toBe('#');
  });
});

describe('winningChances', () => {
  it('is 0 for equal and symmetric around it', () => {
    expect(winningChances({ kind: 'cp', value: 0 })).toBe(0);
    expect(winningChances({ kind: 'cp', value: -300 })).toBeCloseTo(-winningChances({ kind: 'cp', value: 300 }));
  });

  it('follows the Lichess curve and caps at 1000 centipawns', () => {
    expect(winningChances({ kind: 'cp', value: 100 })).toBeCloseTo(0.182, 3);
    expect(winningChances({ kind: 'cp', value: 5000 })).toBe(winningChances({ kind: 'cp', value: 1000 }));
  });

  it('counts a mate as the cap, and being mated as a loss', () => {
    expect(winningChances({ kind: 'mate', value: 3 })).toBe(winningChances({ kind: 'cp', value: 1000 }));
    expect(winningChances({ kind: 'mate', value: -1 })).toBe(winningChances({ kind: 'cp', value: -1000 }));
    expect(winningChances({ kind: 'mate', value: 0 })).toBe(-1);
  });
});

describe('evalBarPercent', () => {
  it('is 50 for equal or unknown and saturates for mates', () => {
    expect(evalBarPercent(null)).toBe(50);
    expect(evalBarPercent({ kind: 'cp', value: 0 })).toBe(50);
    expect(evalBarPercent({ kind: 'mate', value: 1 })).toBe(100);
    expect(evalBarPercent({ kind: 'mate', value: -1 })).toBe(0);
  });

  it('grows with the advantage and stays within bounds', () => {
    const small = evalBarPercent({ kind: 'cp', value: 100 });
    const big = evalBarPercent({ kind: 'cp', value: 900 });
    expect(small).toBeGreaterThan(50);
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThan(100);
    expect(evalBarPercent({ kind: 'cp', value: -100 })).toBeCloseTo(100 - small);
  });
});

describe('verdict', () => {
  it('speaks from the player side', () => {
    expect(verdict({ kind: 'cp', value: 200 }, 'w')).toEqual({ text: 'you are clearly better', tone: 'pos' });
    expect(verdict({ kind: 'cp', value: 200 }, 'b')).toEqual({ text: 'your opponent is clearly better', tone: 'neg' });
    expect(verdict({ kind: 'cp', value: 10 }, 'b').tone).toBe('even');
    expect(verdict({ kind: 'mate', value: -3 }, 'b')).toEqual({ text: 'you have mate in 3', tone: 'pos' });
    expect(verdict({ kind: 'cp', value: -500 }, 'w').text).toBe('your opponent is winning');
  });
});
