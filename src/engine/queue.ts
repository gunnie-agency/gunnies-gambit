import { parseBestMove, parseInfo, type EngineInfo } from './info';

export type OptionValue = string | number | boolean;

export interface SearchJob {
  fen: string;
  /** Arguments for `go`, e.g. `movetime 3000` or `depth 4`. */
  go: string;
  /** UCI options to set before this search. Options persist in the engine, so send the full set a job relies on. */
  options?: Record<string, OptionValue>;
}

export interface SearchHandlers<J extends SearchJob> {
  onInfo(job: J, info: EngineInfo): void;
  /** Called when a search finishes on its own. Not called for searches that were stopped or superseded. */
  onBestMove(job: J, move: string | null): void;
  onBusyChange?(busy: boolean): void;
}

/**
 * Runs one search at a time on a UCI engine and makes sure output is never attributed to the wrong position.
 *
 * A new request while a search runs sends `stop`, waits for that search's `bestmove` (UCI guarantees one),
 * and only then starts the newest request. Requests made in between replace each other, so only the latest
 * one runs. Output from a search that has been stopped or superseded is dropped.
 */
export class SearchQueue<J extends SearchJob = SearchJob> {
  private ready = false;
  private current: J | null = null;
  private pending: J | null = null;
  private stopping = false;

  constructor(
    private readonly send: (command: string) => void,
    private readonly handlers: SearchHandlers<J>,
  ) {}

  get busy(): boolean {
    return this.current !== null;
  }

  /** Call once the engine has answered `uciok`/`readyok`. Starts a request made before that. */
  setReady(): void {
    if (this.ready) return;
    this.ready = true;
    if (this.pending && !this.current) {
      this.startPending();
      this.handlers.onBusyChange?.(true);
    }
  }

  request(job: J): void {
    this.pending = job;
    if (!this.ready) return;
    if (this.current) {
      this.stopCurrent();
      return;
    }
    this.startPending();
    this.handlers.onBusyChange?.(true);
  }

  /** Drops any queued request and stops the running search. */
  cancel(): void {
    this.pending = null;
    if (this.current) this.stopCurrent();
  }

  /** Feed every line the engine prints. */
  handleLine(line: string): void {
    if (line.startsWith('bestmove')) {
      const best = parseBestMove(line);
      const job = this.current;
      const wasStopped = this.stopping;
      this.current = null;
      this.stopping = false;
      if (this.pending) {
        this.startPending();
      } else {
        this.handlers.onBusyChange?.(false);
      }
      if (job && best && !wasStopped) this.handlers.onBestMove(job, best.move);
      return;
    }
    if (!this.current || this.stopping || this.pending) return;
    const info = parseInfo(line);
    if (info) this.handlers.onInfo(this.current, info);
  }

  private stopCurrent(): void {
    if (this.stopping) return;
    this.stopping = true;
    this.send('stop');
  }

  private startPending(): void {
    const job = this.pending;
    if (!job) return;
    this.pending = null;
    this.current = job;
    this.stopping = false;
    for (const [name, value] of Object.entries(job.options ?? {})) {
      this.send(`setoption name ${name} value ${String(value)}`);
    }
    this.send(`position fen ${job.fen}`);
    this.send(`go ${job.go}`);
  }
}
