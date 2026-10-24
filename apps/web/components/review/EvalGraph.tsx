'use client';

import { useState, type MouseEvent, type PointerEvent } from 'react';
import { CLASSIFICATION_META, type MoveClassification } from '@chess/types';
import { ClassificationBadge } from '@/components/board/ClassificationBadge';
import { fenStart } from '@/components/game/MoveList';
import type { Orientation } from '@/lib/board/squares';

/** Classifications worth a marker on the graph (the turning points). */
const NOTABLE = new Set<MoveClassification>(['brilliant', 'great', 'miss', 'mistake', 'blunder']);
const WHITE_FILL = '#f0f0f0';
const BLACK_FILL = '#403d39';

/** Horizontal position (0-100%) of a ply in a game of `plies` moves. */
export const xOf = (ply: number, plies: number) => (plies === 0 ? 0 : (ply / plies) * 100);
/** Vertical position (0-100% from the top): the bottom player's share rises from the bottom. */
export const yOf = (whiteWin: number, orientation: Orientation) =>
  orientation === 'white' ? 100 - whiteWin : whiteWin;
export const nearestPly = (xPercent: number, plies: number) =>
  Math.max(0, Math.min(plies, Math.round((xPercent / 100) * plies)));

export interface EvalGraphProps {
  /** White win% per position, start first (length = plies + 1). */
  winGraph: readonly number[];
  moves: ReadonlyArray<{ san: string; classification: MoveClassification }>;
  ply: number;
  orientation: Orientation;
  onPly: (ply: number) => void;
  /** The game's start position, for move numbers when it is not the usual start. */
  startFen?: string;
}

function describe(
  ply: number,
  winGraph: readonly number[],
  moves: EvalGraphProps['moves'],
  startFen?: string,
): { title: string; detail: string; classification?: MoveClassification } {
  const win = Math.round(winGraph[ply] ?? 50);
  const move = moves[ply - 1];
  if (!move) return { title: 'Start', detail: `White ${win}%` };
  const start = fenStart(startFen);
  const slot = ply - 1 + (start.blackFirst ? 1 : 0);
  const number = start.number + Math.floor(slot / 2);
  const title = `Move ${number}${slot % 2 === 0 ? '.' : '...'} ${move.san}`;
  return { title, detail: `White ${win}%`, classification: move.classification };
}

/**
 * Advantage over the game as a two-tone area (each side's share of the win chance),
 * with badge markers on the turning points. Click or tap jumps there; ← → work anywhere
 * on the review page; a table carries the same data for screen readers.
 */
export function EvalGraph({ winGraph, moves, ply, orientation, onPly, startFen }: EvalGraphProps) {
  const plies = moves.length;
  const [hover, setHover] = useState<number | null>(null);

  const plyAt = (e: MouseEvent<HTMLDivElement> | PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return null;
    return nearestPly(((e.clientX - rect.left) / rect.width) * 100, plies);
  };

  // A game with no moves has one point: stretch it across, or the area becomes a wedge.
  const points =
    plies === 0
      ? `0,${yOf(winGraph[0] ?? 50, orientation)} 100,${yOf(winGraph[0] ?? 50, orientation)}`
      : winGraph.map((w, i) => `${xOf(i, plies)},${yOf(w, orientation)}`).join(' ');
  const area = `0,100 ${points} 100,100`;
  const bottomFill = orientation === 'white' ? WHITE_FILL : BLACK_FILL;
  const topFill = orientation === 'white' ? BLACK_FILL : WHITE_FILL;
  const current = describe(ply, winGraph, moves, startFen);
  const tip = hover === null ? null : describe(hover, winGraph, moves, startFen);

  return (
    <div>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Evaluation graph"
        aria-valuemin={0}
        aria-valuemax={plies}
        aria-valuenow={ply}
        aria-valuetext={`${current.title}, ${current.detail}`}
        onClick={(e) => {
          const target = plyAt(e);
          if (target !== null) onPly(target);
        }}
        onPointerMove={(e) => setHover(plyAt(e))}
        onPointerLeave={() => setHover(null)}
        className="relative h-28 w-full cursor-pointer overflow-visible rounded-(--radius-control)"
        style={{ background: topFill }}
      >
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
        >
          <polygon points={area} fill={bottomFill} />
          <line
            x1="0"
            y1="50"
            x2="100"
            y2="50"
            stroke="#94A3B8"
            strokeOpacity="0.5"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          {hover !== null && (
            <line
              x1={xOf(hover, plies)}
              y1="0"
              x2={xOf(hover, plies)}
              y2="100"
              stroke="#94A3B8"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        <div
          aria-hidden
          data-testid="graph-current"
          className="pointer-events-none absolute top-0 bottom-0 w-0.5 -translate-x-1/2 bg-brand"
          style={{ left: `${xOf(ply, plies)}%` }}
        />

        {moves.map((m, i) =>
          NOTABLE.has(m.classification) ? (
            <span
              key={i}
              aria-hidden
              data-testid={`graph-marker-${i + 1}`}
              data-classification={m.classification}
              className="pointer-events-none absolute -translate-1/2 rounded-full ring-2 ring-surface"
              style={{
                left: `${xOf(i + 1, plies)}%`,
                top: `${yOf(winGraph[i + 1] ?? 50, orientation)}%`,
              }}
            >
              <ClassificationBadge
                classification={m.classification}
                className="size-4 text-[9px]"
              />
            </span>
          ) : null,
        )}

        {tip && hover !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute bottom-full z-20 mb-2 -translate-x-1/2 rounded-(--radius-control) border border-border bg-surface px-3 py-2 text-xs whitespace-nowrap shadow-[0_20px_25px_rgba(0,0,0,0.35)]"
            style={{ left: `${Math.min(85, Math.max(15, xOf(hover, plies)))}%` }}
          >
            <p className="tabular font-semibold text-text">{tip.detail}</p>
            <p className="text-text-muted">{tip.title}</p>
            {tip.classification && (
              <p className="text-text-muted">{CLASSIFICATION_META[tip.classification].label}</p>
            )}
          </div>
        )}
      </div>

      <table className="sr-only">
        <caption>Evaluation by move</caption>
        <thead>
          <tr>
            <th scope="col">Move</th>
            <th scope="col">White win %</th>
          </tr>
        </thead>
        <tbody>
          {moves.map((m, i) => {
            const d = describe(i + 1, winGraph, moves, startFen);
            return (
              <tr key={i}>
                <th scope="row">
                  {d.title} ({CLASSIFICATION_META[m.classification].label})
                </th>
                <td>{Math.round(winGraph[i + 1] ?? 50)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
