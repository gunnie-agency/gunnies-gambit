import { describe, expect, it } from 'vitest';
import { parseUciMove, toUci } from './uci';

describe('parseUciMove', () => {
  it('parses plain moves and promotions', () => {
    expect(parseUciMove('e2e4')).toEqual({ from: 'e2', to: 'e4' });
    expect(parseUciMove('E7E8Q')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' });
  });

  it('rejects anything else', () => {
    expect(parseUciMove('(none)')).toBeNull();
    expect(parseUciMove('e2e9')).toBeNull();
    expect(parseUciMove('Nf3')).toBeNull();
    expect(parseUciMove('e7e8k')).toBeNull();
  });
});

describe('toUci', () => {
  it('round-trips', () => {
    expect(toUci({ from: 'e7', to: 'e8', promotion: 'q' })).toBe('e7e8q');
    expect(toUci({ from: 'g1', to: 'f3' })).toBe('g1f3');
  });
});
