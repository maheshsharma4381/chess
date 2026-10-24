import type { Score } from '@chess/types';

export interface InfoLine {
  multipv: number;
  depth: number;
  /** Side to move's point of view, as UCI reports it. */
  score: Score;
  pv: string[];
}

/**
 * Parses a UCI `info` line carrying a principal variation. Returns null for every other
 * line, and for lowerbound/upperbound scores (aspiration-window fails are not evaluations).
 */
export function parseInfoLine(line: string): InfoLine | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== 'info') return null;

  let depth: number | null = null;
  let multipv = 1;
  let score: Score | null = null;
  let pv: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'depth') depth = Number(tokens[++i]);
    else if (t === 'multipv') multipv = Number(tokens[++i]);
    else if (t === 'lowerbound' || t === 'upperbound') return null;
    else if (t === 'score') {
      const kind = tokens[++i];
      const value = Number(tokens[++i]);
      if (kind === 'cp') score = { cp: value };
      else if (kind === 'mate') score = { mate: value };
    } else if (t === 'pv') {
      pv = tokens.slice(i + 1);
      break;
    }
  }
  if (depth === null || score === null || pv.length === 0) return null;
  return { multipv, depth, score, pv };
}

export function parseBestMove(line: string): { bestmove: string; ponder?: string } | null {
  const match = /^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/.exec(line.trim());
  if (!match) return null;
  return match[2]
    ? { bestmove: match[1] as string, ponder: match[2] }
    : { bestmove: match[1] as string };
}
