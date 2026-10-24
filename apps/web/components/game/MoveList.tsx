import type { MoveClassification } from '@chess/types';
import { ClassificationBadge } from '../board/ClassificationBadge';

export interface MoveListProps {
  sans: readonly string[];
  /** 1-based ply currently shown (0 = start position). */
  currentPly: number;
  classifications?: ReadonlyArray<MoveClassification | undefined>;
  onSelectPly?: (ply: number) => void;
  /** Where the game started: its side to move and move number set the numbering. */
  startFen?: string;
}

/** Move number and side to move of a FEN (defaults: move 1, White). */
export function fenStart(fen?: string): { number: number; blackFirst: boolean } {
  const [, turn = 'w', , , , full = '1'] = (fen ?? '').trim().split(/\s+/);
  return { number: Math.max(1, Number(full) || 1), blackFirst: turn === 'b' };
}

/** Move pairs ("1. e4 e5"); each move is a button that jumps the board to that ply. */
export function MoveList({
  sans,
  currentPly,
  classifications = [],
  onSelectPly,
  startFen,
}: MoveListProps) {
  const start = fenStart(startFen);
  // When Black moves first, White's half of the first row is an empty "…" cell.
  const offset = start.blackFirst ? 1 : 0;
  const pairs = Array.from({ length: Math.ceil((sans.length + offset) / 2) }, (_, i) => i);

  const cell = (ply: number) => {
    if (ply < 1) {
      return (
        <td aria-hidden className="px-2 text-text-muted">
          …
        </td>
      );
    }
    const san = sans[ply - 1];
    if (!san) return <td />;
    const cls = classifications[ply - 1];
    const active = ply === currentPly;
    return (
      <td>
        <button
          type="button"
          aria-current={active || undefined}
          onClick={() => onSelectPly?.(ply)}
          className={`tabular flex min-h-8 w-full cursor-pointer items-center gap-1 rounded-[4px] px-2 text-left font-medium transition-colors duration-(--duration-base) ${
            active
              ? 'bg-surface-raised text-text'
              : 'text-text-muted hover:bg-surface-raised hover:text-text'
          }`}
        >
          {cls && <ClassificationBadge classification={cls} className="size-4 text-[9px]" />}
          {san}
        </button>
      </td>
    );
  };

  return (
    <table className="w-full table-fixed text-sm">
      <caption className="sr-only">Moves</caption>
      {/* table-fixed takes column widths from here; the move number column stays narrow. */}
      <colgroup>
        <col className="w-10" />
        <col />
        <col />
      </colgroup>
      <tbody>
        {pairs.map((i) => (
          <tr key={i}>
            <td className="tabular pr-1 text-right text-text-muted">{start.number + i}.</td>
            {cell(i * 2 + 1 - offset)}
            {cell(i * 2 + 2 - offset)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
