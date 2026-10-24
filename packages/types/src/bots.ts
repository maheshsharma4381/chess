import type { CoachLanguage } from './coach';

export type BotTier = 'beginner' | 'intermediate' | 'advanced' | 'master';

/** Spec sound events (web: Web Audio synth; mobile: expo-av). */
export const SOUND_EVENTS = [
  'move-self',
  'move-opponent',
  'capture',
  'check',
  'castle',
  'promote',
  'game-start',
  'game-end',
  'ten-seconds-low-time',
] as const;

export type SoundEvent = (typeof SOUND_EVENTS)[number];

/** Moments a bot can react to in its speech bubble. */
export const BOT_EVENTS = [
  'game-start',
  'user-opening',
  'captured-queen',
  'lost-queen',
  'in-check',
  'winning',
  'losing',
  'win',
  'loss',
  'draw',
] as const;

export type BotEvent = (typeof BOT_EVENTS)[number];

export type LocalizedLines = Record<CoachLanguage, string[]>;

export interface BotProfile {
  id: string;
  name: string;
  /** Strength the bot actually plays at. */
  rating: number;
  /** What the UI shows (Mystery shows "???"). */
  displayRating: string;
  tier: BotTier;
  /** Initials-on-color avatar: no image assets needed. */
  avatar: { initials: string; color: string };
  bio: Record<CoachLanguage, string>;
  style: {
    /** In the first 10 plies, chance to prefer a queen move that is within `earlyQueenToleranceCp` of best. */
    earlyQueen?: number;
    earlyQueenToleranceCp?: number;
    /** Extra weight for captures and checks (0 = none, 1 = doubles their weight). */
    aggression?: number;
  };
  /** 0..1: how often the bot speaks on optional events. */
  chattiness: number;
  dialogue: Record<BotEvent, LocalizedLines>;
}
