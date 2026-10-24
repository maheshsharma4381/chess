import { describe, expect, it } from 'vitest';
import { ExplorerError, OpeningExplorerService } from '../src/index';

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const AFTER_E4_C5 = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

/** Shaped like explorer.lichess.ovh responses. */
const mastersFixture = {
  white: 1000,
  draws: 1000,
  black: 1000,
  opening: { eco: 'B00', name: "King's Pawn Game" },
  moves: [
    { uci: 'e7e5', san: 'e5', averageRating: 2450, white: 400, draws: 400, black: 200, game: null },
    { uci: 'c7c5', san: 'c5', averageRating: 2400, white: 300, draws: 200, black: 500, game: null },
    { uci: 'e7e6', san: 'e6', averageRating: 2420, white: 30, draws: 10, black: 60, game: null },
    { uci: 'a7a6', san: 'a6', averageRating: 2300, white: 0, draws: 0, black: 0, game: null },
  ],
  topGames: [
    {
      uci: 'c7c5',
      id: 'game0001',
      winner: 'black',
      white: { name: 'Karpov, A', rating: 2750 },
      black: { name: 'Kasparov, G', rating: 2800 },
      year: 1985,
      month: '1985-10',
    },
    {
      uci: 'e7e5',
      id: 'game0002',
      winner: null,
      white: { name: 'Carlsen, M', rating: 2860 },
      black: { name: 'Caruana, F', rating: 2820 },
      year: 2018,
      month: '2018-11',
    },
  ],
};

const recordingFetch = (body: unknown, status = 200) => {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetchFn: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), headers: (init?.headers ?? {}) as Record<string, string> });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
  return { fetchFn, calls };
};

describe('OpeningExplorerService requests', () => {
  it('queries the masters database with the encoded FEN', async () => {
    const { fetchFn, calls } = recordingFetch(mastersFixture);
    await new OpeningExplorerService({ fetchFn }).query(AFTER_E4, { source: 'masters' });
    expect(calls[0]?.url).toBe(
      `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(AFTER_E4)}`,
    );
  });

  it('adds rating and speed filters for the Lichess database', async () => {
    const { fetchFn, calls } = recordingFetch(mastersFixture);
    await new OpeningExplorerService({ fetchFn }).query(AFTER_E4, {
      source: 'lichess',
      ratings: [1600, 1800],
      speeds: ['blitz', 'rapid'],
    });
    expect(calls[0]?.url).toBe(
      `https://explorer.lichess.ovh/lichess?fen=${encodeURIComponent(AFTER_E4)}` +
        '&ratings=1600,1800&speeds=blitz,rapid',
    );
  });

  it('sends the API token as a bearer header and honours a custom base URL', async () => {
    const { fetchFn, calls } = recordingFetch(mastersFixture);
    await new OpeningExplorerService({ fetchFn, token: 'lip_x', baseUrl: '/api/explorer' }).query(
      AFTER_E4,
      { source: 'masters' },
    );
    expect(calls[0]?.url.startsWith('/api/explorer/masters?')).toBe(true);
    expect(calls[0]?.headers['Authorization']).toBe('Bearer lip_x');
  });
});

describe('OpeningExplorerService mapping', () => {
  const query = async (fen = AFTER_E4) =>
    new OpeningExplorerService({ fetchFn: recordingFetch(mastersFixture).fetchFn }).query(fen, {
      source: 'masters',
    });

  it('maps totals, percentages and average rating', async () => {
    const res = await query();
    expect(res.totalGames).toBe(3000);
    expect(res.opening).toEqual({ eco: 'B00', name: "King's Pawn Game" });
    expect(res.counterMoves.find((m) => m.san === 'c5')).toMatchObject({
      uci: 'c7c5',
      totalGames: 1000,
      whiteWinPct: 30,
      drawPct: 20,
      blackWinPct: 50,
      averageRating: 2400,
    });
  });

  it('sorts by games played, then by the side to move win rate', async () => {
    const res = await query();
    // e5 and c5 both have 1000 games; Black to move, so c5 (50% for Black) goes first.
    expect(res.counterMoves.map((m) => m.san)).toEqual(['c5', 'e5', 'e6', 'a6']);
  });

  it('badges the most played move and the best-scoring move with at least 100 games', async () => {
    const res = await query();
    const badges = Object.fromEntries(res.counterMoves.map((m) => [m.san, m.badges]));
    // e6 scores 60% for Black but has exactly 100 games, so it qualifies.
    expect(badges).toEqual({ c5: ['Main Line'], e5: [], e6: ['Top Counter'], a6: [] });
  });

  it('scores Top Counter from White when White is to move', async () => {
    const res = await query(AFTER_E4_C5);
    const top = res.counterMoves.find((m) => m.badges.includes('Top Counter'));
    expect(top?.san).toBe('e5'); // 40% for White, best among moves with >= 100 games
  });

  it('gives a 0-game move zero percentages instead of NaN', async () => {
    const res = await query();
    expect(res.counterMoves.find((m) => m.san === 'a6')).toMatchObject({
      totalGames: 0,
      whiteWinPct: 0,
      drawPct: 0,
      blackWinPct: 0,
    });
  });

  it('omits Top Counter when no move reaches 100 games', async () => {
    const small = {
      ...mastersFixture,
      moves: [{ ...mastersFixture.moves[2], white: 3, draws: 1, black: 6 }],
    };
    const res = await new OpeningExplorerService({ fetchFn: recordingFetch(small).fetchFn }).query(
      AFTER_E4,
      { source: 'masters' },
    );
    expect(res.counterMoves[0]?.badges).toEqual(['Main Line']);
  });

  it('maps top games with results and years', async () => {
    const res = await query();
    expect(res.topGames).toEqual([
      {
        id: 'game0001',
        white: { name: 'Karpov, A', rating: 2750 },
        black: { name: 'Kasparov, G', rating: 2800 },
        result: '0-1',
        year: 1985,
        uci: 'c7c5',
      },
      {
        id: 'game0002',
        white: { name: 'Carlsen, M', rating: 2860 },
        black: { name: 'Caruana, F', rating: 2820 },
        result: '1/2-1/2',
        year: 2018,
        uci: 'e7e5',
      },
    ]);
  });
});

describe('OpeningExplorerService errors', () => {
  const run = (fetchFn: typeof fetch) =>
    new OpeningExplorerService({ fetchFn }).query(AFTER_E4, { source: 'masters' });

  it('rejects with the HTTP status when rate limited', async () => {
    const err = await run(recordingFetch('slow down', 429).fetchFn).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExplorerError);
    expect((err as ExplorerError).status).toBe(429);
  });

  it('explains that an API token is needed on 401', async () => {
    const err = await run(recordingFetch('<html>401</html>', 401).fetchFn).catch((e: unknown) => e);
    expect((err as ExplorerError).status).toBe(401);
    expect((err as ExplorerError).message).toMatch(/token/i);
  });

  it('rejects malformed JSON without a status', async () => {
    const err = await run(recordingFetch('{not json').fetchFn).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExplorerError);
    expect((err as ExplorerError).status).toBeNull();
  });

  it('rejects a response without a moves list', async () => {
    const err = await run(recordingFetch({ white: 1 }).fetchFn).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExplorerError);
  });

  it('wraps network failures', async () => {
    const down: typeof fetch = async () => {
      throw new TypeError('fetch failed');
    };
    const err = await run(down).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExplorerError);
    expect((err as ExplorerError).status).toBeNull();
  });
});
