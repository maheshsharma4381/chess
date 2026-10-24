import type { PieceSymbol } from 'chess.js';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { pieceSrc } from './PieceLayer';

const CHOICES: Array<{ piece: PieceSymbol; label: string }> = [
  { piece: 'q', label: 'Queen' },
  { piece: 'r', label: 'Rook' },
  { piece: 'b', label: 'Bishop' },
  { piece: 'n', label: 'Knight' },
];

/** Modal piece picker over the board: focus starts on Queen, Tab is trapped, Escape cancels. */
export function PromotionDialog({
  color,
  onChoose,
  onCancel,
}: {
  color: 'w' | 'b';
  onChoose: (piece: PieceSymbol) => void;
  onCancel: () => void;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => buttons.current[0]?.focus(), []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === 'Tab') {
      const list = buttons.current.filter((b): b is HTMLButtonElement => b !== null);
      const i = list.indexOf(document.activeElement as HTMLButtonElement);
      e.preventDefault();
      list[(i + (e.shiftKey ? list.length - 1 : 1)) % list.length]?.focus();
    }
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[rgba(15,23,42,0.7)]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Promote pawn"
        onKeyDown={onKeyDown}
        className="flex gap-2 rounded-(--radius-dialog) border border-border bg-surface p-3 shadow-[0_20px_25px_rgba(0,0,0,0.35)]"
      >
        {CHOICES.map(({ piece, label }, i) => (
          <button
            key={piece}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            aria-label={label}
            onClick={() => onChoose(piece)}
            className="size-16 cursor-pointer rounded-(--radius-control) bg-surface-raised p-1 transition-colors duration-(--duration-base) hover:bg-border"
          >
            <img src={pieceSrc(color, piece)} alt="" className="size-full" />
          </button>
        ))}
        {/* Touch users have no Escape key. */}
        <button
          ref={(el) => {
            buttons.current[CHOICES.length] = el;
          }}
          type="button"
          onClick={onCancel}
          className="min-h-16 cursor-pointer rounded-(--radius-control) px-3 text-sm font-medium text-text-muted transition-colors duration-(--duration-base) hover:bg-surface-raised hover:text-text"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
