import type { BotProfile, BotTier } from '@chess/types';
import { VOICES, type Voice } from './voices';

const TIER_COLOR: Record<BotTier, string> = {
  beginner: '#3FAF3F',
  intermediate: '#3D7EFF',
  advanced: '#D97706',
  master: '#DC2626',
};

interface Seed {
  id: string;
  name: string;
  rating: number;
  displayRating?: string;
  tier: BotTier;
  voice: Voice;
  chattiness: number;
  style?: BotProfile['style'];
  bio: BotProfile['bio'];
}

const SEEDS: Seed[] = [
  {
    id: 'pip',
    name: 'Pip',
    rating: 250,
    tier: 'beginner',
    voice: 'cheerful',
    chattiness: 0.8,
    bio: {
      en: 'Just learned how the knight moves and loves every capture.',
      hinglish:
        'Abhi-abhi seekha hai ki knight kaise chalta hai, aur har capture pe khush ho jata hai.',
    },
  },
  {
    id: 'rosa',
    name: 'Rosa',
    rating: 400,
    tier: 'beginner',
    voice: 'cheerful',
    chattiness: 0.7,
    bio: {
      en: 'Plays between gardening sessions. Kind, chatty, a little careless.',
      hinglish: 'Gardening ke beech mein khelti hai. Pyaari, baatooni, thodi laaparwah.',
    },
  },
  {
    id: 'theo',
    name: 'Theo',
    rating: 650,
    tier: 'beginner',
    voice: 'calm',
    chattiness: 0.5,
    bio: {
      en: 'A student who knows the basics and is starting to spot simple tactics.',
      hinglish: 'Student hai, basics jaanta hai aur simple tactics pakadna seekh raha hai.',
    },
  },
  {
    id: 'kabir',
    name: 'Kabir',
    rating: 1000,
    tier: 'intermediate',
    voice: 'cheerful',
    chattiness: 0.6,
    style: { aggression: 0.5 },
    bio: {
      en: 'Cricket fan who plays chess like a T20 innings: always attacking.',
      hinglish: 'Cricket fan hai, chess T20 ki tarah khelta hai: hamesha attack.',
    },
  },
  {
    id: 'duke',
    name: 'Duke',
    rating: 1300,
    tier: 'intermediate',
    voice: 'brash',
    chattiness: 0.8,
    style: { earlyQueen: 0.85, earlyQueenToleranceCp: 150 },
    bio: {
      en: 'Brings his queen out early. Every single game.',
      hinglish: 'Har game mein queen jaldi bahar le aata hai. Har ek game mein.',
    },
  },
  {
    id: 'maya',
    name: 'Maya',
    rating: 1400,
    tier: 'intermediate',
    voice: 'calm',
    chattiness: 0.4,
    bio: {
      en: 'Methodical club player. Solid structure, few blunders.',
      hinglish: 'Methodical club player. Solid structure, kam blunders.',
    },
  },
  {
    id: 'arjun',
    name: 'Arjun',
    rating: 1500,
    tier: 'advanced',
    voice: 'calm',
    chattiness: 0.4,
    bio: {
      en: 'Weekend tournament regular who knows his openings.',
      hinglish: 'Weekend tournaments ka regular player, openings acchi tarah jaanta hai.',
    },
  },
  {
    id: 'elena',
    name: 'Elena',
    rating: 1800,
    tier: 'advanced',
    voice: 'calm',
    chattiness: 0.5,
    bio: {
      en: 'A coach who will punish loose pieces and explain why afterwards.',
      hinglish: 'Coach hai: loose pieces ki saza deti hai aur baad mein samjhati bhi hai.',
    },
  },
  {
    id: 'viktor',
    name: 'Viktor',
    rating: 2000,
    tier: 'advanced',
    voice: 'gruff',
    chattiness: 0.5,
    bio: {
      en: 'Grumpy veteran with an endgame you should be afraid of.',
      hinglish: 'Gussail veteran, jiska endgame dekh ke darr lagna chahiye.',
    },
  },
  {
    id: 'nadia',
    name: 'Nadia',
    rating: 2300,
    tier: 'master',
    voice: 'calm',
    chattiness: 0.3,
    bio: {
      en: 'International Master strength. Precise and patient.',
      hinglish: 'International Master level. Precise aur patient.',
    },
  },
  {
    id: 'engine-max',
    name: 'Engine Max',
    rating: 3200,
    tier: 'master',
    voice: 'engine',
    chattiness: 0.4,
    bio: {
      en: 'Stockfish at full strength. Good luck.',
      hinglish: 'Poori taakat wala Stockfish. Good luck.',
    },
  },
  {
    id: 'mystery',
    name: 'Mystery',
    rating: 3000,
    displayRating: '???',
    tier: 'master',
    voice: 'mystery',
    chattiness: 0.7,
    bio: {
      en: 'Nobody knows how strong this one is. It seems to enjoy that.',
      hinglish: 'Koi nahi jaanta ye kitna strong hai. Aur use ye pasand hai.',
    },
  },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export const BOTS: readonly BotProfile[] = SEEDS.map((s) => ({
  id: s.id,
  name: s.name,
  rating: s.rating,
  displayRating: s.displayRating ?? String(s.rating),
  tier: s.tier,
  avatar: { initials: s.id === 'mystery' ? '?' : initials(s.name), color: TIER_COLOR[s.tier] },
  bio: s.bio,
  style: s.style ?? {},
  chattiness: s.chattiness,
  dialogue: VOICES[s.voice],
}));

export function botById(id: string): BotProfile {
  const bot = BOTS.find((b) => b.id === id);
  if (!bot) throw new Error(`Unknown bot "${id}"`);
  return bot;
}
