import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BOTS } from '@chess/bots';
import { BotGame } from '@/components/play/BotGame';

interface Props {
  params: Promise<{ botId: string }>;
  searchParams: Promise<{ mode?: string; color?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { botId } = await params;
  const bot = BOTS.find((b) => b.id === botId);
  return { title: bot ? `Play ${bot.name}` : 'Bot not found' };
}

export default async function BotGamePage({ params, searchParams }: Props) {
  const { botId } = await params;
  const { mode, color } = await searchParams;
  if (!BOTS.some((b) => b.id === botId)) notFound();
  return (
    <main>
      <BotGame
        botId={botId}
        mode={mode === 'challenge' ? 'challenge' : 'friendly'}
        color={color === 'b' ? 'b' : 'w'}
      />
    </main>
  );
}
