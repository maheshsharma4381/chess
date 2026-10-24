import {
  CLASSIFICATION_META,
  type CoachExplanation,
  type CoachLanguage,
  type Motif,
  type MotifType,
  type MoveClassification,
  type MoveReview,
  type Score,
} from '@chess/types';

/** White POV: +0.3 / -1.8 / 0.0 for centipawns, M3 / -M2 for mates. */
export function formatScore(score: Score): string {
  if ('mate' in score) return score.mate > 0 ? `M${score.mate}` : `-M${Math.abs(score.mate)}`;
  const pawns = (score.cp / 100).toFixed(1);
  return score.cp > 0 ? `+${pawns}` : pawns === '-0.0' ? '0.0' : pawns;
}

type Copy = Record<CoachLanguage, string>;

/** Only real annotation symbols are appended to the SAN in the headline. */
const ANNOTATED = new Set<MoveClassification>([
  'brilliant',
  'great',
  'inaccuracy',
  'mistake',
  'blunder',
]);

const HEADLINE: Record<MoveClassification, Copy> = {
  brilliant: { en: 'is a Brilliant move', hinglish: 'ek Brilliant move hai' },
  great: { en: 'is a Great move', hinglish: 'ek Great move hai' },
  best: { en: 'is the Best move', hinglish: 'Best move hai' },
  excellent: { en: 'is an Excellent move', hinglish: 'ek Excellent move hai' },
  good: { en: 'is a Good move', hinglish: 'ek Good move hai' },
  book: { en: 'is a Book move', hinglish: 'ek Book move hai' },
  inaccuracy: { en: 'is an Inaccuracy', hinglish: 'ek Inaccuracy hai' },
  mistake: { en: 'is a Mistake', hinglish: 'ek Mistake hai' },
  miss: { en: 'is a Miss', hinglish: 'ek Miss hai' },
  blunder: { en: 'is a Blunder', hinglish: 'ek Blunder hai' },
};

const LEAD: Record<MoveClassification, Copy> = {
  brilliant: { en: 'A brilliant find!', hinglish: 'Kya shaandaar move hai!' },
  great: {
    en: 'Great move: it is the only one that keeps your position together.',
    hinglish: 'Great move! Sirf yahi move position ko bachata hai.',
  },
  best: { en: "That's the engine's top choice.", hinglish: 'Ye engine ka sabse best move hai.' },
  excellent: {
    en: 'Excellent, nearly as strong as the best move.',
    hinglish: 'Excellent, lagbhag best move jitna accha.',
  },
  good: { en: 'A solid move.', hinglish: 'Solid move hai.' },
  book: { en: 'A well-known opening move.', hinglish: 'Ye jaana-maana opening move hai.' },
  inaccuracy: { en: 'Slightly imprecise.', hinglish: 'Thoda imprecise move hai.' },
  mistake: { en: 'This is a mistake.', hinglish: 'Ye ek mistake hai.' },
  miss: {
    en: "You missed a chance to punish your opponent's error.",
    hinglish: 'Aapne opponent ki galti ka fayda uthane ka mauka miss kar diya.',
  },
  blunder: { en: 'This is a blunder.', hinglish: 'Ye blunder hai.' },
};

const CHECKMATE: Copy = { en: 'Checkmate!', hinglish: 'Checkmate kar diya!' };

const d = (m: Motif, key: string) => String(m.detail[key] ?? '');

/** One sentence per motif, or null when the motif doesn't fit (e.g. a "good" pawn note on a bad move). */
function sentence(m: Motif, lang: CoachLanguage, positive: boolean): string | null {
  const sq = m.squares[0] ?? '';
  const en = lang === 'en';
  const source = d(m, 'source');
  switch (m.type) {
    case 'sacrifice':
      return en
        ? 'You sacrificed material, and the engine confirms it works.'
        : 'Aapne material ka sacrifice kiya, aur engine ke hisaab se ye bilkul sahi hai.';
    case 'fork': {
      const piece = d(m, 'piece');
      const targets = d(m, 'targets');
      if (source === 'reply') {
        return en
          ? `This allows a ${piece} fork on ${sq} against your ${targets}.`
          : `Isse opponent ko ${sq} par ${piece} fork mil jata hai, aapke ${targets} par.`;
      }
      if (source === 'best') {
        return en
          ? `You missed a ${piece} fork on ${sq} hitting the ${targets}.`
          : `Aapne ${sq} par ${piece} fork miss kar diya, jo ${targets} dono ko attack karta.`;
      }
      return en
        ? `Your ${piece} on ${sq} forks the ${targets}.`
        : `Aapka ${piece} ${sq} se ${targets} par fork kar raha hai.`;
    }
    case 'pin':
      return en
        ? `The ${d(m, 'piece')} on ${m.squares[1]} is pinned to the ${d(m, 'behind')}.`
        : `${m.squares[1]} wala ${d(m, 'piece')} ${d(m, 'behind')} ke saath pin ho gaya hai.`;
    case 'skewer':
      return en
        ? `Skewer: the ${d(m, 'piece')} on ${m.squares[1]} must move and expose the ${d(m, 'behind')}.`
        : `Skewer! ${m.squares[1]} ka ${d(m, 'piece')} hatega to peeche wala ${d(m, 'behind')} gir jayega.`;
    case 'discovered-check':
      return en
        ? 'Moving this piece uncovers a discovered check.'
        : 'Is move se discovered check khul jata hai.';
    case 'discovered-attack':
      return en
        ? `This uncovers a discovered attack on the ${d(m, 'piece')}.`
        : `Is move se ${d(m, 'piece')} par discovered attack khul gaya.`;
    case 'back-rank':
      if (source === 'reply') {
        return en
          ? `Your back rank is weak: the opponent mates on ${sq}.`
          : `Aapki back rank kamzor hai, opponent ${sq} par mate kar sakta hai.`;
      }
      if (source === 'best') {
        return en
          ? `You missed a back-rank mate on ${sq}.`
          : `Aapne ${sq} par back-rank mate miss kar diya.`;
      }
      return en ? 'This sets up a back-rank mate.' : 'Isse back-rank mate set ho gaya.';
    case 'mate-threat':
      return source === 'reply'
        ? en
          ? `This allows a forced mate in ${d(m, 'mateIn')}.`
          : `Isse opponent ko mate in ${d(m, 'mateIn')} mil jata hai.`
        : en
          ? `You have a forced mate in ${d(m, 'mateIn')}.`
          : `Aapke paas mate in ${d(m, 'mateIn')} hai.`;
    case 'hanging-piece':
      return en
        ? `Your ${d(m, 'piece')} on ${sq} is left hanging.`
        : `Aapka ${d(m, 'piece')} ${sq} par hanging chhut gaya hai.`;
    case 'book':
      return en
        ? `This is book theory: ${d(m, 'eco')} ${d(m, 'name')}.`
        : `Ye book theory hai: ${d(m, 'eco')} ${d(m, 'name')}.`;
    case 'book-deviation':
      return en
        ? `This leaves opening theory (${d(m, 'eco')} ${d(m, 'name')}); the main line continues ${d(m, 'bestBookSan')}.`
        : `Yahan se aap opening theory (${d(m, 'eco')} ${d(m, 'name')}) se bahar gaye; main line ${d(m, 'bestBookSan')} hai.`;
    case 'king-safety': {
      const side = d(m, 'castled');
      return en
        ? `Castling ${side} tucks your king away safely.`
        : `${side === 'kingside' ? 'Kingside' : 'Queenside'} castling se aapka king safe ho gaya.`;
    }
    case 'pawn-structure': {
      const issue = d(m, 'issue');
      if (issue === 'passed') {
        return positive
          ? en
            ? 'You now have a passed pawn.'
            : 'Ab aapke paas passed pawn hai.'
          : null;
      }
      if (positive) return null;
      return en
        ? `This leaves you with ${issue === 'doubled' ? 'doubled pawns' : 'an isolated pawn'}.`
        : `Isse aapke ${issue === 'doubled' ? 'doubled pawns ban gaye' : 'pawn isolated ho gaya'}.`;
    }
    case 'development':
      return en
        ? `Develops your ${d(m, 'piece')} toward the center.`
        : `Aapka ${d(m, 'piece')} develop ho gaya.`;
    case 'center-control':
      return en ? 'Grabs space in the center.' : 'Center mein jagah le li.';
  }
}

const POSITIVE = new Set<MoveClassification>([
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
]);

/** Motif priority: good moves explain what was achieved, bad moves what went wrong. */
const PRIORITY_GOOD: MotifType[] = [
  'sacrifice',
  'mate-threat',
  'back-rank',
  'fork',
  'discovered-check',
  'discovered-attack',
  'skewer',
  'pin',
  'book',
  'king-safety',
  'development',
  'center-control',
  'pawn-structure',
];
const PRIORITY_BAD: MotifType[] = [
  'mate-threat',
  'back-rank',
  'fork',
  'hanging-piece',
  'book-deviation',
  'skewer',
  'pin',
  'pawn-structure',
];
const MAX_MOTIF_SENTENCES = 2;

function pickMotifs(motifs: Motif[], positive: boolean): Motif[] {
  const order = positive ? PRIORITY_GOOD : PRIORITY_BAD;
  // Good moves talk about what the move did, not what the opponent could do or what was missed.
  const relevant = positive
    ? motifs.filter((m) => d(m, 'source') !== 'reply' && d(m, 'source') !== 'best')
    : motifs;
  return relevant
    .filter((m) => order.includes(m.type))
    .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
}

/** Natural-language coach comment for one reviewed move. */
export function explainMove(review: MoveReview, lang: CoachLanguage): CoachExplanation {
  const { classification } = review;
  const positive = POSITIVE.has(classification);
  const symbol = ANNOTATED.has(classification) ? CLASSIFICATION_META[classification].symbol : '';

  // On the mating move itself, "forced mate in 1" / "sets up a back-rank mate" is wrong.
  const isMate = review.san.endsWith('#');
  const motifs = isMate
    ? review.motifs.filter((m) => m.type !== 'mate-threat' && m.type !== 'back-rank')
    : review.motifs;

  const parts = [isMate ? CHECKMATE[lang] : LEAD[classification][lang]];
  const used: Motif[] = [];
  for (const m of pickMotifs(motifs, positive)) {
    if (used.length >= MAX_MOTIF_SENTENCES) break;
    const s = sentence(m, lang, positive);
    if (s) {
      parts.push(s);
      used.push(m);
    }
  }

  const best = review.bestMove;
  if (!positive && best && best.uci !== review.uci) {
    parts.push(lang === 'en' ? `Best was ${best.san}.` : `Best move ${best.san} tha.`);
  }

  return {
    headline: `${review.san}${symbol} ${HEADLINE[classification][lang]}`,
    evalChange: `${formatScore(review.scoreBefore)} → ${isMate ? '#' : formatScore(review.scoreAfter)}`,
    text: parts.join(' '),
    motifs: used.map((m) => m.type),
  };
}
