import { capturedPieces } from '@/lib/game/material';
import { pieceSrc } from '../board/PieceLayer';

const NAMES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
};

/** Pieces `side` has captured, plus its material lead (e.g. "+3") when ahead. */
export function CapturedPieces({ fen, side }: { fen: string; side: 'w' | 'b' }) {
  const { byWhite, byBlack, diff } = capturedPieces(fen);
  const taken = side === 'w' ? byWhite : byBlack;
  const lead = side === 'w' ? diff : -diff;
  const victimColor = side === 'w' ? 'b' : 'w';
  const label = taken.length ? `Captured: ${taken.map((t) => NAMES[t]).join(', ')}` : 'No captures';

  return (
    <div className="flex h-5 items-center gap-1 text-xs text-text-muted">
      <span aria-label={label} className="flex items-center">
        {taken.map((t, i) => (
          <img
            key={i}
            src={pieceSrc(victimColor, t)}
            alt=""
            aria-hidden
            className="-ml-1 size-4 first:ml-0"
          />
        ))}
      </span>
      {lead > 0 && <span className="tabular font-semibold">+{lead}</span>}
    </div>
  );
}
