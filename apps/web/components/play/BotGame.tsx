'use client';

import { FlipVertical2, Flag, Lightbulb, RotateCcw, Undo2, Volume2, VolumeX } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { botById } from '@chess/bots';
import { InteractiveBoard } from '@/components/board/InteractiveBoard';
import { CapturedPieces } from '@/components/game/CapturedPieces';
import { EvalBar } from '@/components/game/EvalBar';
import { MoveList } from '@/components/game/MoveList';
import { OpeningBanner, useOpening } from '@/components/game/OpeningBanner';
import type { MoveIntent } from '@/lib/board/reducer';
import { api as defaultApi, type Api } from '@/lib/api/client';
import { sessionStore, type SessionState } from '@/lib/api/session';
import { engineStore, type EngineStatus } from '@/lib/engine/browserEngine';
import { newClientGameId, useAutoSave, type SaveGamePayload } from '@/lib/game/autoSave';
import { sanToWords } from '@/lib/game/speech';
import { createBotGame, type BotEngine, type BotMode, type Side } from '@/lib/game/botGameStore';
import { SoundEngine } from '@/lib/sound/SoundEngine';
import { BotAvatar } from './BotAvatar';

const REASON: Record<string, string> = {
  checkmate: 'by checkmate',
  stalemate: 'Stalemate',
  insufficient: 'Insufficient material',
  threefold: 'Threefold repetition',
  'fifty-move': '50-move rule',
  resign: 'by resignation',
};

const MUTE_KEY = 'chess.muted';

/** Per-browser convenience; storage can be unavailable (private mode), so never throw. */
function readMuted(): boolean {
  try {
    return globalThis.localStorage?.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    globalThis.localStorage?.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Not persisted; the toggle still works for this game.
  }
}

export interface BotGameProps {
  botId: string;
  mode: BotMode;
  color: Side;
  /** Tests inject an engine; the app uses the shared browser Stockfish worker. */
  engine?: BotEngine;
  /** Tests inject the accounts API and session; the app uses the shared ones. */
  api?: Api;
  session?: StoreApi<SessionState>;
}

export function BotGame({
  botId,
  mode,
  color,
  engine,
  api = defaultApi,
  session = sessionStore(),
}: BotGameProps) {
  const [gameKey, setGameKey] = useState(0);
  const sounds = useRef<SoundEngine | null>(null);
  const [muted, setMuted] = useState(readMuted);
  const [orientation, setOrientation] = useState<'white' | 'black'>(
    color === 'w' ? 'white' : 'black',
  );
  // A new colour (navigation) resets the board to the user's side.
  useEffect(() => setOrientation(color === 'w' ? 'white' : 'black'), [color]);

  const store = useMemo(() => {
    const bot = botById(botId);
    return createBotGame({
      bot,
      userColor: color,
      mode,
      getEngine: engine ? async () => engine : () => engineStore().getState().getEngine(),
      restartEngine: engine ? undefined : () => engineStore().getState().retry(),
      onSound: (e) => sounds.current?.play(e),
    });
    // A new game (gameKey) rebuilds the store.
  }, [botId, color, mode, engine, gameKey]);

  useEffect(() => {
    store.getState().start();
    // Leaving the page or starting a new game stops this game's engine work.
    return () => store.getState().dispose();
  }, [store]);

  const s = useStore(store);
  const fenHistory = useMemo(
    () => [s.startFen, ...s.history.map((m) => m.fen)],
    [s.startFen, s.history],
  );
  const opening = useOpening(fenHistory);
  const onMove = useCallback((intent: MoveIntent) => store.getState().userMove(intent), [store]);

  // One id per game: saving it again (a re-render, a retry) never makes a second copy.
  const clientGameId = useMemo(() => newClientGameId(), [gameKey]);
  const savePayload = useCallback((): SaveGamePayload => {
    const g = store.getState();
    const winner = g.result?.winner;
    return {
      pgn: g.toPgn(),
      clientGameId,
      botId,
      userColor: g.userColor === 'w' ? 'white' : 'black',
      termination: g.result?.reason ?? 'abandoned',
      result: !g.result ? '*' : winner === 'w' ? '1-0' : winner === 'b' ? '0-1' : '1/2-1/2',
    };
  }, [store, clientGameId, botId]);
  const saved = useAutoSave({ over: s.status === 'over', payload: savePayload, api, session });
  const username = useStore(session, (st) => st.user?.username);

  const unlockAudio = () => {
    sounds.current ??= new SoundEngine();
    sounds.current.unlock();
    sounds.current.muted = muted;
  };

  const friendly = s.mode === 'friendly';
  const botSide: Side = s.userColor === 'w' ? 'b' : 'w';
  const topSide = orientation === 'white' ? 'b' : 'w';
  const playerBar = (side: Side) =>
    side === botSide ? (
      <div className="flex items-center gap-2">
        <BotAvatar bot={s.bot} size="sm" />
        <span className="font-semibold">{s.bot.name}</span>
        <span className="tabular text-sm text-text-muted">({s.bot.displayRating})</span>
        {s.thinking && <span className="text-xs text-text-muted">thinking…</span>}
        <span className="ml-auto">
          <CapturedPieces fen={s.fen} side={side} />
        </span>
      </div>
    ) : (
      <div className="flex items-center gap-2">
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-surface-raised text-xs font-bold">
          You
        </span>
        <span className="font-semibold">You</span>
        <span className="ml-auto">
          <CapturedPieces fen={s.fen} side={side} />
        </span>
      </div>
    );

  const winnerText =
    s.result?.winner === null
      ? 'Draw'
      : s.result?.winner === s.userColor
        ? 'You win'
        : `${s.bot.name} wins`;

  // Screen-reader narration: the bot's latest move and the result.
  const engineState = useEngineStatus(Boolean(engine));
  const lastBotMove = [...s.history].reverse().find((m) => m.color === botSide);
  const announcements = [
    lastBotMove && `${s.bot.name} played ${sanToWords(lastBotMove.san)}`,
    s.result && `${winnerText} ${REASON[s.result.reason]}`,
  ].filter((a): a is string => Boolean(a));

  return (
    <div
      className="mx-auto grid max-w-6xl gap-4 px-4 py-4 lg:grid-cols-[minmax(0,38rem)_1fr]"
      onPointerDownCapture={unlockAudio}
      onKeyDownCapture={unlockAudio}
    >
      <section aria-label="Game" className="space-y-2">
        {playerBar(topSide)}
        <div className="flex gap-2">
          {friendly && <EvalBar score={s.evaluation} orientation={orientation} />}
          <div className="flex-1">
            <InteractiveBoard
              key={gameKey}
              fen={s.fen}
              movable={s.status === 'playing' ? s.userColor : 'none'}
              onMove={onMove}
              orientation={orientation}
              lastMove={s.lastMove}
              hintSquare={s.hint}
            />
          </div>
        </div>
        {playerBar(topSide === 'w' ? 'b' : 'w')}
      </section>

      <aside className="flex min-h-0 flex-col gap-3 rounded-(--radius-panel) border border-border bg-surface p-3">
        <div className="flex items-start gap-2">
          <BotAvatar bot={s.bot} size="sm" />
          <p
            role="status"
            aria-label={`${s.bot.name} says`}
            aria-live="polite"
            className="min-h-10 flex-1 rounded-(--radius-control) bg-surface-raised px-3 py-2 text-sm"
          >
            {s.speech ?? '…'}
          </p>
        </div>
        <div className="flex justify-end gap-1 text-xs">
          {(['en', 'hinglish'] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              aria-pressed={s.lang === lang}
              onClick={() => s.setLang(lang)}
              className="min-h-11 cursor-pointer rounded-[4px] px-3 text-text-muted aria-pressed:bg-surface-raised aria-pressed:text-text"
            >
              {lang === 'en' ? 'English' : 'Hinglish'}
            </button>
          ))}
        </div>

        <EngineNotice
          error={s.engineError}
          engineStatus={engineState.status}
          engineMessage={engineState.message}
          onRetry={() => void s.retryEngine()}
        />
        <div role="log" aria-label="Game updates" aria-live="polite" className="sr-only">
          {announcements.map((a, i) => (
            <p key={i}>{a}</p>
          ))}
        </div>
        <OpeningBanner opening={opening} />

        <div className="min-h-32 flex-1 overflow-y-auto">
          <MoveList sans={s.history.map((m) => m.san)} currentPly={s.history.length} />
        </div>

        {s.status === 'over' && s.result && (
          <div className="rounded-(--radius-control) bg-surface-raised p-3 text-center">
            <h2 className="text-lg font-bold">{winnerText}</h2>
            <p className="text-sm text-text-muted">{REASON[s.result.reason]}</p>
            <div className="mt-3 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setGameKey((k) => k + 1)}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-(--radius-control) bg-brand px-4 font-semibold text-on-brand hover:bg-brand-hover"
              >
                <RotateCcw aria-hidden className="size-4" /> New game
              </button>
              <Link
                href={`/review?pgn=${encodeURIComponent(s.toPgn())}`}
                className="inline-flex min-h-11 items-center rounded-(--radius-control) border border-border px-4 font-medium hover:bg-surface"
              >
                Game Review
              </Link>
            </div>
            <SaveNotice state={saved} username={username} />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {friendly && (
            <>
              <ControlButton
                label="Hint"
                onClick={() => void s.requestHint()}
                disabled={s.status !== 'playing' || s.thinking}
              >
                <Lightbulb aria-hidden className="size-4" />
              </ControlButton>
              <ControlButton
                label="Take back"
                onClick={() => s.takeback()}
                disabled={s.status !== 'playing' || s.history.length === 0}
              >
                <Undo2 aria-hidden className="size-4" />
              </ControlButton>
            </>
          )}
          <ControlButton
            label="Flip board"
            onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
          >
            <FlipVertical2 aria-hidden className="size-4" />
          </ControlButton>
          <ControlButton
            label={muted ? 'Unmute' : 'Mute'}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              writeMuted(next);
              if (sounds.current) sounds.current.muted = next;
            }}
          >
            {muted ? (
              <VolumeX aria-hidden className="size-4" />
            ) : (
              <Volume2 aria-hidden className="size-4" />
            )}
          </ControlButton>
          <ControlButton
            label="Resign"
            onClick={() => s.resign()}
            disabled={s.status !== 'playing'}
            danger
          >
            <Flag aria-hidden className="size-4" />
          </ControlButton>
        </div>
      </aside>
    </div>
  );
}

/** What happened to the finished game: saved, saving, or why not. */
function SaveNotice({
  state,
  username,
}: {
  state: ReturnType<typeof useAutoSave>;
  username: string | undefined;
}) {
  const link = 'font-medium text-brand underline-offset-2 hover:underline';
  return (
    <p className="mt-3 text-sm text-text-muted" aria-live="polite">
      {state.status === 'saving' && 'Saving to your archive…'}
      {state.status === 'saved' && username && (
        <Link href={`/profile/${username}`} className={link}>
          Saved to your archive
        </Link>
      )}
      {state.status === 'signed-out' && (
        <Link href="/login?next=/play/bots" className={link}>
          Log in to save your games
        </Link>
      )}
      {state.status === 'error' && (
        <>
          Could not save this game ({state.message}).{' '}
          <button type="button" onClick={state.retry} className={`${link} cursor-pointer`}>
            Retry save
          </button>
        </>
      )}
    </p>
  );
}

function ControlButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-(--radius-control) border border-border bg-surface-raised px-3 text-sm font-medium transition-colors duration-(--duration-base) disabled:cursor-not-allowed disabled:opacity-50 ${
        danger ? 'hover:bg-danger hover:text-on-danger' : 'hover:bg-border'
      }`}
    >
      {children}
      {label}
    </button>
  );
}

/**
 * Engine loading/error state: the game's own error, or the shared worker's (e.g. it crashed
 * between moves). Either one shows a Retry (plan Review Focus 3).
 */
export function EngineNotice({
  error,
  engineStatus,
  engineMessage,
  onRetry,
}: {
  error: string | null;
  engineStatus: EngineStatus;
  engineMessage: string | null;
  onRetry: () => void;
}) {
  const message = error ?? (engineStatus === 'error' ? (engineMessage ?? 'unknown error') : null);
  if (message) {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-2 rounded-(--radius-control) border border-danger px-3 py-2 text-sm"
      >
        <span>The engine stopped: {message}</span>
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 cursor-pointer rounded-[4px] bg-danger px-3 font-semibold text-on-danger"
        >
          Retry
        </button>
      </div>
    );
  }
  if (engineStatus === 'loading') {
    return <p className="text-sm text-text-muted">Loading the engine…</p>;
  }
  return null;
}

/** Shared worker state; an injected (test) engine counts as always ready. */
function useEngineStatus(injected: boolean): { status: EngineStatus; message: string | null } {
  const status = useStore(engineStore(), (st) => st.status);
  const message = useStore(engineStore(), (st) => st.error);
  return injected ? { status: 'ready', message: null } : { status, message };
}
