# Phase 1: chess-core Engine Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@chess/chess-core` is a pure-TypeScript, fully tested library providing opening lookup and explorer, Glicko-2, Game Review math, 10-way move classification, tactical motif detection, the EN/Hinglish coach explanation generator, an engine-agnostic review pipeline, and a Chess960 start-position generator.

**Architecture:** Pure functions plus small services with injected dependencies (`EcoBook`, `fetch`, `EngineAdapter`), so web/mobile/server can all reuse them and tests need no network or engine. All evals inside the library are **White POV**. Conversion to the mover's POV happens only in the review math. Board analysis uses chess.js 1.4 plus a small board-geometry layer (rays, SEE) written here.

**Tech Stack:** TypeScript 6.0.3, chess.js 1.4.0, Vitest 5.

**Spec:** `docs/spec/product-spec.md` PART 3.2–3.3, PART 4, PART 5.3 (bots consume the engine later), PART 6.2. Roadmap: `docs/superpowers/plans/2026-10-23-chess-platform-roadmap.md` Phase 1 (including "Carried from the Phase 0 review").

## Global Constraints

- Win% = `50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)`. A mate score gives 100 (White mates) or 0 (Black mates). No cp clamp (spec verbatim).
- MoveAccuracy% = `clamp(103.1668 * exp(-0.04354 * winDiff) - 3.1669, 0, 100)`, `winDiff = max(0, winBefore - winAfter)` from the **mover's** POV. No Lichess `+1` bonus (spec verbatim).
- Game accuracy = (volatility-weighted mean + harmonic mean) / 2 per color, Lichess windowing: `windowSize = clamp(floor(plies/10), 2, 8)`, weights = population stdev of win% windows, clamped to [0.5, 12].
- Book moves score accuracy 100. Book counts only within the first 20 moves (ply ≤ 40).
- Estimated rating = `base + (accuracy - expectedAccuracy(base)) * 18`.
- Classification thresholds (mover win% points): Excellent ≤ 2, Good ≤ 5, Inaccuracy ≤ 10, Mistake ≤ 20, Blunder > 20. Great: `win(PV1) - win(PV2) ≥ 18`. Brilliant: sacrifice, best or within 15 cp of best, `cpBefore < +400` (mover POV), remains equal/winning. Miss: opponent's previous move was Mistake/Blunder and `winDiff > 12`.
- Explorer: "Top Counter" = highest active-side win rate with ≥ 100 games. "Main Line" = most played.
- chess-core `src` must not use Node-only APIs (it runs in browser and React Native).

## Rulings Baked Into This Plan (spec ambiguities)

- R1: "within 0.15 cp of best" is read as **15 cp** (0.15 pawns). 0.15 cp is below engine resolution.
- R2: Classification precedence: Book → Brilliant → Great → Best → (allows mate / drops to lost ⇒ Blunder) → Miss → Blunder (>20) → Mistake → Inaccuracy → Good → Excellent. A position with a single legal move is never Great or Brilliant.
- R3: "Remains winning/equal" = mover win% after ≥ 45. "Lost" = mover win% ≤ 20. "Winning/drawn before" = mover win% ≥ 40.
- R4: Sacrifice = the mover's net material after the move plus the opponent's best static-exchange capture is ≤ −2 pawns (N=B=3, R=5, Q=9). A 1-pawn sacrifice is not Brilliant.
- R5: Harmonic mean floors each move accuracy at 1, so a single 0 can't collapse the mean to 0.
- R6: Phases. Endgame starts at the first ply where the major+minor piece count (both sides) is ≤ 6. Middlegame starts at the first ply where that count is ≤ 10, or either back rank holds < 4 of its own pieces, or ply > 30. Otherwise it is opening.
- R7: Chess960 **castling rules move to Phase 5** (live 960 games own Review Focus 1 in the roadmap). Phase 1 ships only the start-position generator.
- R8: Terminal checkmate is encoded as `{ mate: +1 }` (White delivered) or `{ mate: -1 }`. Stalemate and other draws are `{ cp: 0 }`.

## Review Focus

1. **Mate ↔ cp transitions:** eval goes from `mate +3` to `+250 cp` (still winning, lost the forced mate). The winDiff must be finite and the move must not be a Blunder purely because the mate disappeared. Tested in Task 5 and Task 7.
2. **Black-to-move perspective:** every function that takes White-POV evals must classify Black's moves correctly (a Black blunder makes White's win% go _up_). Tested in Tasks 5, 7 and 10 with Black-mover cases.
3. **Short games:** 1–3 plies, a game ending in mate on move 2, a game with no moves. The accuracy windowing must not divide by zero or index past the array. Tested in Task 5 and Task 10.
4. **Engine returns fewer than 3 PV lines** (only 1 legal move, or a near-mate position): Great/Brilliant/second-best must handle missing `before[1]`. Tested in Task 7.
5. **Explorer API down / 429 / malformed JSON:** the service rejects with a typed error and never returns half-mapped data. Tested in Task 3.

## File Map

```
packages/types/src/   review.ts (Eval, EngineLine, MoveReview, ReviewReport, PhaseAccuracy),
                      explorer.ts (ExplorerQuery, ExplorerResponse, CounterMove, ExplorerGame),
                      rating.ts (Glicko2Rating, GameResult), coach.ts (Motif, CoachExplanation), index.ts
packages/chess-core/src/
  epd.ts                       (simplified: fen() fields 0-3)
  data/eco-book.json + eco-book.d.json.ts   (typed import, no 3,865-key inference)
  opening/OpeningLookupService.ts
  opening/OpeningExplorerService.ts
  rating/glicko2.ts
  board/material.ts            (piece values, material count, majors+minors, SEE, sacrifice)
  board/geometry.ts            (rays, slider attacks, pins/skewers/discovered)
  game-review/math.ts          (winPercent, moveAccuracy, gameAccuracy, phaseOf, estimateRating)
  game-review/classify.ts
  game-review/pipeline.ts      (EngineAdapter, analyzeGame)
  coach/tacticalMotifDetector.ts
  coach/explain.ts
  variants/chess960.ts
  index.ts
packages/chess-core/test/      one test file per module above
tsconfig.base.json -> tsconfig.lib.json (no node types) + tsconfig.node.json (node types)
scripts/src/eco/compileBook.ts, classifyFamily.ts (family epds + majority first move)
```

## Interfaces (shared names)

```ts
// @chess/types (White POV unless named otherwise)
export type Color = 'white' | 'black';
export type Score = { cp: number } | { mate: number };          // mate: signed, + = White mates
export interface EngineLine { uci: string; pv: string[]; score: Score; depth: number }  // White POV
export interface MoveReview {
  ply: number; color: Color; san: string; uci: string; fenBefore: string; fenAfter: string;
  classification: MoveClassification; accuracy: number;
  winBefore: number; winAfter: number;                // mover POV
  scoreBefore: Score; scoreAfter: Score;              // White POV
  bestMove: { uci: string; san: string } | null; secondBestMove: { uci: string; san: string } | null;
  pv: string[];                                       // SAN, best line from fenBefore, ≤ 6
  isBook: boolean; phase: GamePhase; motifs: Motif[];
}
export type GamePhase = 'opening' | 'middlegame' | 'endgame';
export interface PhaseAccuracy { opening: number | null; middlegame: number | null; endgame: number | null }
export interface ReviewReport {
  moves: MoveReview[]; accuracy: Record<Color, number>; phaseAccuracy: Record<Color, PhaseAccuracy>;
  estimatedRating: Record<Color, number>; counts: Record<Color, Record<MoveClassification, number>>;
  opening: BookOpening | null; winGraph: number[];    // White win% per position, length plies+1
}
export interface BookOpening { eco: string; name: string; pgn: string; lastBookPly: number }
export interface Glicko2Rating { rating: number; rd: number; volatility: number }
export interface GameResult { opponent: Glicko2Rating; score: 0 | 0.5 | 1 }
export type MotifType = 'book' | 'book-deviation' | 'hanging-piece' | 'fork' | 'pin' | 'skewer'
  | 'discovered-attack' | 'discovered-check' | 'back-rank' | 'mate-threat' | 'sacrifice'
  | 'center-control' | 'king-safety' | 'pawn-structure' | 'development';
export interface Motif { type: MotifType; squares: string[]; detail: Record<string, string | number> }
export interface CoachExplanation { headline: string; evalChange: string; text: string; motifs: MotifType[] }
export type ExplorerSource = 'masters' | 'lichess';
export interface CounterMove { uci: string; san: string; totalGames: number; whiteWinPct: number;
  drawPct: number; blackWinPct: number; averageRating: number | null;
  badges: Array<'Main Line' | 'Top Counter'> }
export interface ExplorerGame { id: string; white: { name: string; rating: number }; black: { name: string; rating: number };
  result: '1-0' | '0-1' | '1/2-1/2'; year: number | null; uci: string | null }
export interface ExplorerResponse { opening: { eco: string; name: string } | null; totalGames: number;
  counterMoves: CounterMove[]; topGames: ExplorerGame[] }

// @chess/chess-core
normalizeEpd(fen): string
loadEcoBook(): EcoBook
class OpeningLookupService { constructor(book: EcoBook);
  getOpeningByFen(fen): OpeningEntry | null;
  bookMovesFrom(fen): Array<{ uci; san; opening: OpeningEntry }>;
  trackGameOpening(fenHistory: string[]): { opening: BookOpening | null; isBookMove: boolean;
    deviationPly: number | null; bookPlies: boolean[] } }      // bookPlies[i] for ply i+1
class OpeningExplorerService { constructor(opts?: { fetchFn?; baseUrl?; token? });
  query(fen, { source, ratings?, speeds? }): Promise<ExplorerResponse> }
class ExplorerError extends Error { status: number | null }
updateGlicko2(player, results, tau = 0.5): Glicko2Rating;  DEFAULT_GLICKO2
winPercent(score: Score): number                       // White POV
moverWin(score, color): number
moveAccuracy(winBefore, winAfter): number
gameAccuracy(winGraph: number[], accuracies: number[], colorOfPly: Color[]): Record<Color, number>
phaseOf(fen, ply): GamePhase
estimateRating(accuracy, baseElo?): number
materialBalance(fen): number; majorsAndMinors(fen): number; see(fen, square): number;
isSacrifice(fenBefore, uci): boolean
classifyMove(input: ClassifyInput): MoveClassification
detectMotifs(input: MotifInput): Motif[]
explainMove(review: MoveReview, lang: 'en' | 'hinglish', opening?: BookOpening | null): CoachExplanation
interface EngineAdapter { analyse(fen: string, opts: { depth: number; multiPv: number }): Promise<EngineLine[]> }
  // EngineAdapter lines are SIDE-TO-MOVE POV; pipeline converts to White POV
analyzeGame(input: { pgn: string } | { sans: string[]; startFen?: string },
  deps: { engine: EngineAdapter; book: OpeningLookupService },
  opts?: { depth?: number; multiPv?: number; baseElo?: Partial<Record<Color, number>>; onProgress?(done, total): void }
): Promise<ReviewReport>
chess960StartFen(index: number): string; randomChess960Index(rng?: () => number): number
```

---

### Task 1: Phase 0 carryovers (hygiene)

- [ ] Split TS config: `tsconfig.lib.json` (no `types`, `lib: ["ES2023"]`) for `packages/*/src`, and `tsconfig.node.json` (`types: ["node"]`) for scripts, tests and the root. chess-core/types `tsconfig.json` checks `src` with lib and tests via `tsconfig.test.json`. Verify: adding `process.cwd()` to chess-core `src` fails typecheck (then remove it).
- [ ] RED: `epd.test.ts` stays (7 cases incl. pinned pawn). GREEN refactor: `normalizeEpd` = `new Chess(fen).fen()` fields 0–3. All 7 still pass.
- [ ] RED in scripts: `compileBook` families carry `epds: string[]`. `firstMove` = most common first move across the family's lines (tie → shortest line). Tests: family with lines `[e4…, e4…, d4]` → `1.e4`. `epds` lists the family's positions. Add `epds` to `OpeningFamily`. Regenerate the book. eco-book test: Pterodactyl Defense → `1.e4`.
- [ ] `src/data/eco-book.d.json.ts` declares `const book: EcoBook; export default book` (+ `allowArbitraryExtensions`). `loadEcoBook()` returns it. Test: `loadEcoBook().count ≥ 3400`.
- [ ] `.gitattributes`: `packages/chess-core/src/data/eco-book.json -diff linguist-generated`.
- [ ] Commit `chore: phase-0 review carryovers`.

### Task 2: OpeningLookupService

Tests (`opening-lookup.test.ts`, real book):

- `getOpeningByFen` after `1.e4 c5` (FEN with counters + `c6` ep) → B20 Sicilian Defense. Start position → null. Invalid FEN → throws.
- `bookMovesFrom(start)` includes `e4` (King's Pawn Game) and `d4`. Every entry's resulting position is in the book. Sorted by SAN.
- `trackGameOpening` for the Najdorf + `6. Bg5 e6 7. f4 Qb6 8. Qd2 Qxb2 9. Rb1 Qa3 10. h3?`. Expected: opening = deepest named hit, `lastBookPly` = last book ply, `deviationPly` = first non-book ply, `isBookMove` false, and `bookPlies` true up to the deviation.
- A transposition back into book after a deviation counts as book in `bookPlies` but does not reset `deviationPly`.
- Positions after ply 40 are never book (fabricated: a book EPD injected via a tiny custom `EcoBook` at ply 41 → false).
- Empty history / start only → `{ opening: null, isBookMove: false, deviationPly: null, bookPlies: [] }`.

### Task 3: OpeningExplorerService

Tests (`opening-explorer.test.ts`, injected fetch with recorded Lichess-shaped JSON fixtures in `test/fixtures/explorer-*.json`):

- Masters URL = `https://explorer.lichess.ovh/masters?fen=<encoded>`. Lichess URL adds `ratings=1600,1800&speeds=blitz,rapid`. A token sets `Authorization: Bearer <t>`.
- Maps a move `{uci:'c7c5', san:'c5', white:300, draws:200, black:500, averageRating:2400}` → totalGames 1000, 30 / 20 / 50 %, averageRating 2400.
- Sorting: by totalGames desc, ties by active-side win rate desc.
- Badges: "Main Line" on the most played. "Top Counter" on the best active-side win rate among ≥ 100 games (Black to move → blackWinPct). Both may land on the same move. No move ≥ 100 → no Top Counter.
- 0-game move → percentages 0 (no NaN).
- topGames mapped: winner `white` → `1-0`, `black` → `0-1`, null → `1/2-1/2`, year kept.
- HTTP 429 → rejects `ExplorerError` with status 429. Malformed JSON → `ExplorerError` with status null. Network throw → `ExplorerError`.

### Task 4: Glicko-2

Tests (`glicko2.test.ts`):

- Glickman paper example: (1500, 200, 0.06), τ = 0.5 vs (1400,30) win, (1550,100) loss, (1700,300) loss → rating 1464.06 ± 0.01, rd 151.52 ± 0.01, volatility 0.05999 ± 0.00001.
- No games → rating unchanged, RD grows: `sqrt(rd² + σ²)` in Glicko-2 scale.
- RD is capped at 350. `DEFAULT_GLICKO2 = {1500, 350, 0.06}`.
- Symmetry: a win vs an equal opponent raises the rating and a loss lowers it by the same amount.

### Task 5: Review math

Golden values are computed independently from the spec formulas.

- `winPercent({cp:0})` = 50. `{cp:100}` ≈ 59.10. `{cp:-100}` ≈ 40.90. `{cp:300}` ≈ 75.11. `{mate:3}` = 100, `{mate:-1}` = 0. Symmetry holds for 20 random cp values.
- `moverWin(score,'black')` = 100 − White win%.
- `moveAccuracy(50,50)` ≈ 99.9999. `(50,40)` ≈ 63.58. `(60,70)` (gain) ≈ 99.9999. `(100,0)` = 0.
- `gameAccuracy`: hand-computed 4-ply example, winGraph `[50,50,50,30,30]`, accuracies from moveAccuracy, colors w/b/w/b. Window size 2, weights [0.5,0.5,10,0.5]. White ≈ 50.0 (exact value from a standalone computation), Black ≈ 99.99. All-perfect game → both ≈ 100. Zero-ply game → `{white: 100, black: 100}`. One ply → black 100 (no moves).
- `phaseOf`: start → opening. Position with 6 majors+minors → endgame. 9 pieces at ply 20 → middlegame. Ply 31 with full material → middlegame.
- `estimateRating(acc, base)`: equals base when acc = expected(base). +1% → +18. Without base: inverse of the expectation table (accuracy 72 → 1200). Result clamped to [100, 3200].

### Task 6: Material, SEE, sacrifice

- `materialBalance(start)` = 0. After `1.e4 d5 2.exd5` = +1.
- `majorsAndMinors(start)` = 14.
- `see(fen, 'd5')` on a pawn defended by a pawn, attacked by a knight → negative (losing capture). A hanging queen attacked by a pawn → +9.
- `isSacrifice`:
  - Legal's mate pattern `Nxe5`: queen left en prise → true.
  - A plain pawn push → false.
  - The rook exchange sacrifice `Rxf7` where `Kxf7` is legal → true.
  - Capturing a hanging piece → false.
  - A 1-pawn gambit (`2.c4` in QGA style) → false (R4).

### Task 7: classifyMove

`ClassifyInput = { color, uci, isBook, legalMoveCount, lines: EngineLine[] (before, White POV), scoreAfter: Score, prevOpponentClass: MoveClassification | null, sacrifice: boolean }`. Tests per rule, each with a White-mover and a Black-mover case:

- Book wins over everything.
- Brilliant: sacrifice + best + cpBefore < 400 + winAfter ≥ 45. Within 15 cp of best (not equal uci) → still Brilliant. 16 cp worse → not. cpBefore 450 → not Brilliant (falls to Best).
- Great: played best, gap PV1−PV2 ≥ 18. Gap 17 → Best. Only 1 line → never Great. legalMoveCount 1 → Best.
- Best: uci equals lines[0].uci.
- Allows mate: scoreAfter mate against the mover, no mate against them before → Blunder even with winDiff 15.
- `mate +3` → `+250 cp` (winDiff ≈ 18.9) → Mistake, not Blunder (Review Focus 1).
- Miss: prev opponent Blunder, winDiff 13 → Miss. Prev Good, winDiff 13 → Mistake.
- Bands: winDiff 2 → Excellent, 2.01 → Good, 5.01 → Inaccuracy, 10.01 → Mistake, 20.01 → Blunder.

### Task 8: Tactical motif detector

`MotifInput = { fenBefore, uci, pv: string[] (UCI, from fenBefore), scoreAfter, bookOpening, isBook, deviation: { bestBookSan } | null }`. Tests use concrete positions:

- hanging-piece: the move leaves the mover's knight attacked and undefended. Also a bishop attacked by a pawn even when defended.
- fork: PV's first move is a knight fork of king + rook (`Nc7+` style) → fork with both target squares.
- pin: a bishop pins a knight to the king → pin. A rook through a queen to a rook → skewer.
- discovered-attack / discovered-check: moving a knight off a bishop's diagonal reveals check → discovered-check.
- back-rank: mate in 1 along rank 8 with the king boxed by its own pawns → back-rank.
- mate-threat: scoreAfter mate against the mover without the back-rank pattern → mate-threat.
- sacrifice: when `isSacrifice` is true.
- book / book-deviation motifs carry the opening name and `bestBookSan`.
- positional: castling move → king-safety. Creating doubled pawns → pawn-structure. Minor piece off the back rank in the first 10 moves → development. A central pawn push to e4/d4/e5/d5 → center-control.
- Quiet move in a quiet position → [].

### Task 9: Coach explanation generator

Tests (`explain.test.ts`) build `MoveReview`s by hand:

- Brilliant sacrifice with a fork in the PV (EN) → headline `Nxf7!! is a Brilliant move`, text mentions the sacrifice and fork, evalChange `+0.3 → +2.4`.
- Same in Hinglish → text in Hinglish (contains "sacrifice" and "fork", Hinglish phrasing such as "aapne").
- Blunder with a hanging piece → mentions the piece name + square, and the best move SAN.
- Book move → contains "B90 Sicilian Defense: Najdorf Variation".
- Book deviation → contains "theory" and the best book move SAN.
- Mate scores render as `M3` / `-M2`, cp as signed pawns with one decimal.
- Every classification produces non-empty EN and Hinglish text (loop over all 10).

### Task 10: Review pipeline

`analyzeGame` with a scripted `FakeEngine` (a real `EngineAdapter` implementation that returns lines from a FEN → lines table):

- Converts side-to-move scores to White POV (a Black-to-move `cp:+50` → White `cp:-50`).
- Calls the engine once per position (plies + 1), skipping terminal positions (checkmate → `{mate:±1}`, stalemate → `{cp:0}`).
- Scholar's mate game (`1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#`): `Nf6` classified Blunder, last position mate, winGraph ends 100, report counts consistent with the moves.
- Book plies come from the real book (`1.e4 e5` → book).
- Accuracy and estimatedRating are populated per color. onProgress is called plies+1 times.
- Invalid PGN → rejects with a message naming the bad move.
- Empty game → report with 0 moves and accuracy 100.

### Task 11: Chess960 start positions

- `chess960StartFen(518)` = standard start FEN.
- All 960 indices produce unique back ranks. Bishops are on opposite colors and the king sits between the rooks in every one. Black mirrors White.
- Out-of-range / non-integer index → throws RangeError.
- `randomChess960Index(() => 0)` = 0, `(() => 0.9999)` = 959.
- Castling field is `KQkq` (Shredder-FEN castling is a Phase 5 concern, R7).

Each task: RED → GREEN → typecheck/lint → commit `feat(chess-core): <module>`.
