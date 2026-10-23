# ROLE & OBJECTIVE
Act as a Principal Full-Stack Gaming Architect and Chess Engine Specialist. Your mission is to build a full-featured, production-grade replica of **Chess.com** across **Web (Next.js)**, **Mobile (React Native Expo)**, and **Real-Time Backend (Node.js + Socket.io + Redis + PostgreSQL)** inside a Turborepo Monorepo, leveraging **REA (Reverse Engineer Anything)** MCP tools, **Stockfish 16.1 WASM**, and the complete **3,546+ ECO Opening & Counter-Opening Database**.

Do NOT write placeholder comments like `// TODO: implement game review` or `// add logic here`. Every module, mathematical formula, data-fetching script, socket handler, and UI component listed below must be fully implemented.

---

## PART 1: REA (REVERSE ENGINEER ANYTHING) WORKFLOW INSTRUCTIONS
Whenever REA MCP tools are available in the environment, use them systematically before building each frontend and protocol subsystem:
1. **UI & Board State Inspection:** Use REA bundle/DOM inspection utilities to verify drag-and-drop coordinate snapping, SVG arrow rendering layers, pre-move queue highlights, and animation easing curves (150ms cubic-bezier piece slide).
2. **Protocol & Timing Inspection:** Model our WebSocket payloads after high-concurrency chess protocols (compact JSON/binary frames carrying `[moveSAN, fen, whiteMs, blackMs, serverTimestamp]` for lag compensation).
3. **Clean-Room Implementation:** Translate all inspected interaction patterns into clean, strongly-typed TypeScript inside `packages/chess-core` and our UI apps.

---

## PART 2: MONOREPO ARCHITECTURE
Initialize and build the following Turborepo structure:
- `scripts/fetch-eco-book.ts`: Automated build script that downloads and compiles all 3,546 official chess openings (`A00`–`E99`) into an O(1) lookup dictionary.
- `packages/types`: Shared TypeScript interfaces for WebSockets, Game Review reports, Opening Explorer responses, Puzzles, Bots, and Tournaments.
- `packages/chess-core`: Shared TypeScript engine for `chess.js` move validation, Game Review math, Tactical Motif detector (Pins, Forks, Skewers, Hanging Pieces), Coach Commentary generator, Glicko-2 rating calculator, `OpeningLookupService`, and `OpeningExplorerService`.
- `apps/server`: Node.js, Express, Socket.io, Redis (matchmaking, active game clocks, pub/sub, Opening Explorer API cache), Prisma ORM + PostgreSQL.
- `apps/web`: Next.js (App Router), TypeScript, Tailwind CSS, Zustand, Socket.io-client, Framer Motion, Web Workers (Stockfish WASM).
- `apps/mobile`: React Native (Expo Router), TypeScript, NativeWind, `react-native-reanimated`, `react-native-gesture-handler`, `expo-haptics`, `expo-av` (sound effects).

---

## PART 3: COMPLETE 3,546+ OPENING BOOK & COUNTER-OPENING EXPLORER ENGINE
Build a complete Opening & Counter-Defense intelligence system inside `packages/chess-core`, `apps/server`, `apps/web`, and `apps/mobile`:

### 1. Automated ECO Database Compiler (`scripts/fetch-eco-book.ts`)
- Write a Node/TypeScript script that downloads the 5 official TSV files (`a.tsv`, `b.tsv`, `c.tsv`, `d.tsv`, `e.tsv`) from `https://raw.githubusercontent.com/lichess-org/chess-openings/master/`.
- Parse every row (`eco`, `name`, `pgn`, `uci`, `epd`) across all 3,546 openings.
- Normalize every position's `epd` (the first 4 fields of a FEN string: `[piecePlacement] [activeColor] [castlingRights] [enPassantSquare]`) and compile two structures into `packages/chess-core/src/data/eco-book.json`:
  1. `byEpd`: An O(1) hash-map mapping each normalized `epd` -> `{ eco, name, pgn, uci }`.
  2. `byEco`: An indexed catalog of all `A00`–`E99` openings grouped by White opening family (`1.e4`, `1.d4`, `1.c4`, `1.Nf3`, Flank) and Black Counter-Defenses (Sicilian, French, Caro-Kann, King's Indian, Nimzo-Indian, Slav, Queen's Gambit Declined, Dutch, etc.).
- Include a fallback seed of the top 150 most common openings directly in code so offline builds never fail if network access is unavailable during build time.

### 2. Real-Time Opening Detection (`OpeningLookupService.ts`)
- Implement `OpeningLookupService` inside `packages/chess-core`:
  - `getOpeningByFen(fen: string)`: Strips the halfmove and fullmove counters from `fen` to produce the `epd` and performs an O(1) lookup in `eco-book.json`.
  - `trackGameOpening(fenHistory: string[])`: Scans the game history and returns:
    - The deepest matched book opening `{ eco, name, pgn, lastBookPly }`.
    - Whether the current move is still a **Book Move (`📖`)**.
    - The exact **Book Deviation Move** (the first ply where White or Black left known opening theory) so the AI Coach can explain the best theoretical counter-move.

### 3. Live Counter-Opening Explorer (`OpeningExplorerService.ts`)
- Build `OpeningExplorerService` in `packages/chess-core` (with an optional Redis-cached proxy route in `apps/server` at `GET /api/opening-explorer`) that queries:
  - **Masters Database:** `https://explorer.lichess.ovh/masters?fen={encodedFen}`
  - **Online Players Database:** `https://explorer.lichess.ovh/lichess?fen={encodedFen}&ratings={ratingsCsv}&speeds={speedsCsv}`
- For any board position, return:
  - `opening`: `{ eco: string, name: string }`
  - `counterMoves`: Array of all candidate responses sorted by popularity and win rate, each containing:
    - `uci` & `san` (e.g., `c5`, `e5`, `e6`, `c6`)
    - `totalGames`: Total games played (`white + draws + black`)
    - `whiteWinPct`, `drawPct`, `blackWinPct` (exact percentages for the tri-color bar)
    - `averageRating`: Average ELO of players choosing this counter-move
    - `bestCounterBadge`: Automatically tag the counter-move with the highest win-rate for the active side (minimum 100 games sample) as **"Top Counter"** and the most played move as **"Main Line"**.
  - `topGames`: List of notable master games from that position with players, ratings, result, and year.

---

## PART 4: CHESS.COM "GAME REVIEW", ACCURACY % & AI COACH ENGINE (CRITICAL)
Build a complete post-game analysis engine inside `packages/chess-core/src/game-review` and UI inside `apps/web` & `apps/mobile`:

### 1. Stockfish Multi-PV Analysis Pipeline
- Run Stockfish WASM at depth 16–18 with `MultiPV = 3` for every ply (half-move) in the game PGN.
- Extract for each position before and after the played move:
  - `bestMove` (UCI & SAN), `secondBestMove`, `evalCp` (centipawns), `mateIn`, and the `principalVariation` (PV line of 5–6 moves).

### 2. Exact Mathematical Formulas (Must Implement Verbatim)
- **Centipawn to Win Probability % (0 to 100):**
  $$Win\% = 50 + 50 \times \left(\frac{2}{1 + e^{-0.00368208 \times cp}} - 1\right)$$
  *(If `mateIn` is present, set Win% to 100 for positive mate and 0 for negative mate).*

- **Move Accuracy % (Per Move):**
  Calculate `winDiff = max(0, Win%_before - Win%_after)` from the moving player's perspective:
  $$MoveAccuracy\% = \text{clamp}\left(103.1668 \times e^{-0.04354 \times winDiff} - 3.1669,\ 0,\ 100\right)$$

- **Overall Game Accuracy % (CAPS Score - "Kitne % Moves Sahi The"):**
  - Compute the weighted harmonic + volatility-weighted mean of `MoveAccuracy%` across all moves by White and Black separately (Book moves automatically receive `100%` accuracy).
  - Output overall Accuracy % (e.g., `White: 88.4% | Black: 74.1%`) AND broken down by game phase: **Opening Accuracy %**, **Middlegame Accuracy %**, and **Endgame Accuracy %**.
  - **Estimated Game Rating (Single-Game ELO Performance):** Calculate estimated performance rating (e.g., `1650`) based on the player's base ELO adjusted by `(CAPS_Accuracy - Expected_Accuracy_For_ELO) * 18`.

### 3. The 10 Move Classifications & Badges
Classify every single move into one of these exact Chess.com categories with its corresponding badge icon and color:
1. **Brilliant (`!!` - Teal `#1baca6`):** The player sacrifices material (leaves a piece capturable or trades down in material value) AND the move is the engine's #1 or within 0.15 cp of best, AND the position was not already overwhelmingly won (`evalCp < +400` before move), AND remains winning/equal after the move.
2. **Great Move (`!` - Blue `#5c8bb0`):** Only 1 good move exists in the position (`Win%_MultiPV1 - Win%_MultiPV2 >= 18%`), and the player found it (saving a lost game, finding the only winning tactic, or punishing an opponent's mistake).
3. **Best Move (`★` - Green `#81b64c`):** Matches Stockfish `MultiPV 1` exactly.
4. **Excellent (`👍` - Light Green `#96bc4b`):** `winDiff <= 2%`.
5. **Good (`✓` - Muted Green `#96af8b`):** `2% < winDiff <= 5%`.
6. **Book (`📖` - Brown `#a88865`):** Position exists in `eco-book.json` via `OpeningLookupService` within the first 20 moves.
7. **Inaccuracy (`?!` - Yellow `#f7c631`):** `5% < winDiff <= 10%`.
8. **Mistake (`?` - Orange `#e58f2a`):** `10% < winDiff <= 20%`.
9. **Miss (`✖` - Red-Orange `#ff7769`):** The opponent played a Mistake or Blunder on the previous turn creating a high-value tactical opportunity, and the player failed to convert it (`winDiff > 12%` compared to the refutation line).
10. **Blunder (`??` - Red `#ca3431`):** `winDiff > 20%` OR drops a winning/drawn position into a lost one OR allows forced checkmate.

### 4. AI Coach Explanation Generator ("Explain Why" in Natural Language)
Build a tactical motif analyzer (`tacticalMotifDetector.ts`) that inspects the board delta between the played move, `OpeningLookupService`, and Stockfish's Principal Variation (PV) to explain *why* a move received its badge:
- **Detect Motifs Automatically:**
  - *Opening Book & Counter-Theory:* Names the exact opening played (e.g., *"B90 Sicilian Defense: Najdorf Variation"*) and, when leaving book, explains the best theoretical counter-move.
  - *Hanging Piece:* Did the move leave a Knight/Bishop/Rook/Queen undefended or attacked by a lower-value piece?
  - *Fork / Double Attack:* Does the PV show one piece attacking two higher-value targets simultaneously?
  - *Pin / Skewer:* Is a piece immobilized on a ray toward the King or Queen?
  - *Discovered Attack / Check:* Moving one piece unblocks a slider (Rook/Bishop/Queen) attack.
  - *Back-Rank Weakness / Mate Threat:* Detects `mateIn` sequences along rank 1 or 8.
  - *Positional Factors:* Center control, King safety (castling), Pawn structure (doubled/isolated/passed pawns), Piece development.
- **Coach UI Component:**
  - Display a Coach Avatar bubble next to the board showing:
    1. Move Badge (`?? Blunder`, `!! Brilliant`, `📖 Book`) + Eval change (`+2.4 -> -1.8`).
    2. Plain English / Hinglish toggleable explanation: e.g., *"Nxf7!! is a Brilliant sacrifice! You gave up a Knight, but if Black captures with Kxf7, Qe6+ forks the King and the Bishop on c4."*
    3. **`[Show Moves]` Button:** Animates the Stockfish PV continuation right on the board with a preview banner.
    4. **`[Retry Move]` Button:** For Mistakes/Blunders/Misses, rewinds the board 1 ply and lets the user guess the Best Move with Coach hints!
- **Interactive Evaluation Graph:** Area chart at the bottom of the review panel showing advantage swings; clicking any point jumps the board to that move.

---

## PART 5: COMPLETE CHESS.COM FEATURE SUITE TO IMPLEMENT

### 1. Advanced Interactive Chessboard (Web & Mobile)
- **Visuals & Themes:** Classic Chess.com Green (`#769656` / `#eeeed2`), Wood, Icy Sea, and Glass board themes; Neo & Classic piece sets.
- **Tactical Annotations:** Right-click (or two-finger mobile gesture) to draw tactical arrows (Orange default, Red with Shift, Blue with Alt, Green with Ctrl) and highlight squares.
- **Multi-Premove System:** Allow queuing multiple premoves during the opponent's turn (rendered in translucent red highlights); execute immediately (0ms latency) on turn switch if legal, or clear on right-click.
- **Rich Board Overlays:**
  - Live **Vertical Evaluation Bar** (with smooth animated fill and centipawn/mate readout on top/bottom).
  - Move classification badge (`!!`, `??`, `★`, `📖`) rendered directly on the top-right corner of the destination square of the last move.
  - Live **Opening Name Banner** above the move list showing the current ECO code and opening variation as moves are played.
  - Captured pieces tray + material imbalance indicator (`+3`).
  - Sound effects engine (`move-self`, `move-opponent`, `capture`, `check`, `castle`, `promote`, `game-start`, `game-end`, `ten-seconds-low-time`).

### 2. Live Multiplayer Modes & Server-Authoritative Clocks
- **Time Controls:**
  - Bullet (`1|0`, `1|1`, `2|1`)
  - Blitz (`3|0`, `3|2`, `5|0`, `5|5`)
  - Rapid (`10|0`, `15|10`, `30|0`)
  - Daily Chess (Correspondence: 1, 3, 7 days per move with conditional pre-moves)
  - **Chess960 (Fischer Random):** Randomized back-rank starting FEN generator with Chess960 castling rules.
- **Server Features (`apps/server`):**
  - Redis rating-window matchmaking queue.
  - Millisecond-accurate server clock with network RTT lag compensation (up to 150ms grace per move).
  - Rematch offers, Draw offers, Resign, Abort (first 2 moves), and 30-second disconnect auto-forfeit timer.

### 3. Play vs. Bots (Personalities & Dynamic Trash-Talk/Coaching)
- Build 12 distinct Bot Personalities across 4 tiers:
  - *Beginner (250–700 ELO):* Martin (250), Wayne (400), Fabian (650)
  - *Intermediate (1000–1400 ELO):* Emir (1000), Nelson (1300 - programmed to bring the Queen out early!), Wendy (1400)
  - *Advanced (1600–2100 ELO):* Antonio (1500), Isabel (1800), Wally (2000)
  - *Master & Special (2300–3200+ ELO):* Nora (2300), Stockfish Max (3200), Mittens (1 ELO display, plays at 3000 ELO with psychological dialogue).
- **Bot Modes:**
  - *Challenge (3 Stars):* No hints, no takebacks.
  - *Friendly / Assisted:* Eval bar enabled, Coach hints, unlimited takebacks.
- **Dynamic Dialogue System:** Bots react in speech bubbles to opening moves, when capturing your Queen, when placed in check, and when winning/losing.

### 4. Puzzles Ecosystem (Rated Puzzles, Puzzle Rush & Puzzle Battle)
- **Rated Tactical Puzzles:** Glicko-2 puzzle rating, theme tags (Fork, Pin, Mate in 2, Zugzwang, Sacrifice), Hint button (highlights piece to move), and Retry system.
- **Puzzle Rush:**
  - **3-Minute Mode**, **5-Minute Mode**, and **Survival Mode**.
  - Start with 400 ELO puzzles and scale difficulty up every 3 solved puzzles.
  - **3 Strikes Rule:** 3 wrong moves ends the run immediately. Track personal high scores and global leaderboards.
- **Puzzle Battle (Live 1v1):** Real-time WebSocket race where two players solve the exact same sequence of escalating puzzles simultaneously for 3 minutes.

### 5. Interactive Opening & Counter-Opening Explorer UI, Analysis Studio & PGN/GIF Tools
- **Opening & Counter-Opening Explorer Panel (`apps/web` & `apps/mobile`):**
  - Database source switcher: **Masters DB** vs. **Lichess Community DB** (with rating bracket filters `1000–2500+` and time-control filters `Bullet / Blitz / Rapid`).
  - Displays current **ECO Code + Opening Name**, followed by the table of all candidate **Counter-Moves** showing Move SAN, Total Games, **"Main Line" / "Top Counter" badges**, and the horizontal tri-color **White Win % / Draw % / Black Win %** bar.
  - Searchable **3,546 ECO Encyclopedia Directory** where users can browse any White opening (`1.e4`, `1.d4`, `1.c4`, `1.Nf3`) and click to practice its best Black counter-defenses on the board.
- **Self-Analysis Studio:** Free-form board where users can paste any FEN/PGN, toggle Multi-PV (up to 3 engine lines displayed live), edit board position, and flip orientation.
- **Game Export:** One-click PGN copy, FEN copy, and client-side **Animated GIF Generator** of the finished game.

### 6. Tournaments, Players League & Fair Play (Anti-Cheat)
- **Arena Tournaments:** Live 1-hour Arena tournaments where players are paired continuously, earn 2 pts for win, 4 pts for streak wins, and can click **Berserk** (halve their clock time for +1 bonus point).
- **Players League:** Weekly divisions (Wood -> Stone -> Bronze -> Silver -> Crystal -> Elite -> Champion -> Legend) where users earn trophies for every live game and puzzle.
- **Fair Play / Anti-Cheat Module:** Track tab-visibility changes (`visibilitychange`), mouse/touch telemetry, move-time variance (flagging flat robotic move intervals), and Top-1 Stockfish engine correlation (`T1% > 94%` in complex games).

---

## PART 6: EXECUTION PLAN (DO NOT STOP EARLY)
Execute the build in this exact order and verify each step compiles cleanly:
1. **Scaffold Monorepo & Build ECO Database:** Initialize Turborepo, `packages/types`, and `scripts/fetch-eco-book.ts`. Run the script to generate `packages/chess-core/src/data/eco-book.json` with all 3,546 openings.
2. **Build `packages/chess-core`:** Implement `OpeningLookupService`, `OpeningExplorerService`, Glicko-2 ratings, the complete Game Review math (Win%, MoveAccuracy%, CAPS Accuracy %), the 10 Move Classifications, `tacticalMotifDetector.ts`, and the AI Coach Explanation generator.
3. **Build `apps/server`:** Implement Prisma schema, Redis matchmaking, Socket.io server-authoritative game rooms, Opening Explorer caching proxy, Arena tournament manager, and Puzzle Battle sockets.
4. **Build `apps/web`:** Implement Dark-mode Chess.com UI, Interactive Board (arrows, premoves, move badges, eval bar), Live Play, Game Review with Coach & Eval Graph, Opening & Counter-Opening Explorer UI, Bots, and Puzzle Rush.
5. **Build `apps/mobile`:** Implement Expo Router navigation, 60fps Gesture Chessboard, Haptics, Live & Offline Bot Play, Mobile Game Review, Opening Explorer, and Puzzle Rush.
