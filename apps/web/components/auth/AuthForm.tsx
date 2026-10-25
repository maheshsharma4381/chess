'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, type FormEvent } from 'react';
import type { StoreApi } from 'zustand';
import { ApiError, api as defaultApi, type Api } from '@/lib/api/client';
import { sessionStore, type SessionState } from '@/lib/api/session';

const GOOGLE_ERRORS: Record<string, string> = {
  google_state: 'Google sign-in expired or was interrupted. Please try again.',
  google_unverified: 'Your Google account email is not verified, so it cannot be used to sign in.',
  google_failed: 'Google sign-in failed. Please try again.',
  google_cancelled: 'Google sign-in was cancelled.',
};

type Field = 'email' | 'username' | 'password';

export interface AuthFormProps {
  mode: 'login' | 'signup';
  /** Where to go afterwards (only same-site paths are honoured). */
  next?: string;
  /** An error code from the Google redirect (?error=…). */
  error?: string;
  api?: Api;
  store?: StoreApi<SessionState>;
}

const safeNext = (next?: string) =>
  next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

/** Sign-up and log-in, with field errors next to their fields and Google when the server offers it. */
export function AuthForm({
  mode,
  next,
  error,
  api = defaultApi,
  store = sessionStore(),
}: AuthFormProps) {
  const router = useRouter();
  const ids = useId();
  const [values, setValues] = useState({ email: '', username: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(
    error ? (GOOGLE_ERRORS[error] ?? null) : null,
  );
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<{ google: boolean } | 'unavailable' | null>(null);
  const signup = mode === 'signup';

  useEffect(() => {
    let live = true;
    api<{ google: boolean }>('/auth/providers').then(
      (p) => live && setProviders(p),
      (err) =>
        live &&
        setProviders(
          err instanceof ApiError && err.unavailable ? 'unavailable' : { google: false },
        ),
    );
    return () => {
      live = false;
    };
  }, [api]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errors: Partial<Record<Field, string>> = {};
    if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = 'Enter a valid email address';
    if (signup && !/^[A-Za-z0-9_]{3,20}$/.test(values.username.trim())) {
      errors.username = '3-20 letters, digits or underscores';
    }
    if (signup ? values.password.length < 8 : values.password.length === 0) {
      errors.password = signup ? 'At least 8 characters' : 'Enter your password';
    }
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const state = store.getState();
      if (signup) {
        await state.signUp({
          email: values.email.trim(),
          password: values.password,
          username: values.username.trim(),
        });
      } else {
        await state.signIn(values.email.trim(), values.password);
      }
      router.push(safeNext(next));
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        const fromServer: Partial<Record<Field, string>> = {};
        for (const field of ['email', 'username', 'password'] as const) {
          if (err.details[field]) fromServer[field] = err.details[field];
        }
        if (Object.keys(fromServer).length) setFieldErrors(fromServer);
        else setFormError(err.message);
      } else {
        setFormError(err instanceof Error ? err.message : 'Something went wrong');
      }
    } finally {
      setBusy(false);
    }
  };

  if (providers === 'unavailable') {
    return (
      <p className="rounded-(--radius-control) border border-border bg-surface p-4 text-text-muted">
        Accounts are not available on this site right now. You can still play, review and analyse
        games without one.
      </p>
    );
  }

  const field = (name: Field, label: string, type: string, autoComplete: string) => {
    const id = `${ids}-${name}`;
    const message = fieldErrors[name];
    return (
      <div className="space-y-1">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <input
          id={id}
          type={type}
          autoComplete={autoComplete}
          value={values[name]}
          onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? `${id}-error` : undefined}
          className="min-h-11 w-full rounded-(--radius-control) border border-border bg-bg px-3 aria-invalid:border-danger"
        />
        {message && (
          <p id={`${id}-error`} className="text-sm text-text">
            <span aria-hidden className="mr-1 font-semibold text-danger">
              !
            </span>
            {message}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {formError && (
        <p role="alert" className="rounded-(--radius-control) border border-danger p-3 text-sm">
          {formError}
        </p>
      )}
      <form noValidate onSubmit={submit} className="space-y-3">
        {field('email', 'Email', 'email', 'email')}
        {signup && field('username', 'Username', 'text', 'username')}
        {field('password', 'Password', 'password', signup ? 'new-password' : 'current-password')}
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 w-full cursor-pointer rounded-(--radius-control) bg-brand px-4 font-semibold text-on-brand hover:bg-brand-hover disabled:cursor-wait disabled:opacity-60"
        >
          {signup ? 'Create account' : 'Log in'}
        </button>
      </form>
      {providers !== null && providers.google && (
        <a
          href="/api/v1/auth/google/start"
          className="flex min-h-11 w-full items-center justify-center rounded-(--radius-control) border border-border bg-surface-raised px-4 font-medium hover:bg-border"
        >
          Continue with Google
        </a>
      )}
      <p className="text-sm text-text-muted">
        {signup ? 'Already have an account? ' : 'New here? '}
        <Link
          href={signup ? '/login' : '/signup'}
          className="font-medium text-brand underline-offset-2 hover:underline"
        >
          {signup ? 'Log in' : 'Create an account'}
        </Link>
      </p>
    </div>
  );
}
