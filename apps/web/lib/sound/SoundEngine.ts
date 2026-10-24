import type { SoundEvent } from '@chess/types';

/** The parts of a chess.js Move the mapping needs. */
interface MoveLike {
  san: string;
  captured?: string;
  promotion?: string;
  isKingsideCastle(): boolean;
  isQueensideCastle(): boolean;
}

/** Spec sound for a move. Precedence: check > promote > castle > capture > plain move. */
export function soundForMove(move: MoveLike, byUser: boolean): SoundEvent {
  if (/[+#]$/.test(move.san)) return 'check';
  if (move.promotion) return 'promote';
  if (move.isKingsideCastle() || move.isQueensideCastle()) return 'castle';
  if (move.captured) return 'capture';
  return byUser ? 'move-self' : 'move-opponent';
}

interface Tone {
  freq: number;
  type: OscillatorType;
  duration: number;
  gain: number;
  /** Seconds after the start of the sound. */
  at?: number;
}

/** Original synthesized sounds (plan ruling R3): short, soft, distinguishable. */
const TONES: Record<SoundEvent, Tone[]> = {
  'move-self': [{ freq: 420, type: 'triangle', duration: 0.06, gain: 0.25 }],
  'move-opponent': [{ freq: 340, type: 'triangle', duration: 0.06, gain: 0.25 }],
  capture: [
    { freq: 220, type: 'square', duration: 0.05, gain: 0.18 },
    { freq: 160, type: 'triangle', duration: 0.08, gain: 0.22, at: 0.03 },
  ],
  check: [
    { freq: 660, type: 'sine', duration: 0.08, gain: 0.2 },
    { freq: 880, type: 'sine', duration: 0.1, gain: 0.2, at: 0.08 },
  ],
  castle: [
    { freq: 380, type: 'triangle', duration: 0.05, gain: 0.22 },
    { freq: 380, type: 'triangle', duration: 0.05, gain: 0.22, at: 0.09 },
  ],
  promote: [
    { freq: 520, type: 'sine', duration: 0.08, gain: 0.2 },
    { freq: 780, type: 'sine', duration: 0.12, gain: 0.2, at: 0.07 },
  ],
  'game-start': [
    { freq: 440, type: 'sine', duration: 0.12, gain: 0.18 },
    { freq: 660, type: 'sine', duration: 0.16, gain: 0.18, at: 0.12 },
  ],
  'game-end': [
    { freq: 660, type: 'sine', duration: 0.14, gain: 0.18 },
    { freq: 440, type: 'sine', duration: 0.22, gain: 0.18, at: 0.14 },
  ],
  'ten-seconds-low-time': [{ freq: 990, type: 'square', duration: 0.05, gain: 0.12 }],
};

/**
 * Web Audio sound effects. Browsers block audio until a user gesture, so nothing plays
 * before unlock() (call it from the first click/key handler).
 */
export class SoundEngine {
  muted = false;
  private context: AudioContext | null = null;

  constructor(private readonly createContext: () => AudioContext = () => new AudioContext()) {}

  unlock(): void {
    if (this.context) return;
    try {
      this.context = this.createContext();
    } catch {
      this.context = null; // no audio support: stay silent
    }
  }

  play(event: SoundEvent): void {
    const ctx = this.context;
    if (!ctx || this.muted) return;
    for (const tone of TONES[event]) {
      const start = ctx.currentTime + (tone.at ?? 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type;
      osc.frequency.setValueAtTime(tone.freq, start);
      gain.gain.setValueAtTime(tone.gain, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + tone.duration + 0.02);
    }
  }
}
