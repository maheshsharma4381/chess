import { Chess, type Square } from 'chess.js';
import type { CSSProperties, HTMLAttributes, Ref } from 'react';
import type { MoveClassification } from '@chess/types';
import { trackPieces } from '@/lib/board/pieceTracking';
import { squareColor, squaresInDisplayOrder, type Orientation } from '@/lib/board/squares';
import { BOARD_OVERLAYS, BOARD_THEMES, type BoardThemeName } from '@/lib/design/tokens';
import { ClassificationBadge } from './ClassificationBadge';
import { PieceLayer } from './PieceLayer';

const PIECE_NAMES = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
} as const;

export interface BoardProps {
  fen: string;
  orientation?: Orientation;
  theme?: BoardThemeName;
  lastMove?: readonly [string, string] | null;
  badge?: { square: string; classification: MoveClassification } | null;
}

/** Read-only board (review, thumbnails). */
export function Board({ fen, orientation = 'white', ...rest }: BoardProps) {
  return (
    <div className="relative aspect-square w-full">
      <SquaresGrid fen={fen} orientation={orientation} {...rest} />
      <PieceLayer pieces={trackPieces([], fen)} orientation={orientation} />
    </div>
  );
}

export interface SquaresGridProps extends BoardProps {
  orientation: Orientation;
  selected?: string | null;
  targets?: readonly string[];
  premoveSquares?: ReadonlySet<string>;
  highlights?: readonly string[];
  focused?: string | null;
  gridRef?: Ref<HTMLDivElement>;
  squareRef?: (square: string, el: HTMLButtonElement | null) => void;
  onSquareClick?: (square: string) => void;
  onSquareFocus?: (square: string) => void;
  gridHandlers?: HTMLAttributes<HTMLDivElement>;
}

/** The 8x8 grid of square buttons with their overlays; pieces are drawn by PieceLayer. */
export function SquaresGrid({
  fen,
  orientation,
  theme = 'green',
  lastMove = null,
  badge = null,
  selected = null,
  targets = [],
  premoveSquares,
  highlights = [],
  focused = null,
  gridRef,
  squareRef,
  onSquareClick,
  onSquareFocus,
  gridHandlers,
}: SquaresGridProps) {
  const chess = new Chess(fen);
  const squares = squaresInDisplayOrder(orientation);
  const checkSquare = chess.inCheck()
    ? chess.findPiece({ type: 'k', color: chess.turn() })[0]
    : undefined;
  const colors = BOARD_THEMES[theme];
  const leftFile = orientation === 'white' ? 'a' : 'h';
  const bottomRank = orientation === 'white' ? '1' : '8';
  const style = { '--board-light': colors.light, '--board-dark': colors.dark } as CSSProperties;
  const rows = Array.from({ length: 8 }, (_, r) => squares.slice(r * 8, r * 8 + 8));
  const focusable = focused ?? squares[56]; // bottom-left square

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label="Chess board"
      className="relative grid aspect-square w-full touch-none grid-cols-8 grid-rows-8 overflow-hidden rounded-[6px] select-none"
      style={style}
      {...gridHandlers}
    >
      {rows.map((row, r) => (
        <div role="row" key={r} className="contents">
          {row.map((sq) => {
            const piece = chess.get(sq as Square);
            const label = piece
              ? `${sq}, ${piece.color === 'w' ? 'white' : 'black'} ${PIECE_NAMES[piece.type]}`
              : `${sq}, empty`;
            const color = squareColor(sq);
            const isTarget = targets.includes(sq);
            const coordColor = color === 'light' ? 'var(--board-dark)' : 'var(--board-light)';
            return (
              <div role="gridcell" key={sq} className="contents">
                <button
                  ref={(el) => squareRef?.(sq, el)}
                  type="button"
                  aria-label={label}
                  tabIndex={sq === focusable ? 0 : -1}
                  data-square={sq}
                  data-color={color}
                  data-check={sq === checkSquare || undefined}
                  data-last-move={lastMove?.includes(sq) || undefined}
                  data-selected={sq === selected || undefined}
                  data-target={isTarget || undefined}
                  data-premove={premoveSquares?.has(sq) || undefined}
                  data-highlight={highlights.includes(sq) || undefined}
                  onClick={() => onSquareClick?.(sq)}
                  onFocus={() => onSquareFocus?.(sq)}
                  className="relative aspect-square cursor-pointer outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
                  style={{
                    background: color === 'light' ? 'var(--board-light)' : 'var(--board-dark)',
                  }}
                >
                  <Overlay
                    show={lastMove?.includes(sq) ?? false}
                    background={BOARD_OVERLAYS.lastMove}
                  />
                  <Overlay show={sq === selected} background={BOARD_OVERLAYS.selected} />
                  <Overlay
                    show={premoveSquares?.has(sq) ?? false}
                    background={BOARD_OVERLAYS.premove}
                  />
                  <Overlay show={highlights.includes(sq)} background={BOARD_OVERLAYS.highlight} />
                  <Overlay
                    show={sq === checkSquare}
                    background={`radial-gradient(circle, ${BOARD_OVERLAYS.check} 0%, transparent 70%)`}
                  />
                  {isTarget &&
                    (piece ? (
                      <span
                        aria-hidden
                        className="absolute inset-0 rounded-full"
                        style={{ boxShadow: `inset 0 0 0 0.35rem ${BOARD_OVERLAYS.legalDot}` }}
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="absolute top-1/2 left-1/2 size-1/3 -translate-1/2 rounded-full"
                        style={{ background: BOARD_OVERLAYS.legalDot }}
                      />
                    ))}
                  {sq[0] === leftFile && (
                    <span
                      aria-hidden
                      className="absolute top-0.5 left-1 text-[11px] font-semibold"
                      style={{ color: coordColor }}
                    >
                      {sq[1]}
                    </span>
                  )}
                  {sq[1] === bottomRank && (
                    <span
                      aria-hidden
                      className="absolute right-1 bottom-0.5 text-[11px] font-semibold"
                      style={{ color: coordColor }}
                    >
                      {sq[0]}
                    </span>
                  )}
                  {badge?.square === sq && (
                    <ClassificationBadge
                      classification={badge.classification}
                      className="absolute -top-1 -right-1 z-10"
                    />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Overlay({ show, background }: { show: boolean; background: string }) {
  return show ? <span aria-hidden className="absolute inset-0" style={{ background }} /> : null;
}
