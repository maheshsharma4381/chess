import type { Metadata } from 'next';
import { GameReview } from '@/components/review/GameReview';
import { PgnPaste } from '@/components/review/PgnPaste';

export const metadata: Metadata = { title: 'Game Review' };

interface Props {
  searchParams: Promise<{ pgn?: string; depth?: string }>;
}

export default async function ReviewPage({ searchParams }: Props) {
  const { pgn, depth } = await searchParams;
  if (!pgn) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
        <h1 className="text-2xl font-bold">Game Review</h1>
        <p className="text-text-muted">
          Paste a game to see its accuracy, every move graded, and the coach's notes.
        </p>
        <PgnPaste />
      </main>
    );
  }
  // ?depth= exists for fast end-to-end tests; it is clamped to a sane range.
  const parsed = Number(depth);
  const searchDepth =
    Number.isFinite(parsed) && parsed > 0
      ? Math.min(22, Math.max(6, Math.round(parsed)))
      : undefined;
  return <GameReview pgn={pgn} depth={searchDepth} />;
}
