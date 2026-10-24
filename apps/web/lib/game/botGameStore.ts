import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';
import { botLine, botSearchParams, chooseBotMove, createRng } from '@chess/bots';
import type {
  AbortSignalLike,
  BotEvent,
  BotProfile,
  CoachLanguage,
  EngineLine,
  Score,
  SoundEvent,
} from '@chess/types';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { soundForMove } from '@/lib/sound/SoundEngine';

/** What the game needs from an engine (UciEngine satisfies it). */
export interface BotEngine {
  bestMove(
    fen: string,
    opts: {
      movetime?: number;
      depth?: number;
      elo?: number;
      multiPv?: number;
      signal?: AbortSignalLike;
    },
  ): Promise<{ bestmove: string; lines: EngineLine[] }>;
  analyse(
    fen: string,
    opts: { depth: number; multiPv: number; signal?: AbortSignalLike },
  ): Promise<EngineLine[]>;
}

export type BotMode = 'challenge' | 'friendly';
export type Side = 'w' | 'b';
export type ResultReason =
  'checkmate' | 'stalemate' | 'insufficient' | 'threefold' | 'fifty-move' | 'resign';

export interface PlayedMove {
  san: string;
  from: Square;
  to: Square;
  uci: string;
  color: Side;
  /** Position after the move. */
  fen: string;
}

export interface BotGameState {
  bot: BotProfile;
  userColor: Side;
  mode: BotMode;
  lang: CoachLanguage;
  startFen: string;
  fen: string;
  history: PlayedMove[];
  lastMove: [Square, Square] | null;
  status: 'playing' | 'over';
  result: { winner: Side | null; reason: ResultReason } | null;
  thinking: boolean;
  engineError: string | null;
  speech: string | null;
  /** White-POV evaluation; Friendly mode only. */
  evaluation: Score | null;
  /** Square of the piece the engine suggests moving; Friendly mode only. */
  hint: Square | null;

  start(): void;
  /** Returns false when the move is not allowed right now (illegal, bot's turn, game over). */
  userMove(move: { from: string; to: string; promotion?: PieceSymbol }): boolean;
  takeback(): boolean;
  requestHint(): Promise<boolean>;
  resign(): void;
  retryEngine(): Promise<void>;
  setLang(lang: CoachLanguage): void;
}

export interface BotGameDeps {
  bot: BotProfile;
  userColor: Side;
  mode: BotMode;
  getEngine: () => Promise<BotEngine>;
  /** Restart a failed engine (the browser engine store's retry). */
  restartEngine?: () => Promise<unknown>;
  startFen?: string;
  rng?: () => number;
  lang?: CoachLanguage;
  onSound?: (event: SoundEvent) => void;
}

const WINNING_CP = 300;
const MOOD_COOLDOWN_PLIES = 12;
const HINT_DEPTH = 12;
const EVAL_DEPTH = 12;

type AbortControllerLike = { signal: AbortSignalLike; abort(): void };

/**
 * A full game against a bot: legality and results via chess.js, bot moves via the engine
 * and @chess/bots, dialogue, sounds, Friendly-mode help. Searches carry an id and an
 * AbortSignal, so a takeback stops the engine and a late reply is dropped.
 */
export function createBotGame(deps: BotGameDeps): StoreApi<BotGameState> {
  const game = deps.startFen ? new Chess(deps.startFen) : new Chess();
  const startFen = game.fen();
  const rng = deps.rng ?? createRng(Date.now() >>> 0);
  const sound = (e: SoundEvent) => deps.onSound?.(e);
  const botColor: Side = deps.userColor === 'w' ? 'b' : 'w';
  let searchId = 0;
  let controller: AbortControllerLike | null = null;
  let lastMoodPly = -MOOD_COOLDOWN_PLIES;
  let saidOpening = false;

  return createStore<BotGameState>()((set, get) => {
    const say = (event: BotEvent) => {
      const line = botLine(deps.bot, event, get().lang, rng);
      if (line) set({ speech: line });
    };

    const sync = (extra: Partial<BotGameState> = {}) => {
      const history = game.history({ verbose: true }).map((m) => ({
        san: m.san,
        from: m.from,
        to: m.to,
        uci: m.from + m.to + (m.promotion ?? ''),
        color: m.color,
        fen: m.after,
      }));
      const last = history.at(-1);
      set({ fen: game.fen(), history, lastMove: last ? [last.from, last.to] : null, ...extra });
    };

    const finishIfOver = (): boolean => {
      let result: BotGameState['result'] = null;
      if (game.isCheckmate())
        result = { winner: game.turn() === 'w' ? 'b' : 'w', reason: 'checkmate' };
      else if (game.isStalemate()) result = { winner: null, reason: 'stalemate' };
      else if (game.isInsufficientMaterial()) result = { winner: null, reason: 'insufficient' };
      else if (game.isThreefoldRepetition()) result = { winner: null, reason: 'threefold' };
      else if (game.isDrawByFiftyMoves()) result = { winner: null, reason: 'fifty-move' };
      if (!result) return false;
      endGame(result);
      return true;
    };

    const endGame = (result: NonNullable<BotGameState['result']>) => {
      cancelSearch();
      set({ status: 'over', result, thinking: false, hint: null });
      say(result.winner === null ? 'draw' : result.winner === botColor ? 'win' : 'loss');
      sound('game-end');
    };

    const cancelSearch = () => {
      searchId++;
      controller?.abort();
      controller = null;
    };

    const updateEvaluation = async () => {
      if (get().mode !== 'friendly' || get().status !== 'playing') return;
      const fen = game.fen();
      try {
        const engine = await deps.getEngine();
        const [best] = await engine.analyse(fen, { depth: EVAL_DEPTH, multiPv: 1 });
        if (!best || game.fen() !== fen) return;
        const whiteToMove = fen.split(' ')[1] === 'w';
        const score = whiteToMove
          ? best.score
          : 'mate' in best.score
            ? { mate: -best.score.mate }
            : { cp: -best.score.cp };
        set({ evaluation: score });
      } catch {
        // The eval bar is a nicety; a failed analysis must not disturb the game.
      }
    };

    const botTurn = async () => {
      if (get().status !== 'playing' || game.turn() !== botColor) return;
      const id = ++searchId;
      const Ctor = (globalThis as { AbortController?: new () => AbortControllerLike })
        .AbortController;
      controller = Ctor ? new Ctor() : null;
      set({ thinking: true, engineError: null });
      const fen = game.fen();
      try {
        const engine = await deps.getEngine();
        const params = botSearchParams(deps.bot);
        const result = await engine.bestMove(fen, { ...params, signal: controller?.signal });
        if (id !== searchId) return; // taken back or game ended meanwhile
        const legalUci = game.moves({ verbose: true }).map((m) => m.lan);
        const uci = chooseBotMove(
          deps.bot,
          {
            fen,
            ply: game.history().length + 1,
            lines: result.lines,
            legalUci,
            engineMove: result.bestmove,
          },
          rng,
        );
        const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        sync({ thinking: false });
        sound(soundForMove(move, false));
        if (move.captured === 'q') say('captured-queen');
        const mood = result.lines[0]?.score;
        const ply = game.history().length;
        if (mood && ply - lastMoodPly >= MOOD_COOLDOWN_PLIES) {
          const cp = 'mate' in mood ? Math.sign(mood.mate) * 10_000 : mood.cp;
          if (Math.abs(cp) >= WINNING_CP) {
            lastMoodPly = ply;
            say(cp > 0 ? 'winning' : 'losing');
          }
        }
        if (!finishIfOver()) void updateEvaluation();
      } catch (err) {
        if (id !== searchId || (err as Error).name === 'AbortError') return;
        set({ thinking: false, engineError: (err as Error).message });
      }
    };

    return {
      bot: deps.bot,
      userColor: deps.userColor,
      mode: deps.mode,
      lang: deps.lang ?? 'en',
      startFen,
      fen: startFen,
      history: [],
      lastMove: null,
      status: 'playing',
      result: null,
      thinking: false,
      engineError: null,
      speech: null,
      evaluation: null,
      hint: null,

      start() {
        say('game-start');
        sound('game-start');
        void botTurn();
      },

      userMove({ from, to, promotion }) {
        const s = get();
        if (s.status !== 'playing' || s.thinking || game.turn() !== s.userColor) return false;
        let move: Move;
        try {
          move = game.move({ from, to, promotion });
        } catch {
          return false;
        }
        sync({ hint: null });
        sound(soundForMove(move, true));
        if (move.captured === 'q') say('lost-queen');
        else if (move.san.includes('+')) say('in-check');
        else if (!saidOpening && game.history().length >= 3) {
          saidOpening = true;
          say('user-opening');
        }
        if (!finishIfOver()) void botTurn();
        return true;
      },

      takeback() {
        const s = get();
        if (s.mode !== 'friendly' || s.status !== 'playing') return false;
        cancelSearch();
        // Undo until one of the user's own moves has been removed and it is their turn.
        let removedUserMove = false;
        while (game.history().length > 0 && (!removedUserMove || game.turn() !== s.userColor)) {
          const undone = game.undo();
          if (undone?.color === s.userColor) removedUserMove = true;
        }
        sync({ thinking: false, hint: null, engineError: null });
        if (game.turn() !== s.userColor) void botTurn();
        else void updateEvaluation();
        return removedUserMove;
      },

      async requestHint() {
        const s = get();
        if (s.mode !== 'friendly' || s.status !== 'playing' || game.turn() !== s.userColor)
          return false;
        const fen = game.fen();
        try {
          const engine = await deps.getEngine();
          const [best] = await engine.analyse(fen, { depth: HINT_DEPTH, multiPv: 1 });
          if (!best || game.fen() !== fen) return false;
          set({ hint: best.uci.slice(0, 2) as Square });
          return true;
        } catch (err) {
          set({ engineError: (err as Error).message });
          return false;
        }
      },

      resign() {
        if (get().status !== 'playing') return;
        endGame({ winner: botColor, reason: 'resign' });
      },

      async retryEngine() {
        set({ engineError: null });
        try {
          await deps.restartEngine?.();
        } catch (err) {
          // A failed restart must stay visible with its Retry, never leave the game silent.
          set({ engineError: (err as Error).message, thinking: false });
          return;
        }
        await botTurn();
      },

      setLang(lang) {
        set({ lang });
      },
    };
  });
}
