'use client';

import Link from 'next/link';
import type { StoreApi } from 'zustand';
import { sessionStore, useSession, type SessionState } from '@/lib/api/session';

const item =
  'inline-flex min-h-11 items-center rounded-(--radius-control) px-3 text-sm font-medium text-text-muted transition-colors duration-(--duration-base) hover:bg-surface-raised hover:text-text';

/** Header account links; renders nothing until the session is known or when accounts are off. */
export function UserMenu({ store = sessionStore() }: { store?: StoreApi<SessionState> }) {
  const session = useSession(store);
  if (session.status === 'loading' || session.status === 'unavailable') return null;
  if (session.status === 'signed-out' || !session.user) {
    return (
      <div className="flex items-center gap-1">
        <Link href="/login" className={item}>
          Log in
        </Link>
        <Link
          href="/signup"
          className="inline-flex min-h-11 items-center rounded-(--radius-control) bg-brand px-3 text-sm font-semibold text-on-brand hover:bg-brand-hover"
        >
          Sign up
        </Link>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Link href={`/profile/${session.user.username}`} className={`${item} text-text`}>
        {session.user.username}
      </Link>
      <button
        type="button"
        onClick={() => void session.signOut()}
        className={`${item} cursor-pointer`}
      >
        Log out
      </button>
    </div>
  );
}
