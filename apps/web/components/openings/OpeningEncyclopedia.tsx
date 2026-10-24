'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { EcoBook, OpeningEntry, OpeningFamily, WhiteFirstMove } from '@chess/types';
import { ECO_TEXT } from '@/lib/design/tokens';
import {
  FIRST_MOVES,
  familiesByFirstMove,
  familyLines,
  practiceHref,
  searchOpenings,
} from '@/lib/openings/encyclopedia';

const defaultLoadBook = () => import('@chess/chess-core/book').then((m) => m.loadEcoBook());

export interface OpeningEncyclopediaProps {
  /** The book is 1.7 MB, so it loads after the page; tests inject it. */
  loadBook?: () => Promise<EcoBook>;
}

/** Every named opening: search by name or ECO, or browse by White's first move (spec 5.5). */
export function OpeningEncyclopedia({ loadBook = defaultLoadBook }: OpeningEncyclopediaProps) {
  const [book, setBook] = useState<EcoBook | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<WhiteFirstMove>('1.e4');
  // Typing stays responsive while the 3,865-entry search catches up.
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    let live = true;
    loadBook().then(
      (b) => live && setBook(b),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [loadBook]);

  const groups = useMemo(() => (book ? familiesByFirstMove(book) : null), [book]);
  const results = useMemo(
    () => (book ? searchOpenings(book, deferredQuery) : []),
    [book, deferredQuery],
  );

  if (failed) {
    return (
      <p role="alert" className="rounded-(--radius-control) border border-danger p-3">
        The opening book could not be loaded. Reload the page to try again.
      </p>
    );
  }
  if (!book || !groups) {
    return (
      <p role="status" className="text-text-muted">
        Loading the opening book…
      </p>
    );
  }

  const searching = deferredQuery.trim() !== '';

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
        />
        <input
          type="search"
          aria-label="Search openings"
          placeholder={`Search ${book.count.toLocaleString('en')} openings by name or ECO (e.g. Najdorf, B20)`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-11 w-full rounded-(--radius-control) border border-border bg-bg pr-3 pl-9 text-sm"
        />
      </div>

      {searching ? (
        results.length === 0 ? (
          <p className="text-text-muted">No openings match “{deferredQuery.trim()}”.</p>
        ) : (
          <ol aria-label="Search results" className="space-y-1">
            {results.map((o) => (
              <LineItem key={o.uci} entry={o} />
            ))}
          </ol>
        )
      ) : (
        <>
          <div role="group" aria-label="White's first move" className="flex flex-wrap gap-1">
            {FIRST_MOVES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={tab === m}
                onClick={() => setTab(m)}
                className="min-h-11 cursor-pointer rounded-(--radius-control) px-4 text-sm font-medium text-text-muted hover:bg-surface-raised aria-pressed:bg-surface-raised aria-pressed:text-text"
              >
                {m}
              </button>
            ))}
          </div>
          <ul className="space-y-2">
            {groups[tab].map((f) => (
              <FamilyItem key={f.name} book={book} family={f} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const ecoRange = (codes: string[]) =>
  codes.length > 1 ? `${codes[0]}–${codes[codes.length - 1]}` : (codes[0] ?? '');

function FamilyItem({ book, family }: { book: EcoBook; family: OpeningFamily }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-(--radius-panel) border border-border bg-surface">
      <details onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 py-2">
          <span className="font-semibold">{family.name}</span>
          <span className="tabular text-xs text-text-muted">
            <span style={{ color: ECO_TEXT }}>{ecoRange(family.ecoCodes)}</span> · {family.count}{' '}
            {family.count === 1 ? 'line' : 'lines'}
          </span>
        </summary>
        {/* Rendered only when open: the big families have hundreds of lines. */}
        {open && (
          <ol aria-label={`${family.name} lines`} className="space-y-1 px-2 pb-2">
            {familyLines(book, family).map((o) => (
              <LineItem key={o.uci} entry={o} />
            ))}
          </ol>
        )}
      </details>
    </li>
  );
}

function LineItem({ entry }: { entry: OpeningEntry }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-(--radius-control) px-2 py-1.5 hover:bg-surface-raised">
      <span className="min-w-0">
        <span className="flex items-baseline gap-2">
          <span className="tabular text-xs font-semibold" style={{ color: ECO_TEXT }}>
            {entry.eco}
          </span>
          <span className="truncate text-sm font-medium">{entry.name}</span>
        </span>
        <span className="block truncate font-mono text-xs text-text-muted">{entry.pgn}</span>
      </span>
      <Link
        href={practiceHref(entry)}
        aria-label={`Practice ${entry.name}`}
        className="inline-flex min-h-11 shrink-0 items-center rounded-(--radius-control) border border-border px-3 text-sm font-medium hover:bg-border"
      >
        Practice
      </Link>
    </li>
  );
}
