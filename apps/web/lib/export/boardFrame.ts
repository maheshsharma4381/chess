import { coordinateInks } from '@/lib/design/ink';
import { BOARD_OVERLAYS, BOARD_THEMES, type BoardThemeName } from '@/lib/design/tokens';
import type { Orientation } from '@/lib/board/squares';

/** The slice of CanvasRenderingContext2D the frame needs (a test can record the calls). */
export type FrameContext = Pick<
  CanvasRenderingContext2D,
  'fillStyle' | 'font' | 'textAlign' | 'textBaseline' | 'fillRect' | 'fillText'
> & {
  drawImage(image: CanvasImageSource, x: number, y: number, w: number, h: number): void;
};

/** Piece images keyed like the piece files: "wK", "bP", ... */
export type PieceImages = Record<string, CanvasImageSource>;

export interface FrameOptions {
  theme?: BoardThemeName;
  size: number;
  images: PieceImages;
  orientation?: Orientation;
  lastMove?: readonly [string, string] | null;
}

const FILES = 'abcdefgh';

/** Top-left pixel of a square for the orientation. */
function origin(square: string, sq: number, orientation: Orientation): [number, number] {
  const file = FILES.indexOf(square[0]!);
  const rank = Number(square[1]);
  const col = orientation === 'white' ? file : 7 - file;
  const row = orientation === 'white' ? 8 - rank : rank - 1;
  return [col * sq, row * sq];
}

/** Draws one position as the board looks on screen: squares, last move, coordinates, pieces. */
export function renderBoardFrame(
  ctx: FrameContext,
  fen: string,
  { theme = 'green', size, images, orientation = 'white', lastMove = null }: FrameOptions,
): void {
  const colors = BOARD_THEMES[theme];
  const inks = coordinateInks(colors);
  const sq = size / 8;

  for (let rank = 1; rank <= 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const [x, y] = origin(`${FILES[file]}${rank}`, sq, orientation);
      ctx.fillStyle = (file + rank) % 2 === 0 ? colors.light : colors.dark;
      ctx.fillRect(x, y, sq, sq);
    }
  }

  if (lastMove) {
    ctx.fillStyle = BOARD_OVERLAYS.lastMove;
    for (const square of lastMove) {
      const [x, y] = origin(square, sq, orientation);
      ctx.fillRect(x, y, sq, sq);
    }
  }

  // Coordinates sit on the bottom row (files) and the left column (ranks), like the board.
  ctx.font = `600 ${Math.max(8, Math.round(sq * 0.2))}px sans-serif`;
  const pad = sq * 0.06;
  for (let i = 0; i < 8; i++) {
    const file = orientation === 'white' ? FILES[i]! : FILES[7 - i]!;
    const rank = orientation === 'white' ? 8 - i : i + 1;
    // Bottom row: column i; light squares get the dark ink and vice versa.
    const bottomLight = (FILES.indexOf(file) + (orientation === 'white' ? 1 : 8)) % 2 === 0;
    ctx.fillStyle = bottomLight ? inks.onLight : inks.onDark;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(file, (i + 1) * sq - pad, size - pad);

    const leftFile = orientation === 'white' ? 0 : 7;
    const leftLight = (leftFile + rank) % 2 === 0;
    ctx.fillStyle = leftLight ? inks.onLight : inks.onDark;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(String(rank), pad, i * sq + pad);
  }

  const placement = fen.split(' ')[0]!;
  placement.split('/').forEach((row, r) => {
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += Number(ch);
        continue;
      }
      const square = `${FILES[file]}${8 - r}`;
      const image = images[`${ch === ch.toUpperCase() ? 'w' : 'b'}${ch.toUpperCase()}`];
      const [x, y] = origin(square, sq, orientation);
      if (image) ctx.drawImage(image, x, y, sq, sq);
      file++;
    }
  });
}
