'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { ApiError, api as defaultApi, type Api } from '@/lib/api/client';
import { sessionStore, type SessionState } from '@/lib/api/session';
import { AVATAR_COLORS, Avatar, avatarColor } from './Avatar';

interface PublicUser {
  username: string;
  displayName: string;
  country: string | null;
  bio: string | null;
  avatar: string;
  createdAt: string;
}
type Ratings = Record<string, { rating: number; rd: number; games: number }>;
interface Stats {
  total: number;
  wins: number;
  draws: number;
  losses: number;
}
interface ArchivedGame {
  id: string;
  whiteName: string;
  blackName: string;
  userColor: 'white' | 'black' | null;
  pgn: string;
  result: string;
  termination: string;
  plies: number;
  playedAt: string;
}

const POOLS: [string, string][] = [
  ['bullet', 'Bullet'],
  ['blitz', 'Blitz'],
  ['rapid', 'Rapid'],
  ['daily', 'Daily'],
  ['puzzle', 'Puzzles'],
];
const PAGE = 20;
const plural = (n: number, word: string) =>
  `${n} ${word}${n === 1 ? '' : word === 'loss' ? 'es' : 's'}`;

function outcome(game: ArchivedGame): 'Win' | 'Loss' | 'Draw' | 'Unfinished' {
  if (game.result === '1/2-1/2') return 'Draw';
  if (game.result === '*' || !game.userColor) return 'Unfinished';
  return (game.result === '1-0') === (game.userColor === 'white') ? 'Win' : 'Loss';
}
const OUTCOME_CLASS = {
  Win: 'bg-brand text-on-brand',
  Loss: 'bg-danger text-on-danger',
  Draw: 'bg-surface-raised text-text',
  Unfinished: 'bg-surface-raised text-text-muted',
} as const;

export interface ProfileViewProps {
  username: string;
  api?: Api;
  session?: StoreApi<SessionState>;
}

/** A player's profile: ratings per pool, record, and their saved games. */
export function ProfileView({
  username,
  api = defaultApi,
  session = sessionStore(),
}: ProfileViewProps) {
  const me = useStore(session, (s) => s.user?.username);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [ratings, setRatings] = useState<Ratings>({});
  const [stats, setStats] = useState<Stats | null>(null);
  const [games, setGames] = useState<ArchivedGame[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const name = username.toLowerCase();

  useEffect(() => {
    if (session.getState().status === 'loading') void session.getState().load();
  }, [session]);

  useEffect(() => {
    let live = true;
    Promise.all([
      api<{ user: PublicUser; ratings: Ratings }>(`/users/${name}`),
      api<Stats>(`/users/${name}/stats`),
      api<{ games: ArchivedGame[]; nextCursor: string | null }>(
        `/users/${name}/games?limit=${PAGE}`,
      ),
    ]).then(
      ([profile, record, page]) => {
        if (!live) return;
        setUser(profile.user);
        setRatings(profile.ratings);
        setStats(record);
        setGames(page.games);
        setCursor(page.nextCursor);
      },
      (err) => {
        if (!live) return;
        setError(
          err instanceof ApiError && err.status === 404 && !err.unavailable
            ? 'No such player.'
            : 'This profile could not be loaded.',
        );
      },
    );
    return () => {
      live = false;
    };
  }, [api, name]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    const page = await api<{ games: ArchivedGame[]; nextCursor: string | null }>(
      `/users/${name}/games?limit=${PAGE}&cursor=${cursor}`,
    );
    setGames((g) => [...g, ...page.games]);
    setCursor(page.nextCursor);
  }, [api, cursor, name]);

  if (error) {
    return (
      <p className="rounded-(--radius-control) border border-border bg-surface p-4">{error}</p>
    );
  }
  if (!user || !stats) {
    return (
      <p role="status" className="text-text-muted">
        Loading profile…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex items-start gap-4">
        <Avatar avatar={user.avatar} name={user.displayName} />
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl font-bold">{user.displayName}</h1>
          <p className="text-sm text-text-muted">
            @{user.username}
            {user.country && <> · {user.country}</>} · joined{' '}
            {new Date(user.createdAt).toLocaleDateString('en', { month: 'short', year: 'numeric' })}
          </p>
          {user.bio && <p className="text-sm">{user.bio}</p>}
        </div>
        {me === user.username && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-11 cursor-pointer rounded-(--radius-control) border border-border bg-surface-raised px-3 text-sm hover:bg-border"
          >
            Edit profile
          </button>
        )}
      </section>

      {editing && (
        <EditProfile
          user={user}
          api={api}
          onCancel={() => setEditing(false)}
          onSaved={(next) => {
            setUser((u) => (u ? { ...u, ...next } : u));
            setEditing(false);
          }}
        />
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <table aria-label="Ratings" className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-text-muted">
              <th className="py-1 font-medium">Pool</th>
              <th className="py-1 text-right font-medium">Rating</th>
              <th className="py-1 text-right font-medium">Games</th>
            </tr>
          </thead>
          <tbody>
            {POOLS.map(([pool, label]) => {
              const r = ratings[pool];
              return (
                <tr key={pool} className="border-t border-border">
                  <th scope="row" className="py-2 text-left font-medium">
                    {label}
                  </th>
                  <td className="tabular py-2 text-right">{r?.rating ?? '—'}</td>
                  <td className="tabular py-2 text-right text-text-muted">{r?.games ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="rounded-(--radius-panel) border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-text-muted">Saved games</h2>
          <p className="tabular text-3xl font-bold">{stats.total}</p>
          <p className="text-sm">
            {plural(stats.wins, 'win')} · {plural(stats.draws, 'draw')} ·{' '}
            {plural(stats.losses, 'loss')}
          </p>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Games</h2>
        {games.length === 0 ? (
          <p className="text-sm text-text-muted">No saved games yet.</p>
        ) : (
          <ol
            aria-label="Games"
            className="divide-y divide-border rounded-(--radius-panel) border border-border bg-surface"
          >
            {games.map((g) => {
              const o = outcome(g);
              return (
                <li key={g.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <span
                    className={`w-20 rounded-[4px] px-2 py-0.5 text-center text-xs font-semibold ${OUTCOME_CLASS[o]}`}
                  >
                    {o}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {g.whiteName} vs {g.blackName}
                    </span>
                    <span className="block text-xs text-text-muted">
                      {g.result} · {g.termination} · {Math.ceil(g.plies / 2)} moves ·{' '}
                      {new Date(g.playedAt).toLocaleDateString('en', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </span>
                  <Link
                    href={`/review?pgn=${encodeURIComponent(g.pgn)}`}
                    className="inline-flex min-h-11 items-center rounded-(--radius-control) px-3 font-medium text-brand hover:bg-surface-raised"
                  >
                    Review
                  </Link>
                  <Link
                    href={`/analysis?pgn=${encodeURIComponent(g.pgn)}`}
                    className="inline-flex min-h-11 items-center rounded-(--radius-control) px-3 text-text-muted hover:bg-surface-raised"
                  >
                    Analyse
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
        {cursor && (
          <button
            type="button"
            onClick={() => void loadMore()}
            className="min-h-11 cursor-pointer rounded-(--radius-control) border border-border bg-surface-raised px-4 text-sm hover:bg-border"
          >
            Load more games
          </button>
        )}
      </section>
    </div>
  );
}

function EditProfile({
  user,
  api,
  onSaved,
  onCancel,
}: {
  user: PublicUser;
  api: Api;
  onSaved: (next: Partial<PublicUser>) => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const [form, setForm] = useState({
    displayName: user.displayName,
    country: user.country ?? '',
    bio: user.bio ?? '',
    avatar: user.avatar,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const { user: saved } = await api<{ user: Partial<PublicUser> }>('/me', {
        method: 'PATCH',
        json: {
          displayName: form.displayName,
          country: form.country.trim() ? form.country.trim() : null,
          bio: form.bio.trim() ? form.bio : null,
          avatar: form.avatar,
        },
      });
      onSaved(saved);
    } catch (err) {
      setErrors(
        err instanceof ApiError && err.details ? err.details : { form: (err as Error).message },
      );
    } finally {
      setBusy(false);
    }
  };

  const input = 'min-h-11 w-full rounded-(--radius-control) border border-border bg-bg px-3';
  const described = (key: string) =>
    errors[key] ? { 'aria-invalid': true, 'aria-describedby': `${ids}-${key}-error` } : {};
  const errorText = (key: string) =>
    errors[key] && (
      <p id={`${ids}-${key}-error`} className="text-sm">
        {errors[key]}
      </p>
    );

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-(--radius-panel) border border-border bg-surface p-4"
    >
      {errors['form'] && <p role="alert">{errors['form']}</p>}
      <div className="space-y-1">
        <label htmlFor={`${ids}-name`} className="text-sm font-medium">
          Display name
        </label>
        <input
          id={`${ids}-name`}
          value={form.displayName}
          maxLength={40}
          onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
          className={input}
          {...described('displayName')}
        />
        {errorText('displayName')}
      </div>
      <div className="space-y-1">
        <label htmlFor={`${ids}-country`} className="text-sm font-medium">
          Country code
        </label>
        <input
          id={`${ids}-country`}
          value={form.country}
          maxLength={2}
          placeholder="IN"
          onChange={(e) => setForm((f) => ({ ...f, country: e.target.value.toUpperCase() }))}
          className={`${input} w-24 uppercase`}
          {...described('country')}
        />
        {errorText('country')}
      </div>
      <div className="space-y-1">
        <label htmlFor={`${ids}-bio`} className="text-sm font-medium">
          Bio
        </label>
        <textarea
          id={`${ids}-bio`}
          value={form.bio}
          maxLength={200}
          rows={2}
          onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
          className={`${input} py-2`}
          {...described('bio')}
        />
        {errorText('bio')}
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Avatar</legend>
        <div role="radiogroup" className="flex flex-wrap gap-2">
          {AVATAR_COLORS.map((_, i) => {
            const id = `avatar-${String(i + 1).padStart(2, '0')}`;
            const { bg } = avatarColor(id);
            return (
              <label key={id} className="cursor-pointer">
                <input
                  type="radio"
                  name="avatar"
                  value={id}
                  aria-label={`Avatar ${i + 1}`}
                  checked={form.avatar === id}
                  onChange={() => setForm((f) => ({ ...f, avatar: id }))}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className="block size-11 rounded-full ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-text peer-focus-visible:ring-2 peer-focus-visible:ring-brand"
                  style={{ backgroundColor: bg }}
                />
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 cursor-pointer rounded-(--radius-control) bg-brand px-4 font-semibold text-on-brand hover:bg-brand-hover disabled:opacity-60"
        >
          Save profile
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 cursor-pointer rounded-(--radius-control) border border-border px-4 hover:bg-surface-raised"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
