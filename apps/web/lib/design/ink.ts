import { contrastRatio } from './contrast';
import { COLORS } from './tokens';

const toRgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (rgb: number[]) =>
  `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
const mix = (hex: string, target: string, t: number) => {
  const a = toRgb(hex);
  const b = toRgb(target);
  return toHex(a.map((c, i) => c + ((b[i] as number) - c) * t));
};

/** Moves `ink` toward `toward` until it reaches `ratio` against `bg` (or as far as it can). */
function reach(ink: string, bg: string, toward: string, ratio: number): string {
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const candidate = mix(ink, toward, t);
    if (contrastRatio(candidate, bg) >= ratio) return candidate;
  }
  return toward;
}

/**
 * Coordinate label colors for a board theme: the opposite square's hue, pushed darker
 * (on light squares) or lighter (on dark squares) until it reads at 3:1.
 */
export function coordinateInks(theme: { light: string; dark: string }) {
  return {
    onLight: reach(theme.dark, theme.light, '#000000', 3),
    onDark: reach(theme.light, theme.dark, '#FFFFFF', 3),
  };
}

/** White or slate text, whichever contrasts more with the avatar color. */
export function avatarInk(bg: string): string {
  return contrastRatio('#FFFFFF', bg) >= contrastRatio(COLORS.bg, bg) ? '#FFFFFF' : COLORS.bg;
}
