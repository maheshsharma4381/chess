'use client';

import { Chess } from 'chess.js';
import { BookOpen, FlipVertical2, PencilRuler } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { EngineAdapter } from '@chess/chess-core';
import { InteractiveBoard } from '@/components/board/InteractiveBoard';
import { ExportMenu } from '@/components/export/ExportMenu';
import { ExplorerPanel } from '@/components/explorer/ExplorerPanel';
import { EvalBar } from '@/components/game/EvalBar';
import { MoveList } from '@/components/game/MoveList';
import { ReviewNav } from '@/components/review/ReviewNav';
import { importGame, playUci, type AnalysisLine } from '@/lib/analysis/line';
import { useLiveAnalysis } from '@/lib/analysis/useLiveAnalysis';
import type { MoveIntent } from '@/lib/board/reducer';
import { engineStore } from '@/lib/engine/browserEngine';
import { linePgn } from '@/lib/export/pgn';
import type { ExplorerQueryService } from '@/lib/explorer/useExplorer';
import { BoardEditor } from './BoardEditor';
import { EnginePanel } from './EnginePanel';

const START: AnalysisLine = { startFen: new Chess().fen(), sans: [] };

export interface AnalysisStudioProps {
  /** From `?fen=` (a position) or `?pgn=` (a game); the PGN wins when both are given. */
  initialFen?: string;
  initialPgn?: string;
  showExplorer?: boolean;
  /** Tests inject these; the app uses the shared Stockfish worker and the explorer proxy. */
  engine?: EngineAdapter;
  explorerService?: ExplorerQueryService;
}

function initialState(fen?: string, pgn?: string): { line: AnalysisLine; error: string | null } {
  const source = pgn ?? fen;
  if (!source) return { line: START, error: null };
  const imported = importGame(source);
  return imported.ok
    ? { line: imported.line, error: null }
    : {
        line: START,
        error: `The link's ${pgn ? 'game' : 'position'} is invalid: ${imported.error}`,
      };
}

/** The analysis board (spec 5.5): free moves for both sides, live engine lines, explorer, editor. */
export function AnalysisStudio({
  initialFen,
  initialPgn,
  showExplorer = false,
  engine,
  explorerService,
}: AnalysisStudioProps) {
  const [initial] = useState(() => initialState(initialFen, initialPgn));
  const [line, setLine] = useState(initial.line);
  const [ply, setPly] = useState(initial.line.sans.length);
  const [linkError, setLinkError] = useState(initial.error);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [editing, setEditing] = useState(false);
  const [explorerOn, setExplorerOn] = useState(showExplorer);
  const [engineOn, setEngineOn] = useState(true);
  const [multiPv, setMultiPv] = useState(3);

  const positions = useMemo(() => {
    const chess = new Chess(line.startFen);
    const fens = [chess.fen()];
    const moves: (readonly [string, string])[] = [];
    for (const san of line.sans) {
      const m = chess.move(san);
      fens.push(m.after);
      moves.push([m.from, m.to]);
    }
    return { fens, moves };
  }, [line]);
  const fen = positions.fens[ply] ?? line.startFen;

  const getEngine = useMemo(
    () => (engine ? async () => engine : () => engineStore().getState().getEngine()),
    [engine],
  );
  const analysis = useLiveAnalysis(fen, multiPv, getEngine, engineOn && !editing);
  const best = 'lines' in analysis ? analysis.lines[0] : undefined;

  const play = useCallback(
    (uci: string) => {
      const next = playUci(line, ply, uci);
      if (!next) return;
      setLine(next);
      setPly(ply + 1);
    },
    [line, ply],
  );
  const onMove = useCallback(
    (intent: MoveIntent) => play(`${intent.from}${intent.to}${intent.promotion ?? ''}`),
    [play],
  );

  const load = (next: AnalysisLine) => {
    setLine(next);
    setPly(next.sans.length);
    setLinkError(null);
  };
  const submitImport = () => {
    const imported = importGame(importText);
    if (!imported.ok) {
      setImportError(imported.error);
      return;
    }
    setImportError(null);
    setImportText('');
    load(imported.line);
  };

  const toolButton =
    'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-(--radius-control) border border-border bg-surface-raised px-3 text-sm hover:bg-border aria-pressed:border-brand';

  return (
    <main className="mx-auto grid max-w-6xl gap-4 px-4 py-4 lg:grid-cols-[minmax(0,38rem)_1fr]">
      <section aria-label="Board" className="space-y-3">
        <h1 className="sr-only">Analysis board</h1>
        {linkError && (
          <p role="alert" className="rounded-(--radius-control) border border-danger p-3 text-sm">
            {linkError}
          </p>
        )}
        {editing ? (
          <BoardEditor
            initialFen={fen}
            orientation={orientation}
            onCancel={() => setEditing(false)}
            onDone={(edited) => {
              load({ startFen: edited, sans: [] });
              setEditing(false);
            }}
          />
        ) : (
          <>
            <div className="flex gap-2">
              <EvalBar score={engineOn ? (best?.score ?? null) : null} orientation={orientation} />
              <div className="flex-1">
                <InteractiveBoard
                  fen={fen}
                  movable="both"
                  onMove={onMove}
                  orientation={orientation}
                  lastMove={ply > 0 ? (positions.moves[ply - 1] ?? null) : null}
                />
              </div>
            </div>
            <ReviewNav ply={ply} max={line.sans.length} onPly={setPly} />
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
            className={toolButton}
          >
            <FlipVertical2 aria-hidden className="size-4" /> Flip board
          </button>
          {!editing && (
            <button type="button" onClick={() => setEditing(true)} className={toolButton}>
              <PencilRuler aria-hidden className="size-4" /> Edit position
            </button>
          )}
          <button
            type="button"
            aria-pressed={explorerOn}
            onClick={() => setExplorerOn((on) => !on)}
            className={toolButton}
          >
            <BookOpen aria-hidden className="size-4" /> Opening explorer
          </button>
        </div>
      </section>

      <aside className="flex flex-col gap-4">
        <EnginePanel
          fen={fen}
          analysis={analysis}
          multiPv={multiPv}
          onMultiPv={setMultiPv}
          enabled={engineOn}
          onToggle={() => setEngineOn((on) => !on)}
          onPlayLine={play}
        />

        {explorerOn && !editing && (
          <ExplorerPanel fen={fen} onPlayMove={play} service={explorerService} />
        )}

        <div className="max-h-72 overflow-y-auto rounded-(--radius-panel) border border-border bg-surface p-2">
          {line.sans.length > 0 ? (
            <MoveList
              sans={line.sans}
              currentPly={ply}
              onSelectPly={setPly}
              startFen={line.startFen}
            />
          ) : (
            <p className="p-2 text-sm text-text-muted">
              Make a move on the board, or import a game.
            </p>
          )}
        </div>

        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            submitImport();
          }}
        >
          <label htmlFor="analysis-import" className="text-sm font-medium">
            FEN or PGN
          </label>
          <textarea
            id="analysis-import"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={3}
            spellCheck={false}
            className="w-full rounded-(--radius-control) border border-border bg-bg p-2 font-mono text-xs"
          />
          {importError && (
            <p role="alert" className="text-sm text-text">
              <span className="font-semibold text-danger">Could not load:</span> {importError}
            </p>
          )}
          <button
            type="submit"
            className="min-h-11 cursor-pointer rounded-(--radius-control) bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-hover"
          >
            Load
          </button>
        </form>

        <ExportMenu
          pgn={linePgn(line, { Event: 'Analysis' })}
          fen={fen}
          fens={positions.fens}
          lastMoves={[null, ...positions.moves]}
          orientation={orientation}
        />
      </aside>
    </main>
  );
}
