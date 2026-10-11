import { describe, expect, it } from 'vitest';
import { numberMoves, pvToSan } from './san';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

describe('pvToSan', () => {
  it('converts UCI moves to SAN', () => {
    expect(pvToSan(START, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'])).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
  });

  it('handles castling and promotion', () => {
    expect(pvToSan('r3k3/8/8/8/8/8/8/4K2R w Kq - 0 1', ['e1g1', 'e8c8'])).toEqual(['O-O', 'O-O-O']);
    expect(pvToSan('8/4P1k1/8/8/8/8/8/4K3 w - - 0 1', ['e7e8q'])).toEqual(['e8=Q']);
  });

  it('stops at the first illegal or malformed move', () => {
    expect(pvToSan(START, ['e2e4', 'e2e4', 'g1f3'])).toEqual(['e4']);
    expect(pvToSan(START, ['g1f3', 'nonsense'])).toEqual(['Nf3']);
  });

  it('respects the maximum length', () => {
    expect(pvToSan(START, ['e2e4', 'e7e5', 'g1f3'], 2)).toEqual(['e4', 'e5']);
  });
});

describe('numberMoves', () => {
  it('numbers a line that starts with White', () => {
    expect(numberMoves(START, ['e4', 'e5', 'Nf3'])).toEqual([
      { label: '1.', san: 'e4' },
      { label: '', san: 'e5' },
      { label: '2.', san: 'Nf3' },
    ]);
  });

  it('uses an ellipsis when the line starts with Black', () => {
    expect(numberMoves(AFTER_E4, ['e5', 'Nf3'])).toEqual([
      { label: '1…', san: 'e5' },
      { label: '2.', san: 'Nf3' },
    ]);
  });
});
