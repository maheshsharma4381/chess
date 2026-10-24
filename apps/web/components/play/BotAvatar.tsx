import type { BotProfile } from '@chess/types';

export function BotAvatar({ bot, size = 'md' }: { bot: BotProfile; size?: 'sm' | 'md' }) {
  const dims = size === 'sm' ? 'size-8 text-xs' : 'size-11 text-sm';
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-[#0F172A] ${dims}`}
      style={{ background: bot.avatar.color }}
    >
      {bot.avatar.initials}
    </span>
  );
}
