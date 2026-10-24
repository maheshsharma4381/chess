import type { MoveClassification } from '@chess/types';
import { ClassificationBadge } from '../board/ClassificationBadge';

export interface MoveListProps {
  sans: readonly string[];
  /** 1-based ply currently shown (0 = start position). */
  currentPly: number;
  classifications?: ReadonlyArray<MoveClassification | undefined>;
  onSelectPly?: (ply: number) => void;
}

/** Move pairs ("1. e4 e5"); each move is a button that jumps the board to that ply. */
export function MoveList({ sans, currentPly, classifications = [], onSelectPly }: MoveListProps) {
  const pairs = Array.from({ length: Math.ceil(sans.length / 2) }, (_, i) => i);

  const cell = (ply: number) => {
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
            <td className="tabular pr-1 text-right text-text-muted">{i + 1}.</td>
            {cell(i * 2 + 1)}
            {cell(i * 2 + 2)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
