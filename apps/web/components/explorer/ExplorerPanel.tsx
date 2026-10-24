'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Chess } from 'chess.js';
import type { CounterMove, ExplorerGame, ExplorerSpeed } from '@chess/types';
import {
  type ExplorerFilters,
  type ExplorerQueryService,
  useExplorer,
} from '@/lib/explorer/useExplorer';

const RATINGS = [1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500] as const;
const SPEEDS: { id: ExplorerSpeed; label: string }[] = [
  { id: 'bullet', label: 'Bullet' },
  { id: 'blitz', label: 'Blitz' },
  { id: 'rapid', label: 'Rapid' },
];
/** Lichess's own explorer defaults. */
const DEFAULT_FILTERS: ExplorerFilters = {
  source: 'masters',
  ratings: [1600, 1800, 2000, 2200, 2500],
  speeds: ['blitz', 'rapid'],
};

/** Segment fills with the ink that reads on each (contrast ≥ 4.5:1). */
export const RESULT_BAR = {
  white: { fill: '#F1F5F9', ink: '#0F172A' },
  draw: { fill: '#94A3B8', ink: '#0F172A' },
  black: { fill: '#020617', ink: '#F1F5F9' },
} as const;
/** Narrower segments drop their % label (it is still in the row's accessible name). */
const LABEL_MIN_PCT = 12;

const compactFormat = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
export const compactCount = (n: number) => compactFormat.format(n);

const toggle = <T,>(list: readonly T[], item: T, order: readonly T[]) =>
  order.filter((x) => (x === item ? !list.includes(item) : list.includes(x)));

function sanOf(fen: string, uci: string | null): string | null {
  if (!uci) return null;
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
      .san;
  } catch {
    return null;
  }
}

export interface ExplorerPanelProps {
  fen: string;
  onPlayMove: (uci: string) => void;
  /** Injected in tests; defaults to the server proxy. */
  service?: ExplorerQueryService;
}

/** Opening explorer: Masters / Lichess games from the current position (spec 5.5). */
export function ExplorerPanel({ fen, onPlayMove, service }: ExplorerPanelProps) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const explorer = useExplorer(fen, filters, service);

  return (
    <section
      aria-label="Opening explorer"
      className="space-y-3 rounded-(--radius-panel) border border-border bg-surface p-3"
    >
      <div className="flex gap-1 text-sm" role="group" aria-label="Database">
        {(['masters', 'lichess'] as const).map((source) => (
          <button
            key={source}
            type="button"
            aria-pressed={filters.source === source}
            onClick={() => setFilters((f) => ({ ...f, source }))}
            className="min-h-11 flex-1 cursor-pointer rounded-(--radius-control) px-3 font-medium text-text-muted hover:bg-surface-raised aria-pressed:bg-surface-raised aria-pressed:text-text"
          >
            {source === 'masters' ? 'Masters' : 'Lichess'}
          </button>
        ))}
      </div>

      {filters.source === 'lichess' && (
        <div className="space-y-2">
          <Chips label="Ratings">
            {RATINGS.map((r) => (
              <Chip
                key={r}
                pressed={filters.ratings.includes(r)}
                onClick={() =>
                  setFilters((f) => ({ ...f, ratings: toggle(f.ratings, r, RATINGS) }))
                }
              >
                {r === 2500 ? '2500+' : r}
              </Chip>
            ))}
          </Chips>
          <Chips label="Speeds">
            {SPEEDS.map(({ id, label }) => (
              <Chip
                key={id}
                pressed={filters.speeds.includes(id)}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    speeds: toggle(
                      f.speeds,
                      id,
                      SPEEDS.map((s) => s.id),
                    ),
                  }))
                }
              >
                {label}
              </Chip>
            ))}
          </Chips>
        </div>
      )}

      {explorer.status === 'loading' && <Skeleton />}

      {explorer.status === 'error' && (
        <div className="space-y-2 rounded-(--radius-control) bg-surface-raised p-3 text-sm">
          <p className="font-semibold">Explorer unavailable</p>
          <p className="text-text-muted">{explorer.message}</p>
          <button
            type="button"
            onClick={explorer.retry}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-(--radius-control) border border-border px-3 font-medium hover:bg-border"
          >
            <RotateCcw aria-hidden className="size-4" /> Retry
          </button>
        </div>
      )}

      {explorer.status === 'ready' && (
        <div className="space-y-3">
          <p className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">{explorer.data.opening?.name ?? 'Position'}</span>
            <span className="tabular text-text-muted">
              {compactCount(explorer.data.totalGames)} games
            </span>
          </p>
          {explorer.data.counterMoves.length === 0 ? (
            <p className="text-sm text-text-muted">No games from this position.</p>
          ) : (
            <MoveList moves={explorer.data.counterMoves} onPlayMove={onPlayMove} />
          )}
          {explorer.data.topGames.length > 0 && (
            <TopGames fen={fen} games={explorer.data.topGames} />
          )}
        </div>
      )}
    </section>
  );
}

function Chips({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {children}
    </div>
  );
}

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className="tabular min-h-11 cursor-pointer rounded-full border border-border px-3 text-xs text-text-muted hover:bg-surface-raised aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:text-on-brand"
    >
      {children}
    </button>
  );
}

function Skeleton() {
  return (
    <div role="status" className="space-y-2">
      <span className="sr-only">Loading opening statistics</span>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          aria-hidden
          className="h-9 rounded-(--radius-control) bg-surface-raised motion-safe:animate-pulse"
        />
      ))}
    </div>
  );
}

function rowLabel(m: CounterMove) {
  const parts = [
    m.san,
    `${compactCount(m.totalGames)} games`,
    `White ${Math.round(m.whiteWinPct)}%`,
    `draw ${Math.round(m.drawPct)}%`,
    `Black ${Math.round(m.blackWinPct)}%`,
  ];
  if (m.averageRating !== null) parts.push(`average rating ${m.averageRating}`);
  return [...parts, ...m.badges].join(', ');
}

function MoveList({
  moves,
  onPlayMove,
}: {
  moves: CounterMove[];
  onPlayMove: (uci: string) => void;
}) {
  return (
    <div>
      <div
        aria-hidden
        className="grid grid-cols-[4rem_3.5rem_1fr_2.75rem] gap-2 px-2 pb-1 text-xs text-text-muted"
      >
        <span>Move</span>
        <span className="text-right">Games</span>
        <span>White / Draw / Black</span>
        <span className="text-right">Avg</span>
      </div>
      <ol aria-label="Moves" className="space-y-1">
        {moves.map((m) => (
          <li key={m.uci}>
            <button
              type="button"
              aria-label={rowLabel(m)}
              onClick={() => onPlayMove(m.uci)}
              className="grid min-h-11 w-full cursor-pointer grid-cols-[4rem_3.5rem_1fr_2.75rem] items-center gap-2 rounded-(--radius-control) px-2 text-left text-sm hover:bg-surface-raised"
            >
              <span className="flex flex-col">
                <span className="font-semibold">{m.san}</span>
                {m.badges.map((b) => (
                  <span
                    key={b}
                    className={
                      b === 'Main Line'
                        ? 'w-fit rounded-[4px] bg-brand px-1 text-[10px] font-semibold leading-4 text-on-brand'
                        : 'w-fit rounded-[4px] bg-accent px-1 text-[10px] font-semibold leading-4 text-on-accent'
                    }
                  >
                    {b}
                  </span>
                ))}
              </span>
              <span className="tabular text-right text-text-muted">
                {compactCount(m.totalGames)}
              </span>
              <ResultBar move={m} />
              <span className="tabular text-right text-text-muted">{m.averageRating ?? '—'}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ResultBar({ move }: { move: CounterMove }) {
  const segments = [
    ['white', move.whiteWinPct],
    ['draw', move.drawPct],
    ['black', move.blackWinPct],
  ] as const;
  return (
    <span className="flex h-6 overflow-hidden rounded-[4px] ring-1 ring-border">
      {segments.map(([side, pct]) => (
        <span
          key={side}
          data-testid={`bar-${side}`}
          style={{
            width: `${+pct.toFixed(1)}%`,
            backgroundColor: RESULT_BAR[side].fill,
            color: RESULT_BAR[side].ink,
          }}
          className="tabular flex items-center justify-center overflow-hidden text-[11px] font-medium"
        >
          {pct >= LABEL_MIN_PCT && `${Math.round(pct)}%`}
        </span>
      ))}
    </span>
  );
}

function TopGames({ fen, games }: { fen: string; games: ExplorerGame[] }) {
  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Top games</h3>
      <ol aria-label="Top games" className="space-y-1">
        {games.map((g) => {
          const san = sanOf(fen, g.uci);
          return (
            <li key={g.id}>
              <a
                href={`https://lichess.org/${g.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center justify-between gap-2 rounded-(--radius-control) px-2 text-sm hover:bg-surface-raised"
              >
                <span className="min-w-0">
                  <span className="block truncate">
                    {g.white.name}{' '}
                    <span className="tabular text-text-muted">({g.white.rating})</span>
                  </span>
                  <span className="block truncate">
                    {g.black.name}{' '}
                    <span className="tabular text-text-muted">({g.black.rating})</span>
                  </span>
                </span>
                <span className="tabular shrink-0 text-right text-xs text-text-muted">
                  {san && <span className="block font-semibold text-text">{san}</span>}
                  <span className="block">
                    {g.result}
                    {g.year !== null && ` · ${g.year}`}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
