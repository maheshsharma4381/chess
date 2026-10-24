import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MoveClassification } from '@chess/types';
import { EvalGraph, nearestPly, xOf, yOf } from '@/components/review/EvalGraph';

const winGraph = [50, 55, 52, 20, 22, 80];
const moves: Array<{ san: string; classification: MoveClassification }> = [
  { san: 'e4', classification: 'book' },
  { san: 'e5', classification: 'book' },
  { san: 'Bc4', classification: 'blunder' },
  { san: 'Nc6', classification: 'best' },
  { san: 'Qh5', classification: 'brilliant' },
];

describe('eval graph geometry', () => {
  it('spreads plies evenly across the width', () => {
    expect(xOf(0, 5)).toBe(0);
    expect(xOf(5, 5)).toBe(100);
    expect(xOf(2, 5)).toBe(40);
    expect(xOf(0, 0)).toBe(0);
  });

  it("puts the bottom player's advantage at the bottom", () => {
    expect(yOf(80, 'white')).toBe(20); // White ahead: the white fill rises
    expect(yOf(80, 'black')).toBe(80); // Black at the bottom: same eval, Black's share is small
  });

  it('maps a horizontal position to the nearest ply', () => {
    expect(nearestPly(0, 5)).toBe(0);
    expect(nearestPly(38, 5)).toBe(2);
    expect(nearestPly(100, 5)).toBe(5);
    expect(nearestPly(130, 5)).toBe(5);
  });
});

describe('<EvalGraph>', () => {
  const setup = (ply = 2, orientation: 'white' | 'black' = 'white') => {
    const onPly = vi.fn();
    const utils = render(
      <EvalGraph
        winGraph={winGraph}
        moves={moves}
        ply={ply}
        orientation={orientation}
        onPly={onPly}
      />,
    );
    const plot = screen.getByRole('slider', { name: /evaluation graph/i });
    plot.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 500, height: 100, right: 500, bottom: 100 }) as DOMRect;
    return { onPly, plot, ...utils };
  };

  it('is a slider over the plies with a spoken value', () => {
    const { plot } = setup(3);
    expect(plot).toHaveAttribute('aria-valuemin', '0');
    expect(plot).toHaveAttribute('aria-valuemax', '5');
    expect(plot).toHaveAttribute('aria-valuenow', '3');
    expect(plot).toHaveAttribute(
      'aria-valuetext',
      expect.stringMatching(/Move 2\. Bc4.*White 20%/),
    );
  });

  it('jumps to the ply nearest a click', () => {
    const { onPly, plot } = setup();
    fireEvent.click(plot, { clientX: 410, clientY: 50 });
    expect(onPly).toHaveBeenCalledWith(4);
  });

  it('marks notable moves with their badge symbol, not color alone', () => {
    setup();
    const markers = screen.getAllByTestId(/^graph-marker-/);
    expect(markers.map((m) => m.dataset['classification'])).toEqual(['blunder', 'brilliant']);
    expect(within(markers[0] as HTMLElement).getByText('??')).toBeInTheDocument();
  });

  it('shows a tooltip with the move and evaluation on hover', () => {
    const { plot } = setup();
    fireEvent.pointerMove(plot, { clientX: 300, clientY: 40 });
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Move 2. Bc4');
    expect(tip).toHaveTextContent('White 20%');
    expect(tip).toHaveTextContent('Blunder');
    fireEvent.pointerLeave(plot);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('places the current-ply line at the ply', () => {
    const { rerender, onPly } = setup(1);
    expect(screen.getByTestId('graph-current')).toHaveStyle({ left: '20%' });
    rerender(
      <EvalGraph winGraph={winGraph} moves={moves} ply={5} orientation="white" onPly={onPly} />,
    );
    expect(screen.getByTestId('graph-current')).toHaveStyle({ left: '100%' });
  });

  it('offers the data as a table for screen readers', () => {
    setup();
    const table = screen.getByRole('table', { name: /evaluation by move/i });
    expect(within(table).getAllByRole('row')).toHaveLength(6); // header + 5 moves
    expect(within(table).getByRole('row', { name: /Bc4/ })).toHaveTextContent('20');
  });
});
