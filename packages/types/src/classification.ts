export const MOVE_CLASSIFICATIONS = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
] as const;

export type MoveClassification = (typeof MOVE_CLASSIFICATIONS)[number];

export interface ClassificationMeta {
  label: string;
  symbol: string;
  color: string;
}

export const CLASSIFICATION_META: Record<MoveClassification, ClassificationMeta> = {
  brilliant: { label: 'Brilliant', symbol: '!!', color: '#1baca6' },
  great: { label: 'Great Move', symbol: '!', color: '#5c8bb0' },
  best: { label: 'Best Move', symbol: '★', color: '#81b64c' },
  excellent: { label: 'Excellent', symbol: '👍', color: '#96bc4b' },
  good: { label: 'Good', symbol: '✓', color: '#96af8b' },
  book: { label: 'Book', symbol: '📖', color: '#a88865' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', color: '#f7c631' },
  mistake: { label: 'Mistake', symbol: '?', color: '#e58f2a' },
  miss: { label: 'Miss', symbol: '✖', color: '#ff7769' },
  blunder: { label: 'Blunder', symbol: '??', color: '#ca3431' },
};
