# Phase 3: Game Review, Analysis Studio, Opening Explorer UI and Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After any game (or a pasted PGN) the user gets a Chess.com-style Game Review: accuracy, estimated rating, classification counts, a badge on every move, a coach that explains each move in English or Hinglish, an eval graph to jump around, "Show Moves" and "Retry Move". There is also an analysis board with live MultiPV, an opening explorer with counter-moves, an opening encyclopedia, and PGN/FEN/GIF export.

**Architecture:**

- **Review:** runs `analyzeGame` (chess-core) in the browser on the shared Stockfish worker. A `reviewStore` holds progress, cancellation and the report. Review UI components are presentational over the report.
- **Explorer:** the explorer goes through a Next.js route handler `/api/opening-explorer`. It holds `LICHESS_API_TOKEN` server-side (loaded from the repo-root `.env` via `@next/env`) and an in-memory TTL cache. Phase 4's server takes it over later.
- **Analysis Studio** reuses `InteractiveBoard` with `movable: 'both'` and a live-analysis hook.
- **GIF export** draws frames on a canvas and encodes them with `gifenc`.

**Tech Stack:** Phase 2 stack + `gifenc` 1.0.3 (MIT) + `@next/env` 16.4.3.

**Spec:** `docs/spec/product-spec.md` PART 4 (Game Review, coach UI, eval graph), PART 5.5 (explorer UI, encyclopedia, analysis studio, export). Roadmap Phase 3, including "Carried from the Phase 2 review". Design: `design-system/chess-platform/MASTER.md`. The **dataviz** skill applies to the eval graph.

## Global Constraints

- Coach bubble: badge + eval change (`+2.4 → -1.8`), an EN/Hinglish toggle, `[Show Moves]` (animates the PV on the board with a preview banner), and `[Retry Move]` for Mistake/Blunder/Miss (rewinds 1 ply and lets the user find the best move, with a hint).
- The eval graph is an area chart of White win%; clicking a point jumps the board to that ply.
- Explorer: Masters vs Lichess DB. Rating brackets 1000–2500+ and speeds Bullet/Blitz/Rapid (Lichess DB only). Counter-move table with SAN, games, "Main Line" / "Top Counter" badges and a tri-color W/D/B bar.
- Encyclopedia: search all named openings, browse by White first move (1.e4, 1.d4, 1.c4, 1.Nf3, Flank), and open any line on the board to practice.
- Analysis studio: paste FEN/PGN, MultiPV 1–3 live lines, edit position, flip.
- Export: PGN copy, FEN copy, animated GIF download (client-side).
- The token never reaches the browser. The explorer route rejects non-GET requests and malformed FENs.

## Rulings Baked Into This Plan

- R1: In-browser review defaults to **depth 14, MultiPV 3**; "Deeper review" uses depth 18. Lite single-thread WASM at depth 18 takes minutes per game. Server-side deep review is Phase 4.
- R2: A finished bot game reaches review through `/review?pgn=<urlencoded PGN>` (shareable, no storage). `/review` without a PGN shows a paste box.
- R3: The explorer proxy is a Next route handler with a 10-minute in-memory cache per (source, fen, filters). Redis replaces it in Phase 4.
- R4: Retry Move counts as solved if the user's move is the engine's best, or classifies as Excellent or better against the stored lines.
- R5: Board editor (Phase 3 scope): click a palette piece then a square, an eraser, side to move, castling checkboxes, clear/start buttons. Invalid positions (missing king, pawns on back ranks) are reported, not loaded.

## Review Focus

1. **Navigating away mid-review:** the engine search must stop (AbortSignal), and the next page's engine work must not queue behind a stale review.
2. **Show Moves / Retry Move then navigation:** leaving a PV preview or a retry via the move list, the arrow keys or the graph must restore the real position at the chosen ply.
3. **Pasted PGN edge cases:** an empty paste, an illegal move, a FEN-start game, a game with zero moves. A clear message, no crash.
4. **Explorer proxy failures:** no token (500 with a clear message), Lichess 429/401, a timeout. The UI shows "Explorer unavailable" with retry, and the board keeps working.
5. **Black at the bottom in review:** the badge, arrows, graph direction and eval bar all match the orientation.

## Tasks

### Task 1: Phase 2 carryovers

Tests first:

- **Bot store:** `dispose()` aborts the in-flight search and makes later replies no-ops. The Friendly-mode eval analysis is abortable and stops on takeback. Takeback works after the game ends (Friendly) and reopens play. Insufficient material, threefold repetition and the 50-move rule each end the game with the right reason.
- **BotGame:** the effect cleanup calls `dispose`. New game remounts the board (arrows cleared). Orientation follows the `color` prop. Mute persists in localStorage, wrapped in try/catch.
- **Engine store:** `retry()` during an in-flight start reuses it (one worker).
- **Board:** the drag ghost uses the premove (virtual) board. The promotion dialog has a Cancel button and returns focus to the board.
- **Contrast:**
  - Coordinates get a text shadow or a darker shade and must reach ≥ 3:1 (large-ish UI text) against both square colors on all themes; a test computes this.
  - The ECO text color must reach ≥ 4.5:1.
  - Avatar initials pick the ink by contrast.
- **CapturedPieces:** `role="img"`.

### Task 2: Review store and the /review route

- **`lib/review/reviewStore.ts`:**
  - `createReviewStore({ getEngine, book })` exposes `run(pgn, {depth})`, `cancel()`, and `status: idle | running | done | error`.
  - Progress is `(done, total)`. It holds `report`, `error` and `ply` (the current navigation ply).
- **Tests (fake engine):**
  - progress reaches total;
  - `cancel()` aborts, and the status returns to idle;
  - an illegal PGN gives an error with the SAN;
  - a zero-move game gives a report with 0 moves;
  - `setPly` clamps to 0..n;
  - starting a second run cancels the first.
- **Pages:**
  - `app/review/page.tsx` is a server page reading `searchParams.pgn` and rendering `<GameReview pgn>`.
  - Without a PGN it renders `<PgnPaste>`, a client form that pushes `/review?pgn=`.
  - BotGame's "Review" button routes there.

### Task 3: Review summary and move navigation

- **`<ReviewSummary>`:** both players' accuracy (e.g. 88.4), the estimated rating (or "—" when null), and a classification counts table with badges (10 rows × 2 colors).
- **`<ReviewBoard>`:** the board at `ply` with a badge on the destination square, the last-move highlight, and arrows for the best move when the played move wasn't best.
- **Navigation:** ← → Home End keys, and buttons with labels.
- **Tests:**
  - accuracy rendering;
  - the counts table;
  - the badge on the right square at ply k for both orientations;
  - the keys move the ply;
  - a best-move arrow appears only for non-best moves.

### Task 4: Eval graph (dataviz skill)

- **`<EvalGraph>`:** an SVG area chart of `winGraph` (White win%, 50% midline), points colored by classification for Mistake/Blunder/Miss/Brilliant/Great, and a current-ply marker.
- **Interaction:** click or tap jumps to a ply; the keyboard moves focus between points with arrow keys + Enter. `role="img"` plus an accessible summary, and a data table fallback (visually hidden).
- **Tests:**
  - x positions map plies evenly;
  - y = 100 − win%;
  - a click at x selects the nearest ply;
  - the marker follows `ply`;
  - it flips vertically when Black is at the bottom (Review Focus 5).

### Task 5: Coach bubble with Show Moves and Retry Move

- **`<CoachPanel>`:** `explainMove` for the current ply; headline, evalChange and text; an EN/Hinglish toggle (persisted).
- **`[Show Moves]`:** plays the stored PV (SAN from MoveReview.pv) on the board one move every 600ms, with a "Showing engine line" banner and a Stop button. Any navigation stops it and restores the ply (Review Focus 2).
- **`[Retry Move]`** (Mistake/Blunder/Miss only): the board goes to `fenBefore`, movable for the mover. A correct move (R4) shows "Correct!"; a wrong one shows "Not quite" plus a Hint (highlights the best piece) and Try again. Exit returns to the ply.
- **Tests:**
  - the text for a blunder;
  - the toggle switches language;
  - Show Moves advances frames with fake timers and stops on navigation;
  - Retry accepts the best move and rejects a bad one, and the hint highlights the from-square;
  - Retry is hidden for good moves.

### Task 6: GameReview page assembly

- `<GameReview pgn>` wires the store, summary, board, coach, graph, move list (badges, click = jump), progress bar, cancel button and a "Deeper review" (depth 18) button.
- The eval bar is beside the board. It uses `useEffect` cleanup to cancel on unmount (Review Focus 1).
- **Tests (fake engine):** renders progress and then the summary; clicking a move updates the coach; unmount aborts the engine.

### Task 7: Explorer proxy route

- **`app/api/opening-explorer/route.ts`:** GET with `source`, `fen`, `ratings`, `speeds`. It validates the FEN (chess.js) and the enums, calls Lichess with the bearer token from `process.env.LICHESS_API_TOKEN`, caches for 10 minutes (an LRU of 500 entries), and passes the status through (401/429 mapped to a JSON error). Missing token → 500 `{error: 'Explorer not configured'}`.
- **`next.config.ts`:** `loadEnvConfig(repoRoot)`.
- **Tests** (the route function with a mocked global fetch):
  - the cache hits the second time;
  - a bad FEN → 400;
  - no token → 500;
  - Lichess 429 → 429 with an error body;
  - the token is never echoed in the response.

### Task 8: Explorer panel UI

- **`<ExplorerPanel fen onPlayMove>`:**
  - Masters/Lichess tabs; rating chips (1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500) and speed chips (Bullet, Blitz, Rapid), Lichess only.
  - The table: SAN, games (compact numbers), badges, a tri-color bar with % labels, and the average rating.
  - Top games.
  - Loading skeleton, "Explorer unavailable" + Retry (Review Focus 4), and requests cancelled on FEN change.
- **Tests** (mocked fetch):
  - rows render with the bar widths matching the percentages;
  - the badges show;
  - clicking a row calls onPlayMove(uci);
  - the filters change the query;
  - the error state + retry;
  - an aborted stale request doesn't overwrite newer data.

### Task 9: Analysis Studio and board editor

- **`/analysis`:** the board (`movable: 'both'`), the move list with variations (main line only; Phase 3 scope), FEN/PGN import with an error display, a live engine panel (MultiPV 1–3 toggle, depth readout, lines in SAN with the eval, click a line to play its first move), flip, the explorer panel and an "Edit position" mode (R5). It deep-links via `?fen=`.
- **`useLiveAnalysis(fen, multiPv)`:** restarts the search on FEN change and aborts the old one.
- **Tests:**
  - importing a PGN shows its moves;
  - a bad FEN shows an error;
  - the MultiPV toggle requests N lines;
  - a line click plays its move;
  - the editor places and removes pieces and rejects a king-less position;
  - `?fen=` loads.

### Task 10: Opening encyclopedia

- **`/openings`:** search (by name or ECO, debounced, over the lazily loaded book) and tabs for the White first-move groups. Each family lists its named lines with ECO + PGN. "Practice" opens `/analysis?fen=…&explorer=1` at the line's final position.
- **Tests:**
  - "najdorf" finds B90;
  - "B20" finds the Sicilian;
  - the 1.c4 tab lists the English Opening;
  - the Practice link carries the right FEN.

### Task 11: Export (PGN, FEN, GIF)

- **`<ExportMenu pgn fen>`:**
  - copy PGN and copy FEN via the clipboard API, with a confirmation toast;
  - "Download GIF" renders every position (`renderBoardFrame(ctx, fen, theme, size)` draws squares, coordinates, pieces from preloaded images and the last move) and encodes them with gifenc at 1 frame/600ms, with a longer final frame.
- **Tests:**
  - the PGN text includes headers and the result;
  - `renderBoardFrame` paints the right square colors (canvas mock / pixel check via a small canvas polyfill or a mock ctx call log);
  - the GIF encoder is called with N frames;
  - the clipboard is called.

### Task 12: E2E

- Play a short bot game (Pip), resign, and click Review. Wait for the review to complete (depth 10 via a `?depth=` test param).
- Click a blunder in the graph, see the coach text, press Show Moves, then Retry Move with the best move.
- Open /analysis with a pasted PGN, and check that the explorer table loads (the real proxy, with the user's token from `.env`).
- Open /openings, search najdorf, and Practice.
