import { avatarInk } from '@/lib/design/ink';

/** The 12 preset avatars (server ruling R6): a colour each, with the player's initial. */
export const AVATAR_COLORS = [
  '#81B64C',
  '#3D7EFF',
  '#D97706',
  '#C62828',
  '#7C3AED',
  '#0EA5E9',
  '#14B8A6',
  '#EC4899',
  '#A16207',
  '#64748B',
  '#F59E0B',
  '#22C55E',
] as const;

export function avatarColor(avatar: string | undefined): { bg: string; ink: string } {
  const index = Number(/^avatar-(\d{2})$/.exec(avatar ?? '')?.[1]) - 1;
  const bg = AVATAR_COLORS[index >= 0 && index < AVATAR_COLORS.length ? index : 0]!;
  return { bg, ink: avatarInk(bg) };
}

export function Avatar({
  avatar,
  name,
  size = 64,
}: {
  avatar?: string;
  name: string;
  size?: number;
}) {
  const { bg, ink } = avatarColor(avatar);
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{ backgroundColor: bg, color: ink, width: size, height: size, fontSize: size * 0.42 }}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
