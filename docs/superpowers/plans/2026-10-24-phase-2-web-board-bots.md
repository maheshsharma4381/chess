# Phase 2: Web Board, Engine and Bots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Next.js web app where a user plays a full game against one of 12 bot personalities on a polished, accessible board (drag, click and keyboard moves, arrows, premoves, eval bar, sounds), with no backend.

**Architecture:**

- `packages/engine` is a transport-agnostic UCI client. It provides the `EngineAdapter` for Game Review and `bestMove` for bots. There are two transports:
  - a Web Worker in the browser (Stockfish 19 lite-single WASM, served from `/engine/`);
  - Node, through the `stockfish` npm package, for integration tests and the Phase 4 server.
- `packages/bots` holds pure bot logic: profiles, strength model, personality biases and dialogue, all testable with a seeded RNG.
- `apps/web` holds the Next.js App Router UI.
  - All board state logic (selection, premove queue, arrows) lives in pure reducers, so it is unit-tested without a DOM.
  - Components are thin.
  - The design system is CSS custom properties consumed by Tailwind 4.

**Tech Stack:**

- Web: Next.js 16.4.3, React 19.3.1, Tailwind CSS 4.3.3, Zustand 5.0.16, Motion 14.6.0, lucide-react 1.61.0.
- Engine: Stockfish 19 (npm `stockfish` 19.0.1, GPL-3.0).
- Testing: Vitest 5 + @testing-library/react 16 + jsdom 30, Playwright 1.64.1.

**Spec:** `docs/spec/product-spec.md` PART 5.1 (board), PART 5.3 (bots), PART 4.1 (engine pipeline). Design mandate: `docs/spec/workflow-mandate.md` §2. Design system: `design-system/chess-platform/MASTER.md` (persisted from UI-UX Pro Max, Task 3). Roadmap Phase 2, including its "Carried from the Phase 1 review" list.

## Global Constraints

- Board default colors `#769656` / `#eeeed2`. Themes: Green, Wood, Icy Sea, Glass. Piece slide 150ms `cubic-bezier(0.25, 0.1, 0.25, 1)`. `prefers-reduced-motion` turns it off.
- Arrows: right-drag. Orange by default, red with Shift, blue with Alt, green with Ctrl. Right-click on a square toggles a highlight. A left click anywhere clears arrows.
- Premoves: multiple can be queued during the opponent's turn and are shown as translucent red. The first one executes immediately on the turn switch if legal; otherwise the whole queue clears. A right click clears the queue.
- Sound events: `move-self`, `move-opponent`, `capture`, `check`, `castle`, `promote`, `game-start`, `game-end`, `ten-seconds-low-time`.
- Bots, 4 tiers, 12 personalities (original names, no Chess.com characters):
  - Beginner: 250 / 400 / 650.
  - Intermediate: 1000 / 1300 (brings the queen out early) / 1400.
  - Advanced: 1500 / 1800 / 2000.
  - Master: 2300 / 3200 / "Mystery" (displays ??? and plays at ~3000).
  - Modes: Challenge (no hints, no takebacks) and Friendly (eval bar, hints, unlimited takebacks).
  - Dialogue reacts to: game start, the user's opening, a queen capture, being in check, winning, losing, the game end.
- Accessibility: every move is possible without dragging (click-to-move, keyboard). Contrast ≥ 4.5:1. Visible focus. 44px minimum touch targets outside the board.
- GPL: Stockfish is shipped as separate files under `public/engine/` with `Copying.txt` and a source link on an `/about/licenses` page.
- Client components stay leaf-level. Pages are server components.
- No emoji as UI icons. Classification badges use the spec symbols as text glyphs inside styled badges, or SVG.

## Rulings Baked Into This Plan

- R1: Stockfish's `UCI_Elo` floor is 1320. Bots ≥ 1320 use `UCI_LimitStrength` + `UCI_Elo` + movetime. Bots < 1320 use a MultiPV candidate pick: softmax over candidate evals with a per-rating temperature, plus a per-rating random-blunder probability.
- R2: One piece set in Phase 2: **cburnett** (Colin M. L. Burnett, tri-licensed GPL/BSD/GFDL on Wikimedia Commons, used here under BSD with attribution). The spec's "Neo & Classic" sets are Chess.com assets and cannot be copied. The theme system supports more sets later.
- R3: Sounds are synthesized with the Web Audio API (no audio assets, no licensing). A user setting can mute them.
- R4: The bot game runs entirely client-side. Game Review of a finished bot game is Phase 3. A "Review" button is shown and routes to Phase 3's page once it exists.
- R5: The engine worker runs in the user's browser. The bot never sees the user's eval in Challenge mode.

## Review Focus

1. **Premove race:** the user queues premoves, the bot replies, and the first premove is now illegal. Expected: the whole queue clears, no exception, and the board shows the real position. Tested in Task 6.
2. **Promotion through every path:** drag, click, keyboard and premove of a pawn to the last rank. Each path must ask for (or default to) the promotion piece and produce the right SAN. Tested in Tasks 6 and 10.
3. **Engine worker failure** (WASM fails to load, worker crashes, no response): the bot game must surface a clear error and allow retry, never hang forever on "thinking". Tested in Tasks 2 and 10.
4. **Takeback during the bot's think** (Friendly mode): the in-flight engine search is stopped and its late `bestmove` is ignored. Tested in Task 10.
5. **Flipped board + arrows/keyboard:** coordinates, arrows and keyboard focus must map to the right squares when Black is at the bottom. Tested in Tasks 5 and 7.

## File Map

```
packages/chess-core/   (Task 1 carryovers) package.json sideEffects + ./book entry, src/book.ts,
                       pipeline/explorer AbortSignal, parsePgn, engine-empty error, coach wording
packages/engine/       src/uci.ts (parse info/bestmove), src/UciEngine.ts (queue, analyse, bestMove, stop),
                       src/transports/{worker.ts,node.ts}, src/index.ts, test/*
packages/bots/         src/profiles.ts, src/strength.ts (chooseMove), src/personality.ts,
                       src/dialogue.ts, src/rng.ts, src/index.ts, test/*
apps/web/              Next.js app: app/{layout,page,play/bots/page,play/bots/[botId]/page,about/licenses/page}.tsx,
                       app/globals.css (design tokens), components/board/*, components/game/*,
                       lib/board/{reducer.ts,premoves.ts,arrows.ts,keyboard.ts}, lib/sound/SoundEngine.ts,
                       lib/engine/browserEngine.ts, lib/game/botGameStore.ts, public/engine/*, public/pieces/cburnett/*,
                       test/* (vitest), e2e/* (playwright)
design-system/chess-platform/MASTER.md
```

## Interfaces

```ts
// @chess/engine
interface UciTransport { send(cmd: string): void; onLine(cb: (line: string) => void): void; terminate(): void }
class UciEngine implements EngineAdapter {
  constructor(transport: UciTransport, opts?: { readyTimeoutMs?: number });
  init(): Promise<void>;                                      // uci/uciok, isready/readyok
  analyse(fen, { depth, multiPv, signal? }): Promise<EngineLine[]>;   // side-to-move POV (EngineAdapter contract)
  bestMove(fen, { movetime?, depth?, elo?, multiPv?, signal? }): Promise<{ bestmove: string; lines: EngineLine[] }>;
  stop(): void; quit(): void;
}
class EngineError extends Error { kind: 'timeout' | 'crashed' | 'aborted' | 'protocol' }
parseInfoLine(line): { multipv, depth, score: Score, pv: string[] } | null

// @chess/bots
interface BotProfile { id; name; rating: number; displayRating: string; tier; avatar: string;
  style: { earlyQueen?: number; aggression?: number }; dialogue: DialogueSet; bio: Copy }
BOTS: BotProfile[]  (12)
botSearchParams(profile): { multiPv: number; depth?: number; movetime: number; elo?: number }
chooseBotMove(profile, ctx: { fen, ply, lines: EngineLine[], legalUci: string[] }, rng): string
botLine(profile, event: BotEvent, lang, rng): string | null
type BotEvent = 'game-start' | 'user-opening' | 'captured-queen' | 'lost-queen' | 'in-check' | 'winning' | 'losing' | 'win' | 'loss' | 'draw'
createRng(seed: number): () => number

// apps/web lib/board
type BoardState = { fen; orientation; selected: Square | null; legalTargets: Square[]; premoves: Premove[];
  arrows: Arrow[]; highlights: Square[]; lastMove: [Square, Square] | null; pendingPromotion: ... | null }
boardReducer(state, action): BoardState     // pure
```

---

### Task 1: chess-core carryovers from the Phase 1 review

Tests first for each item:

- `parsePgn`: handles `[Event "Arena [Nov]"]`, and stops at the first result token in a multi-game paste.
- `analyzeGame`: rejects with `AbortError` when the signal aborts mid-review, and stops calling the engine. Throws when the engine returns `[]` for a non-terminal position.
- Explorer `query`: honours an `AbortSignal` and a timeout (default 10s → `ExplorerError` status null).
- Coach:
  - says "theory continues X";
  - Hinglish fork targets use "aur";
  - on bad moves, the mover's own pin/skewer is not cited as the reason;
  - O-O with an open f-file is not a discovered attack;
  - development notes respect the fullmove number from a FEN start.
- `package.json` gets `"sideEffects": false` and an `./book` export. `index.ts` keeps `loadEcoBook` re-exported, while `@chess/chess-core/book` is the lazy entry. Test: importing `../src/math-only` path does not load JSON (assert via module graph: `import.meta.glob` is not available, so check that `src/index.ts` has no static JSON import except via `book.ts`).

### Task 2: `packages/engine` UCI client

- `parseInfoLine`: `info depth 18 seldepth 24 multipv 2 score cp -35 nodes … pv e7e5 g1f3` → {multipv 2, depth 18, score {cp:-35}, pv}. `score mate -3`. Lowerbound/upperbound lines are ignored. Lines without a pv are ignored. `bestmove e2e4 ponder e7e5` is parsed.
- `UciEngine` with a scripted fake transport:
  - init handshake;
  - `analyse` returns the last line per multipv at the final depth, sorted by multipv;
  - concurrent calls are queued (the second waits);
  - abort sends `stop` and rejects `aborted`, and late lines from the aborted search are not delivered to the next request;
  - no `readyok` within the timeout → `EngineError('timeout')`;
  - a transport error → `crashed`, and the engine rejects pending calls.
- `bestMove` with `elo` sets `UCI_LimitStrength`/`UCI_Elo`, and resets them for analysis.
- Node transport + **integration test with real Stockfish lite-single** (tagged slow, part of the suite):
  - the start position returns 3 lines at depth 10;
  - mate in 1 is found as `{mate: 1}`;
  - `analyzeGame` on Scholar's mate with the real engine → Nf6 is a Blunder and Qxf7# is Best/Great.

### Task 3: Design system + web app scaffold

- Persist the UI-UX Pro Max design system to `design-system/chess-platform/MASTER.md`, with this project's tokens:
  - Swiss/minimal on slate `#0F172A`, surface `#1E293B`, raised `#273449`.
  - Brand green `#81B64C` with on-brand `#0F172A`; gold accent `#D97706`.
  - Text `#F1F5F9` / muted `#94A3B8`.
  - Inter with tabular numbers for clocks and evals.
  - Spacing on a 4px base. Motion tokens: fast 150ms (pieces), base 200ms (UI), slow 300ms (dialogs), all with reduced-motion.
- `apps/web`: Next.js + Tailwind 4 (`@theme` tokens from CSS variables), root layout, header nav, home page with "Play vs Bots", the licenses page, and the Vitest + RTL setup.
- `public/engine/` is copied from `node_modules/stockfish/bin` (lite-single js+wasm + Copying.txt) by a `predev`/`prebuild` script. `public/pieces/cburnett/` gets 12 SVGs fetched by a script, with attribution.
- Tests: the home page renders the Play CTA; the licenses page lists Stockfish GPL-3.0 and cburnett BSD; the token contrast check (brand-on-dark ≥ 4.5:1, text-on-surface ≥ 4.5:1) is computed in a test.

### Task 4: `packages/bots`

- `createRng(seed)` is deterministic.
- `BOTS`: 12 profiles in 4 tiers with the spec ratings. Ids are unique. Mystery displays `???` and plays at 3000.
- `botSearchParams`:
  - Elo ≥ 1320 → `{ elo, movetime, multiPv: 1 }`;
  - below that → `{ multiPv: 5..8, depth: 4..10 }`.
- `chooseBotMove`:
  - the 3200 bot always picks lines[0];
  - the 250 bot picks a non-best move in > 40% of 1,000 seeded trials and sometimes a random legal move;
  - the early-queen bot picks a queen move in the first 10 plies whenever one is within its tolerance;
  - it always returns a legal UCI, even with empty lines (falls back to a random legal move).
- `botLine`: every bot has at least 1 line per event in EN and Hinglish. Lines are deterministic with the seed. `null` is allowed only with probability (chattiness).

### Task 5: Board rendering (static)

- The `<Board>` client component draws an 8×8 grid from the FEN in the given orientation, with coordinates on the edge squares, pieces from `/pieces/cburnett`, a theme from props, last-move/check highlights, and a classification badge slot on a square.
- Tests (RTL):
  - correct piece on e1/e8 in both orientations;
  - the a1 square is dark;
  - check highlights the king square;
  - every square has an accessible name ("e4, white pawn");
  - the theme sets CSS variables.

### Task 6: Board interaction reducer (pure)

`boardReducer` tests:

- Select a piece → legal targets. Click a target → `move` intent. Click another own piece → reselect. Click empty/illegal → deselect.
- A pawn reaching the last rank → `pendingPromotion`. Choosing a piece → move with that promotion. Cancel → no move.
- Premoves during the opponent's turn: queue multiple (validated against pseudo-legal geometry, since the opponent moves first). Right click clears them.
  - `opponentMoved` → if premoves[0] is legal in the new position, emit it immediately; otherwise clear all (Review Focus 1).
  - A premove promotion defaults to a queen.
- Arrows: right-drag from→to with modifiers → color. Same arrow again → removed. Right-click on a single square → highlight toggle. Left click clears arrows/highlights.
- Flipped orientation does not change the square logic (Review Focus 5).

### Task 7: Board interaction components

- Pointer drag with snapping to the hovered square and a 150ms cubic-bezier slide (CSS transform). Click-to-move. Keyboard: arrow keys move focus over squares (respecting orientation), Enter/Space select/move, Escape cancels.
- SVG arrow layer (orange/red/blue/green, with arrowheads), knight arrows drawn as an L, square highlights. Premove squares in translucent red. Promotion picker dialog (focus trapped, Escape cancels).
- Tests (RTL + user-event):
  - click-click move dispatches;
  - keyboard e2→e4 with a flipped board;
  - the promotion picker returns the chosen piece;
  - `prefers-reduced-motion` removes the transition.

### Task 8: Game chrome

- `<EvalBar>`: vertical bar, animated fill from White win%, readout `+1.3` / `M3` at the winning side's end, flips with orientation, hidden in Challenge mode.
- `<CapturedPieces>` + material diff `+3`.
- `<OpeningBanner>` (ECO + name from `OpeningLookupService` per position).
- `<MoveList>` with SAN pairs, the current-move highlight and badge glyphs.
- `SoundEngine` (Web Audio, 9 events, mute setting, plays nothing before the first user gesture).
- Tests:
  - the eval bar fill height equals win% (cp 0 → 50%, mate → 100%);
  - the readout is formatted;
  - captured pieces for a sample FEN with diff +3;
  - the opening banner shows "B90 Sicilian Defense: Najdorf Variation" for the Najdorf FEN;
  - the move list renders pairs and an active ply;
  - SoundEngine maps a chess.js move to the right event (capture vs castle vs promote vs check precedence) — the mapping is pure and tested.

### Task 9: Browser engine adapter

- `lib/engine/browserEngine.ts`: a singleton Worker transport for `/engine/stockfish-19-lite-single.js`, lazy init, and a status store (`loading | ready | error`) with retry.
- Tests: a worker-construction failure surfaces an `error` status with a retry action (using a fake Worker global).

### Task 10: Play vs Bots

- `/play/bots`: the bot picker (tiers, avatars as initials/SVG, rating, bio, mode toggle Challenge/Friendly, colour choice).
- `/play/bots/[botId]`: the game screen. Board + eval bar (Friendly) + move list + opening banner + bot speech bubble + controls (resign, takeback (Friendly), hint (Friendly: highlights the piece to move), flip, new game).
- `botGameStore` (Zustand), tests with a fake engine:
  - the user moves → the bot replies via `chooseBotMove`;
  - a takeback during the bot's think aborts the search and ignores the late reply (Review Focus 4);
  - an engine error → error banner + retry (Review Focus 3);
  - game end detection (mate, stalemate, insufficient, threefold, 50-move, resign) → result + dialogue + sound;
  - a promotion via the store → correct SAN;
  - premoves execute on the bot's reply;
  - the hint uses the engine's best move's from-square;
  - Challenge mode rejects takeback/hint.

### Task 11: End-to-end smoke (Playwright, Chromium)

- Start the Next dev server and open `/play/bots`. Pick the 250 bot, Friendly mode, as White.
- Play 1.e4 by click-click. Wait for the bot's reply (real WASM engine). Play a move by drag. Play a move by keyboard.
- Draw an arrow with right-drag. Queue a premove. Take back.
- Assert:
  - the move list grows;
  - the eval bar is visible;
  - no console errors;
  - the opening banner shows the opening name.
