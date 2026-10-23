import { describe, expect, it } from 'vitest';
import { ECO_FILES, fetchSources, resolveFallback } from '../src/eco/fetchSources';

const tsvFor = (file: string) => {
  const eco = `${file.toUpperCase()}00`;
  return `eco\tname\tpgn\n${eco}\tOpening ${eco}\t1. e4\n`;
};

const okFetch: typeof fetch = async (input) => {
  const file = String(input).match(/\/([a-e])\.tsv$/)?.[1] ?? '';
  return new Response(tsvFor(file), { status: 200 });
};

/** Fixtures carry one row per file, so lower the real per-file floor. */
const opts = { retries: 0, minRowsPerFile: 1 };

const replacingC =
  (body: string): typeof fetch =>
  async (input) =>
    String(input).endsWith('/c.tsv') ? new Response(body, { status: 200 }) : okFetch(input);

describe('fetchSources', () => {
  it('downloads all five files and concatenates rows in a-e order', async () => {
    const rows = await fetchSources({ ...opts, fetchFn: okFetch });
    expect(ECO_FILES).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(rows.map((r) => r.eco)).toEqual(['A00', 'B00', 'C00', 'D00', 'E00']);
  });

  it('rejects when any single file fails, so a partial book is never written', async () => {
    const failingC: typeof fetch = async (input) =>
      String(input).endsWith('/c.tsv') ? new Response('boom', { status: 500 }) : okFetch(input);
    await expect(fetchSources({ ...opts, fetchFn: failingC })).rejects.toThrow(/c\.tsv.*500/);
  });

  it('rejects a file that returns 200 with too few rows (truncated or HTML body)', async () => {
    await expect(
      fetchSources({ ...opts, fetchFn: replacingC('<html>captive portal</html>') }),
    ).rejects.toThrow(/c\.tsv.*0 rows/);
  });

  it('rejects a file whose rows belong to another ECO volume', async () => {
    await expect(fetchSources({ ...opts, fetchFn: replacingC(tsvFor('a')) })).rejects.toThrow(
      /c\.tsv.*A00/,
    );
  });

  it('retries a failed request before giving up', async () => {
    let calls = 0;
    const flaky: typeof fetch = async (input) => {
      if (String(input).endsWith('/a.tsv') && calls++ === 0) throw new Error('ECONNRESET');
      return okFetch(input);
    };
    const rows = await fetchSources({ ...opts, fetchFn: flaky, retries: 1 });
    expect(rows).toHaveLength(5);
  });

  it('names the file when a network error persists', async () => {
    const down: typeof fetch = async (input) => {
      if (String(input).endsWith('/d.tsv')) throw new TypeError('fetch failed');
      return okFetch(input);
    };
    await expect(fetchSources({ ...opts, fetchFn: down })).rejects.toThrow(/d\.tsv.*fetch failed/);
  });
});

describe('resolveFallback', () => {
  it('keeps an existing full Lichess book when the download fails', () => {
    expect(resolveFallback({ source: 'lichess' })).toEqual({ action: 'keep' });
  });

  it('writes the seed book when there is no book or only a seed book', () => {
    expect(resolveFallback(null)).toEqual({ action: 'write-seed' });
    expect(resolveFallback({ source: 'seed' })).toEqual({ action: 'write-seed' });
  });
});
