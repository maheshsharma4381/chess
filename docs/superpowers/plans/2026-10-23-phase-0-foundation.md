# Phase 0: Foundation and ECO Book Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fresh clone runs `pnpm install && pnpm typecheck && pnpm lint && pnpm test` green. `pnpm fetch-eco` produces `packages/chess-core/src/data/eco-book.json` from the Lichess TSVs, with an offline seed fallback.

**Architecture:** pnpm workspaces + Turborepo. Internal packages are consumed as TypeScript source (`exports` → `./src/index.ts`), so there is no build step for libraries. Next/Expo/tsx transpile them. `scripts/` is its own workspace package that depends on `@chess/chess-core` for EPD normalization, so the build script and runtime lookup share one canonical EPD function.

**Tech Stack:** Node 24, pnpm 11.5.2, turbo 2.11.10, TypeScript 6.0.3, Vitest 5.0.5, chess.js 1.4.0, tsx 4.23.15, ESLint 10 + typescript-eslint 8.72, Prettier 3.9.

**Spec:** `docs/spec/product-spec.md`, `docs/spec/workflow-mandate.md`, roadmap `docs/superpowers/plans/2026-10-23-chess-platform-roadmap.md`.

## Global Constraints

- Exact dependency versions (no `^`) for reproducibility.
- TypeScript strict + `noUncheckedIndexedAccess`.
- Source: `https://raw.githubusercontent.com/lichess-org/chess-openings/master/{a,b,c,d,e}.tsv`. **Discovered fact:** these TSVs only have `eco, name, pgn` columns, so `uci` and `epd` must be derived by replaying the PGN with chess.js.
- EPD = first 4 FEN fields. The en passant field is canonical: kept only if a legal en passant capture exists, else `-`.
- Count sanity: ≥3,400 entries (the upstream count drifts, so never assert exactly 3,546).
- Offline: if the download fails and the existing book is a full Lichess build, keep it. Otherwise write a book built from the 150-entry seed.
- Generated `eco-book.json` is committed so offline builds work.

## Review Focus

1. **En passant FEN mismatch**: a FEN from a user paste or Stockfish carries `e3` after `1.e4` while the book key has `-`. Lookup must still hit. Tested in Task 3 (`normalizeEpd`).
2. **Malformed TSV rows** (blank trailing line, CRLF, header repeated): the parser must skip them, not crash. Tested in Task 4.
3. **Illegal or garbled PGN in a row**: skip it with a warning and keep compiling. Tested in Task 4.
4. **Duplicate EPD (transposition) across rows**: the first entry wins and the duplicate is counted. Tested in Task 4.
5. **Network failure mid-download (1 of 5 files)**: treat it as total failure and fall back, never write a partial book. Tested in Task 5.

## File Map

```
package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json
.gitignore, .editorconfig, .prettierrc.json, .prettierignore, eslint.config.js, .env.example
.github/workflows/ci.yml
docs/spec/{product-spec.md, workflow-mandate.md}
packages/types/        package.json, tsconfig.json, src/index.ts (+ domain modules), test/classification.test.ts
packages/chess-core/   package.json, tsconfig.json, src/index.ts, src/epd.ts, src/data/eco-book.json, test/epd.test.ts, test/eco-book.test.ts
scripts/               package.json, tsconfig.json, fetch-eco-book.ts, build-eco-seed.ts,
                       src/eco/{parseTsv.ts, replayPgn.ts, compileBook.ts, classifyFamily.ts, fetchSources.ts, seed.ts}
                       test/{parseTsv,replayPgn,compileBook,classifyFamily,fetchSources}.test.ts
```

## Interfaces (shared names, used by later phases)

```ts
// @chess/types
export type EcoCode = string; // "A00".."E99"
export interface OpeningEntry { eco: EcoCode; name: string; pgn: string; uci: string }
export type WhiteFirstMove = '1.e4' | '1.d4' | '1.c4' | '1.Nf3' | 'Flank';
export interface OpeningFamily { name: string; side: 'white' | 'black'; firstMove: WhiteFirstMove; ecoCodes: EcoCode[]; count: number }
export interface EcoBook {
  version: 1; source: 'lichess' | 'seed'; generatedAt: string; count: number;
  byEpd: Record<string, OpeningEntry>;     // O(1) lookup
  byEco: Record<EcoCode, string[]>;       // eco -> epd keys (entries live once, in byEpd)
  families: OpeningFamily[];
}
export type MoveClassification = 'brilliant'|'great'|'best'|'excellent'|'good'|'book'|'inaccuracy'|'mistake'|'miss'|'blunder';
export const CLASSIFICATION_META: Record<MoveClassification, { label: string; symbol: string; color: string }>;

// @chess/chess-core
export function normalizeEpd(fen: string): string;

// scripts
parseTsv(text: string): RawOpening[]                 // RawOpening = { eco, name, pgn }
replayPgn(pgn: string): { uci: string; epd: string; plies: number }   // throws on illegal SAN
classifyFamily(name: string, firstMoveSan: string): { family: string; side; firstMove }
compileBook(rows: RawOpening[], source): { book: EcoBook; skipped: string[]; duplicates: number }
fetchSources(fetchFn?: typeof fetch): Promise<RawOpening[]>   // throws unless all 5 files succeed
```

---

### Task 1: Monorepo scaffold, tooling, CI, spec docs

- [ ] `git init -b main`. Root `package.json` (private, `packageManager: pnpm@11.5.2`, scripts `typecheck|lint|test|format|fetch-eco`), `pnpm-workspace.yaml` (`apps/*`, `packages/*`, `scripts`), `turbo.json` (tasks `typecheck`, `lint`, `test`), `tsconfig.base.json`, ESLint flat config, Prettier, `.gitignore` (node_modules, .turbo, coverage, `.env`), `.env.example`, CI workflow.
- [ ] Copy both spec documents into `docs/spec/`.
- [ ] Verify: `pnpm install` succeeds. `pnpm turbo typecheck` runs (no packages yet = no-op).
- [ ] Commit `chore: scaffold turborepo monorepo`.

### Task 2: `@chess/types` foundation

Tests (`classification.test.ts`):

- `CLASSIFICATION_META` has exactly 10 keys, matching the `MoveClassification` union.
- Colors match the spec exactly (brilliant `#1baca6` … blunder `#ca3431`).
- Symbols: `!!`, `!`, `★`, `👍`, `✓`, `📖`, `?!`, `?`, `✖`, `??`.

- [ ] Write the failing test, run it (FAIL), implement `src/opening.ts`, `src/classification.ts`, `src/index.ts`, run it (PASS), typecheck.
- [ ] Commit `feat(types): opening book and move classification types`.

### Task 3: `normalizeEpd` in `@chess/chess-core`

Tests (`epd.test.ts`):

- Start FEN → `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -`.
- After `1.e4`, FEN with `e3` → ep field `-` (no black pawn can capture).
- Position with a legal ep capture (`1.e4 Nf6 2.e5 d5`) → ep field `d6` kept.
- Same position whose FEN lacks the ep square → still `-` (we don't invent one).
- Halfmove/fullmove counters stripped. A 4-field EPD input is accepted.
- Invalid FEN → throws `Error` mentioning "Invalid FEN".

- [ ] TDD cycle, typecheck. Commit `feat(chess-core): canonical EPD normalization`.

### Task 4: Parse, replay, classify, compile (scripts)

Tests:

- `parseTsv`: header skipped, CRLF handled, blank lines skipped, rows with <3 columns skipped.
- `replayPgn('1. e4 c5')` → `uci: 'e2e4 c7c5'`, `plies: 2`, epd equals `normalizeEpd` of the position. Castling `O-O` → `e1g1`. Promotion → `e7e8q` style. Illegal SAN → throws.
- `classifyFamily`: `'Sicilian Defense: Najdorf Variation'` + `e4` → `{family:'Sicilian Defense', side:'black', firstMove:'1.e4'}`. `'Queen's Gambit Declined'` → black. `'Ruy Lopez'` → white. `'Bird Opening'` (`f4`) → firstMove `Flank`. `'English Opening'` (`c4`) → `1.c4`.
- `compileBook`: entries indexed by epd. `byEco['B20']` contains that epd. A duplicate epd keeps the first and counts `duplicates: 1`. A bad pgn lands in `skipped` and the others still compile. `families` are aggregated with counts and sorted ecoCodes. `count` = number of byEpd keys.

- [ ] TDD each module. Commit `feat(scripts): ECO TSV parser and book compiler`.

### Task 5: Fetch with fallback, seed, generate the real book

Tests (`fetchSources.test.ts`, with a mocked fetch):

- All 5 succeed → rows concatenated in a–e order.
- One file returns 500 → rejects (no partial book).
- `resolveRows` (the fallback decision): on fetch failure with an existing lichess book → `{action:'keep'}`. With no book or a seed book → `{action:'write', source:'seed'}`.

- [ ] Implement `fetchSources.ts` (timeout + 2 retries), `fetch-eco-book.ts` CLI, `build-eco-seed.ts` (curated famous names + fill to 150 with the shallowest lines; writes `src/eco/seed.ts`).
- [ ] Run `pnpm fetch-eco`. Expect ≥3,400 entries, 0 skipped.
- [ ] `eco-book.test.ts` in chess-core loads the JSON: count ≥3,400, start position → no entry (the root isn't an opening), after `1.e4 c5` → Sicilian Defense B20, Najdorf position → B90.
- [ ] Run the full `pnpm typecheck && pnpm lint && pnpm test`. Commit `feat: generate ECO opening book with offline seed fallback`.
