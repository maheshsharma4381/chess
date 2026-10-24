import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/lib/design/contrast';
import { BOARD_THEMES, COLORS, MOTION } from '@/lib/design/tokens';

const css = readFileSync(resolve(import.meta.dirname, '../app/globals.css'), 'utf8');

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });
});

describe('design tokens', () => {
  it.each([
    ['text on bg', COLORS.text, COLORS.bg],
    ['text on surface', COLORS.text, COLORS.surface],
    ['muted text on bg', COLORS.textMuted, COLORS.bg],
    ['muted text on surface', COLORS.textMuted, COLORS.surface],
    ['on-brand on brand', COLORS.onBrand, COLORS.brand],
    ['on-brand on brand hover', COLORS.onBrand, COLORS.brandHover],
    ['on-accent on accent', COLORS.onAccent, COLORS.accent],
    ['on-danger on danger', COLORS.onDanger, COLORS.danger],
  ])('%s passes 4.5:1', (_, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps globals.css in sync with tokens.ts', () => {
    const cssVar = (name: string) =>
      new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim().toUpperCase();
    for (const [key, value] of Object.entries(COLORS)) {
      const name = `color-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
      expect(cssVar(name), name).toBe(value.toUpperCase());
    }
    expect(cssVar('duration-fast')).toBe(`${MOTION.fast}MS`);
    expect(cssVar('ease-standard')).toBe(MOTION.ease.toUpperCase());
  });

  it('defines the four board themes with the spec green as default', () => {
    expect(Object.keys(BOARD_THEMES)).toEqual(['green', 'wood', 'icy-sea', 'glass']);
    expect(BOARD_THEMES.green).toEqual({ light: '#EEEED2', dark: '#769656' });
  });

  it('turns motion off for reduced-motion users', () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*--duration-fast:\s*0ms/);
  });
});
