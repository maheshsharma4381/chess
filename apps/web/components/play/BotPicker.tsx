'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { BotProfile, BotTier } from '@chess/types';
import { BotAvatar } from './BotAvatar';

const TIERS: Array<{ tier: BotTier; label: string }> = [
  { tier: 'beginner', label: 'Beginner' },
  { tier: 'intermediate', label: 'Intermediate' },
  { tier: 'advanced', label: 'Advanced' },
  { tier: 'master', label: 'Master' },
];

const MODES = [
  { value: 'friendly', label: 'Friendly', detail: 'Eval bar, hints and unlimited takebacks.' },
  { value: 'challenge', label: 'Challenge', detail: 'No hints, no takebacks.' },
] as const;

const COLORS = [
  { value: 'w', label: 'White' },
  { value: 'b', label: 'Black' },
] as const;

const optionCard =
  'flex cursor-pointer items-center gap-3 rounded-(--radius-panel) border border-border bg-surface p-3 transition-colors duration-(--duration-base) hover:bg-surface-raised has-[:checked]:border-brand has-[:checked]:bg-surface-raised has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand';

export function BotPicker({ bots }: { bots: readonly BotProfile[] }) {
  const [botId, setBotId] = useState(bots[0]?.id ?? '');
  const [mode, setMode] = useState<(typeof MODES)[number]['value']>('friendly');
  const [color, setColor] = useState<(typeof COLORS)[number]['value']>('w');
  const selected = bots.find((b) => b.id === botId);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <fieldset>
        <legend className="sr-only">Choose a bot</legend>
        {TIERS.map(({ tier, label }) => (
          <section key={tier} className="mb-6">
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-text-muted uppercase">
              {label}
            </h2>
            <div className="grid gap-2 sm:grid-cols-3">
              {bots
                .filter((b) => b.tier === tier)
                .map((bot) => (
                  <label key={bot.id} className={optionCard}>
                    <input
                      type="radio"
                      name="bot"
                      value={bot.id}
                      checked={bot.id === botId}
                      onChange={() => setBotId(bot.id)}
                      className="sr-only"
                    />
                    <BotAvatar bot={bot} />
                    <span>
                      <span className="block font-semibold">{bot.name}</span>
                      <span className="tabular block text-sm text-text-muted">
                        <span className="sr-only">{`${bot.name} (${bot.displayRating})`}</span>
                        <span aria-hidden>{bot.displayRating}</span>
                      </span>
                    </span>
                  </label>
                ))}
            </div>
          </section>
        ))}
      </fieldset>

      <aside className="h-fit space-y-5 rounded-(--radius-panel) border border-border bg-surface p-4 lg:sticky lg:top-4">
        {selected && (
          <div className="flex gap-3">
            <BotAvatar bot={selected} />
            <div>
              <p className="font-semibold">
                {selected.name}{' '}
                <span className="tabular text-text-muted">{selected.displayRating}</span>
              </p>
              <p className="mt-1 text-sm text-text-muted">{selected.bio.en}</p>
            </div>
          </div>
        )}

        <div role="radiogroup" aria-label="Mode" className="space-y-2">
          <p className="text-sm font-semibold">Mode</p>
          {MODES.map((m) => (
            <label key={m.value} className={optionCard}>
              <input
                type="radio"
                name="mode"
                checked={mode === m.value}
                onChange={() => setMode(m.value)}
                className="sr-only"
                aria-label={m.label}
              />
              <span>
                <span className="block font-medium">{m.label}</span>
                <span className="block text-sm text-text-muted">{m.detail}</span>
              </span>
            </label>
          ))}
        </div>

        <div role="radiogroup" aria-label="Play as" className="space-y-2">
          <p className="text-sm font-semibold">Play as</p>
          <div className="grid grid-cols-2 gap-2">
            {COLORS.map((c) => (
              <label key={c.value} className={`${optionCard} justify-center`}>
                <input
                  type="radio"
                  name="color"
                  checked={color === c.value}
                  onChange={() => setColor(c.value)}
                  className="sr-only"
                  aria-label={c.label}
                />
                <span className="font-medium">{c.label}</span>
              </label>
            ))}
          </div>
        </div>

        <Link
          href={`/play/bots/${botId}?mode=${mode}&color=${color}`}
          className="flex min-h-12 items-center justify-center rounded-(--radius-control) bg-brand px-6 font-semibold text-on-brand transition-colors duration-(--duration-base) hover:bg-brand-hover"
        >
          Play {selected?.name}
        </Link>
      </aside>
    </div>
  );
}
