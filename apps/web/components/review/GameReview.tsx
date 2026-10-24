'use client';

import { FlipVertical2, Lightbulb, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import type { EngineAdapter } from '@chess/chess-core';
import type { CoachLanguage } from '@chess/types';
import { InteractiveBoard } from '@/components/board/InteractiveBoard';
import { ExportMenu } from '@/components/export/ExportMenu';
import { EvalBar } from '@/components/game/EvalBar';
import { MoveList } from '@/components/game/MoveList';
import { engineStore } from '@/lib/engine/browserEngine';
import { previewFrames, useLinePreview, useRetry } from '@/lib/review/coachModes';
import { DEEP_DEPTH, QUICK_DEPTH, createReviewStore } from '@/lib/review/reviewStore';
import { CoachPanel } from './CoachPanel';
import { EvalGraph } from './EvalGraph';
import { ReviewBoard } from './ReviewBoard';
import { ReviewNav } from './ReviewNav';
import { ReviewSummary } from './ReviewSummary';

const header = (pgn: string, tag: string) =>
  new RegExp(`^\\s*\\[${tag}\\s+"([^"]*)"\\]`, 'm').exec(pgn)?.[1];

const loadBook = () =>
  import('@chess/chess-core/book').then(
    ({ OpeningLookupService, loadEcoBook }) => new OpeningLookupService(loadEcoBook()),
  );

export interface GameReviewProps {
  pgn: string;
  depth?: number;
  /** Tests inject an engine; the app uses the shared browser Stockfish worker. */
  engine?: EngineAdapter;
}

export function GameReview({ pgn, depth = QUICK_DEPTH, engine }: GameReviewProps) {
  const store = useMemo(
    () =>
      createReviewStore({
        getEngine: engine ? async () => engine : () => engineStore().getState().getEngine(),
        loadBook,
      }),
    [engine],
  );
  const s = useStore(store);
  const names = { white: header(pgn, 'White') ?? 'White', black: header(pgn, 'Black') ?? 'Black' };
  const [orientation, setOrientation] = useState<'white' | 'black'>(
    names.black === 'You' ? 'black' : 'white',
  );
  const [lang, setLang] = useState<CoachLanguage>('en');
  const preview = useLinePreview();
  const retry = useRetry();

  useEffect(() => {
    void store.getState().run(pgn, { depth });
    // Leaving the page stops the engine (plan Review Focus 1).
    return () => store.getState().cancel();
  }, [store, pgn, depth]);

  // Any navigation leaves Show Moves / Retry and shows the real position (Review Focus 2).
  const { stop: stopPreview } = preview;
  const { exit: exitRetry } = retry;
  const goTo = useCallback(
    (ply: number) => {
      stopPreview();
      exitRetry();
      store.getState().setPly(ply);
    },
    [store, stopPreview, exitRetry],
  );

  if (s.status === 'error') {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p role="alert" className="rounded-(--radius-control) border border-danger p-3">
          This game could not be reviewed: {s.error}
        </p>
      </main>
    );
  }

  const report = s.report;
  if (!report) {
    const pct = s.progress.total ? Math.round((s.progress.done / s.progress.total) * 100) : 0;
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 space-y-4">
        <h1 className="text-2xl font-bold">Game Review</h1>
        {s.status === 'idle' ? (
          <div className="space-y-3">
            <p className="text-text-muted">Review cancelled.</p>
            <button
              type="button"
              onClick={() => void s.run(pgn, { depth })}
              className="min-h-11 cursor-pointer rounded-(--radius-control) bg-brand px-4 font-semibold text-on-brand hover:bg-brand-hover"
            >
              Start again
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div
              role="progressbar"
              aria-label="Analysing the game"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="h-2 overflow-hidden rounded-full bg-surface-raised"
            >
              <div
                className="h-full bg-brand"
                style={{
                  width: `${pct}%`,
                  transition: 'width var(--duration-slow) var(--ease-standard)',
                }}
              />
            </div>
            <p className="tabular text-sm text-text-muted">
              Analysing with Stockfish at depth {s.depth}… {pct}%
            </p>
            <button
              type="button"
              onClick={() => s.cancel()}
              className="min-h-11 cursor-pointer rounded-(--radius-control) border border-border px-4 hover:bg-surface-raised"
            >
              Cancel
            </button>
          </div>
        )}
      </main>
    );
  }

  const ply = s.ply;
  const move = ply > 0 ? (report.moves[ply - 1] ?? null) : null;
  const score = move?.scoreAfter ?? report.moves[0]?.scoreBefore ?? { cp: 0 };
  const r = retry.state;

  return (
    <main className="mx-auto grid max-w-6xl gap-4 px-4 py-4 lg:grid-cols-[minmax(0,38rem)_1fr]">
      <section aria-label="Board" className="space-y-3">
        <div className="flex gap-2">
          <EvalBar score={score} orientation={orientation} />
          <div className="flex-1">
            {r ? (
              <InteractiveBoard
                fen={r.fen}
                movable={r.status === 'correct' ? 'none' : r.color}
                onMove={retry.attempt}
                orientation={orientation}
                hintSquare={r.hint}
              />
            ) : (
              <ReviewBoard
                report={report}
                ply={ply}
                orientation={orientation}
                fenOverride={preview.fen}
              />
            )}
          </div>
        </div>
        <ReviewNav ply={ply} max={report.moves.length} onPly={goTo} />
        <EvalGraph
          winGraph={report.winGraph}
          moves={report.moves}
          ply={ply}
          orientation={orientation}
          onPly={goTo}
        />
      </section>

      <aside className="flex flex-col gap-4">
        <ReviewSummary report={report} names={names} />

        {r ? (
          <section
            aria-label="Retry move"
            className="space-y-3 rounded-(--radius-panel) border border-border bg-surface p-3"
          >
            <p className="font-semibold" aria-live="polite">
              {r.status === 'trying' &&
                `Find the best move for ${r.color === 'w' ? 'White' : 'Black'}.`}
              {r.status === 'wrong' && 'Not quite. Try again, or take a hint.'}
              {r.status === 'correct' && `Correct! ${r.move.bestMove?.san} was the best move.`}
            </p>
            <div className="flex flex-wrap gap-2">
              {r.status !== 'correct' && (
                <button
                  type="button"
                  onClick={retry.showHint}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-(--radius-control) border border-border bg-surface-raised px-3 text-sm hover:bg-border"
                >
                  <Lightbulb aria-hidden className="size-4" /> Hint
                </button>
              )}
              {r.status === 'wrong' && (
                <button
                  type="button"
                  onClick={retry.tryAgain}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-(--radius-control) border border-border bg-surface-raised px-3 text-sm hover:bg-border"
                >
                  <Undo2 aria-hidden className="size-4" /> Try again
                </button>
              )}
              <button
                type="button"
                onClick={retry.exit}
                className="min-h-11 cursor-pointer rounded-(--radius-control) bg-brand px-3 text-sm font-semibold text-on-brand hover:bg-brand-hover"
              >
                Back to review
              </button>
            </div>
          </section>
        ) : (
          <CoachPanel
            move={move}
            lang={lang}
            onLang={setLang}
            previewing={preview.fen !== null}
            onShowMoves={() => move && preview.start(previewFrames(move))}
            onStopPreview={preview.stop}
            onRetry={() => {
              if (!move) return;
              preview.stop();
              retry.begin(move);
            }}
          />
        )}

        <div className="max-h-72 overflow-y-auto rounded-(--radius-panel) border border-border bg-surface p-2">
          <MoveList
            sans={report.moves.map((m) => m.san)}
            classifications={report.moves.map((m) => m.classification)}
            currentPly={ply}
            onSelectPly={goTo}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-(--radius-control) border border-border bg-surface-raised px-3 text-sm hover:bg-border"
          >
            <FlipVertical2 aria-hidden className="size-4" /> Flip board
          </button>
          {s.depth < DEEP_DEPTH && (
            <button
              type="button"
              onClick={() => void s.run(pgn, { depth: DEEP_DEPTH })}
              className="min-h-11 cursor-pointer rounded-(--radius-control) border border-border bg-surface-raised px-3 text-sm hover:bg-border"
            >
              Deeper review (depth {DEEP_DEPTH})
            </button>
          )}
        </div>

        <ExportMenu
          pgn={pgn}
          fen={move?.fenAfter ?? report.startFen}
          fens={[report.startFen, ...report.moves.map((m) => m.fenAfter)]}
          lastMoves={[
            null,
            ...report.moves.map((m) => [m.uci.slice(0, 2), m.uci.slice(2, 4)] as const),
          ]}
          orientation={orientation}
        />
      </aside>
    </main>
  );
}
