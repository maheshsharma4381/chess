'use client';

import { Eraser } from 'lucide-react';
import { useState } from 'react';
import { pieceSrc } from '@/components/board/PieceLayer';
import {
  editorFen,
  emptyPosition,
  positionFromFen,
  validateEditorPosition,
  type EditorPosition,
  type PieceChar,
} from '@/lib/analysis/editor';
import { BOARD_THEMES } from '@/lib/design/tokens';
import type { Orientation } from '@/lib/board/squares';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const NAMES: Record<string, string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
};
const PALETTE: PieceChar[][] = [
  ['K', 'Q', 'R', 'B', 'N', 'P'],
  ['k', 'q', 'r', 'b', 'n', 'p'],
];
const CASTLING = [
  ['K', 'White O-O'],
  ['Q', 'White O-O-O'],
  ['k', 'Black O-O'],
  ['q', 'Black O-O-O'],
] as const;

const colorOf = (p: PieceChar) => (p === p.toUpperCase() ? 'w' : 'b');
const pieceName = (p: PieceChar) =>
  `${colorOf(p) === 'w' ? 'white' : 'black'} ${NAMES[p.toLowerCase()]}`;
const capitalised = (s: string) => s[0]!.toUpperCase() + s.slice(1);

type Tool = PieceChar | 'erase';

export interface BoardEditorProps {
  initialFen: string;
  orientation: Orientation;
  onDone: (fen: string) => void;
  onCancel: () => void;
}

/** Set up a position (plan ruling R5): palette, eraser, side to move, castling rights. */
export function BoardEditor({ initialFen, orientation, onDone, onCancel }: BoardEditorProps) {
  const [pos, setPos] = useState<EditorPosition>(() => positionFromFen(initialFen));
  const [tool, setTool] = useState<Tool>('P');
  const [error, setError] = useState<string | null>(null);

  const edit = (next: EditorPosition) => {
    setPos(next);
    setError(null);
  };
  const apply = (square: string) => {
    const pieces = { ...pos.pieces };
    if (tool === 'erase') delete pieces[square];
    else pieces[square] = tool;
    edit({ ...pos, pieces });
  };
  const finish = () => {
    const problem = validateEditorPosition(pos);
    if (problem) setError(problem);
    else onDone(editorFen(pos));
  };

  const ranks = orientation === 'white' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === 'white' ? 'abcdefgh' : 'hgfedcba';
  const theme = BOARD_THEMES.green;
  const toolButton =
    'inline-flex size-11 cursor-pointer items-center justify-center rounded-(--radius-control) border border-transparent hover:bg-surface-raised aria-pressed:border-brand aria-pressed:bg-surface-raised';
  const actionButton =
    'min-h-11 cursor-pointer rounded-(--radius-control) border border-border bg-surface-raised px-3 text-sm hover:bg-border';

  return (
    <section aria-label="Board editor" className="space-y-3">
      <div className="space-y-1">
        {PALETTE.map((row) => (
          <div key={row[0]} className="flex flex-wrap gap-1">
            {row.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={tool === p}
                aria-label={capitalised(pieceName(p))}
                onClick={() => setTool(p)}
                className={toolButton}
              >
                <img src={pieceSrc(colorOf(p), p)} alt="" className="size-9" />
              </button>
            ))}
            {row[0] === 'K' && (
              <button
                type="button"
                aria-pressed={tool === 'erase'}
                aria-label="Eraser"
                onClick={() => setTool('erase')}
                className={toolButton}
              >
                <Eraser aria-hidden className="size-5" />
              </button>
            )}
          </div>
        ))}
      </div>

      <div
        role="group"
        aria-label="Squares"
        className="grid aspect-square w-full grid-cols-8 overflow-hidden rounded-(--radius-control)"
      >
        {ranks.flatMap((rank) =>
          [...files].map((file) => {
            const square = `${file}${rank}`;
            const piece = pos.pieces[square];
            // a1 is dark: light squares have an even file index + rank.
            const light = ('abcdefgh'.indexOf(file) + rank) % 2 === 0;
            return (
              <button
                key={square}
                type="button"
                aria-label={`${square}, ${piece ? pieceName(piece) : 'empty'}`}
                onClick={() => apply(square)}
                style={{ backgroundColor: light ? theme.light : theme.dark }}
                className="relative cursor-pointer focus-visible:z-10"
              >
                {piece && (
                  <img
                    src={pieceSrc(colorOf(piece), piece)}
                    alt=""
                    draggable={false}
                    className="absolute inset-0 size-full"
                  />
                )}
              </button>
            );
          }),
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div role="group" aria-label="Side to move" className="flex gap-1">
          {(['w', 'b'] as const).map((turn) => (
            <button
              key={turn}
              type="button"
              aria-pressed={pos.turn === turn}
              onClick={() => edit({ ...pos, turn })}
              className="min-h-11 cursor-pointer rounded-(--radius-control) px-3 text-text-muted hover:bg-surface-raised aria-pressed:bg-surface-raised aria-pressed:text-text"
            >
              {turn === 'w' ? 'White to move' : 'Black to move'}
            </button>
          ))}
        </div>
        <fieldset className="flex flex-wrap gap-x-3">
          <legend className="sr-only">Castling rights</legend>
          {CASTLING.map(([letter, label]) => (
            <label key={letter} className="inline-flex min-h-11 items-center gap-1.5">
              <input
                type="checkbox"
                checked={pos.castling.includes(letter)}
                onChange={(e) =>
                  edit({
                    ...pos,
                    castling: e.target.checked
                      ? pos.castling + letter
                      : pos.castling.replace(letter, ''),
                  })
                }
                className="size-4 accent-brand"
              />
              {label}
            </label>
          ))}
        </fieldset>
      </div>

      {error && (
        <p role="alert" className="rounded-(--radius-control) border border-danger p-2 text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => edit(emptyPosition())} className={actionButton}>
          Clear board
        </button>
        <button
          type="button"
          onClick={() => edit(positionFromFen(START_FEN))}
          className={actionButton}
        >
          Start position
        </button>
        <button type="button" onClick={onCancel} className={actionButton}>
          Cancel
        </button>
        <button
          type="button"
          onClick={finish}
          className="min-h-11 cursor-pointer rounded-(--radius-control) bg-brand px-3 text-sm font-semibold text-on-brand hover:bg-brand-hover"
        >
          Analyse position
        </button>
      </div>
    </section>
  );
}
