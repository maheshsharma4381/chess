import type { Metadata } from 'next';
import { BOTS } from '@chess/bots';
import { BotPicker } from '@/components/play/BotPicker';

export const metadata: Metadata = { title: 'Play vs Bots' };

export default function BotsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Play vs Bots</h1>
      <BotPicker bots={BOTS} />
    </main>
  );
}
