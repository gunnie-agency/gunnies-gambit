import { Chess, DEFAULT_POSITION, type Color } from 'chess.js';
import type { Opening } from '../openings/lookup';
import { gameEnd } from './moves';
import { parseUciMove, toUci } from './uci';

export interface PgnGame {
  startFen: string;
  /** The moves in UCI notation. */
  moves: readonly string[];
  /** In play mode the user and the computer; in Analyse the players are not known. */
  players: { mode: 'play'; side: Color; level: string } | { mode: 'analysis' };
  /** The public URL of the app, for the Site tag. */
  site: string;
  date: Date;
  /**
   * The tags of a loaded game (see {@link keptTags}), which replace the app's own. Its Result counts while the moves
   * on the board do not decide the game, as for a game won on time or by resignation.
   */
  tags?: Readonly<Record<string, string>>;
  /** The deepest named opening of the game, written as the ECO and Opening tags. */
  opening?: Opening | null;
}

/** The tags of a loaded game worth keeping when it is exported again: who played, where, when, and how it ended. */
const KEPT_TAGS = [
  'Event',
  'Site',
  'Date',
  'Round',
  'White',
  'Black',
  'Result',
  'TimeControl',
  'WhiteElo',
  'BlackElo',
] as const;

const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

/** The tags of {@link KEPT_TAGS} among `headers`, leaving out a Result that is not one. */
export function keptTags(headers: Readonly<Record<string, unknown>>): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const name of KEPT_TAGS) {
    const value = headers[name];
    if (typeof value === 'string' && (name !== 'Result' || RESULTS.has(value))) kept[name] = value;
  }
  return kept;
}

/** A tag value with its quotes and backslashes escaped, as the PGN standard asks. */
const escapeTag = (value: string) => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');

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
 * The game as PGN with the seven standard tags, the kept tags of a loaded game, SetUp and FEN when it started from
 * another position, and ECO and Opening when it reached a named one. Moves stop at the first one that does not
 * apply, as when a saved game is replayed.
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
  const result = pgnResult(game);
  const tags: Record<string, string> = {
    Event: g.players.mode === 'play' ? 'Practice game against the computer' : 'Analysis',
    Site: g.site,
    Date: pgnDate(g.date),
    Round: '-',
    White: players.white,
    Black: players.black,
    ...g.tags,
    Result: result === '*' ? (g.tags?.Result ?? result) : result,
  };
  if (g.opening) {
    tags.ECO = g.opening.eco;
    tags.Opening = g.opening.name;
  }
  for (const [name, value] of Object.entries(tags)) game.setHeader(name, escapeTag(value));
  return game.pgn();
}

function playerNames(players: PgnGame['players']): { white: string; black: string } {
  if (players.mode === 'analysis') return { white: '?', black: '?' };
  const computer = `Computer (${players.level})`;
  return players.side === 'w' ? { white: 'You', black: computer } : { white: computer, black: 'You' };
}

/** A game read from PGN: where it starts, its moves in UCI notation, and its tags with escapes resolved. */
export interface ReadGame {
  startFen: string;
  moves: string[];
  headers: Record<string, string>;
}

/** A tag pair, `[Name "value"]`, whose value may hold `\"` and `\\` escapes. */
const TAG_PAIR = /\[(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]/g;

/**
 * Reads a PGN the way the board loads it: leniently, moves in UCI, and from the FEN tag if there is one. Null when it
 * is not a readable game. chess.js 1.4 rejects a tag value with an escaped quote, which the PGN standard allows, so
 * the tags are read here and handed to chess.js with their escapes blanked out.
 */
export function readPgn(text: string): ReadGame | null {
  const headers: Record<string, string> = {};
  const plain = text.replace(TAG_PAIR, (_, name: string, value: string) => {
    headers[name] = value.replaceAll(/\\(.)/g, '$1');
    return `[${name} "${value.replaceAll(/\\./g, '_')}"]`;
  });
  const game = new Chess();
  try {
    game.loadPgn(plain, { strict: false });
  } catch {
    return null;
  }
  return {
    startFen: headers.FEN ?? DEFAULT_POSITION,
    moves: game.history({ verbose: true }).map(toUci),
    headers,
  };
}

/** A SAN move, standing on its own or after a move number: a piece move, a pawn move or capture, or castling. */
const SAN_MOVE = /(?:^|[\s.])(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h](?:x[a-h])?[1-8]|O-O)/;

/**
 * Whether a PGN has at least one move, without parsing it: brace and rest-of-line comments and the tags are dropped
 * and the rest searched for a move. Cheap enough for every game of a month's archive; a game abandoned before the first move has none.
 */
export function hasMoves(pgn: string): boolean {
  const uncommented = pgn
    .split('{')
    .map((part, i) => (i === 0 ? part : part.slice(part.indexOf('}') + 1 || part.length)))
    .join(' ')
    .split('\n')
    .map((line) => line.split(';')[0])
    .join('\n');
  return SAN_MOVE.test(uncommented.replaceAll(TAG_PAIR, ' '));
}
