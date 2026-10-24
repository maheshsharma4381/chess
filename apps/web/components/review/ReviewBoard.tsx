'use client';

import { useMemo, useRef } from 'react';
import type { ReviewReport } from '@chess/types';
import { ArrowLayer } from '@/components/board/ArrowLayer';
import { SquaresGrid } from '@/components/board/Board';
import { PieceLayer } from '@/components/board/PieceLayer';
import { trackPieces, type TrackedPiece } from '@/lib/board/pieceTracking';
import type { Arrow } from '@/lib/board/reducer';
import type { Orientation } from '@/lib/board/squares';
import type { BoardThemeName } from '@/lib/design/tokens';

export interface ReviewBoardProps {
  report: ReviewReport;
  /** 0 = start position, k = after ply k. */
  ply: number;
  orientation: Orientation;
  theme?: BoardThemeName;
  /** Overrides the position (Show Moves preview). */
  fenOverride?: string | null;
}

/** Position at the ply with its classification badge, and the best move when it wasn't played. */
export function ReviewBoard({
  report,
  ply,
  orientation,
  theme = 'green',
  fenOverride = null,
}: ReviewBoardProps) {
  const move = ply > 0 ? report.moves[ply - 1] : undefined;
  const fen = fenOverride ?? move?.fenAfter ?? report.startFen;
  const tracked = useRef<TrackedPiece[]>([]);
  const pieces = useMemo(() => {
    tracked.current = trackPieces(tracked.current, fen);
    return tracked.current;
  }, [fen]);

  const showOverlays = move && !fenOverride;
  const arrows: Arrow[] =
    showOverlays &&
    move.bestMove &&
    move.bestMove.uci !== move.uci &&
    move.classification !== 'book'
      ? [
          {
            from: move.bestMove.uci.slice(0, 2),
            to: move.bestMove.uci.slice(2, 4),
            color: 'green',
          } as Arrow,
        ]
      : [];

  return (
    <div className="relative aspect-square w-full">
      <SquaresGrid
        fen={fen}
        orientation={orientation}
        theme={theme}
        lastMove={showOverlays ? [move.uci.slice(0, 2), move.uci.slice(2, 4)] : null}
        badge={
          showOverlays
            ? { square: move.uci.slice(2, 4), classification: move.classification }
            : null
        }
      />
      <PieceLayer pieces={pieces} orientation={orientation} />
      <ArrowLayer arrows={arrows} orientation={orientation} />
    </div>
  );
}
