'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';
import type { Api } from '@/lib/api/client';
import type { SessionState } from '@/lib/api/session';

export interface SaveGamePayload {
  pgn: string;
  clientGameId: string;
  botId: string;
  userColor: 'white' | 'black';
  termination: string;
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
}

export type SaveState =
  | { status: 'idle' | 'saving' | 'signed-out' | 'unavailable' }
  | { status: 'saved'; gameId: string }
  | { status: 'error'; message: string };

/** A stable id per game, so a repeated save is recognised by the server (idempotent). */
export const newClientGameId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Saves the finished game once for a signed-in player. `payload` is read when the game ends;
 * the save is keyed by its clientGameId so re-renders never post twice.
 */
export function useAutoSave(opts: {
  over: boolean;
  payload: () => SaveGamePayload;
  api: Api;
  session: StoreApi<SessionState>;
}): SaveState & { retry: () => void } {
  const session = useStore(opts.session);
  const [state, setState] = useState<SaveState>({ status: 'idle' });
  const savedFor = useRef<string | null>(null);
  const { api, payload, over } = opts;

  const save = useCallback(async () => {
    const body = payload();
    savedFor.current = body.clientGameId;
    setState({ status: 'saving' });
    try {
      const { game } = await api<{ game: { id: string } }>('/games', {
        method: 'POST',
        json: body,
      });
      setState({ status: 'saved', gameId: game.id });
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }, [api, payload]);

  useEffect(() => {
    if (!over) {
      setState({ status: 'idle' });
      return;
    }
    if (session.status === 'signed-out') return setState({ status: 'signed-out' });
    if (session.status === 'unavailable') return setState({ status: 'unavailable' });
    if (session.status !== 'signed-in') return;
    if (savedFor.current === payload().clientGameId) return;
    void save();
  }, [over, session.status, payload, save]);

  return { ...state, retry: () => void save() };
}
