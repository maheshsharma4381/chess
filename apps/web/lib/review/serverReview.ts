'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import type { ReviewReport } from '@chess/types';
import { ApiError, type Api } from '@/lib/api/client';
import { browserReviewKey } from '@/lib/api/reviewKey';
import type { SessionState } from '@/lib/api/session';
import { DEEP_DEPTH } from './reviewStore';

interface ReviewAnswer {
  status: 'queued' | 'active' | 'done' | 'failed';
  id: string;
  progress?: { done: number; total: number } | null;
  report?: ReviewReport;
  error?: string;
}

export type ServerReviewState =
  | { status: 'idle' }
  | { status: 'running'; progress: { done: number; total: number } | null }
  | { status: 'failed'; message: string };

/**
 * Game Review on apps/server for signed-in players: a cached deep report is picked up as
 * soon as the page opens, and `request()` queues one and polls until it is ready.
 */
export function useServerReview(opts: {
  pgn: string;
  api: Api;
  session: StoreApi<SessionState>;
  onReport: (report: ReviewReport, depth: number) => void;
  pollMs?: number;
}) {
  const { pgn, api, onReport, pollMs = 1500 } = opts;
  const signedIn = useStore(opts.session, (s) => s.status === 'signed-in');
  const [state, setState] = useState<ServerReviewState>({ status: 'idle' });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // A cached deep report: show it instead of waiting for the browser.
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    void (async () => {
      try {
        const key = await browserReviewKey(pgn);
        const answer = await api<ReviewAnswer>(`/reviews/${key}-${DEEP_DEPTH}`);
        if (live && answer.status === 'done' && answer.report) onReport(answer.report, DEEP_DEPTH);
      } catch {
        // Not cached (404), or no server: the browser review carries on.
      }
    })();
    return () => {
      live = false;
    };
  }, [signedIn, pgn, api, onReport]);

  const request = useCallback(async () => {
    setState({ status: 'running', progress: null });
    try {
      let answer = await api<ReviewAnswer>('/reviews', {
        method: 'POST',
        json: { pgn, depth: DEEP_DEPTH },
      });
      while (alive.current && (answer.status === 'queued' || answer.status === 'active')) {
        setState({ status: 'running', progress: answer.progress ?? null });
        await new Promise((r) => setTimeout(r, pollMs));
        answer = await api<ReviewAnswer>(`/reviews/${answer.id}`);
      }
      if (!alive.current) return;
      if (answer.status === 'done' && answer.report) {
        onReport(answer.report, DEEP_DEPTH);
        setState({ status: 'idle' });
      } else {
        setState({
          status: 'failed',
          message: answer.error ?? 'The review could not be completed',
        });
      }
    } catch (err) {
      if (!alive.current) return;
      const message =
        err instanceof ApiError && err.status === 429
          ? 'You have asked for many reviews this hour. Try again later.'
          : err instanceof Error
            ? err.message
            : 'The review could not be completed';
      setState({ status: 'failed', message });
    }
  }, [api, pgn, pollMs, onReport]);

  return { signedIn, state, request, reset: () => setState({ status: 'idle' }) };
}
