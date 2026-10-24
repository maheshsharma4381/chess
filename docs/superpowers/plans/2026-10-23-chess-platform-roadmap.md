# Chess Platform — Master Roadmap (Phase-wise)

> **For agentic workers:** This is the MASTER roadmap. It is intentionally not code-level.
> Before starting any phase, write that phase's own bite-sized TDD plan at
> `docs/superpowers/plans/YYYY-MM-DD-phase-N-<name>.md` (superpowers:writing-plans), then execute it
> with superpowers:subagent-driven-development or superpowers:executing-plans.
> Every phase must end in working, testable software. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build a production-grade, Chess.com-class online chess platform (web + mobile + real-time backend)
with Game Review / accuracy / AI coach, opening book + explorer, bots, puzzles, tournaments and fair-play.

**Architecture:** Turborepo + pnpm monorepo. All chess logic and math lives in one pure-TypeScript
package (`packages/chess-core`) shared by server, web and mobile. Server is authoritative for live games
(Socket.io + Redis for clocks/matchmaking/pub-sub, PostgreSQL via Prisma for persistence). Heavy engine
analysis runs in a server-side worker queue (native Stockfish) with client-side WASM as the
interactive/offline path.

**Tech Stack:** TypeScript 5, Turborepo, pnpm, Vitest, chess.js (+ custom Chess960 layer), Stockfish 17.x
(WASM in browser, native binary on server), Node 22 + Express + Socket.io + @socket.io/redis-adapter,
Redis, PostgreSQL + Prisma, BullMQ, Next.js (App Router) + Tailwind + Zustand + Framer Motion,
Expo (Router) + NativeWind + Reanimated + Gesture Handler + expo-haptics + expo-av.

**Spec:** the two pasted prompt files (`gemini-code-1792767906998.md` = workflow mandate,
`gemini-code-1792768026104.md` = product spec). Copy both into `docs/spec/` in Phase 0 so they travel with the plan.

## Global Constraints

- Monorepo layout: `scripts/`, `packages/types`, `packages/chess-core`, `apps/server`, `apps/web`, `apps/mobile`.
- No placeholder code (`// TODO`, `// add logic here`) in merged work.
- Win% = `50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)`; mate → 100 / 0.
- MoveAccuracy% = `clamp(103.1668 * exp(-0.04354 * winDiff) - 3.1669, 0, 100)`, `winDiff = max(0, before - after)` from mover's POV.
- Book moves score 100% accuracy. Book detection limited to the first 20 moves.
- Classification thresholds: Excellent ≤2, Good ≤5, Inaccuracy ≤10, Mistake ≤20, Blunder >20 (win% points).
- Badge colors: Brilliant `#1baca6`, Great `#5c8bb0`, Best `#81b64c`, Excellent `#96bc4b`, Good `#96af8b`,
  Book `#a88865`, Inaccuracy `#f7c631`, Mistake `#e58f2a`, Miss `#ff7769`, Blunder `#ca3431`.
- Board default colors `#769656` / `#eeeed2`; piece slide 150ms cubic-bezier.
- Lag compensation grace: up to 150ms per move. Disconnect forfeit: 30s. Abort allowed in first 2 moves.
- Socket move frame: `[moveSAN, fen, whiteMs, blackMs, serverTimestamp]`.
- Explorer "Top Counter" requires ≥100 games sample.
- IP rule: no Chess.com name, logo, piece sets, sounds, bot names/avatars (e.g. "Mittens"), or copied code.
  Use original or permissively licensed assets (see Licensing notes).

## Review Focus

1. **Chess960 castling and edge rules**: chess.js has no Chess960 castling. A reasonable user expects 960 games to castle correctly (king/rook on any file, including king that doesn't move). Owned by Phase 5 (custom rules layer + perft tests on known 960 positions).
2. **Clock correctness under lag/reconnect**: a player whose network jitters must not lose time unfairly or gain extra time. Owned by Phase 5 (deterministic clock tests with fake timers: lag grace cap, flag on server tick, reconnect within 30s).
3. **Mate-score transitions in review math**: eval going from `mate 3` to `+250cp`, or mate for the opponent, must give a sane winDiff and a sane classification. Owned by Phase 1 (golden tests).
4. **Promotion, en passant, threefold/50-move/insufficient material** through every path (board UI, premove queue, socket, review). Owned by Phases 2 and 5.
5. **External API outage/rate limits** (Lichess explorer, ECO download): the UI must degrade without crashing (cached / "explorer unavailable"). Owned by Phases 0, 1 and 4.

---

## Phase 0: Foundation and Monorepo

**Deliverable:** `pnpm install && pnpm typecheck && pnpm lint && pnpm test` passes in a fresh clone (libraries ship as TS source, so there is no build step until apps exist). The ECO book is generated.

- [ ] `git init`, Turborepo + pnpm workspaces, shared `tsconfig`, ESLint, Prettier, Vitest, `.env.example`, GitHub Actions CI (lint, typecheck, test).
- [x] `packages/types` foundation: `MoveClassification` + `CLASSIFICATION_META`, `EcoBook` / `OpeningEntry` / `OpeningFamily`. **Every other shared type lands with the phase that first uses it** (YAGNI, so types are designed against real code):
  - Phase 1: `ReviewReport`, `MoveAnalysis`, `EngineLine`, `ExplorerResponse`, `CounterMove`, `CoachExplanation`, `Glicko2Rating`.
  - Phase 2: `BotProfile`, `BoardTheme`, `SoundEvent`.
  - Phase 5: socket event map (client↔server), `GameState`, `ClockState`, `TimeControl`, move frame `[moveSAN, fen, whiteMs, blackMs, serverTimestamp]`.
  - Phase 6: `Puzzle`, `PuzzleRushRun`. Phase 7: `Tournament`, `LeagueDivision`, `FairPlaySignal`.
- [ ] `scripts/fetch-eco-book.ts`: downloads `a–e.tsv` from lichess-org/chess-openings, parses rows, normalizes EPD (first 4 FEN fields), writes `packages/chess-core/src/data/eco-book.json` with `byEpd` + `byEco` (grouped into White families `1.e4 / 1.d4 / 1.c4 / 1.Nf3 / Flank` and named Black defenses).
- [ ] Offline fallback: `eco-seed.ts` holds the top 150 openings in code. The script uses it if the network fails.
- [ ] Tests: EPD normalization, TSV parse, count sanity (≥3,400 rows. The upstream count changes over time, so don't hard-assert exactly 3,546), fallback path.

## Phase 1: `packages/chess-core` (pure logic, no UI)

**Deliverable:** fully unit-tested library with ≥90% coverage. Every formula has golden-value tests.

- [ ] `OpeningLookupService`: `getOpeningByFen`, `trackGameOpening(fenHistory)` returns deepest book match, `isBookMove`, `deviationPly`.
- [ ] `OpeningExplorerService`: Masters + Lichess DB clients, counter-move stats (totals, W/D/B %, avg rating), "Main Line" and "Top Counter" (≥100 games) badges, top games. Fetch is injectable for tests and caching.
- [ ] `rating/glicko2.ts`: Glicko-2 (tested against the Glickman paper's worked example).
- [ ] `game-review/math.ts`: Win%, MoveAccuracy%, game accuracy (volatility-weighted + harmonic mean, Lichess-style), per-phase accuracy (opening/middlegame/endgame by material + ply heuristic), estimated performance rating `base + (acc - expected(base)) * 18` with a calibrated `expected()` table.
- [ ] `game-review/classify.ts`: the 10 classifications with an explicit precedence order: Book → Brilliant → Great → Best → Miss → Blunder → Mistake → Inaccuracy → Good → Excellent bands. Material-sacrifice detector for Brilliant.
- [ ] `game-review/pipeline.ts`: engine-agnostic orchestrator (`EngineAdapter` interface: `analyse(fen, {depth, multiPv}) → lines[]`), so WASM, native and mock engines all plug in.
- [ ] `coach/tacticalMotifDetector.ts`: hanging piece, fork/double attack, pin/skewer, discovered attack/check, back-rank/mate threat, positional factors (center, king safety, pawn structure, development).
- [ ] `coach/explain.ts`: template-based explanation generator in English and Hinglish (deterministic, testable). Optional LLM rewrite hook (see Suggestions).
- [ ] `variants/chess960.ts`: start-position generator (all 960 by index) + castling rules wrapper over chess.js.
- [ ] Carried from the Phase 0 review (deferred minors that Phase 1 code touches):
  - `normalizeEpd`: use `chess.fen()` fields 0–3 directly, since chess.js 1.4 already emits ep only when a legal capture exists. This drops the per-call `moves({verbose})` cost. Keep the pinned-pawn test as the guard.
  - Import `eco-book.json` through a hand-written declaration (`allowArbitraryExtensions` + `eco-book.d.json.ts`) so tsc doesn't infer a 3,865-key literal type.
  - Split `tsconfig.base.json` into a lib base without `types: ["node"]` (chess-core/types run in browser and RN) and a node base for scripts/server/tests.
  - Give `OpeningFamily` an `epds` list (or move `familyOf` into chess-core) so the encyclopedia can list a family's lines. Derive `firstMove` from the family's most common first move, not the shortest line (Pterodactyl and Borg are mis-tagged 1.d4).

## Phase 2: Web Board and Offline Play (first visible product)

**Deliverable:** play vs. bots in the browser with a full-featured board, no backend needed.

- [ ] UI design system (ui-ux-pro-max): slate-900 dark theme tokens, green accents, type scale, spacing, motion tokens (150ms cubic-bezier).
- [ ] `<Chessboard>`: drag/click moves, snapping, animations, promotion picker, legal-move dots, last-move highlight, coordinates, flip.
- [ ] Arrows and square highlights (right-drag; Shift=red, Alt=blue, Ctrl=green, default orange). Multi-premove queue (translucent red, executes on turn switch, right-click clears).
- [ ] Board themes (Green, Wood, Icy Sea, Glass) and 2 piece sets (permissive license). Sound engine (all 9 events, original/CC0 sounds).
- [ ] Stockfish WASM web worker + `EngineAdapter` implementation. Vertical eval bar (animated).
- [ ] Captured pieces tray + material diff. Live opening banner. Move list with badges.
- [ ] Bots: 12 personalities across 4 tiers (original names), strength via Skill Level + UCI_Elo + move-time + personality biases (e.g. early-queen bot). Challenge vs. Friendly modes. Dialogue system with event triggers.
- [ ] Playwright smoke tests: play a full game vs. bot, premove, promotion, arrows.
- [ ] Carried from the Phase 1 review (deferred minors that the web app touches first):
  - chess-core: add `"sideEffects": false` and a separate `@chess/chess-core/book` entry so pages that only need math/Glicko don't bundle the 1.7MB book. Lazy-load the book.
  - `analyzeGame` / explorer `query`: accept an `AbortSignal` (user leaves the review page), and add an explorer timeout.
  - `parsePgn`: strip headers line-wise (`]` inside values) and stop at the first result token (multi-game PGN paste).
  - The engine adapter returning `[]` for a live position should throw, not become 0.00.
  - Coach wording: "theory continues X" instead of "main line"; Hinglish `aur` in fork targets; skip the mover's own pin/skewer on bad moves; exclude castling rook rays from "discovered"; base opening-ply limits on the fullmove number for FEN starts.
  - Plan text: Phase 1 Task 7 "≈18.9" should read 28.5. R9 has a cliff (+200 cp Blunder vs +250 cp Mistake), so revisit it with real games.

## Phase 3: Game Review, Analysis Studio and Explorer UI (web)

**Deliverable:** finish any game and get a full Chess.com-style review.

- [ ] Review screen: accuracy (overall + per phase), estimated rating, classification counts table, badge on destination square.
- [ ] Coach bubble: badge + eval delta, EN/Hinglish toggle, `[Show Moves]` (animates PV), `[Retry Move]` (rewind 1 ply, hints).
- [ ] Interactive eval graph (click to jump).
- [ ] Analysis Studio: FEN/PGN paste, board editor, MultiPV up to 3 live lines, flip.
- [ ] Opening Explorer panel (Masters / Lichess DB, rating + speed filters, tri-color bars, badges) + searchable ECO encyclopedia with "practice this defense".
- [ ] Export: PGN copy, FEN copy, client-side animated GIF.
- [ ] Carried from the Phase 2 review (deferred minors):
  - **Bot game store:**
    - Add `dispose()` (cancel the search on unmount and New game; avoids StrictMode's double search).
    - Make the Friendly-mode eval analysis abortable.
    - Allow takeback after the game ends in Friendly mode.
    - Reset orientation when the colour changes.
    - Add store tests for insufficient material, threefold repetition and the 50-move rule.
  - **Engine store:** a `retry()` while a start is in flight spawns a second worker.
  - **Board:**
    - New game should clear arrows (key the board by game).
    - Show a drag ghost for pieces that exist only on the premove board.
    - Promotion dialog: return focus to the board when it closes, and add a touch Cancel button.
  - **Contrast:**
    - Board coordinates (2.2–2.8:1).
    - Opening ECO text (`#a88865`, 4.44:1).
    - Master-tier avatar initials (3.7:1).
  - **Accessibility:** CapturedPieces' `aria-label` sits on a span (use role="img"); move-list buttons are 32px and inert in bot games.
  - **Persistence:** save the mute setting across games.

## Phase 4: Backend Core (accounts and persistence)

**Deliverable:** users can sign up, games are saved, reviews are cached server-side.

- [ ] `apps/server`: Express + Socket.io bootstrap, config, structured logging, health checks.
- [ ] Auth (email + Google OAuth), sessions/JWT shared by web and mobile. Profiles, settings, avatars.
- [ ] Prisma schema: User, Rating (per time-control pool), Game, Move, ReviewReport, Puzzle, PuzzleAttempt, Tournament, TournamentEntry, LeagueWeek, FairPlaySignal, Friendship, Bot.
- [ ] Game archive + profile stats + rating history.
- [ ] Analysis queue: BullMQ + native Stockfish workers produce ReviewReport, cached by PGN hash.
- [ ] `GET /api/opening-explorer` Redis-cached proxy (TTL, rate-limit, stale-while-revalidate).

## Phase 5: Live Multiplayer

**Deliverable:** two people on different devices can play rated live games reliably.

- [ ] Redis matchmaking with an expanding rating window, per time control (Bullet/Blitz/Rapid presets).
- [ ] Server-authoritative game rooms: move validation, millisecond clocks, RTT lag compensation (≤150ms), flagging on server.
- [ ] Draw offer, resign, abort (first 2 moves), rematch, 30s disconnect auto-forfeit, reconnect + state resync.
- [ ] Glicko-2 updates on game end. Horizontal scaling via the Socket.io Redis adapter + room ownership.
- [ ] Chess960 live games.
- [ ] Daily (correspondence): 1/3/7 days per move, conditional premoves, timeout job.
- [ ] Load test (k6/Artillery): 1,000 concurrent games, p95 move latency target.

## Phase 6: Puzzles

**Deliverable:** rated puzzles, Puzzle Rush (3 min / 5 min / Survival), Puzzle Battle.

- [ ] Import the Lichess puzzle database (CC0) into Postgres with theme tags and ratings.
- [ ] Rated puzzles: Glicko-2 puzzle rating, hint, retry, theme filter.
- [ ] Puzzle Rush: start at 400, step up every 3 solves, 3 strikes, personal best + leaderboards.
- [ ] Puzzle Battle: live 1v1 socket race on the same puzzle sequence for 3 minutes.

## Phase 7: Tournaments, League, Fair Play

**Deliverable:** competitive and retention layer.

- [ ] Arena tournaments: continuous pairing, 2 pts per win, 4 pts on a streak, Berserk (half clock, +1), live standings.
- [ ] Weekly Players League: Wood → Stone → Bronze → Silver → Crystal → Elite → Champion → Legend, trophies from games + puzzles, promotion/relegation cron.
- [ ] Fair play: client telemetry (visibilitychange, input telemetry), move-time variance, engine T1% correlation (>94% in complex positions). Produces **flags for human review only**, never auto-bans. Admin review queue.

## Phase 8: Mobile App (Expo)

**Deliverable:** iOS/Android app with parity on core flows.

- [ ] Expo Router navigation, auth, shared `chess-core` + `types`.
- [ ] 60fps gesture board (Reanimated + Gesture Handler), haptics, sounds.
- [ ] Offline bot play (engine via a native Stockfish module, or a WebView WASM fallback).
- [ ] Live play, Game Review (server reports), Opening Explorer, Puzzles / Puzzle Rush.
- [ ] Push notifications (daily-chess turns, challenges). EAS builds.

## Phase 9: Hardening and Launch

- [ ] Security review (auth, socket abuse, rate limits), chat moderation if chat ships.
- [ ] Observability (Sentry, metrics), backups, privacy policy (telemetry disclosure).
- [ ] Deploy: web on Vercel. Server and workers on a long-lived host (Fly/Railway/VPS), since sockets can't run on serverless. Managed Postgres + Redis.

---

## Licensing Notes

- Stockfish is GPL-3: ship it as a separate worker/binary and publish its source/notice.
- chessground and chessops (Lichess) are GPL-3: avoid them in proprietary code. Use our own board and chess.js (BSD-2).
- Lichess chess-openings data is CC0. The Lichess puzzle DB is CC0. The explorer API is subject to Lichess ToS/rate limits.
- Chess.com assets and bot characters are their IP. Reverse-engineering their bundles may breach their ToS. Use REA only for interaction-pattern study on open sources, never to copy code/assets.
