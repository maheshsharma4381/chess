'use client';

import { useEffect } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { ApiError, api as defaultApi, type Api } from './client';

export interface SessionUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  country?: string | null;
  bio?: string | null;
  avatar?: string;
  settings?: Record<string, unknown>;
}

export type SessionStatus = 'loading' | 'signed-in' | 'signed-out' | 'unavailable';

export interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
  load(): Promise<void>;
  signIn(email: string, password: string): Promise<SessionUser>;
  signUp(input: { email: string; password: string; username: string }): Promise<SessionUser>;
  signOut(): Promise<void>;
  setUser(user: SessionUser): void;
}

/** Who is signed in. `unavailable` means the site runs without an accounts server. */
export function createSessionStore(api: Api = defaultApi): StoreApi<SessionState> {
  return createStore<SessionState>()((set) => ({
    status: 'loading',
    user: null,
    async load() {
      try {
        const { user } = await api<{ user: SessionUser }>('/me');
        set({ status: 'signed-in', user });
      } catch (err) {
        const unavailable = err instanceof ApiError && err.unavailable;
        set({ status: unavailable ? 'unavailable' : 'signed-out', user: null });
      }
    },
    async signIn(email, password) {
      const { user } = await api<{ user: SessionUser }>('/auth/login', {
        method: 'POST',
        json: { email, password },
      });
      set({ status: 'signed-in', user });
      return user;
    },
    async signUp(input) {
      const { user } = await api<{ user: SessionUser }>('/auth/signup', {
        method: 'POST',
        json: input,
      });
      set({ status: 'signed-in', user });
      return user;
    },
    async signOut() {
      try {
        await api('/auth/logout', { method: 'POST' });
      } finally {
        set({ status: 'signed-out', user: null });
      }
    },
    setUser(user) {
      set({ status: 'signed-in', user });
    },
  }));
}

let shared: StoreApi<SessionState> | null = null;
export function sessionStore(): StoreApi<SessionState> {
  shared ??= createSessionStore();
  return shared;
}

/** The session, loaded on first use. */
export function useSession(store: StoreApi<SessionState> = sessionStore()): SessionState {
  const state = useStore(store);
  useEffect(() => {
    if (store.getState().status === 'loading') void store.getState().load();
  }, [store]);
  return state;
}
