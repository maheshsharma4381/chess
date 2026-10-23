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

describe('fetchSources', () => {
  it('downloads all five files and concatenates rows in a-e order', async () => {
    const rows = await fetchSources({ fetchFn: okFetch, retries: 0 });
    expect(ECO_FILES).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(rows.map((r) => r.eco)).toEqual(['A00', 'B00', 'C00', 'D00', 'E00']);
  });

  it('rejects when any single file fails, so a partial book is never written', async () => {
    const failingC: typeof fetch = async (input) =>
      String(input).endsWith('/c.tsv') ? new Response('boom', { status: 500 }) : okFetch(input);
    await expect(fetchSources({ fetchFn: failingC, retries: 0 })).rejects.toThrow(/c\.tsv.*500/);
  });

  it('retries a failed request before giving up', async () => {
    let calls = 0;
    const flaky: typeof fetch = async (input) => {
      if (String(input).endsWith('/a.tsv') && calls++ === 0) throw new Error('ECONNRESET');
      return okFetch(input);
    };
    const rows = await fetchSources({ fetchFn: flaky, retries: 1 });
    expect(rows).toHaveLength(5);
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
