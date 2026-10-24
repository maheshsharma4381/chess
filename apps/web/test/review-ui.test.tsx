import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chess } from 'chess.js';
import { describe, expect, it, vi } from 'vitest';
import { MOVE_CLASSIFICATIONS, type MoveReview, type ReviewReport } from '@chess/types';
import { ReviewBoard } from '@/components/review/ReviewBoard';
import { ReviewNav } from '@/components/review/ReviewNav';
import { ReviewSummary } from '@/components/review/ReviewSummary';

const START = new Chess().fen();

function move(ply: number, san: string, overrides: Partial<MoveReview> = {}): MoveReview {
  const c = new Chess();
  const sans = ['e4', 'e5', 'Nf3'].slice(0, ply - 1);
  for (const s of sans) c.move(s);
  const fenBefore = c.fen();
  const m = c.move(san);
  return {
    ply,
    color: m.color === 'w' ? 'white' : 'black',
    san,
    uci: m.lan,
    fenBefore,
    fenAfter: c.fen(),
    classification: 'best',
    accuracy: 100,
    winBefore: 50,
    winAfter: 50,
    scoreBefore: { cp: 20 },
    scoreAfter: { cp: 20 },
    bestMove: { uci: m.lan, san },
    secondBestMove: null,
    pv: [san],
    isBook: false,
    phase: 'opening',
    motifs: [],
    ...overrides,
  };
}

const counts = () =>
  Object.fromEntries(MOVE_CLASSIFICATIONS.map((c) => [c, 0])) as ReviewReport['counts']['white'];

const report: ReviewReport = {
  startFen: START,
  moves: [
    move(1, 'e4', { classification: 'book', isBook: true }),
    move(2, 'e5', { classification: 'book', isBook: true }),
    move(3, 'Bc4', { classification: 'mistake', bestMove: { uci: 'g1f3', san: 'Nf3' } }),
  ],
  accuracy: { white: 88.44, black: 74.06 },
  phaseAccuracy: {
    white: { opening: 90, middlegame: null, endgame: null },
    black: { opening: 74, middlegame: null, endgame: null },
  },
  estimatedRating: { white: 1650, black: null },
  counts: { white: { ...counts(), book: 1, mistake: 1 }, black: { ...counts(), book: 1 } },
  opening: { eco: 'C20', name: "King's Pawn Game", pgn: '1. e4 e5', lastBookPly: 2 },
  winGraph: [50, 52, 50, 40],
};

describe('<ReviewSummary>', () => {
  it('shows accuracy, estimated rating and the classification counts', () => {
    render(<ReviewSummary report={report} names={{ white: 'You', black: 'Maya' }} />);
    expect(screen.getByText('88.4')).toBeInTheDocument();
    expect(screen.getByText('74.1')).toBeInTheDocument();
    expect(screen.getByText('1650')).toBeInTheDocument();
    expect(screen.getByLabelText(/Maya estimated rating/)).toHaveTextContent('—');
    const mistakeRow = screen.getByRole('row', { name: /Mistake/ });
    expect(
      within(mistakeRow)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['1', '0']);
    expect(screen.getAllByRole('row')).toHaveLength(11); // header + 10 classifications
  });
});

describe('<ReviewBoard>', () => {
  it('shows the position after the ply with its badge on the destination square', () => {
    render(<ReviewBoard report={report} ply={3} orientation="white" />);
    const c4 = screen.getByRole('button', { name: /^c4,/ });
    expect(within(c4).getByLabelText('Mistake')).toBeInTheDocument();
    expect(c4).toHaveAccessibleName(/white bishop/);
  });

  it('draws the best-move arrow only when the played move was not best', () => {
    const { rerender } = render(<ReviewBoard report={report} ply={3} orientation="white" />);
    expect(screen.getByTestId('arrow-g1-f3')).toHaveAttribute('data-color', 'green');
    rerender(<ReviewBoard report={report} ply={2} orientation="white" />);
    expect(screen.queryByTestId(/^arrow-/)).not.toBeInTheDocument();
  });

  it('shows the start position at ply 0 and respects orientation', () => {
    render(<ReviewBoard report={report} ply={0} orientation="black" />);
    const squares = screen.getAllByRole('button', { name: /^[a-h][1-8],/ });
    expect(squares[0]).toHaveAccessibleName('h1, white rook');
    expect(screen.queryByLabelText('Mistake')).not.toBeInTheDocument();
  });
});

describe('<ReviewNav>', () => {
  it('moves through the game with buttons and arrow keys', async () => {
    const onPly = vi.fn();
    const user = userEvent.setup();
    render(<ReviewNav ply={1} max={3} onPly={onPly} />);
    await user.click(screen.getByRole('button', { name: /next move/i }));
    expect(onPly).toHaveBeenLastCalledWith(2);
    await user.click(screen.getByRole('button', { name: /first move/i }));
    expect(onPly).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onPly).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(window, { key: 'End' });
    expect(onPly).toHaveBeenLastCalledWith(3);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onPly).toHaveBeenLastCalledWith(2);
  });

  it('ignores arrow keys typed into a text field', () => {
    const onPly = vi.fn();
    render(
      <>
        <input aria-label="notes" />
        <ReviewNav ply={1} max={3} onPly={onPly} />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText('notes'), { key: 'ArrowRight' });
    expect(onPly).not.toHaveBeenCalled();
  });
});
