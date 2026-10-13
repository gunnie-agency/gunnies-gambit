import type { EngineInfo } from './info';
import { SearchQueue, type OptionValue, type SearchJob } from './queue';

export type EngineStatus = 'loading' | 'ready' | 'thinking' | 'failed';

export interface EngineOptions<J extends SearchJob> {
  /** URL of the engine script, run as a classic Web Worker. */
  url: string;
  /** UCI options sent once after `uciok`. */
  init?: Record<string, OptionValue>;
  onInfo?(job: J, info: EngineInfo): void;
  onBestMove?(job: J, move: string | null): void;
  onStatus?(status: EngineStatus): void;
}

const LOAD_TIMEOUT_MS = 30_000;

/** A UCI engine in a Web Worker, with a {@link SearchQueue} in front of it. */
export class Engine<J extends SearchJob = SearchJob> {
  private statusValue: EngineStatus = 'loading';
  private worker: Worker | null = null;
  private loadTimer: ReturnType<typeof setTimeout> | undefined;
  private initialised = false;
  private readonly queue: SearchQueue<J>;

  constructor(private readonly options: EngineOptions<J>) {
    this.queue = new SearchQueue<J>((command) => this.worker?.postMessage(command), {
      onInfo: (job, info) => this.options.onInfo?.(job, info),
      onBestMove: (job, move) => this.options.onBestMove?.(job, move),
      onBusyChange: (busy) => this.setStatus(busy ? 'thinking' : 'ready'),
    });
  }

  get status(): EngineStatus {
    return this.statusValue;
  }

  start(): void {
    if (this.worker || this.statusValue === 'failed') return;
    try {
      this.worker = new Worker(this.options.url);
    } catch {
      this.setStatus('failed');
      return;
    }
    this.worker.onmessage = (e: MessageEvent) => this.handleLine(String(e.data));
    this.worker.onerror = (e) => {
      e.preventDefault();
      this.fail();
    };
    this.loadTimer = setTimeout(() => {
      if (!this.initialised) this.fail();
    }, LOAD_TIMEOUT_MS);
    this.worker.postMessage('uci');
  }

  request(job: J): void {
    if (this.statusValue === 'failed') return;
    this.queue.request(job);
  }

  cancel(): void {
    this.queue.cancel();
  }

  /** Shuts the worker down for good, without reporting a status. Later calls to `start` and `request` do nothing. */
  terminate(): void {
    clearTimeout(this.loadTimer);
    this.worker?.terminate();
    this.worker = null;
    this.statusValue = 'failed';
  }

  private handleLine(line: string): void {
    if (!this.initialised) {
      if (line.startsWith('uciok')) {
        for (const [name, value] of Object.entries(this.options.init ?? {})) {
          this.worker?.postMessage(`setoption name ${name} value ${String(value)}`);
        }
        this.worker?.postMessage('isready');
      } else if (line.startsWith('readyok')) {
        this.initialised = true;
        clearTimeout(this.loadTimer);
        this.setStatus('ready');
        this.queue.setReady();
      }
      return;
    }
    this.queue.handleLine(line);
  }

  private fail(): void {
    clearTimeout(this.loadTimer);
    this.worker?.terminate();
    this.setStatus('failed');
  }

  private setStatus(status: EngineStatus): void {
    if (this.statusValue === status) return;
    this.statusValue = status;
    this.options.onStatus?.(status);
  }
}

/** URL of the bundled Stockfish build, relative to the page. */
export const STOCKFISH_URL = import.meta.env.BASE_URL + __STOCKFISH_FILE__;
