import { render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { Chess } from 'chess.js';
import { describe, expect, it, vi } from 'vitest';
import { SOUND_EVENTS } from '@chess/types';
import { CapturedPieces } from '@/components/game/CapturedPieces';
import { EvalBar } from '@/components/game/EvalBar';
import { MoveList } from '@/components/game/MoveList';
import { OpeningBanner, useOpening } from '@/components/game/OpeningBanner';
import { capturedPieces } from '@/lib/game/material';
import { SoundEngine, soundForMove } from '@/lib/sound/SoundEngine';

const historyOf = (sans: string) => {
  const chess = new Chess();
  return [chess.fen(), ...sans.split(' ').map((s) => (chess.move(s), chess.fen()))];
};

describe('<EvalBar>', () => {
  it('fills to White win% and reads out the score on the leading side', () => {
    const { rerender } = render(<EvalBar score={{ cp: 0 }} orientation="white" />);
    const bar = screen.getByRole('meter', { name: /evaluation/i });
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    rerender(<EvalBar score={{ cp: 130 }} orientation="white" />);
    expect(screen.getByText('+1.3')).toBeInTheDocument();
    rerender(<EvalBar score={{ mate: 3 }} orientation="white" />);
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('M3')).toBeInTheDocument();
  });

  it('animates with transform on the slow motion token', () => {
    render(<EvalBar score={{ cp: 0 }} orientation="white" />);
    const fill = screen.getByTestId('eval-fill');
    expect(fill.style.transform).toBe('scaleY(0.5)');
    expect(fill.style.transition).toContain('var(--duration-slow)');
  });
});

describe('captured pieces', () => {
  // White has won a knight; Black has won a pawn.
  const fen = 'r1bqkbnr/pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNR w KQkq - 0 1';

  it('counts what each side captured and the material difference', () => {
    expect(capturedPieces(fen)).toEqual({ byWhite: ['n'], byBlack: ['p'], diff: 2 });
  });

  it('shows the tray with the advantage for the leading side', () => {
    render(<CapturedPieces fen={fen} side="w" />);
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByLabelText('Captured: knight')).toBeInTheDocument();
  });
});

describe('opening banner', () => {
  it('names the opening of the current position, loading the book lazily', async () => {
    const fens = historyOf('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6');
    const { result } = renderHook(() => useOpening(fens));
    await waitFor(() =>
      expect(result.current).toEqual({ eco: 'B90', name: 'Sicilian Defense: Najdorf Variation' }),
    );
    render(<OpeningBanner opening={result.current} />);
    expect(screen.getByText('B90')).toBeInTheDocument();
    expect(screen.getByText('Sicilian Defense: Najdorf Variation')).toBeInTheDocument();
  });
});

describe('<MoveList>', () => {
  it('shows numbered move pairs, the current ply and badges', () => {
    const onSelectPly = vi.fn();
    render(
      <MoveList
        sans={['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#']}
        currentPly={6}
        classifications={[undefined, undefined, undefined, undefined, undefined, 'blunder', 'best']}
        onSelectPly={onSelectPly}
      />,
    );
    const rows = screen.getAllByRole('row');
    expect(within(rows[0] as HTMLElement).getByText('1.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nf6/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByLabelText('Blunder')).toBeInTheDocument();
    screen.getByRole('button', { name: /Qxf7#/ }).click();
    expect(onSelectPly).toHaveBeenCalledWith(7);
  });
});

describe('sound', () => {
  const play = (sans: string) => {
    const chess = new Chess();
    const moves = sans.split(' ').map((s) => chess.move(s));
    return moves.at(-1) as ReturnType<Chess['move']>;
  };

  it('maps moves to sound events with check > promote > castle > capture > move', () => {
    expect(soundForMove(play('e4'), true)).toBe('move-self');
    expect(soundForMove(play('e4'), false)).toBe('move-opponent');
    expect(soundForMove(play('e4 d5 exd5'), true)).toBe('capture');
    expect(soundForMove(play('e4 e5 Nf3 Nc6 Bc4 Bc5 O-O'), true)).toBe('castle');
    expect(soundForMove(play('e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#'), true)).toBe('check');
    const promo = new Chess('8/4P3/8/8/8/8/k7/4K3 w - - 0 1').move('e8=Q');
    expect(soundForMove(promo, true)).toBe('promote');
    expect(SOUND_EVENTS).toHaveLength(9);
  });

  it('stays silent until unlocked by a user gesture, and when muted', () => {
    const oscillators: string[] = [];
    class FakeAudioContext {
      currentTime = 0;
      destination = {};
      createOscillator() {
        oscillators.push('osc');
        return {
          type: '',
          frequency: { setValueAtTime() {} },
          connect: (n: unknown) => n,
          start() {},
          stop() {},
        };
      }
      createGain() {
        return {
          gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect: (n: unknown) => n,
        };
      }
    }
    const engine = new SoundEngine(() => new FakeAudioContext() as unknown as AudioContext);
    engine.play('move-self');
    expect(oscillators).toHaveLength(0);
    engine.unlock();
    engine.play('move-self');
    expect(oscillators.length).toBeGreaterThan(0);
    const count = oscillators.length;
    engine.muted = true;
    engine.play('capture');
    expect(oscillators).toHaveLength(count);
  });
});
