import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chess } from 'chess.js';
import { describe, expect, it, vi } from 'vitest';
import { InteractiveBoard } from '@/components/board/InteractiveBoard';
import { trackPieces } from '@/lib/board/pieceTracking';

const START = new Chess().fen();
const after = (sans: string) => {
  const c = new Chess();
  for (const s of sans.split(' ')) c.move(s);
  return c.fen();
};
const square = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name},`) });

describe('trackPieces', () => {
  it('keeps the same id for a piece that moved, so it can slide', () => {
    const before = trackPieces([], START);
    const knight = before.find((p) => p.square === 'g1');
    const next = trackPieces(before, after('Nf3'));
    expect(next.find((p) => p.square === 'f3')?.id).toBe(knight?.id);
    expect(next).toHaveLength(32);
  });

  it('drops captured pieces and keeps the capturer id', () => {
    const before = trackPieces([], after('e4 d5'));
    const pawn = before.find((p) => p.square === 'e4');
    const next = trackPieces(before, after('e4 d5 exd5'));
    expect(next).toHaveLength(31);
    expect(next.find((p) => p.square === 'd5')?.id).toBe(pawn?.id);
  });
});

describe('<InteractiveBoard>', () => {
  it('moves by clicking a piece and then a target', async () => {
    const onMove = vi.fn();
    const user = userEvent.setup();
    render(<InteractiveBoard fen={START} movable="w" onMove={onMove} />);
    await user.click(square('e2'));
    expect(square('e2')).toHaveAttribute('data-selected', 'true');
    expect(square('e4')).toHaveAttribute('data-target', 'true');
    await user.click(square('e4'));
    expect(onMove).toHaveBeenCalledWith({ from: 'e2', to: 'e4', premove: false });
  });

  it('moves with the keyboard on a flipped board', async () => {
    const onMove = vi.fn();
    const user = userEvent.setup();
    render(<InteractiveBoard fen={after('e4')} movable="b" orientation="black" onMove={onMove} />);
    await user.tab();
    expect(square('h8')).toHaveFocus(); // bottom-left from Black's side
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowUp}');
    expect(square('e7')).toHaveFocus();
    await user.keyboard('{Enter}{ArrowUp}{ArrowUp}{Enter}');
    expect(onMove).toHaveBeenCalledWith({ from: 'e7', to: 'e5', premove: false });
  });

  it('cancels a selection with Escape', async () => {
    const user = userEvent.setup();
    render(<InteractiveBoard fen={START} movable="w" onMove={vi.fn()} />);
    await user.click(square('g1'));
    await user.keyboard('{Escape}');
    expect(square('g1')).not.toHaveAttribute('data-selected');
  });

  it('asks which piece to promote to', async () => {
    const onMove = vi.fn();
    const user = userEvent.setup();
    render(<InteractiveBoard fen="8/4P3/8/8/8/8/k7/4K3 w - - 0 1" movable="w" onMove={onMove} />);
    await user.click(square('e7'));
    await user.click(square('e8'));
    const dialog = screen.getByRole('dialog', { name: /promote/i });
    expect(within(dialog).getByRole('button', { name: 'Queen' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Knight' }));
    expect(onMove).toHaveBeenCalledWith({ from: 'e7', to: 'e8', promotion: 'n', premove: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the promotion picker with Escape and makes no move', async () => {
    const onMove = vi.fn();
    const user = userEvent.setup();
    render(<InteractiveBoard fen="8/4P3/8/8/8/8/k7/4K3 w - - 0 1" movable="w" onMove={onMove} />);
    await user.click(square('e7'));
    await user.click(square('e8'));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onMove).not.toHaveBeenCalled();
  });

  it('shows queued premoves in red', async () => {
    const user = userEvent.setup();
    render(<InteractiveBoard fen={START} movable="b" onMove={vi.fn()} />);
    await user.click(square('e7'));
    await user.click(square('e5'));
    expect(square('e7')).toHaveAttribute('data-premove', 'true');
    expect(square('e5')).toHaveAttribute('data-premove', 'true');
  });

  it('draws an arrow with a right-button drag', () => {
    render(<InteractiveBoard fen={START} movable="w" onMove={vi.fn()} />);
    const grid = screen.getByRole('grid');
    grid.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 800, right: 800, bottom: 800 }) as DOMRect;
    // e2 = column 4, row 6 -> centre (450, 650); e4 = row 4 -> (450, 450)
    fireEvent.pointerDown(grid, { button: 2, clientX: 450, clientY: 650, pointerId: 1 });
    fireEvent.pointerUp(grid, {
      button: 2,
      clientX: 450,
      clientY: 450,
      pointerId: 1,
      shiftKey: true,
    });
    const arrow = screen.getByTestId('arrow-e2-e4');
    expect(arrow).toHaveAttribute('data-color', 'red');
  });

  it('moves by drag and drop, and the next click still works', async () => {
    const onMove = vi.fn();
    render(<InteractiveBoard fen={START} movable="w" onMove={onMove} />);
    const grid = screen.getByRole('grid');
    grid.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 800, right: 800, bottom: 800 }) as DOMRect;
    // g1 = column 6, row 7 -> (650, 750); f3 = column 5, row 5 -> (550, 550)
    fireEvent.pointerDown(grid, { button: 0, clientX: 650, clientY: 750, pointerId: 7 });
    fireEvent.pointerMove(grid, { button: 0, clientX: 600, clientY: 650, pointerId: 7 });
    fireEvent.pointerUp(grid, { button: 0, clientX: 550, clientY: 550, pointerId: 7 });
    expect(onMove).toHaveBeenCalledWith({ from: 'g1', to: 'f3', premove: false });

    // Browsers send no click after a drag that ends on another square, so nothing may
    // stay "suppressed": the user's next click must select normally.
    await new Promise((r) => setTimeout(r, 10));
    fireEvent.click(square('e2'));
    expect(square('e2')).toHaveAttribute('data-selected', 'true');
  });

  it('slides pieces with the fast motion token (zeroed for reduced motion)', () => {
    render(<InteractiveBoard fen={START} movable="w" onMove={vi.fn()} />);
    const piece = screen.getByTestId('piece-e1');
    expect(piece.style.transition).toContain('var(--duration-fast)');
    expect(piece.style.transition).toContain('var(--ease-standard)');
  });
});
