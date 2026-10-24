'use client';

import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MoveReview } from '@chess/types';

/** Spec "Show Moves": one engine move every 600ms. */
export const PREVIEW_STEP_MS = 600;

/** Positions along the engine's best line from the position before the move. */
export function previewFrames(move: MoveReview): string[] {
  const chess = new Chess(move.fenBefore);
  const frames: string[] = [];
  for (const san of move.pv) {
    try {
      chess.move(san);
    } catch {
      break;
    }
    frames.push(chess.fen());
  }
  return frames;
}

/** Plan ruling R4 (narrowed): only the engine's best move counts as solving the retry. */
export function judgeRetry(move: MoveReview, uci: string): boolean {
  return Boolean(move.bestMove && move.bestMove.uci === uci);
}

/** Plays preview frames on a timer; `fen` is null when nothing is being previewed. */
export function useLinePreview() {
  const [frames, setFrames] = useState<string[]>([]);
  const [index, setIndex] = useState(-1);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const stop = useCallback(() => {
    clear();
    setFrames([]);
    setIndex(-1);
  }, []);

  const start = useCallback((next: string[]) => {
    clear();
    if (next.length === 0) return;
    setFrames(next);
    setIndex(0);
    timer.current = setInterval(() => {
      setIndex((i) => {
        if (i + 1 >= next.length) {
          clear();
          return i;
        }
        return i + 1;
      });
    }, PREVIEW_STEP_MS);
  }, []);

  useEffect(() => clear, []);

  return {
    fen: index >= 0 ? (frames[index] ?? null) : null,
    playing: index >= 0 && index < frames.length - 1,
    start,
    stop,
  };
}

export interface RetryState {
  move: MoveReview;
  fen: string;
  color: 'w' | 'b';
  status: 'trying' | 'correct' | 'wrong';
  hint: Square | null;
}

/** "Retry Move": back to the position before the move; the user looks for the best move. */
export function useRetry() {
  const [state, setState] = useState<RetryState | null>(null);

  const begin = useCallback((move: MoveReview) => {
    setState({
      move,
      fen: move.fenBefore,
      color: move.fenBefore.split(' ')[1] === 'b' ? 'b' : 'w',
      status: 'trying',
      hint: null,
    });
  }, []);

  const attempt = useCallback((move: { from: string; to: string; promotion?: PieceSymbol }) => {
    setState((s) => {
      if (!s || s.status === 'correct') return s;
      const uci = move.from + move.to + (move.promotion ?? '');
      return { ...s, status: judgeRetry(s.move, uci) ? 'correct' : 'wrong' };
    });
  }, []);

  const showHint = useCallback(() => {
    setState((s) =>
      s?.move.bestMove ? { ...s, hint: s.move.bestMove.uci.slice(0, 2) as Square } : s,
    );
  }, []);

  const tryAgain = useCallback(() => {
    setState((s) => (s ? { ...s, status: 'trying', hint: null, fen: s.move.fenBefore } : s));
  }, []);

  const exit = useCallback(() => setState(null), []);

  return { state, begin, attempt, showHint, tryAgain, exit };
}
