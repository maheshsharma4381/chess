import { CLASSIFICATION_META, type MoveClassification } from '@chess/types';
import { contrastRatio } from '@/lib/design/contrast';
import { COLORS } from '@/lib/design/tokens';

/** Spec badge: classification symbol on its color, text in whichever of dark/white reads best. */
export function ClassificationBadge({
  classification,
  className = '',
}: {
  classification: MoveClassification;
  className?: string;
}) {
  const meta = CLASSIFICATION_META[classification];
  const ink =
    contrastRatio(COLORS.bg, meta.color) >= contrastRatio('#FFFFFF', meta.color)
      ? COLORS.bg
      : '#FFFFFF';
  return (
    <span
      role="img"
      aria-label={meta.label}
      title={meta.label}
      className={`inline-flex size-5 items-center justify-center rounded-full text-[11px] leading-none font-bold shadow ${className}`}
      style={{ background: meta.color, color: ink }}
    >
      <span aria-hidden>{meta.symbol}</span>
    </span>
  );
}
