import { describe, expect, it } from 'vitest';
import { squareColor } from './board';

describe('squareColor', () => {
  it('colours the board with a dark square at a1 and a light one at h1', () => {
    expect(squareColor('a1')).toBe('dark');
    expect(squareColor('h1')).toBe('light');
    expect(squareColor('a8')).toBe('light');
    expect(squareColor('h8')).toBe('dark');
    expect(squareColor('d4')).toBe('dark');
    expect(squareColor('e4')).toBe('light');
  });
});
