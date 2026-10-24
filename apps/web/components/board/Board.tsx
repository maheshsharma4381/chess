import { Chess, type Square } from 'chess.js';
import type { CSSProperties } from 'react';
import type { MoveClassification } from '@chess/types';
import { BOARD_OVERLAYS, BOARD_THEMES, type BoardThemeName } from '@/lib/design/tokens';
import { squareColor, squaresInDisplayOrder, type Orientation } from '@/lib/board/squares';
import { ClassificationBadge } from './ClassificationBadge';

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

export function Board({
  fen,
  orientation = 'white',
  theme = 'green',
  lastMove = null,
  badge = null,
}: BoardProps) {
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

  return (
    <div
      role="grid"
      aria-label="Chess board"
      className="relative grid aspect-square w-full touch-none grid-cols-8 grid-rows-8 overflow-hidden rounded-[6px] select-none"
      style={style}
    >
      {rows.map((row, r) => (
        <div role="row" key={r} className="contents">
          {row.map((sq) => (
            <div role="gridcell" key={sq} className="contents">
              <SquareButton
                square={sq}
                piece={chess.get(sq as Square)}
                isLastMove={lastMove?.includes(sq) ?? false}
                isCheck={sq === checkSquare}
                rankLabel={sq[0] === leftFile ? sq[1] : undefined}
                fileLabel={sq[1] === bottomRank ? sq[0] : undefined}
                badge={badge?.square === sq ? badge.classification : undefined}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function SquareButton({
  square,
  piece,
  isLastMove,
  isCheck,
  rankLabel,
  fileLabel,
  badge,
}: {
  square: string;
  piece: ReturnType<Chess['get']>;
  isLastMove: boolean;
  isCheck: boolean;
  rankLabel?: string;
  fileLabel?: string;
  badge?: MoveClassification;
}) {
  const color = squareColor(square);
  const label = piece
    ? `${square}, ${piece.color === 'w' ? 'white' : 'black'} ${PIECE_NAMES[piece.type]}`
    : `${square}, empty`;
  const coordColor = color === 'light' ? 'var(--board-dark)' : 'var(--board-light)';

  return (
    <button
      type="button"
      aria-label={label}
      data-square={square}
      data-color={color}
      data-check={isCheck || undefined}
      data-last-move={isLastMove || undefined}
      className="relative aspect-square outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
      style={{ background: color === 'light' ? 'var(--board-light)' : 'var(--board-dark)' }}
    >
      {isLastMove && (
        <span
          aria-hidden
          className="absolute inset-0"
          style={{ background: BOARD_OVERLAYS.lastMove }}
        />
      )}
      {isCheck && (
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle, ${BOARD_OVERLAYS.check} 0%, transparent 70%)`,
          }}
        />
      )}
      {rankLabel && (
        <span
          aria-hidden
          className="absolute top-0.5 left-1 text-[11px] font-semibold"
          style={{ color: coordColor }}
        >
          {rankLabel}
        </span>
      )}
      {fileLabel && (
        <span
          aria-hidden
          className="absolute right-1 bottom-0.5 text-[11px] font-semibold"
          style={{ color: coordColor }}
        >
          {fileLabel}
        </span>
      )}
      {piece && (
        // Plain <img>: static SVG sprites need no next/image optimization.
        <img
          src={`/pieces/cburnett/${piece.color}${piece.type.toUpperCase()}.svg`}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 size-full"
        />
      )}
      {badge && (
        <ClassificationBadge classification={badge} className="absolute -top-1 -right-1 z-10" />
      )}
    </button>
  );
}
