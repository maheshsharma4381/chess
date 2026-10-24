import type { Metadata } from 'next';
import { OpeningEncyclopedia } from '@/components/openings/OpeningEncyclopedia';

export const metadata: Metadata = { title: 'Openings' };

export default function OpeningsPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <h1 className="text-2xl font-bold">Opening encyclopedia</h1>
      <p className="text-text-muted">
        Every named opening from the Lichess ECO book. Open any line on the analysis board to
        practise it against the explorer.
      </p>
      <OpeningEncyclopedia />
    </main>
  );
}
