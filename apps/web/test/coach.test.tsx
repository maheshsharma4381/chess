import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chess } from 'chess.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MoveReview } from '@chess/types';
import { CoachPanel } from '@/components/review/CoachPanel';
import {
  PREVIEW_STEP_MS,
  judgeRetry,
  previewFrames,
  useLinePreview,
  useRetry,
} from '@/lib/review/coachModes';

const before = (() => {
  const c = new Chess();
  for (const s of ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5']) c.move(s);
  return c.fen();
})();

const blunder: MoveReview = {
  ply: 6,
  color: 'black',
  san: 'Nf6',
  uci: 'g8f6',
  fenBefore: before,
  fenAfter: new Chess(before).move('Nf6').after,
  classification: 'blunder',
  accuracy: 8,
  winBefore: 48,
  winAfter: 0,
  scoreBefore: { cp: 20 },
  scoreAfter: { mate: 1 },
  bestMove: { uci: 'g7g6', san: 'g6' },
  secondBestMove: { uci: 'd8e7', san: 'Qe7' },
  pv: ['g6', 'Qf3', 'Nf6'],
  isBook: false,
  phase: 'opening',
  motifs: [{ type: 'mate-threat', squares: [], detail: { source: 'reply', mateIn: 1 } }],
};
const good: MoveReview = { ...blunder, classification: 'good', motifs: [] };

afterEach(() => vi.useRealTimers());

describe('coach helpers', () => {
  it('builds preview frames by playing the PV from the position before the move', () => {
    const frames = previewFrames(blunder);
    expect(frames).toHaveLength(3);
    const c = new Chess(before);
    c.move('g6');
    expect(frames[0]).toBe(c.fen());
  });

  it('accepts only the engine best move in a retry', () => {
    expect(judgeRetry(blunder, 'g7g6')).toBe(true);
    expect(judgeRetry(blunder, 'g8f6')).toBe(false);
  });
});

describe('useLinePreview', () => {
  it('steps through the frames and stops on demand', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useLinePreview());
    act(() => result.current.start(['f1', 'f2', 'f3']));
    expect(result.current.fen).toBe('f1');
    act(() => vi.advanceTimersByTime(PREVIEW_STEP_MS));
    expect(result.current.fen).toBe('f2');
    act(() => result.current.stop());
    expect(result.current.fen).toBeNull();
    act(() => vi.advanceTimersByTime(PREVIEW_STEP_MS * 3));
    expect(result.current.fen).toBeNull();
  });

  it('holds the last frame when the line ends', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useLinePreview());
    act(() => result.current.start(['f1', 'f2']));
    act(() => vi.advanceTimersByTime(PREVIEW_STEP_MS * 5));
    expect(result.current.fen).toBe('f2');
    expect(result.current.playing).toBe(false);
  });
});

describe('useRetry', () => {
  it('rewinds to the position before the move and judges the attempt', () => {
    const { result } = renderHook(() => useRetry());
    act(() => result.current.begin(blunder));
    expect(result.current.state).toMatchObject({ fen: before, status: 'trying', color: 'b' });
    act(() => result.current.attempt({ from: 'g8', to: 'f6' }));
    expect(result.current.state?.status).toBe('wrong');
    act(() => result.current.showHint());
    expect(result.current.state?.hint).toBe('g7');
    act(() => result.current.tryAgain());
    expect(result.current.state).toMatchObject({ fen: before, status: 'trying' });
    act(() => result.current.attempt({ from: 'g7', to: 'g6' }));
    expect(result.current.state?.status).toBe('correct');
    act(() => result.current.exit());
    expect(result.current.state).toBeNull();
  });
});

describe('<CoachPanel>', () => {
  const props = {
    lang: 'en' as const,
    onLang: vi.fn(),
    onShowMoves: vi.fn(),
    onStopPreview: vi.fn(),
    previewing: false,
    onRetry: vi.fn(),
  };

  it('explains the move with its badge and eval change', () => {
    render(<CoachPanel move={blunder} {...props} />);
    expect(screen.getByRole('heading', { name: /Nf6\?\? is a Blunder/ })).toBeInTheDocument();
    expect(screen.getByText('+0.2 → M1')).toBeInTheDocument();
    expect(screen.getByText(/forced mate in 1/i)).toBeInTheDocument();
  });

  it('switches to Hinglish', async () => {
    const onLang = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<CoachPanel move={blunder} {...props} onLang={onLang} />);
    await user.click(screen.getByRole('button', { name: 'Hinglish' }));
    expect(onLang).toHaveBeenCalledWith('hinglish');
    rerender(<CoachPanel move={blunder} {...props} lang="hinglish" />);
    expect(screen.getByRole('heading', { name: /ek Blunder hai/ })).toBeInTheDocument();
  });

  it('offers Show Moves and Retry for a blunder, and only Show Moves for a good move', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CoachPanel move={blunder} {...props} />);
    await user.click(screen.getByRole('button', { name: /show moves/i }));
    expect(props.onShowMoves).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /retry move/i }));
    expect(props.onRetry).toHaveBeenCalled();
    rerender(<CoachPanel move={good} {...props} />);
    expect(screen.queryByRole('button', { name: /retry move/i })).not.toBeInTheDocument();
  });

  it('shows a Stop button and banner while previewing', () => {
    render(<CoachPanel move={blunder} {...props} previewing />);
    expect(screen.getByText(/showing engine line/i)).toBeInTheDocument();
    screen.getByRole('button', { name: /stop/i }).click();
    expect(props.onStopPreview).toHaveBeenCalled();
  });

  it('greets the start position without a move', () => {
    render(<CoachPanel move={null} {...props} />);
    expect(screen.getByText(/step through the game/i)).toBeInTheDocument();
  });
});
