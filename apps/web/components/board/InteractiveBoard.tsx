'use client';

import { Chess, type Square } from 'chess.js';
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import type { MoveClassification } from '@chess/types';
import { trackPieces, type TrackedPiece } from '@/lib/board/pieceTracking';
import { virtualBoard } from '@/lib/board/premoves';
import {
  boardReducer,
  initialBoardState,
  type Movable,
  type MoveIntent,
} from '@/lib/board/reducer';
import { displayPosition, squareAt, type Orientation } from '@/lib/board/squares';
import type { BoardThemeName } from '@/lib/design/tokens';
import { ArrowLayer } from './ArrowLayer';
import { SquaresGrid } from './Board';
import { PieceLayer, pieceSrc } from './PieceLayer';
import { PromotionDialog } from './PromotionDialog';

export interface InteractiveBoardProps {
  fen: string;
  movable: Movable;
  onMove: (intent: MoveIntent) => void;
  orientation?: Orientation;
  theme?: BoardThemeName;
  lastMove?: readonly [string, string] | null;
  badge?: { square: string; classification: MoveClassification } | null;
  /** Squares to emphasise (e.g. the hint's piece). */
  hintSquare?: string | null;
}

const DRAG_THRESHOLD_PX = 4;
const KEY_STEPS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

interface DragState {
  from: Square;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
  x: number;
  y: number;
}

/**
 * A playable board: click-to-move, drag-and-drop, keyboard (arrows + Enter, Escape),
 * right-drag arrows, right-click highlights, premoves and promotion, all through the pure
 * boardReducer. The owner applies `onMove` intents and passes the new `fen` back.
 */
export function InteractiveBoard({
  fen,
  movable,
  onMove,
  orientation = 'white',
  theme = 'green',
  lastMove = null,
  badge = null,
  hintSquare = null,
}: InteractiveBoardProps) {
  const [state, dispatch] = useReducer(boardReducer, { fen, movable }, initialBoardState);
  const gridRef = useRef<HTMLDivElement>(null);
  const squareEls = useRef(new Map<string, HTMLButtonElement>());
  const [focused, setFocused] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const arrowFrom = useRef<Square | null>(null);
  const suppressClick = useRef(false);
  const tracked = useRef<TrackedPiece[]>([]);

  useEffect(() => {
    if (fen !== state.fen) dispatch({ type: 'positionChanged', fen });
  }, [fen, state.fen]);
  useEffect(() => {
    if (movable !== state.movable) dispatch({ type: 'setMovable', movable });
  }, [movable, state.movable]);
  useEffect(() => {
    if (!state.intent) return;
    onMove(state.intent);
    dispatch({ type: 'intentConsumed' });
  }, [state.intent, onMove]);

  const pieces = useMemo(() => {
    tracked.current = trackPieces(tracked.current, state.fen);
    return tracked.current;
  }, [state.fen]);

  const premoveSquares = useMemo(
    () => new Set(state.premoves.flatMap((p) => [p.from, p.to])),
    [state.premoves],
  );

  const squareFromPoint = (clientX: number, clientY: number): Square | null => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return squareAt(col, row, orientation);
  };

  const ownsPiece = (square: Square) => {
    if (movable === 'none') return false;
    const piece = virtualBoard(state.fen, state.premoves).get(square);
    if (!piece) return false;
    return movable === 'both'
      ? piece.color === new Chess(state.fen).turn()
      : piece.color === movable;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const square = squareFromPoint(e.clientX, e.clientY);
    if (!square) return;
    if (e.button === 2) {
      arrowFrom.current = square;
      return;
    }
    if (e.button === 0 && ownsPiece(square)) {
      setDrag({
        from: square,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        active: false,
        x: e.clientX,
        y: e.clientY,
      });
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > DRAG_THRESHOLD_PX;
    if (!drag.active && !moved) return;
    if (!drag.active) {
      gridRef.current?.setPointerCapture?.(e.pointerId);
      if (state.selected !== drag.from) dispatch({ type: 'squareClicked', square: drag.from });
    }
    setDrag({ ...drag, active: true, x: e.clientX, y: e.clientY });
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const square = squareFromPoint(e.clientX, e.clientY);
    if (e.button === 2 && arrowFrom.current) {
      if (square) {
        const modifiers = { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey };
        dispatch({ type: 'rightDrag', from: arrowFrom.current, to: square, modifiers });
      }
      arrowFrom.current = null;
      return;
    }
    if (drag?.active) {
      suppressClick.current = true;
      if (square && square !== drag.from)
        dispatch({ type: 'moveAttempt', from: drag.from, to: square });
    }
    setDrag(null);
  };

  const onSquareClick = (square: string) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    dispatch({ type: 'squareClicked', square });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && state.selected) {
      e.preventDefault();
      dispatch({ type: 'squareClicked', square: state.selected });
      return;
    }
    const step = KEY_STEPS[e.key];
    const current = focused ?? squareAt(0, 7, orientation);
    if (!step) return;
    e.preventDefault();
    const { col, row } = displayPosition(current, orientation);
    const next = squareAt(
      Math.min(7, Math.max(0, col + step[0])),
      Math.min(7, Math.max(0, row + step[1])),
      orientation,
    );
    setFocused(next);
    squareEls.current.get(next)?.focus();
  };

  const rect = gridRef.current?.getBoundingClientRect();
  const ghostSize = rect ? rect.width / 8 : 0;
  const draggedPiece = drag?.active ? new Chess(state.fen).get(drag.from) : null;
  const pendingColor = state.pendingPromotion
    ? state.pendingPromotion.to[1] === '8'
      ? 'w'
      : 'b'
    : null;

  return (
    <div className="relative aspect-square w-full">
      <SquaresGrid
        fen={state.fen}
        orientation={orientation}
        theme={theme}
        lastMove={lastMove}
        badge={badge}
        selected={state.selected}
        targets={state.legalTargets}
        premoveSquares={premoveSquares}
        highlights={hintSquare ? [...state.highlights, hintSquare] : state.highlights}
        focused={focused}
        gridRef={gridRef}
        squareRef={(sq, el) => {
          if (el) squareEls.current.set(sq, el);
          else squareEls.current.delete(sq);
        }}
        onSquareClick={onSquareClick}
        onSquareFocus={setFocused}
        gridHandlers={{
          onPointerDown,
          onPointerMove,
          onPointerUp,
          onPointerCancel: () => setDrag(null),
          onContextMenu: (e) => e.preventDefault(),
          onKeyDown,
        }}
      />
      <PieceLayer
        pieces={pieces}
        orientation={orientation}
        hidden={drag?.active ? drag.from : null}
      />
      <ArrowLayer arrows={state.arrows} orientation={orientation} />
      {draggedPiece && drag && rect && (
        <img
          aria-hidden
          alt=""
          src={pieceSrc(draggedPiece.color, draggedPiece.type)}
          className="pointer-events-none absolute z-30"
          style={{
            width: ghostSize,
            height: ghostSize,
            left: drag.x - rect.left - ghostSize / 2,
            top: drag.y - rect.top - ghostSize / 2,
          }}
        />
      )}
      {pendingColor && (
        <PromotionDialog
          color={pendingColor}
          onChoose={(piece) => dispatch({ type: 'promotionChosen', piece })}
          onCancel={() => dispatch({ type: 'promotionCancelled' })}
        />
      )}
    </div>
  );
}
