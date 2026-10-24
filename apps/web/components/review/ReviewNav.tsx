'use client';

import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect } from 'react';

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return Boolean(
    el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable),
  );
};

/** First / previous / next / last, plus ← → Home End anywhere on the page (not while typing). */
export function ReviewNav({
  ply,
  max,
  onPly,
}: {
  ply: number;
  max: number;
  onPly: (ply: number) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      const next =
        e.key === 'ArrowLeft'
          ? ply - 1
          : e.key === 'ArrowRight'
            ? ply + 1
            : e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? max
                : null;
      if (next === null) return;
      e.preventDefault();
      onPly(Math.max(0, Math.min(max, next)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ply, max, onPly]);

  const button = (label: string, target: number, Icon: typeof ChevronLeft, disabled: boolean) => (
    <button
      type="button"
      aria-label={label}
      onClick={() => onPly(target)}
      disabled={disabled}
      className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-(--radius-control) bg-surface-raised transition-colors duration-(--duration-base) hover:bg-border disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon aria-hidden className="size-5" />
    </button>
  );

  return (
    <div className="flex gap-1">
      {button('First move', 0, ChevronFirst, ply === 0)}
      {button('Previous move', Math.max(0, ply - 1), ChevronLeft, ply === 0)}
      {button('Next move', Math.min(max, ply + 1), ChevronRight, ply === max)}
      {button('Last move', max, ChevronLast, ply === max)}
    </div>
  );
}
