import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chess } from 'chess.js';
import { describe, expect, it, vi } from 'vitest';
import type { EngineAdapter } from '@chess/chess-core';
import type { EngineLine } from '@chess/types';
import { AnalysisStudio } from '@/components/analysis/AnalysisStudio';
import { importGame } from '@/lib/analysis/line';
import { LIVE_DEPTHS } from '@/lib/analysis/useLiveAnalysis';
import type { ExplorerQueryService } from '@/lib/explorer/useExplorer';
import AnalysisPage from '@/app/analysis/page';

const START = new Chess().fen();

/** Answers every search with the first N legal moves; scores are side-to-move POV. */
function fakeEngine() {
  const analyse = vi.fn(async (fen: string, opts: { depth: number; multiPv: number }) => {
    const moves = new Chess(fen).moves({ verbose: true }).slice(0, opts.multiPv);
    return moves.map((m, i): EngineLine => ({
      uci: m.lan,
      pv: [m.lan],
      score: { cp: 50 - i * 20 },
      depth: opts.depth,
    }));
  });
  return { analyse } satisfies EngineAdapter;
}

const explorer: ExplorerQueryService = {
  query: async () => ({ opening: null, totalGames: 0, counterMoves: [], topGames: [] }),
};

const studio = (props: Partial<Parameters<typeof AnalysisStudio>[0]> = {}) => {
  const engine = props.engine ?? fakeEngine();
  render(<AnalysisStudio engine={engine} explorerService={explorer} {...props} />);
  return engine;
};

const moveList = () => screen.getByRole('table', { name: 'Moves' });
const square = (name: string) =>
  within(screen.getByRole('grid', { name: /board/i })).getByRole('button', {
    name: new RegExp(`^${name},`),
  });

describe('importGame (FEN rules)', () => {
  it('rejects a FEN where the side not to move is in check', () => {
    expect(importGame('4k3/8/8/8/8/8/4R3/4K3 w - - 0 1')).toEqual({
      ok: false,
      error: 'Black is in check but it is White to move.',
    });
  });
});

describe('<AnalysisStudio>', () => {
  it('imports a PGN and shows its moves', async () => {
    studio();
    await userEvent.type(screen.getByLabelText('FEN or PGN'), '1. e4 e5 2. Nf3');
    await userEvent.click(screen.getByRole('button', { name: 'Load' }));
    expect(within(moveList()).getByText('Nf3')).toBeInTheDocument();
    expect(within(moveList()).getByText('e5')).toBeInTheDocument();
  });

  it('shows an error for a bad FEN and keeps the current game', async () => {
    studio();
    await userEvent.type(screen.getByLabelText('FEN or PGN'), '8/8/8/8/8/8/8/8 w - - 0 1');
    await userEvent.click(screen.getByRole('button', { name: 'Load' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/king/i);
    expect(square('e2')).toHaveAccessibleName(/white pawn/);
  });

  it('requests the chosen number of lines and deepens step by step', async () => {
    const engine = studio();
    await waitFor(() =>
      expect(engine.analyse).toHaveBeenCalledWith(
        START,
        expect.objectContaining({ depth: LIVE_DEPTHS.at(-1), multiPv: 3 }),
      ),
    );
    const lines = screen.getByRole('list', { name: 'Engine lines' });
    await waitFor(() => expect(within(lines).getAllByRole('button')).toHaveLength(3));
    expect(screen.getByText(`Depth ${LIVE_DEPTHS.at(-1)}`)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '1 line' }));
    await waitFor(() => expect(within(lines).getAllByRole('button')).toHaveLength(1));
    expect(engine.analyse).toHaveBeenLastCalledWith(START, expect.objectContaining({ multiPv: 1 }));
  });

  it('shows scores from White’s point of view', async () => {
    studio({ initialPgn: '1. e4' });
    const lines = await screen.findByRole('list', { name: 'Engine lines' });
    // Black to move, engine says +0.5 for Black => -0.5 for White.
    await waitFor(() => expect(within(lines).getAllByRole('button')[0]).toHaveTextContent('-0.5'));
  });

  it('plays the first move of a clicked line', async () => {
    studio();
    const lines = screen.getByRole('list', { name: 'Engine lines' });
    await waitFor(() => expect(within(lines).getAllByRole('button')).toHaveLength(3));
    const first = within(lines).getAllByRole('button')[0]!;
    const san = first.getAttribute('data-san')!;
    await userEvent.click(first);
    expect(within(moveList()).getByText(san)).toBeInTheDocument();
  });

  it('plays moves on the board for both sides', async () => {
    studio();
    await userEvent.click(square('e2'));
    await userEvent.click(square('e4'));
    await userEvent.click(square('e7'));
    await userEvent.click(square('e5'));
    expect(within(moveList()).getByText('e4')).toBeInTheDocument();
    expect(within(moveList()).getByText('e5')).toBeInTheDocument();
  });

  it('lets the focused board use the arrow keys without stepping through moves', async () => {
    studio({ initialPgn: '1. e4 e5' });
    expect(screen.getByRole('button', { name: 'Next move' })).toBeDisabled();
    fireEvent.keyDown(square('e4'), { key: 'ArrowLeft' });
    expect(screen.getByRole('button', { name: 'Next move' })).toBeDisabled();
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(screen.getByRole('button', { name: 'Next move' })).toBeEnabled();
  });

  it('edits a position: places and removes pieces and rejects a position without a king', async () => {
    studio();
    await userEvent.click(screen.getByRole('button', { name: 'Edit position' }));
    const editor = screen.getByRole('region', { name: 'Board editor' });
    const cell = (sq: string) =>
      within(editor).getByRole('button', { name: new RegExp(`^${sq},`) });

    await userEvent.click(within(editor).getByRole('button', { name: 'Clear board' }));
    await userEvent.click(within(editor).getByRole('button', { name: 'White king' }));
    await userEvent.click(cell('e1'));
    expect(cell('e1')).toHaveAccessibleName('e1, white king');
    await userEvent.click(within(editor).getByRole('button', { name: 'Analyse position' }));
    expect(within(editor).getByRole('alert')).toHaveTextContent('Black needs exactly one king.');

    await userEvent.click(within(editor).getByRole('button', { name: 'Black king' }));
    await userEvent.click(cell('e8'));
    await userEvent.click(within(editor).getByRole('button', { name: 'White queen' }));
    await userEvent.click(cell('d4'));
    await userEvent.click(within(editor).getByRole('button', { name: 'Eraser' }));
    await userEvent.click(cell('d4'));
    expect(cell('d4')).toHaveAccessibleName('d4, empty');
    await userEvent.click(within(editor).getByRole('button', { name: 'White pawn' }));
    await userEvent.click(cell('a2'));
    await userEvent.click(within(editor).getByRole('button', { name: 'Analyse position' }));

    expect(screen.queryByRole('region', { name: 'Board editor' })).toBeNull();
    expect(square('a2')).toHaveAccessibleName(/white pawn/);
    expect(square('d1')).toHaveAccessibleName(/^d1, empty/);
    expect(square('e8')).toHaveAccessibleName(/black king/);
  });

  it('flips the board', async () => {
    studio();
    const grid = screen.getByRole('grid', { name: /board/i });
    const firstCell = () => within(grid).getAllByRole('button')[0]!;
    expect(firstCell()).toHaveAccessibleName(/^a8,/);
    await userEvent.click(screen.getByRole('button', { name: 'Flip board' }));
    expect(firstCell()).toHaveAccessibleName(/^h1,/);
  });
});

describe('/analysis page', () => {
  it('loads the ?fen= position', async () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
    render(await AnalysisPage({ searchParams: Promise.resolve({ fen }) }));
    const grid = screen.getByRole('grid', { name: /board/i });
    expect(within(grid).getByRole('button', { name: /^e2, white pawn/ })).toBeInTheDocument();
    expect(within(grid).getByRole('button', { name: /^d2, empty/ })).toBeInTheDocument();
  });

  it('reports an invalid ?fen= and falls back to the start position', async () => {
    render(await AnalysisPage({ searchParams: Promise.resolve({ fen: 'garbage' }) }));
    // jsdom has no Worker, so the engine panel may also report an error.
    expect(screen.getAllByRole('alert').some((a) => /link/i.test(a.textContent ?? ''))).toBe(true);
    expect(screen.getByRole('grid', { name: /board/i })).toBeInTheDocument();
  });
});
