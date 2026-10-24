const PIECES: Record<string, string> = {
  K: 'king',
  Q: 'queen',
  R: 'rook',
  B: 'bishop',
  N: 'knight',
};

/** SAN as a screen reader should say it: "Qxf7#" -> "queen takes f7, checkmate". */
export function sanToWords(san: string): string {
  let s = san;
  let suffix = '';
  if (s.endsWith('#')) {
    suffix = ', checkmate';
    s = s.slice(0, -1);
  } else if (s.endsWith('+')) {
    suffix = ', check';
    s = s.slice(0, -1);
  }
  if (s === 'O-O') return `castles kingside${suffix}`;
  if (s === 'O-O-O') return `castles queenside${suffix}`;

  let promotion = '';
  const promo = /=([QRBN])$/.exec(s);
  if (promo) {
    promotion = ` promotes to ${PIECES[promo[1] as string]}`;
    s = s.slice(0, -2);
  }
  const piece = PIECES[s[0] as string];
  const body = (piece ? s.slice(1) : s).replace('x', ' takes ');
  return `${piece ? `${piece} ` : ''}${body}`.replace(/\s+/g, ' ').trim() + promotion + suffix;
}
