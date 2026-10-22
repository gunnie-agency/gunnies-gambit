import { Chess, type Color } from 'chess.js';
import { gameEnd } from './moves';
import { parseUciMove } from './uci';

export interface PgnGame {
  startFen: string;
  /** The moves in UCI notation. */
  moves: readonly string[];
  /** In play mode the user and the computer; in Analyse the players are not known. */
  players: { mode: 'play'; side: Color; level: string } | { mode: 'analysis' };
  /** The public URL of the app, for the Site tag. */
  site: string;
  date: Date;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A PGN date, `2026.10.22`, in local time. */
export function pgnDate(date: Date): string {
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

/** A file name for the downloaded game, by local date and time so two downloads on one day do not collide. */
export function pgnFileName(date: Date): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `chess-${day}-${pad(date.getHours())}${pad(date.getMinutes())}.pgn`;
}

/** The PGN result: who won by checkmate, a draw, or `*` for a game still going. */
export function pgnResult(game: Chess): string {
  const end = gameEnd(game);
  if (end === null) return '*';
  if (end !== 'checkmate') return '1/2-1/2';
  return game.turn() === 'w' ? '0-1' : '1-0';
}

/**
 * The game as PGN with the seven standard tags, plus SetUp and FEN when it started from another position. Moves
 * stop at the first one that does not apply, as when a saved game is replayed.
 */
export function buildPgn(g: PgnGame): string {
  const game = new Chess(g.startFen);
  for (const uci of g.moves) {
    const move = parseUciMove(uci);
    if (!move) break;
    try {
      game.move(move);
    } catch {
      break;
    }
  }
  const players = playerNames(g.players);
  game.setHeader('Event', g.players.mode === 'play' ? 'Practice game against the computer' : 'Analysis');
  game.setHeader('Site', g.site);
  game.setHeader('Date', pgnDate(g.date));
  game.setHeader('Round', '-');
  game.setHeader('White', players.white);
  game.setHeader('Black', players.black);
  game.setHeader('Result', pgnResult(game));
  return game.pgn();
}

function playerNames(players: PgnGame['players']): { white: string; black: string } {
  if (players.mode === 'analysis') return { white: '?', black: '?' };
  const computer = `Computer (${players.level})`;
  return players.side === 'w' ? { white: 'You', black: computer } : { white: computer, black: 'You' };
}
