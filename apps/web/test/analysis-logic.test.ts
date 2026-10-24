import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import {
  editorFen,
  emptyPosition,
  positionFromFen,
  validateEditorPosition,
  type EditorPosition,
} from '@/lib/analysis/editor';
import { fensOf, importGame, playUci } from '@/lib/analysis/line';

const START = new Chess().fen();

describe('importGame', () => {
  it('reads a PGN with headers, comments and a result', () => {
    const result = importGame('[Event "x"]\n\n1. e4 {best} e5 2. Nf3 Nc6 1-0');
    expect(result).toEqual({
      ok: true,
      line: { startFen: START, sans: ['e4', 'e5', 'Nf3', 'Nc6'] },
    });
  });

  it('reads a FEN as a position with no moves', () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
    expect(importGame(`  ${fen} `)).toEqual({ ok: true, line: { startFen: fen, sans: [] } });
  });

  it('reports an empty paste, a bad FEN and an illegal move', () => {
    expect(importGame('   ')).toEqual({ ok: false, error: 'Paste a FEN or a PGN.' });
    const badFen = importGame('8/8/8/8/8/8/8/8 w - - 0 1');
    expect(badFen.ok).toBe(false);
    expect(!badFen.ok && badFen.error).toMatch(/king/i);
    const illegal = importGame('1. e4 e5 2. Ke3');
    expect(!illegal.ok && illegal.error).toBe('Illegal move 2. Ke3.');
  });

  it('honours a [FEN] header', () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
    const result = importGame(`[SetUp "1"]\n[FEN "${fen}"]\n\n1. e4 Kd7`);
    expect(result).toEqual({ ok: true, line: { startFen: fen, sans: ['e4', 'Kd7'] } });
  });
});

describe('playUci / fensOf', () => {
  const line = { startFen: START, sans: ['e4', 'e5', 'Nf3'] };

  it('appends at the end and truncates the future when playing from an earlier ply', () => {
    expect(playUci(line, 3, 'b8c6')?.sans).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(playUci(line, 1, 'c7c5')?.sans).toEqual(['e4', 'c5']);
  });

  it('keeps the line when the move is already the next one', () => {
    expect(playUci(line, 1, 'e7e5')).toBe(line);
  });

  it('rejects an illegal move', () => {
    expect(playUci(line, 3, 'e8e6')).toBeNull();
  });

  it('lists a FEN per ply', () => {
    const fens = fensOf(line);
    expect(fens).toHaveLength(4);
    expect(fens[0]).toBe(START);
    expect(fens[3]).toContain('5N2');
  });
});

describe('board editor model', () => {
  it('round-trips the start position', () => {
    expect(editorFen(positionFromFen(START))).toBe(START);
  });

  it('rejects a position without both kings', () => {
    const pos = positionFromFen(START);
    delete pos.pieces['e1'];
    expect(validateEditorPosition(pos)).toBe('White needs exactly one king.');
    expect(validateEditorPosition(emptyPosition())).toBe('White needs exactly one king.');
  });

  it('rejects pawns on the back ranks and a side not to move in check', () => {
    const pawn: EditorPosition = { pieces: { e1: 'K', e8: 'k', a8: 'P' }, turn: 'w', castling: '' };
    expect(validateEditorPosition(pawn)).toBe('Pawns cannot stand on the first or last rank.');
    const check: EditorPosition = {
      pieces: { e1: 'K', e8: 'k', e2: 'R' },
      turn: 'w',
      castling: '',
    };
    expect(validateEditorPosition(check)).toBe('Black is in check but it is White to move.');
    expect(validateEditorPosition({ ...check, turn: 'b' })).toBeNull();
  });

  it('drops castling rights whose king or rook has left its square', () => {
    const pos = positionFromFen(START);
    delete pos.pieces['h1'];
    expect(editorFen(pos).split(' ')[2]).toBe('Qkq');
    expect(editorFen({ ...pos, castling: '' }).split(' ')[2]).toBe('-');
  });
});
