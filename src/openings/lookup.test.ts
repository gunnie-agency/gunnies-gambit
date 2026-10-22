import { DEFAULT_POSITION } from 'chess.js';
import { describe, expect, it } from 'vitest';
import data from './data/openings.json';
import { epd, findOpening, gameFens, type OpeningTable } from './lookup';

const table = data.positions as unknown as OpeningTable;
const ENDGAME = '4k3/8/8/8/8/8/8/4K2R w K - 0 1';
const opening = (sans: string, start = DEFAULT_POSITION) =>
  findOpening(table, gameFens(start, sans.split(' ').filter(Boolean)));

describe('epd', () => {
  it('drops the halfmove clock and the move number', () => {
    expect(epd('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')).toBe(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -',
    );
  });
});

describe('gameFens', () => {
  it('returns the start and the position after each move', () => {
    const fens = gameFens(DEFAULT_POSITION, ['e4', 'e5']);
    expect(fens).toHaveLength(3);
    expect(fens[0]).toBe(DEFAULT_POSITION);
  });

  it('stops at an illegal move', () => {
    expect(gameFens(DEFAULT_POSITION, ['e4', 'e4', 'e5'])).toHaveLength(2);
  });
});

describe('findOpening', () => {
  it('names the Najdorf', () => {
    expect(opening('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6')).toEqual({
      eco: 'B90',
      name: 'Sicilian Defense: Najdorf Variation',
      ply: 10,
    });
  });

  it('names the Queen’s Gambit Declined', () => {
    expect(opening('d4 d5 c4 e6')).toEqual({ eco: 'D30', name: "Queen's Gambit Declined", ply: 4 });
  });

  it('names the Italian Game', () => {
    expect(opening('e4 e5 Nf3 Nc6 Bc4')).toEqual({ eco: 'C50', name: 'Italian Game', ply: 5 });
  });

  it('finds a known position reached by another move order', () => {
    expect(opening('Nf3 Nc6 e4 e5 Bc4')).toEqual({ eco: 'C50', name: 'Italian Game', ply: 5 });
  });

  it('keeps the deepest name after the game leaves the book', () => {
    const match = opening('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Rg1 Ra7 Rh1 Ra8');
    expect(match?.name).toMatch(/^Sicilian Defense: Najdorf Variation/);
    expect(match?.ply).toBeLessThan(14);
  });

  it('returns null when no position of the game has a name', () => {
    expect(opening('', ENDGAME)).toBeNull();
    expect(opening('Kf1 Kf8', ENDGAME)).toBeNull();
  });
});
