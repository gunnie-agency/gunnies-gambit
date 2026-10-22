import { describe, expect, it } from 'vitest';
import {
  cleanUsername,
  finishedResult,
  formatClock,
  formatDays,
  listMessage,
  mostRecent,
  outcomeFor,
  problemForStatus,
  problemMessage,
  sideOf,
  type GameSummary,
} from './games';

const pgn = (result: string) => `[Event "Casual"]\n[Result "${result}"]\n\n1. e4 e5 ${result}\n`;

describe('finishedResult', () => {
  it('reads the three results of a finished game', () => {
    expect(finishedResult(pgn('1-0'))).toBe('1-0');
    expect(finishedResult(pgn('0-1'))).toBe('0-1');
    expect(finishedResult(pgn('1/2-1/2'))).toBe('1/2-1/2');
  });

  it('refuses ongoing games and games without a result', () => {
    expect(finishedResult(pgn('*'))).toBeNull();
    expect(finishedResult('[Event "Casual"]\n\n1. e4 e5')).toBeNull();
    expect(finishedResult(pgn(''))).toBeNull();
  });
});

describe('outcomeFor', () => {
  it('judges the result from the user side', () => {
    expect(outcomeFor('1-0', 'w')).toBe('win');
    expect(outcomeFor('1-0', 'b')).toBe('loss');
    expect(outcomeFor('0-1', 'b')).toBe('win');
    expect(outcomeFor('1/2-1/2', 'w')).toBe('draw');
  });
});

describe('sideOf', () => {
  it('matches the username case-insensitively', () => {
    expect(sideOf('hikaru', 'Hikaru', 'someone')).toBe('w');
    expect(sideOf('HIKARU', 'someone', 'Hikaru')).toBe('b');
    expect(sideOf('hikaru', 'a', 'b')).toBeNull();
  });
});

describe('cleanUsername', () => {
  it('trims and accepts the characters both sites allow', () => {
    expect(cleanUsername('  Dr_Nykter-stein ')).toBe('Dr_Nykter-stein');
  });

  it('refuses anything that could not be a username', () => {
    expect(cleanUsername('')).toBeNull();
    expect(cleanUsername('a')).toBeNull();
    expect(cleanUsername('../admin')).toBeNull();
    expect(cleanUsername('name with spaces')).toBeNull();
    expect(cleanUsername('x'.repeat(31))).toBeNull();
  });
});

describe('time controls', () => {
  it('writes minutes plus increment like the sites do', () => {
    expect(formatClock(180, 2)).toBe('3+2');
    expect(formatClock(60, 0)).toBe('1+0');
    expect(formatClock(30, 0)).toBe('½+0');
    expect(formatClock(90, 1)).toBe('1.5+1');
  });

  it('writes correspondence in days', () => {
    expect(formatDays(1)).toBe('1 day');
    expect(formatDays(3)).toBe('3 days');
  });
});

describe('mostRecent', () => {
  const game = (id: string, endedAt: number): GameSummary => ({
    site: 'lichess',
    id,
    side: 'w',
    opponent: 'x',
    outcome: 'draw',
    endedAt,
    timeControl: '3+0',
    pgn: '',
  });

  it('sorts newest first and keeps at most the limit', () => {
    const games = [game('a', 1), game('b', 3), game('c', 2)];
    expect(mostRecent(games).map((g) => g.id)).toEqual(['b', 'c', 'a']);
    expect(mostRecent(games, 2).map((g) => g.id)).toEqual(['b', 'c']);
  });
});

describe('problems', () => {
  it('maps HTTP statuses', () => {
    expect(problemForStatus(404)).toBe('not-found');
    expect(problemForStatus(429)).toBe('rate-limited');
    expect(problemForStatus(500)).toBe('unavailable');
  });

  it('names the site and tells the user what to do', () => {
    expect(problemMessage('not-found', 'chesscom', 'nobody')).toContain('Chess.com has no player called nobody');
    expect(problemMessage('rate-limited', 'lichess', 'x')).toContain('Wait a minute');
    expect(problemMessage('network', 'lichess', 'x')).toContain('connection');
  });
});

describe('listMessage', () => {
  it('counts the finished games, or says there are none', () => {
    expect(listMessage(20, 'lichess', 'x1')).toBe('20 finished games of x1 on Lichess. Pick one to review it.');
    expect(listMessage(1, 'lichess', 'x1')).toContain('1 finished game of');
    expect(listMessage(0, 'chesscom', 'x1')).toBe('x1 has no recent finished games on Chess.com.');
  });
});
