'use client';

import { Clipboard, Film } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Orientation } from '@/lib/board/squares';

type Frames = ReadonlyArray<readonly [string, string] | null>;

const defaultMakeGif = async (
  fens: readonly string[],
  lastMoves: Frames,
  orientation: Orientation,
) => {
  // gifenc and the piece images load only when someone asks for a GIF.
  const { encodeGameGif, loadPieceImages } = await import('@/lib/export/gif');
  return encodeGameGif(fens, lastMoves, { images: await loadPieceImages(), orientation });
};

function defaultDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export interface ExportMenuProps {
  pgn: string;
  fen: string;
  /** Every position of the game, for the GIF, and the move that led to each. */
  fens: readonly string[];
  lastMoves: Frames;
  orientation?: Orientation;
  /** Injected in tests. */
  makeGif?: typeof defaultMakeGif;
  download?: (blob: Blob, name: string) => void;
}

const TOAST_MS = 4000;

/** Copy PGN, copy FEN, download an animated GIF (spec 5.5 export). */
export function ExportMenu({
  pgn,
  fen,
  fens,
  lastMoves,
  orientation = 'white',
  makeGif = defaultMakeGif,
  download = defaultDownload,
}: ExportMenuProps) {
  const [toast, setToast] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const notify = (message: string) => {
    setToast(message);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${what} copied`);
    } catch {
      notify(`Could not copy the ${what}. Your browser blocked the clipboard.`);
    }
  };

  const gif = async () => {
    setRendering(true);
    try {
      const bytes = await makeGif(fens, lastMoves, orientation);
      download(new Blob([bytes as BlobPart], { type: 'image/gif' }), 'chess-game.gif');
      notify('GIF downloaded');
    } catch (err) {
      notify(`Could not make the GIF: ${(err as Error).message}`);
    } finally {
      setRendering(false);
    }
  };

  const button =
    'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-(--radius-control) border border-border bg-surface-raised px-3 text-sm hover:bg-border disabled:cursor-wait disabled:opacity-60';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void copy(pgn, 'PGN')} className={button}>
          <Clipboard aria-hidden className="size-4" /> Copy PGN
        </button>
        <button type="button" onClick={() => void copy(fen, 'FEN')} className={button}>
          <Clipboard aria-hidden className="size-4" /> Copy FEN
        </button>
        <button type="button" onClick={() => void gif()} disabled={rendering} className={button}>
          <Film aria-hidden className="size-4" /> {rendering ? 'Rendering GIF…' : 'Download GIF'}
        </button>
      </div>
      <p role="status" className="min-h-5 text-sm text-text-muted">
        {toast}
      </p>
    </div>
  );
}
