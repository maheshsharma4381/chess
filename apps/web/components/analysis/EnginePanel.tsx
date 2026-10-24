'use client';

import { formatScore } from '@chess/chess-core';
import type { LiveAnalysis, LiveLine } from '@/lib/analysis/useLiveAnalysis';

export const MULTI_PV_OPTIONS = [1, 2, 3] as const;

/** "12. Nf3 Nc6 13. Bb5" from the position's move number and side to move. */
function numbered(fen: string, sans: readonly string[]): string {
  const [, turn = 'w', , , , full = '1'] = fen.split(' ');
  let number = Number(full) || 1;
  let white = turn === 'w';
  const parts: string[] = [];
  sans.forEach((san, i) => {
    if (white) parts.push(`${number}. ${san}`);
    else parts.push(i === 0 ? `${number}... ${san}` : san);
    if (!white) number++;
    white = !white;
  });
  return parts.join(' ');
}

export interface EnginePanelProps {
  fen: string;
  analysis: LiveAnalysis & { retry: () => void };
  multiPv: number;
  onMultiPv: (n: number) => void;
  enabled: boolean;
  onToggle: () => void;
  onPlayLine: (uci: string) => void;
}

/** Stockfish's live lines for the board position (spec 5.5 analysis studio). */
export function EnginePanel({
  fen,
  analysis,
  multiPv,
  onMultiPv,
  enabled,
  onToggle,
  onPlayLine,
}: EnginePanelProps) {
  const lines: LiveLine[] = 'lines' in analysis ? analysis.lines : [];

  return (
    <section
      aria-label="Engine"
      className="space-y-2 rounded-(--radius-panel) border border-border bg-surface p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          aria-pressed={enabled}
          onClick={onToggle}
          className="min-h-11 cursor-pointer rounded-(--radius-control) px-3 text-sm font-semibold text-text-muted hover:bg-surface-raised aria-pressed:text-text"
        >
          Stockfish 19 {enabled ? 'on' : 'off'}
        </button>
        <p className="tabular text-xs text-text-muted" aria-live="polite">
          {'depth' in analysis && analysis.depth > 0 && `Depth ${analysis.depth}`}
          {analysis.status === 'running' && analysis.depth === 0 && 'Thinking…'}
        </p>
        <div role="group" aria-label="Lines" className="flex gap-1 text-xs">
          {MULTI_PV_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={multiPv === n}
              aria-label={`${n} line${n > 1 ? 's' : ''}`}
              onClick={() => onMultiPv(n)}
              className="tabular min-h-11 min-w-11 cursor-pointer rounded-[4px] text-text-muted hover:bg-surface-raised aria-pressed:bg-surface-raised aria-pressed:text-text"
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {analysis.status === 'error' && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-(--radius-control) border border-danger px-3 py-2 text-sm"
        >
          <span>The engine stopped: {analysis.message}</span>
          <button
            type="button"
            onClick={analysis.retry}
            className="min-h-11 cursor-pointer rounded-[4px] bg-danger px-3 font-semibold text-on-danger"
          >
            Retry
          </button>
        </div>
      )}
      {analysis.status === 'over' && (
        <p className="text-sm text-text-muted">The game is over in this position.</p>
      )}

      {enabled && analysis.status !== 'error' && analysis.status !== 'over' && (
        <ol aria-label="Engine lines" className="space-y-1">
          {lines.map((line) => (
            <li key={line.uci}>
              <button
                type="button"
                data-san={line.sans[0]}
                onClick={() => onPlayLine(line.uci)}
                className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-(--radius-control) px-2 text-left text-sm hover:bg-surface-raised"
              >
                <span className="tabular w-14 shrink-0 rounded-[4px] bg-surface-raised px-1 text-center font-semibold">
                  {formatScore(line.score)}
                </span>
                <span className="min-w-0 truncate text-text-muted">{numbered(fen, line.sans)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
