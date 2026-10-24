import type { Arrow } from '@/lib/board/reducer';
import { displayPosition, type Orientation } from '@/lib/board/squares';
import { ARROW_COLORS, type ArrowColor } from '@/lib/design/tokens';

const center = (square: string, orientation: Orientation) => {
  const { col, row } = displayPosition(square, orientation);
  return { x: col + 0.5, y: row + 0.5 };
};

/** Arrow path: straight, or an L for knight jumps (long leg first, like a knight would). */
function points(arrow: Arrow, orientation: Orientation): Array<{ x: number; y: number }> {
  const a = center(arrow.from, orientation);
  const b = center(arrow.to, orientation);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const knight =
    (Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1);
  if (!knight) return [a, b];
  return Math.abs(dy) > Math.abs(dx) ? [a, { x: a.x, y: b.y }, b] : [a, { x: b.x, y: a.y }, b];
}

/** Stops the shaft short so the arrowhead tip lands near the target square's center. */
function shorten(pts: Array<{ x: number; y: number }>, by = 0.25) {
  const out = pts.map((p) => ({ ...p }));
  const last = out[out.length - 1] as { x: number; y: number };
  const prev = out[out.length - 2] as { x: number; y: number };
  const len = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
  last.x -= ((last.x - prev.x) / len) * by;
  last.y -= ((last.y - prev.y) / len) * by;
  return out;
}

export function ArrowLayer({
  arrows,
  orientation,
}: {
  arrows: readonly Arrow[];
  orientation: Orientation;
}) {
  if (arrows.length === 0) return null;
  return (
    <svg aria-hidden viewBox="0 0 8 8" className="pointer-events-none absolute inset-0 size-full">
      <defs>
        {(Object.keys(ARROW_COLORS) as ArrowColor[]).map((c) => (
          <marker
            key={c}
            id={`arrowhead-${c}`}
            viewBox="0 0 10 10"
            refX="3"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={ARROW_COLORS[c]} />
          </marker>
        ))}
      </defs>
      {arrows.map((arrow) => (
        <polyline
          key={`${arrow.from}-${arrow.to}`}
          data-testid={`arrow-${arrow.from}-${arrow.to}`}
          data-color={arrow.color}
          points={shorten(points(arrow, orientation))
            .map((p) => `${p.x},${p.y}`)
            .join(' ')}
          fill="none"
          stroke={ARROW_COLORS[arrow.color]}
          strokeOpacity={0.8}
          strokeWidth={0.18}
          strokeLinecap="round"
          strokeLinejoin="round"
          markerEnd={`url(#arrowhead-${arrow.color})`}
        />
      ))}
    </svg>
  );
}
