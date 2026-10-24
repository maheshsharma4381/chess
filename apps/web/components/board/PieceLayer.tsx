import type { TrackedPiece } from '@/lib/board/pieceTracking';
import { displayPosition, type Orientation } from '@/lib/board/squares';

export const pieceSrc = (color: string, type: string) =>
  `/pieces/cburnett/${color}${type.toUpperCase()}.svg`;

/**
 * Pieces drawn above the squares, positioned by transform so a moved piece (same id)
 * slides with the spec's 150ms ease. Pointer events pass through to the squares.
 */
export function PieceLayer({
  pieces,
  orientation,
  hidden,
}: {
  pieces: readonly TrackedPiece[];
  orientation: Orientation;
  /** Square whose piece is being dragged (drawn faded; the ghost follows the pointer). */
  hidden?: string | null;
}) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {pieces.map((p) => {
        const { col, row } = displayPosition(p.square, orientation);
        return (
          <div
            key={p.id}
            data-testid={`piece-${p.square}`}
            className="absolute top-0 left-0 size-[12.5%]"
            style={{
              transform: `translate(${col * 100}%, ${row * 100}%)`,
              transition: 'transform var(--duration-fast) var(--ease-standard)',
              opacity: hidden === p.square ? 0.35 : 1,
            }}
          >
            {/* Plain <img>: static SVG sprites need no next/image optimization. */}
            <img src={pieceSrc(p.color, p.type)} alt="" draggable={false} className="size-full" />
          </div>
        );
      })}
    </div>
  );
}
