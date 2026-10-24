import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chess } from 'chess.js';
import * as gifenc from 'gifenc';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExportMenu } from '@/components/export/ExportMenu';
import { renderBoardFrame, type FrameContext } from '@/lib/export/boardFrame';
import { FINAL_FRAME_MS, GIF_FRAME_MS, encodeGameGif } from '@/lib/export/gif';
import { linePgn } from '@/lib/export/pgn';
import { BOARD_OVERLAYS, BOARD_THEMES } from '@/lib/design/tokens';

const START = new Chess().fen();

describe('linePgn', () => {
  it('writes headers, the moves and the result for a finished game', () => {
    const pgn = linePgn(
      { startFen: START, sans: ['f3', 'e5', 'g4', 'Qh4#'] },
      { White: 'Me', Black: 'Pip' },
    );
    expect(pgn).toContain('[White "Me"]');
    expect(pgn).toContain('[Black "Pip"]');
    expect(pgn).toContain('[Result "0-1"]');
    expect(pgn.trim().endsWith('1. f3 e5 2. g4 Qh4# 0-1')).toBe(true);
  });

  it('marks an unfinished game "*" and records a custom start position', () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
    const pgn = linePgn({ startFen: fen, sans: ['e4'] });
    expect(pgn).toContain('[Result "*"]');
    expect(pgn).toContain('[SetUp "1"]');
    expect(pgn).toContain(`[FEN "${fen}"]`);
    expect(pgn.trim().endsWith('1. e4 *')).toBe(true);
  });

  it('records a draw', () => {
    // Black king a8, White king c6: after Qb6 Black is not in check and has no moves.
    const fen = 'k7/8/2K5/8/8/8/8/1Q6 w - - 0 1';
    expect(linePgn({ startFen: fen, sans: ['Qb6'] })).toContain('[Result "1/2-1/2"]');
  });
});

/** Records every draw call with the fill style in force. */
function recordingContext() {
  const calls: { op: string; args: unknown[]; fill: string }[] = [];
  const ctx: FrameContext = {
    fillStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillRect: (...args) => void calls.push({ op: 'fillRect', args, fill: String(ctx.fillStyle) }),
    fillText: (...args) => void calls.push({ op: 'fillText', args, fill: String(ctx.fillStyle) }),
    drawImage: (...args: unknown[]) =>
      void calls.push({ op: 'drawImage', args, fill: String(ctx.fillStyle) }),
  };
  return { ctx, calls };
}

const images = new Proxy({} as Record<string, CanvasImageSource>, {
  get: (_, key) => ({ key }) as unknown as CanvasImageSource,
});

describe('renderBoardFrame', () => {
  const theme = BOARD_THEMES.green;
  const squareAt = (calls: ReturnType<typeof recordingContext>['calls'], x: number, y: number) =>
    calls.find(
      (c) => c.op === 'fillRect' && c.args[0] === x && c.args[1] === y && c.args[2] === 40,
    );

  it('paints light and dark squares in the right places for White', () => {
    const { ctx, calls } = recordingContext();
    renderBoardFrame(ctx, START, { theme: 'green', size: 320, images });
    expect(squareAt(calls, 0, 0)?.fill).toBe(theme.light); // a8
    expect(squareAt(calls, 0, 280)?.fill).toBe(theme.dark); // a1
    expect(squareAt(calls, 280, 280)?.fill).toBe(theme.light); // h1
    expect(calls.filter((c) => c.op === 'drawImage')).toHaveLength(32);
  });

  it('draws each piece image on its square, flipped for Black', () => {
    const { ctx, calls } = recordingContext();
    renderBoardFrame(ctx, START, { theme: 'green', size: 320, images, orientation: 'black' });
    const at = (x: number, y: number) =>
      calls.find((c) => c.op === 'drawImage' && c.args[1] === x && c.args[2] === y);
    // With Black at the bottom, e1 (white king) is the 4th square from the left on the top row.
    expect((at(120, 0)?.args[0] as { key: string }).key).toBe('wK');
    expect((at(120, 280)?.args[0] as { key: string }).key).toBe('bK');
  });

  it('highlights the last move squares', () => {
    const { ctx, calls } = recordingContext();
    const fen = new Chess().move('e4').after;
    renderBoardFrame(ctx, fen, { theme: 'green', size: 320, images, lastMove: ['e2', 'e4'] });
    const overlays = calls.filter((c) => c.op === 'fillRect' && c.fill === BOARD_OVERLAYS.lastMove);
    expect(overlays.map((c) => [c.args[0], c.args[1]])).toEqual([
      [160, 240],
      [160, 160],
    ]);
  });

  it('labels files and ranks', () => {
    const { ctx, calls } = recordingContext();
    renderBoardFrame(ctx, START, { theme: 'green', size: 320, images });
    const labels = calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    expect(labels).toEqual(expect.arrayContaining(['a', 'h', '1', '8']));
    expect(labels).toHaveLength(16);
  });
});

describe('encodeGameGif', () => {
  it('encodes one frame per position with the final frame held longer', async () => {
    const delays: number[] = [];
    const encoder = () => {
      const real = gifenc.GIFEncoder();
      return {
        ...real,
        writeFrame: (...args: Parameters<typeof real.writeFrame>) => {
          delays.push(args[3]?.delay ?? 0);
          real.writeFrame(...args);
        },
        finish: () => real.finish(),
        bytes: () => real.bytes(),
      };
    };
    const size = 16;
    const createCanvas = () => {
      const { ctx } = recordingContext();
      return {
        ctx,
        imageData: () => new Uint8ClampedArray(size * size * 4).fill(200),
      };
    };
    const fens = [START, new Chess().move('e4').after];
    const bytes = await encodeGameGif(fens, [null, ['e2', 'e4']], {
      size,
      images,
      createCanvas,
      createEncoder: encoder,
    });
    expect(delays).toEqual([GIF_FRAME_MS, FINAL_FRAME_MS]);
    expect(new TextDecoder().decode(bytes.slice(0, 6))).toBe('GIF89a');
    expect(bytes.at(-1)).toBe(0x3b); // trailer
  });
});

describe('<ExportMenu>', () => {
  afterEach(() => vi.restoreAllMocks());
  const pgn = linePgn({ startFen: START, sans: ['e4'] });
  const fen = new Chess().move('e4').after;

  it('copies the PGN and the FEN and confirms', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<ExportMenu pgn={pgn} fen={fen} fens={[START, fen]} lastMoves={[null, ['e2', 'e4']]} />);
    await user.click(screen.getByRole('button', { name: 'Copy PGN' }));
    expect(writeText).toHaveBeenLastCalledWith(pgn);
    expect(await screen.findByRole('status')).toHaveTextContent('PGN copied');
    await user.click(screen.getByRole('button', { name: 'Copy FEN' }));
    expect(writeText).toHaveBeenLastCalledWith(fen);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('FEN copied'));
  });

  it('reports a clipboard failure', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    render(<ExportMenu pgn={pgn} fen={fen} fens={[START, fen]} lastMoves={[null, ['e2', 'e4']]} />);
    await user.click(screen.getByRole('button', { name: 'Copy PGN' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Could not copy');
  });

  it('downloads the GIF from the encoded bytes', async () => {
    const user = userEvent.setup();
    const makeGif = vi.fn(async () => new Uint8Array([0x47, 0x49, 0x46]));
    const download = vi.fn();
    render(
      <ExportMenu
        pgn={pgn}
        fen={fen}
        fens={[START, fen]}
        lastMoves={[null, ['e2', 'e4']]}
        makeGif={makeGif}
        download={download}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Download GIF' }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(makeGif).toHaveBeenCalledWith([START, fen], [null, ['e2', 'e4']], 'white');
    const [blob, name] = download.mock.calls[0] as unknown as [Blob, string];
    expect(blob.type).toBe('image/gif');
    expect(name).toMatch(/\.gif$/);
    expect(await screen.findByRole('status')).toHaveTextContent('GIF downloaded');
  });
});
