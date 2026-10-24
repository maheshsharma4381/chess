import type { BotEvent, BotProfile, CoachLanguage } from '@chess/types';
import { pick } from './rng';

/** Events a bot always comments on; the rest depend on its chattiness. */
const ALWAYS: ReadonlySet<BotEvent> = new Set(['game-start', 'win', 'loss', 'draw']);

/** A speech-bubble line for the event, or null when the bot stays quiet. */
export function botLine(
  bot: BotProfile,
  event: BotEvent,
  lang: CoachLanguage,
  rng: () => number,
): string | null {
  if (!ALWAYS.has(event) && rng() >= bot.chattiness) return null;
  const lines = bot.dialogue[event][lang];
  return lines.length ? pick(lines, rng) : null;
}
