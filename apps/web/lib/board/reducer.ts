import { Chess, type PieceSymbol, type Square } from 'chess.js';
import type { ArrowColor } from '@/lib/design/tokens';
import { isPromotionSquare, premoveTargets, virtualBoard, type Premove } from './premoves';

/** Which side the user may move: one color in games, both in analysis, none when over. */
export type Movable = 'w' | 'b' | 'both' | 'none';

export interface Arrow {
  from: Square;
  to: Square;
  color: ArrowColor;
}

/** A move the user asked for; the owner of the game applies it and reports positionChanged. */
export interface MoveIntent {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
  premove: boolean;
}

export interface BoardState {
  fen: string;
  movable: Movable;
  selected: Square | null;
  legalTargets: Square[];
  premoves: Premove[];
  arrows: Arrow[];
  highlights: Square[];
  pendingPromotion: { from: Square; to: Square } | null;
  intent: MoveIntent | null;
}

export interface Modifiers {
  shift?: boolean;
  alt?: boolean;
  ctrl?: boolean;
}

export type BoardAction =
  | { type: 'squareClicked'; square: string }
  | { type: 'moveAttempt'; from: string; to: string }
  | { type: 'promotionChosen'; piece: PieceSymbol }
  | { type: 'promotionCancelled' }
  | { type: 'rightClick'; square: string; modifiers: Modifiers }
  | { type: 'rightDrag'; from: string; to: string; modifiers: Modifiers }
  | { type: 'positionChanged'; fen: string }
  | { type: 'setMovable'; movable: Movable }
  | { type: 'intentConsumed' };

export function initialBoardState(init: { fen: string; movable: Movable }): BoardState {
  return {
    fen: init.fen,
    movable: init.movable,
    selected: null,
    legalTargets: [],
    premoves: [],
    arrows: [],
    highlights: [],
    pendingPromotion: null,
    intent: null,
  };
}

const turnOf = (fen: string) => (fen.split(' ')[1] === 'b' ? 'b' : 'w');
const usersTurn = (s: BoardState) => s.movable === 'both' || s.movable === turnOf(s.fen);
const premoving = (s: BoardState) =>
  (s.movable === 'w' || s.movable === 'b') && s.movable !== turnOf(s.fen);

const deselect = (s: BoardState): BoardState => ({ ...s, selected: null, legalTargets: [] });

function legalTargetsOf(fen: string, square: Square): Square[] {
  return [...new Set(new Chess(fen).moves({ square, verbose: true }).map((m) => m.to))];
}

function attemptMove(s: BoardState, from: Square, to: Square): BoardState {
  const moves = new Chess(s.fen).moves({ square: from, verbose: true }).filter((m) => m.to === to);
  if (moves.length === 0) return deselect(s);
  if (moves.some((m) => m.promotion)) return { ...deselect(s), pendingPromotion: { from, to } };
  return { ...deselect(s), intent: { from, to, premove: false } };
}

function addPremove(s: BoardState, from: Square, to: Square): BoardState {
  const board = virtualBoard(s.fen, s.premoves);
  const piece = board.get(from);
  if (!piece || !premoveTargets(from, piece).includes(to)) return deselect(s);
  const premove: Premove = isPromotionSquare(piece, to)
    ? { from, to, promotion: 'q' }
    : { from, to };
  return { ...deselect(s), premoves: [...s.premoves, premove] };
}

function select(s: BoardState, square: Square): BoardState {
  if (usersTurn(s)) {
    const piece = new Chess(s.fen).get(square);
    if (!piece || piece.color !== turnOf(s.fen) || square === s.selected) return deselect(s);
    return { ...s, selected: square, legalTargets: legalTargetsOf(s.fen, square) };
  }
  const piece = virtualBoard(s.fen, s.premoves).get(square);
  if (!piece || piece.color !== s.movable || square === s.selected) return deselect(s);
  return { ...s, selected: square, legalTargets: premoveTargets(square, piece) };
}

function move(s: BoardState, from: Square, to: Square): BoardState {
  if (usersTurn(s)) return attemptMove(s, from, to);
  if (premoving(s)) return addPremove(s, from, to);
  return deselect(s);
}

const arrowColor = (m: Modifiers): ArrowColor =>
  m.shift ? 'red' : m.alt ? 'blue' : m.ctrl ? 'green' : 'orange';

function rightClick(s: BoardState, square: Square): BoardState {
  // A right click first cancels premoves; otherwise it toggles a square highlight.
  if (s.premoves.length) return { ...deselect(s), premoves: [] };
  const highlights = s.highlights.includes(square)
    ? s.highlights.filter((h) => h !== square)
    : [...s.highlights, square];
  return { ...s, highlights };
}

function toggleArrow(s: BoardState, from: Square, to: Square, color: ArrowColor): BoardState {
  const existing = s.arrows.find((a) => a.from === from && a.to === to);
  const others = s.arrows.filter((a) => a !== existing);
  if (existing?.color === color) return { ...s, arrows: others };
  if (existing)
    return { ...s, arrows: s.arrows.map((a) => (a === existing ? { from, to, color } : a)) };
  return { ...s, arrows: [...s.arrows, { from, to, color }] };
}

/** After any move: play the first premove if it is now legal, otherwise drop the queue. */
function positionChanged(s: BoardState, fen: string): BoardState {
  const next: BoardState = { ...deselect(s), fen, pendingPromotion: null };
  if (!usersTurn(next) || next.premoves.length === 0) return next;

  const [first, ...rest] = next.premoves as [Premove, ...Premove[]];
  const legal = new Chess(fen)
    .moves({ square: first.from, verbose: true })
    .some((m) => m.to === first.to && (!m.promotion || m.promotion === (first.promotion ?? 'q')));
  if (!legal) return { ...next, premoves: [] };
  const intent: MoveIntent = first.promotion
    ? { from: first.from, to: first.to, promotion: first.promotion, premove: true }
    : { from: first.from, to: first.to, premove: true };
  return { ...next, premoves: rest, intent };
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'squareClicked': {
      const s = { ...state, arrows: [], highlights: [] };
      const square = action.square as Square;
      if (s.movable === 'none' || s.pendingPromotion) return deselect(s);
      if (s.selected && s.selected !== square && s.legalTargets.includes(square)) {
        return move(s, s.selected, square);
      }
      return select(s, square);
    }
    case 'moveAttempt': {
      if (state.movable === 'none' || state.pendingPromotion) return state;
      return move(
        { ...state, arrows: [], highlights: [] },
        action.from as Square,
        action.to as Square,
      );
    }
    case 'promotionChosen': {
      const pending = state.pendingPromotion;
      if (!pending) return state;
      return {
        ...state,
        pendingPromotion: null,
        intent: { ...pending, promotion: action.piece, premove: false },
      };
    }
    case 'promotionCancelled':
      return { ...state, pendingPromotion: null };
    case 'rightClick':
      return rightClick(state, action.square as Square);
    case 'rightDrag':
      if (action.from === action.to) return rightClick(state, action.from as Square);
      return toggleArrow(
        state,
        action.from as Square,
        action.to as Square,
        arrowColor(action.modifiers),
      );
    case 'positionChanged':
      return positionChanged(state, action.fen);
    case 'setMovable':
      return {
        ...deselect(state),
        movable: action.movable,
        premoves: action.movable === 'none' ? [] : state.premoves,
      };
    case 'intentConsumed':
      return { ...state, intent: null };
  }
}
