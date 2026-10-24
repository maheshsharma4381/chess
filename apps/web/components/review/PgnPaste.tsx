'use client';

import { Chess } from 'chess.js';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { parsePgn } from '@chess/chess-core';

/** Returns an error message, or null when the PGN replays cleanly. */
function validate(pgn: string): string | null {
  if (!pgn.trim()) return 'Paste a game in PGN format to review it.';
  const { startFen, sans } = parsePgn(pgn);
  let chess: Chess;
  try {
    chess = startFen ? new Chess(startFen) : new Chess();
  } catch {
    return 'The FEN header is not a valid position.';
  }
  for (const [i, san] of sans.entries()) {
    try {
      chess.move(san);
    } catch {
      return `Illegal move "${san}" at ply ${i + 1}.`;
    }
  }
  return null;
}

export function PgnPaste() {
  const router = useRouter();
  const [pgn, setPgn] = useState('');
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = validate(pgn);
    setError(problem);
    if (!problem) router.push(`/review?pgn=${encodeURIComponent(pgn.trim())}`);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor={id} className="block font-semibold">
        PGN
      </label>
      <textarea
        id={id}
        value={pgn}
        onChange={(e) => setPgn(e.target.value)}
        rows={8}
        placeholder={'[Event "Casual"]\n\n1. e4 e5 2. Nf3 Nc6 *'}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="tabular w-full rounded-(--radius-control) border border-border bg-bg p-3 font-mono text-sm"
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="inline-flex min-h-12 cursor-pointer items-center rounded-(--radius-control) bg-brand px-6 font-semibold text-on-brand hover:bg-brand-hover"
      >
        Review game
      </button>
    </form>
  );
}
