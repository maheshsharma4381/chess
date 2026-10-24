import type { BotProfile } from '@chess/types';
import { avatarInk } from '@/lib/design/ink';

export function BotAvatar({ bot, size = 'md' }: { bot: BotProfile; size?: 'sm' | 'md' }) {
  const dims = size === 'sm' ? 'size-8 text-xs' : 'size-11 text-sm';
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${dims}`}
      style={{ background: bot.avatar.color, color: avatarInk(bot.avatar.color) }}
    >
      {bot.avatar.initials}
    </span>
  );
}
