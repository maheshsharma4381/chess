import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Board } from '@/components/board/Board';
import { squareColor, squaresInDisplayOrder } from '@/lib/board/squares';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// White king on e1 in check from the queen on e7... via the open e-file.
const WHITE_IN_CHECK = '4k3/4q3/8/8/8/8/8/4K3 w - - 0 1';

describe('square helpers', () => {
  it('orders squares top-left to bottom-right for each orientation', () => {
    const white = squaresInDisplayOrder('white');
    const black = squaresInDisplayOrder('black');
    expect(white[0]).toBe('a8');
    expect(white[63]).toBe('h1');
    expect(black[0]).toBe('h1');
    expect(black[63]).toBe('a8');
  });

  it('colors a1 dark and h1 light', () => {
    expect(squareColor('a1')).toBe('dark');
    expect(squareColor('h1')).toBe('light');
    expect(squareColor('e4')).toBe('light');
  });
});

describe('<Board>', () => {
  it('names every square with its piece', () => {
    render(<Board fen={START} />);
    const grid = screen.getByRole('grid', { name: /chess board/i });
    expect(within(grid).getAllByRole('button')).toHaveLength(64);
    expect(screen.getByRole('button', { name: 'e1, white king' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'e8, black king' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'e4, empty' })).toBeInTheDocument();
  });

  it('puts h1 in the top-left corner when Black is at the bottom', () => {
    render(<Board fen={START} orientation="black" />);
    const squares = within(screen.getByRole('grid')).getAllByRole('button');
    expect(squares[0]).toHaveAccessibleName('h1, white rook');
    expect(squares[63]).toHaveAccessibleName('a8, black rook');
  });

  it('marks square colors, the last move and a king in check', () => {
    render(<Board fen={WHITE_IN_CHECK} lastMove={['e8', 'e7']} />);
    expect(screen.getByRole('button', { name: /^a1,/ })).toHaveAttribute('data-color', 'dark');
    expect(screen.getByRole('button', { name: /^e1,/ })).toHaveAttribute('data-check', 'true');
    expect(screen.getByRole('button', { name: /^e7,/ })).toHaveAttribute('data-last-move', 'true');
  });

  it('applies the board theme as CSS variables', () => {
    render(<Board fen={START} theme="wood" />);
    const grid = screen.getByRole('grid');
    expect(grid.style.getPropertyValue('--board-light')).toBe('#F0D9B5');
    expect(grid.style.getPropertyValue('--board-dark')).toBe('#B58863');
  });

  it('shows rank and file coordinates on the edge squares', () => {
    render(<Board fen={START} />);
    const a1 = screen.getByRole('button', { name: /^a1,/ });
    expect(within(a1).getByText('a')).toBeInTheDocument();
    expect(within(a1).getByText('1')).toBeInTheDocument();
  });

  it('draws a classification badge on the destination square', () => {
    render(<Board fen={START} badge={{ square: 'e4', classification: 'blunder' }} />);
    const e4 = screen.getByRole('button', { name: /^e4,/ });
    expect(within(e4).getByText('??')).toBeInTheDocument();
    expect(within(e4).getByLabelText('Blunder')).toBeInTheDocument();
  });
});
