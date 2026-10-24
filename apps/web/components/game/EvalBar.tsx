import { formatScore, winPercent } from '@chess/chess-core';
import type { Score } from '@chess/types';
import type { Orientation } from '@/lib/board/squares';

/**
 * Vertical evaluation bar: White's share fills from White's side of the board.
 * Animates `transform: scaleY` (never height) on the slow motion token.
 */
export function EvalBar({ score, orientation }: { score: Score | null; orientation: Orientation }) {
  const whitePct = score ? winPercent(score) : 50;
  const whiteLeads = whitePct >= 50;
  const readout = score ? formatScore(score) : '0.0';
  const whiteAtBottom = orientation === 'white';

  return (
    <div
      role="meter"
      aria-label="Evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(whitePct)}
      aria-valuetext={`${readout} (${whiteLeads ? 'White' : 'Black'} is better)`}
      className="relative h-full w-6 overflow-hidden rounded-[4px] bg-[#403d39]"
    >
      <div
        data-testid="eval-fill"
        className="absolute inset-0 bg-[#f0f0f0]"
        style={{
          transformOrigin: whiteAtBottom ? 'bottom' : 'top',
          transform: `scaleY(${whitePct / 100})`,
          transition: 'transform var(--duration-slow) var(--ease-standard)',
        }}
      />
      <span
        className={`tabular absolute left-0 w-full text-center text-[10px] font-bold ${
          whiteLeads === whiteAtBottom ? 'bottom-1' : 'top-1'
        } ${whiteLeads ? 'text-[#403d39]' : 'text-[#f0f0f0]'}`}
      >
        {readout}
      </span>
    </div>
  );
}
