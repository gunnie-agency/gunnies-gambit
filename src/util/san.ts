import { Chess } from 'chess.js';
import { parseUciMove } from './uci';

/** Converts a UCI principal variation to SAN, stopping at the first move that is not legal. */
export function pvToSan(fen: string, pv: readonly string[], max = 10): string[] {
  const game = new Chess(fen);
  const out: string[] = [];
  for (const uci of pv.slice(0, max)) {
    const move = parseUciMove(uci);
    if (!move) break;
    try {
      out.push(game.move(move).san);
    } catch {
      break;
    }
  }
  return out;
}

export interface NumberedMove {
  /** Move number label such as `12.` or `12…`, or empty for Black's move after White's. */
  label: string;
  san: string;
}

/** Adds move numbers to a list of SAN moves played from `fen`. */
export function numberMoves(fen: string, sans: readonly string[]): NumberedMove[] {
  const fields = fen.split(' ');
  let turn = fields[1] === 'b' ? 'b' : 'w';
  let num = Number.parseInt(fields[5] ?? '1', 10) || 1;
  return sans.map((san, i) => {
    const label = moveLabel(turn, num, i === 0);
    if (turn === 'b') num++;
    turn = turn === 'w' ? 'b' : 'w';
    return { label, san };
  });
}

/** White's moves are numbered `12.`; Black's only when the list starts with it, as `12…`. */
function moveLabel(turn: string, num: number, first: boolean): string {
  if (turn === 'w') return `${num}.`;
  return first ? `${num}…` : '';
}
