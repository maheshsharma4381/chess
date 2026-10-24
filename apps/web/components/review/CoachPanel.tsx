'use client';

import { Play, RotateCcw, Square } from 'lucide-react';
import { explainMove } from '@chess/chess-core';
import type { CoachLanguage, MoveReview } from '@chess/types';
import { ClassificationBadge } from '@/components/board/ClassificationBadge';

const RETRYABLE = new Set(['mistake', 'blunder', 'miss']);

export interface CoachPanelProps {
  move: MoveReview | null;
  lang: CoachLanguage;
  onLang: (lang: CoachLanguage) => void;
  onShowMoves: () => void;
  onStopPreview: () => void;
  previewing: boolean;
  onRetry: () => void;
}

/** The coach's comment on the current move, with Show Moves and Retry Move. */
export function CoachPanel({
  move,
  lang,
  onLang,
  onShowMoves,
  onStopPreview,
  previewing,
  onRetry,
}: CoachPanelProps) {
  const explanation = move ? explainMove(move, lang) : null;

  return (
    <section
      aria-label="Coach"
      className="space-y-3 rounded-(--radius-panel) border border-border bg-surface p-3"
    >
      <div className="flex justify-end gap-1 text-xs">
        {(['en', 'hinglish'] as const).map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={lang === l}
            onClick={() => onLang(l)}
            className="min-h-11 cursor-pointer rounded-[4px] px-3 text-text-muted aria-pressed:bg-surface-raised aria-pressed:text-text"
          >
            {l === 'en' ? 'English' : 'Hinglish'}
          </button>
        ))}
      </div>

      {move && explanation ? (
        <div aria-live="polite" className="space-y-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <ClassificationBadge classification={move.classification} />
            {explanation.headline}
          </h2>
          <p className="tabular text-sm text-text-muted">{explanation.evalChange}</p>
          <p className="text-sm leading-relaxed">{explanation.text}</p>
        </div>
      ) : (
        <p className="text-sm text-text-muted">
          Step through the game with the arrow keys, or click a move or the graph.
        </p>
      )}

      {previewing && (
        <p className="flex items-center justify-between rounded-(--radius-control) bg-surface-raised px-3 py-2 text-sm">
          <span>Showing engine line</span>
          <button
            type="button"
            onClick={onStopPreview}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-[4px] px-2 font-medium hover:bg-border"
          >
            <Square aria-hidden className="size-4" /> Stop
          </button>
        </p>
      )}

      {move && (
        <div className="flex flex-wrap gap-2">
          {move.pv.length > 0 && !previewing && (
            <button
              type="button"
              onClick={onShowMoves}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-(--radius-control) border border-border bg-surface-raised px-3 text-sm font-medium hover:bg-border"
            >
              <Play aria-hidden className="size-4" /> Show Moves
            </button>
          )}
          {RETRYABLE.has(move.classification) && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-(--radius-control) bg-brand px-3 text-sm font-semibold text-on-brand hover:bg-brand-hover"
            >
              <RotateCcw aria-hidden className="size-4" /> Retry Move
            </button>
          )}
        </div>
      )}
    </section>
  );
}
