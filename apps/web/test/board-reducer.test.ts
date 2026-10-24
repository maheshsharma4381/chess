import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import {
  boardReducer,
  initialBoardState,
  type BoardAction,
  type BoardState,
} from '@/lib/board/reducer';
import { premoveTargets } from '@/lib/board/premoves';

const START = new Chess().fen();
const after = (sans: string) => {
  const c = new Chess();
  for (const s of sans.split(' ')) c.move(s);
  return c.fen();
};
const run = (state: BoardState, ...actions: BoardAction[]) => actions.reduce(boardReducer, state);
const click = (square: string): BoardAction => ({ type: 'squareClicked', square });

describe('selecting and moving on your turn', () => {
  const s0 = initialBoardState({ fen: START, movable: 'w' });

  it('selects your piece and lists its legal targets', () => {
    const s = run(s0, click('g1'));
    expect(s.selected).toBe('g1');
    expect([...s.legalTargets].sort()).toEqual(['f3', 'h3']);
  });

  it('emits a move intent when a target is clicked', () => {
    const s = run(s0, click('e2'), click('e4'));
    expect(s.intent).toEqual({ from: 'e2', to: 'e4', premove: false });
    expect(s.selected).toBeNull();
  });

  it('reselects another own piece, and deselects on an empty or illegal square', () => {
    expect(run(s0, click('e2'), click('d2')).selected).toBe('d2');
    expect(run(s0, click('e2'), click('e5')).selected).toBeNull();
    expect(run(s0, click('e2'), click('e2')).selected).toBeNull();
    expect(run(s0, click('e7')).selected).toBeNull(); // opponent's piece
  });

  it('supports drag-and-drop as a move attempt', () => {
    const s = run(s0, { type: 'moveAttempt', from: 'g1', to: 'f3' });
    expect(s.intent).toEqual({ from: 'g1', to: 'f3', premove: false });
  });

  it('ignores clicks when the board is not movable', () => {
    const s = run(initialBoardState({ fen: START, movable: 'none' }), click('e2'));
    expect(s.selected).toBeNull();
  });
});

describe('promotion', () => {
  const fen = '8/4P3/8/8/8/8/k7/4K3 w - - 0 1';
  const s0 = initialBoardState({ fen, movable: 'w' });

  it('asks for the piece, then emits the move with it', () => {
    const asking = run(s0, click('e7'), click('e8'));
    expect(asking.pendingPromotion).toEqual({ from: 'e7', to: 'e8' });
    expect(asking.intent).toBeNull();
    const chosen = run(asking, { type: 'promotionChosen', piece: 'n' });
    expect(chosen.intent).toEqual({ from: 'e7', to: 'e8', promotion: 'n', premove: false });
    expect(chosen.pendingPromotion).toBeNull();
  });

  it('makes no move when promotion is cancelled', () => {
    const s = run(s0, click('e7'), click('e8'), { type: 'promotionCancelled' });
    expect(s.intent).toBeNull();
    expect(s.pendingPromotion).toBeNull();
  });
});

describe('premoves', () => {
  // White to move; the user plays Black, so Black's clicks are premoves.
  const s0 = initialBoardState({ fen: START, movable: 'b' });

  it('uses piece geometry for premove targets, ignoring blockers', () => {
    expect(premoveTargets('d8', { type: 'q', color: 'b' })).toContain('d1');
    expect(premoveTargets('g8', { type: 'n', color: 'b' }).sort()).toEqual(['e7', 'f6', 'h6']);
    expect(premoveTargets('e7', { type: 'p', color: 'b' }).sort()).toEqual([
      'd6',
      'e5',
      'e6',
      'f6',
    ]);
  });

  it('queues several premoves during the opponent turn', () => {
    const s = run(s0, click('e7'), click('e5'), click('g8'), click('f6'));
    expect(s.premoves).toEqual([
      { from: 'e7', to: 'e5' },
      { from: 'g8', to: 'f6' },
    ]);
    expect(s.intent).toBeNull();
  });

  it('builds later premoves on top of earlier ones', () => {
    // After premoving e7-e5, the pawn now stands on e5 and can be premoved again.
    const s = run(s0, click('e7'), click('e5'), click('e5'), click('e4'));
    expect(s.premoves).toEqual([
      { from: 'e7', to: 'e5' },
      { from: 'e5', to: 'e4' },
    ]);
  });

  it('plays the first premove as soon as it is legal on your turn', () => {
    const queued = run(s0, click('e7'), click('e5'), click('g8'), click('f6'));
    const s = boardReducer(queued, { type: 'positionChanged', fen: after('e4') });
    expect(s.intent).toEqual({ from: 'e7', to: 'e5', premove: true });
    expect(s.premoves).toEqual([{ from: 'g8', to: 'f6' }]);
  });

  it('clears the whole queue when the first premove became illegal', () => {
    // 1.e4 d5, White to move; Black premoves Nf6 and e5.
    const queued = run(
      initialBoardState({ fen: after('e4 d5'), movable: 'b' }),
      click('g8'),
      click('f6'),
      click('e7'),
      click('e5'),
    );
    // 2.Bb5+ : in check, Nf6 is illegal, so nothing is played and the queue is dropped.
    const s = boardReducer(queued, { type: 'positionChanged', fen: after('e4 d5 Bb5+') });
    expect(s.intent).toBeNull();
    expect(s.premoves).toEqual([]);
  });

  it('defaults a premoved promotion to a queen', () => {
    const fen = 'k7/8/8/8/8/8/4p3/K7 w - - 0 1'; // White to move, user is Black
    const queued = run(initialBoardState({ fen, movable: 'b' }), click('e2'), click('e1'));
    expect(queued.premoves).toEqual([{ from: 'e2', to: 'e1', promotion: 'q' }]);
    const s = boardReducer(queued, {
      type: 'positionChanged',
      fen: 'k7/8/8/8/8/8/4p3/1K6 b - - 1 1',
    });
    expect(s.intent).toEqual({ from: 'e2', to: 'e1', promotion: 'q', premove: true });
  });

  it('clears premoves on a right click', () => {
    const queued = run(s0, click('e7'), click('e5'));
    const s = boardReducer(queued, { type: 'rightClick', square: 'a4', modifiers: {} });
    expect(s.premoves).toEqual([]);
    expect(s.highlights).toEqual([]); // the click only cancelled premoves
  });
});

describe('arrows and highlights', () => {
  const s0 = initialBoardState({ fen: START, movable: 'w' });
  const drag = (from: string, to: string, modifiers = {}): BoardAction => ({
    type: 'rightDrag',
    from,
    to,
    modifiers,
  });

  it('draws arrows colored by modifier keys', () => {
    const s = run(
      s0,
      drag('e2', 'e4'),
      drag('d2', 'd4', { shift: true }),
      drag('g1', 'f3', { alt: true }),
      drag('b1', 'c3', { ctrl: true }),
    );
    expect(s.arrows).toEqual([
      { from: 'e2', to: 'e4', color: 'orange' },
      { from: 'd2', to: 'd4', color: 'red' },
      { from: 'g1', to: 'f3', color: 'blue' },
      { from: 'b1', to: 'c3', color: 'green' },
    ]);
  });

  it('removes an arrow drawn twice and recolors one drawn with another color', () => {
    expect(run(s0, drag('e2', 'e4'), drag('e2', 'e4')).arrows).toEqual([]);
    expect(run(s0, drag('e2', 'e4'), drag('e2', 'e4', { shift: true })).arrows).toEqual([
      { from: 'e2', to: 'e4', color: 'red' },
    ]);
  });

  it('toggles a square highlight with a right click', () => {
    const on = boardReducer(s0, { type: 'rightClick', square: 'f7', modifiers: {} });
    expect(on.highlights).toEqual(['f7']);
    expect(
      boardReducer(on, { type: 'rightClick', square: 'f7', modifiers: {} }).highlights,
    ).toEqual([]);
  });

  it('clears arrows and highlights on any left click', () => {
    const marked = run(s0, drag('e2', 'e4'), { type: 'rightClick', square: 'f7', modifiers: {} });
    const s = boardReducer(marked, click('a3'));
    expect(s.arrows).toEqual([]);
    expect(s.highlights).toEqual([]);
  });
});

describe('intent bookkeeping', () => {
  it('clears the intent once the consumer applies it', () => {
    const s = run(initialBoardState({ fen: START, movable: 'w' }), click('e2'), click('e4'), {
      type: 'intentConsumed',
    });
    expect(s.intent).toBeNull();
  });
});
