import { describe, expect, it } from 'vitest';
import { graphMarkup, positionAt } from './graph';

describe('graphMarkup', () => {
  it('fills White’s share from the bottom through every evaluated position', () => {
    const svg = graphMarkup([0, 1, -1], [null, null], 0);
    expect(svg).toContain('d="M0,80 L0,40 L300,0 L600,80 L600,80 Z"');
  });

  it('skips positions that are not evaluated yet', () => {
    const svg = graphMarkup([0, undefined, 0], [], 0);
    expect(svg).toContain('L0,40 L600,40 L600,80');
  });

  it('draws no area before anything is evaluated', () => {
    expect(graphMarkup([undefined, undefined], [], 0)).not.toContain('graph-area');
  });

  it('marks a judged move at the position it led to, and the current position', () => {
    const svg = graphMarkup([0, 0, 0, 0, 0], [null, 'blunder', null, 'inaccuracy'], 1);
    expect(svg).toContain('class="graph-mark blunder" x1="300"');
    expect(svg).toContain('class="graph-mark inaccuracy" x1="600"');
    expect(svg).toContain('class="graph-cur" x1="150"');
  });
});

describe('positionAt', () => {
  it('rounds to the nearest position and stays in range', () => {
    expect(positionAt(0.49, 3)).toBe(1);
    expect(positionAt(1.2, 3)).toBe(2);
    expect(positionAt(-0.1, 3)).toBe(0);
    expect(positionAt(0.5, 1)).toBe(0);
  });
});
