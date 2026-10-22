import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFinishedGames, ImportError } from './fetch';
import month from './fixtures/chesscom-hikaru-2026-10.json?raw';
import lichess from './fixtures/lichess-drnykterstein.ndjson?raw';

/** Stubs fetch with one response per URL and records the requests. */
function serve(responses: Record<string, Response | Error>) {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    requests.push({ url, init });
    const response = responses[url] ?? new Response('', { status: 404 });
    if (response instanceof Error) throw response;
    return response;
  });
  return requests;
}

const signal = () => new AbortController().signal;
const problemOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (err: unknown) => (err instanceof ImportError ? err.problem : err),
  );

const ARCHIVES = 'https://api.chess.com/pub/player/hikaru/games/archives';
const OCT = 'https://api.chess.com/pub/player/hikaru/games/2026/10';
const SEP = 'https://api.chess.com/pub/player/hikaru/games/2026/09';
const json = (body: unknown) => new Response(JSON.stringify(body));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchFinishedGames', () => {
  it('sends only the username, without cookies or referrer', async () => {
    const requests = serve({});
    await problemOf(fetchFinishedGames('lichess', 'DrNykterstein', signal()));
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toMatch(/^https:\/\/lichess\.org\/api\/games\/user\/DrNykterstein\?/);
    expect(requests[0]?.init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' });
  });

  it('lists Lichess games newest first', async () => {
    vi.stubGlobal('fetch', async () => new Response(lichess));
    const games = await fetchFinishedGames('lichess', 'DrNykterstein', signal());
    const ended = games.map((g) => g.endedAt);
    expect(ended).toEqual([...ended].sort((a, b) => b - a));
    expect(games).toHaveLength(3);
  });

  it('reads the previous month too when the newest has few games', async () => {
    const requests = serve({
      [ARCHIVES]: json({ archives: [SEP, OCT] }),
      [OCT]: new Response(month),
      [SEP]: json({ games: [] }),
    });
    const games = await fetchFinishedGames('chesscom', 'hikaru', signal());
    expect(requests.map((r) => r.url)).toEqual([ARCHIVES, OCT, SEP]);
    expect(games.map((g) => g.opponent)).toEqual(['Sina-Movahed', 'BillieKimbah', 'crescentmoon2411']);
  });

  it('returns an empty list for a player without games', async () => {
    serve({ [ARCHIVES]: json({ archives: [] }) });
    expect(await fetchFinishedGames('chesscom', 'hikaru', signal())).toEqual([]);
  });

  it('reports unknown players, rate limits, failing sites and no connection', async () => {
    serve({});
    expect(await problemOf(fetchFinishedGames('chesscom', 'nobody', signal()))).toBe('not-found');
    vi.stubGlobal('fetch', async () => new Response('', { status: 429 }));
    expect(await problemOf(fetchFinishedGames('lichess', 'x1', signal()))).toBe('rate-limited');
    vi.stubGlobal('fetch', async () => new Response('<html>', { status: 200 }));
    expect(await problemOf(fetchFinishedGames('chesscom', 'x1', signal()))).toBe('unavailable');
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await problemOf(fetchFinishedGames('lichess', 'x1', signal()))).toBe('network');
  });
});
