/**
 * Design tokens: the source of truth for values used from TypeScript (board themes, canvas
 * drawing). `app/globals.css` mirrors COLORS and MOTION for CSS; a test keeps them in sync.
 * Rationale: design-system/chess-platform/MASTER.md.
 */
export const COLORS = {
  bg: '#0F172A',
  surface: '#1E293B',
  surfaceRaised: '#273449',
  border: '#334155',
  text: '#F1F5F9',
  textMuted: '#94A3B8',
  brand: '#81B64C',
  onBrand: '#0F172A',
  brandHover: '#95C95D',
  accent: '#D97706',
  onAccent: '#0F172A',
  danger: '#DC2626',
  onDanger: '#FFFFFF',
} as const;

/** Book/opening accent (spec Book badge hue), lightened for text on panels. */
export const ECO_TEXT = '#AE8E6B';

export const MOTION = {
  ease: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  fast: 150,
  base: 200,
  slow: 300,
} as const;

export const BOARD_THEMES = {
  green: { light: '#EEEED2', dark: '#769656' },
  wood: { light: '#F0D9B5', dark: '#B58863' },
  'icy-sea': { light: '#DEE3E6', dark: '#788A94' },
  glass: { light: '#C9D3DF', dark: '#7F8FA6' },
} as const;

export type BoardThemeName = keyof typeof BOARD_THEMES;

export const BOARD_OVERLAYS = {
  lastMove: 'rgba(246, 246, 105, 0.5)',
  selected: 'rgba(20, 85, 30, 0.5)',
  legalDot: 'rgba(0, 0, 0, 0.18)',
  premove: 'rgba(220, 38, 38, 0.45)',
  check: 'rgba(220, 38, 38, 0.85)',
  highlight: 'rgba(235, 97, 80, 0.8)',
} as const;

/** Spec: orange by default, red with Shift, blue with Alt, green with Ctrl. */
export const ARROW_COLORS = {
  orange: '#FF9F1A',
  red: '#E53935',
  blue: '#3D7EFF',
  green: '#3FAF3F',
} as const;

export type ArrowColor = keyof typeof ARROW_COLORS;
