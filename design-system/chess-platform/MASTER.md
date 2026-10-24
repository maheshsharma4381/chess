# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/chess-platform/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file. Otherwise follow the rules below.
> Code source of truth: `apps/web/lib/design/tokens.ts`, mirrored in `apps/web/app/globals.css`.
> A test (`apps/web/test/design-tokens.test.ts`) keeps the two in sync and checks contrast.

**Project:** Chess Platform
**Base:** UI-UX Pro Max "Card & Board Game", Minimalism & Swiss style (variance 3, motion 3, density 6), adapted to the
workflow mandate (slate-900 + chess green). The generated defaults that failed contrast (white text on gold, white
modals in a dark app) were replaced.

---

## Principles

1. **The board is the product.** Chrome stays quiet: flat surfaces, one accent, no decorative motion.
2. **Every move is possible three ways:** drag, click-to-move, keyboard (WCAG 2.2 "Dragging Movements").
3. **Motion carries meaning:** pieces slide (150ms), the eval bar eases (300ms), and nothing else animates by default. `prefers-reduced-motion` turns piece and bar motion off.
4. **Numbers are tabular:** clocks, evals and ratings use `font-variant-numeric: tabular-nums`.

## Color Tokens (dark only in Phase 2)

| Token                    | Value     | Use                              | Contrast              |
| ------------------------ | --------- | -------------------------------- | --------------------- |
| `--color-bg`             | `#0F172A` | page background (slate-900)      |                       |
| `--color-surface`        | `#1E293B` | panels, cards (slate-800)        |                       |
| `--color-surface-raised` | `#273449` | hover rows, menus                |                       |
| `--color-border`         | `#334155` | dividers, inputs                 |                       |
| `--color-text`           | `#F1F5F9` | primary text                     | ≥ 4.5:1 on bg/surface |
| `--color-text-muted`     | `#94A3B8` | secondary text                   | ≥ 4.5:1 on bg/surface |
| `--color-brand`          | `#81B64C` | primary CTA ("Play"), focus ring |                       |
| `--color-on-brand`       | `#0F172A` | text on brand                    | ≥ 4.5:1               |
| `--color-brand-hover`    | `#95C95D` | CTA hover                        |                       |
| `--color-accent`         | `#D97706` | gold: ratings, highlights        |                       |
| `--color-on-accent`      | `#0F172A` | text on gold                     | ≥ 4.5:1               |
| `--color-danger`         | `#DC2626` | resign, errors                   |                       |
| `--color-on-danger`      | `#FFFFFF` | text on danger                   | ≥ 4.5:1               |

Move-classification colors follow the spec exactly (`CLASSIFICATION_META` in `@chess/types`).

## Board Tokens

| Theme           | Light     | Dark      |
| --------------- | --------- | --------- |
| Green (default) | `#EEEED2` | `#769656` |
| Wood            | `#F0D9B5` | `#B58863` |
| Icy Sea         | `#DEE3E6` | `#788A94` |
| Glass           | `#C9D3DF` | `#7F8FA6` |

The overlays below are the same for every theme:

- last move: `rgba(246, 246, 105, 0.5)`
- selected square: `rgba(20, 85, 30, 0.5)`
- legal-move dot: `rgba(0, 0, 0, 0.18)`
- premove: `rgba(220, 38, 38, 0.45)`
- check: radial `rgba(220, 38, 38, 0.85)` → transparent
- right-click highlight: `rgba(235, 97, 80, 0.8)`

Arrows (80% opacity): orange `#FF9F1A` (default), red `#E53935` (Shift), blue `#3D7EFF` (Alt), green `#3FAF3F` (Ctrl).

## Typography

- Inter (via `next/font`), weights 400 / 500 / 600 / 700. Base 16px, line-height 1.5.
- Scale: 12 (caption, never body) / 14 (UI) / 16 (body) / 20 (h3) / 24 (h2) / 32 (h1).
- Tabular numbers for clocks, evals, ratings and move numbers.

## Spacing, Radius, Elevation

- Spacing on a 4px base: 4 / 8 / 12 / 16 / 24 / 32 / 48.
- Radius: 6px (buttons, inputs) / 10px (panels) / 14px (dialogs). The board itself is square-cornered with a 6px outer radius.
- Elevation: borders do the work, plus one shadow for dialogs: `0 20px 25px rgba(0,0,0,0.35)`.

## Motion

| Token             | Value                              | Use                              |
| ----------------- | ---------------------------------- | -------------------------------- |
| `--ease-standard` | `cubic-bezier(0.25, 0.1, 0.25, 1)` | everything                       |
| `--duration-fast` | `150ms`                            | piece slide (spec), button press |
| `--duration-base` | `200ms`                            | hovers, toggles                  |
| `--duration-slow` | `300ms`                            | eval bar fill, dialogs           |

Under `prefers-reduced-motion: reduce`, all three durations become `0ms`.

## Components

- **Primary button:** `--color-brand` background, `--color-on-brand` text, 600 weight, min height 44px, radius 6px; hover `--color-brand-hover`; focus a 2px ring in `--color-brand` with a 2px offset.
- **Secondary button:** `--color-surface-raised` background, `--color-text`, 1px `--color-border`.
- **Panel:** `--color-surface`, 1px `--color-border`, radius 10px, padding 16px.
- **Dialog:** `--color-surface`, radius 14px, the dialog shadow, overlay `rgba(15, 23, 42, 0.7)`, focus trapped, Escape closes.
- **Badge (classification):** a 20px circle in the classification color, with the symbol in 700 weight on `#0F172A` or white (whichever passes 4.5:1).
- **Icons:** lucide-react only, 20px in UI and 16px in dense lists, `aria-hidden` when decorative.

## Anti-Patterns

- No emoji as icons (classification symbols are text glyphs inside styled badges).
- No 3D, no complex shadows, no scroll-reveal animation on app screens.
- Never animate width/height. The eval bar animates `transform: scaleY`.
- No hover-only affordances. Everything works on touch.

## Pre-Delivery Checklist

- [ ] Contrast test green (`design-tokens.test.ts`)
- [ ] Every board action works by click, drag and keyboard
- [ ] Visible focus on every interactive element
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive at 375 / 768 / 1024 / 1440px, no horizontal scroll
- [ ] Touch targets ≥ 44px outside the board
