'use client';

import { Chess } from 'chess.js';
import { useEffect, useMemo, useState } from 'react';
import type { EngineAdapter } from '@chess/chess-core';
import type { EngineLine, Score } from '@chess/types';

/**
 * The engine reports only finished searches, so "live" analysis deepens in steps; each step
 * replaces the lines and the depth readout. Stockfish keeps its hash between searches, so a
 * step re-uses most of the work of the one before.
 */
export const LIVE_DEPTHS = [8, 12, 16, 20] as const;
/** SAN plies shown per line. */
const PV_PLIES = 10;

export interface LiveLine {
  uci: string;
  /** The line in SAN, starting with the move to play. */
  sans: string[];
  /** White's point of view. */
  score: Score;
}

export type LiveAnalysis =
  | { status: 'off' | 'over' }
  | { status: 'running' | 'done'; depth: number; lines: LiveLine[] }
  | { status: 'error'; message: string };

function toLiveLine(fen: string, line: EngineLine): LiveLine {
  const chess = new Chess(fen);
  const flip = chess.turn() === 'b';
  const sans: string[] = [];
  for (const uci of line.pv.slice(0, PV_PLIES)) {
    try {
      sans.push(chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san);
    } catch {
      break;
    }
  }
  const s = line.score;
  const score: Score = !flip ? s : 'mate' in s ? { mate: -s.mate } : { cp: -s.cp };
  return { uci: line.uci, sans, score };
}

/**
 * Analyses `fen` with `multiPv` lines while `enabled`, restarting (and aborting the old
 * search) whenever the position or the line count changes.
 */
export function useLiveAnalysis(
  fen: string,
  multiPv: number,
  getEngine: () => Promise<EngineAdapter>,
  enabled = true,
): LiveAnalysis & { retry: () => void } {
  const over = useMemo(() => new Chess(fen).moves().length === 0, [fen]);
  const [attempt, setAttempt] = useState(0);
  const key = `${attempt}|${multiPv}|${fen}`;
  const [result, setResult] = useState<{ key: string; state: LiveAnalysis } | null>(null);

  useEffect(() => {
    if (!enabled || over) return;
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      try {
        const engine = await getEngine();
        for (const depth of LIVE_DEPTHS) {
          const lines = await engine.analyse(fen, { depth, multiPv, signal });
          if (signal.aborted) return;
          const status = depth === LIVE_DEPTHS.at(-1) ? 'done' : 'running';
          setResult({
            key,
            state: { status, depth, lines: lines.map((l) => toLiveLine(fen, l)) },
          });
        }
      } catch (err) {
        if (signal.aborted || (err as Error).name === 'AbortError') return;
        setResult({ key, state: { status: 'error', message: (err as Error).message } });
      }
    })();
    return () => controller.abort();
  }, [enabled, over, fen, multiPv, key, getEngine]);

  // A failed engine is dropped by the engine store, so a new attempt starts a fresh one.
  const retry = () => setAttempt((n) => n + 1);
  if (!enabled) return { status: 'off', retry };
  if (over) return { status: 'over', retry };
  const state =
    result?.key === key ? result.state : { status: 'running' as const, depth: 0, lines: [] };
  return { ...state, retry };
}
