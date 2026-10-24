import { GIFEncoder, applyPalette, quantize, type Encoder } from 'gifenc';
import { pieceSrc } from '@/components/board/PieceLayer';
import type { Orientation } from '@/lib/board/squares';
import type { BoardThemeName } from '@/lib/design/tokens';
import { renderBoardFrame, type FrameContext, type PieceImages } from './boardFrame';

/** Plan Task 11: one position every 600ms, and the final position held so it can be read. */
export const GIF_FRAME_MS = 600;
export const FINAL_FRAME_MS = 2000;
export const GIF_SIZE = 480;

export interface GifCanvas {
  ctx: FrameContext;
  /** RGBA pixels of the whole canvas. */
  imageData(): Uint8ClampedArray;
}

export interface GifOptions {
  size?: number;
  theme?: BoardThemeName;
  orientation?: Orientation;
  images: PieceImages;
  createCanvas?: (size: number) => GifCanvas;
  createEncoder?: () => Pick<Encoder, 'writeFrame' | 'finish' | 'bytes'>;
}

function browserCanvas(size: number): GifCanvas {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This browser cannot draw on a canvas');
  return { ctx, imageData: () => ctx.getImageData(0, 0, size, size).data };
}

/** Loads the 12 piece images so frames can draw them synchronously. */
export async function loadPieceImages(): Promise<PieceImages> {
  const entries = await Promise.all(
    ['w', 'b'].flatMap((color) =>
      ['K', 'Q', 'R', 'B', 'N', 'P'].map(async (type) => {
        const img = new Image();
        img.src = pieceSrc(color, type);
        await img.decode();
        return [`${color}${type}`, img] as const;
      }),
    ),
  );
  return Object.fromEntries(entries);
}

const nextTick = () => new Promise((r) => setTimeout(r, 0));

/** Renders every position and encodes them as a looping GIF. */
export async function encodeGameGif(
  fens: readonly string[],
  lastMoves: ReadonlyArray<readonly [string, string] | null>,
  {
    size = GIF_SIZE,
    theme,
    orientation,
    images,
    createCanvas = browserCanvas,
    createEncoder = GIFEncoder,
  }: GifOptions,
): Promise<Uint8Array> {
  const canvas = createCanvas(size);
  const gif = createEncoder();
  for (const [i, fen] of fens.entries()) {
    renderBoardFrame(canvas.ctx, fen, {
      size,
      theme,
      orientation,
      images,
      lastMove: lastMoves[i] ?? null,
    });
    const rgba = canvas.imageData();
    const palette = quantize(rgba, 256);
    const delay = i === fens.length - 1 ? FINAL_FRAME_MS : GIF_FRAME_MS;
    gif.writeFrame(applyPalette(rgba, palette), size, size, { palette, delay });
    // Long games take a while; yield so the page stays responsive.
    await nextTick();
  }
  gif.finish();
  return gif.bytes();
}
