'use client';

import { BookOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { OpeningLookupService } from '@chess/chess-core/book';

export interface OpeningName {
  eco: string;
  name: string;
}

let service: Promise<OpeningLookupService> | null = null;
/** The 1.7 MB book loads on first use, not with the page. */
function loadService(): Promise<OpeningLookupService> {
  service ??= import('@chess/chess-core/book').then(
    ({ OpeningLookupService: Service, loadEcoBook }) => new Service(loadEcoBook()),
  );
  return service;
}

/** Deepest named opening reached in the game so far (null until the book has loaded). */
export function useOpening(fenHistory: readonly string[]): OpeningName | null {
  const [opening, setOpening] = useState<OpeningName | null>(null);
  const key = fenHistory.at(-1) ?? '';
  useEffect(() => {
    let cancelled = false;
    void loadService().then((svc) => {
      if (cancelled) return;
      const found = svc.trackGameOpening([...fenHistory]).opening;
      setOpening(found ? { eco: found.eco, name: found.name } : null);
    });
    return () => {
      cancelled = true;
    };
    // Keyed on the last position: fenHistory is a new array every render.
  }, [key]);
  return opening;
}

export function OpeningBanner({ opening }: { opening: OpeningName | null }) {
  if (!opening) return null;
  return (
    <p className="flex min-h-8 items-center gap-2 text-sm">
      <BookOpen aria-hidden className="size-4 text-[#a88865]" />
      <span className="tabular font-semibold text-[#a88865]">{opening.eco}</span>
      <span className="truncate text-text-muted">{opening.name}</span>
    </p>
  );
}
