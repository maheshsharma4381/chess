import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { loadEcoBook } from '@chess/chess-core/book';
import { OpeningEncyclopedia } from '@/components/openings/OpeningEncyclopedia';
import {
  familiesByFirstMove,
  familyLines,
  practiceHref,
  searchOpenings,
} from '@/lib/openings/encyclopedia';

const book = loadEcoBook();
const loadBook = async () => book;

describe('encyclopedia helpers', () => {
  it('finds openings by name words, ignoring case and accents', () => {
    const najdorf = searchOpenings(book, 'najdorf');
    expect(najdorf[0]).toMatchObject({ eco: 'B90', name: 'Sicilian Defense: Najdorf Variation' });
    expect(najdorf.every((o) => /najdorf/i.test(o.name))).toBe(true);
    expect(searchOpenings(book, 'reti').some((o) => o.name.startsWith('Réti Opening'))).toBe(true);
    expect(searchOpenings(book, 'sicilian dragon').every((o) => /Dragon/.test(o.name))).toBe(true);
  });

  it('finds openings by ECO code or prefix', () => {
    const b20 = searchOpenings(book, 'b20');
    expect(b20[0]).toMatchObject({ eco: 'B20', name: 'Sicilian Defense' });
    expect(b20.every((o) => o.eco === 'B20')).toBe(true);
    expect(searchOpenings(book, 'C6').every((o) => o.eco.startsWith('C6'))).toBe(true);
  });

  it('returns nothing for an empty query and caps the result count', () => {
    expect(searchOpenings(book, '  ')).toEqual([]);
    expect(searchOpenings(book, 'defense', 25)).toHaveLength(25);
  });

  it('groups families by White first move, most lines first', () => {
    const groups = familiesByFirstMove(book);
    expect(groups['1.c4'][0]!.name).toBe('English Opening');
    expect(groups['1.e4'][0]!.name).toBe('Sicilian Defense');
    const counts = groups['1.d4'].map((f) => f.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('lists a family’s named lines, shortest first', () => {
    const sicilian = familiesByFirstMove(book)['1.e4'][0]!;
    const lines = familyLines(book, sicilian);
    expect(lines).toHaveLength(sicilian.count);
    expect(lines[0]).toMatchObject({ name: 'Sicilian Defense', pgn: '1. e4 c5' });
  });

  it('links Practice to the line’s final position with the explorer open', () => {
    const entry = searchOpenings(book, 'najdorf')[0]!;
    const c = new Chess();
    for (const san of ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'])
      c.move(san);
    const url = new URL(practiceHref(entry), 'http://x');
    expect(url.pathname).toBe('/analysis');
    expect(url.searchParams.get('fen')).toBe(c.fen());
    expect(url.searchParams.get('explorer')).toBe('1');
  });
});

describe('<OpeningEncyclopedia>', () => {
  it('shows the 1.e4 families once the book loads', async () => {
    render(<OpeningEncyclopedia loadBook={loadBook} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading the opening book');
    expect(await screen.findByText('Sicilian Defense')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1.e4' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches to the 1.c4 tab and lists the English Opening', async () => {
    render(<OpeningEncyclopedia loadBook={loadBook} />);
    await screen.findByText('Sicilian Defense');
    await userEvent.click(screen.getByRole('button', { name: '1.c4' }));
    expect(screen.getByText('English Opening')).toBeInTheDocument();
    expect(screen.queryByText('Sicilian Defense')).toBeNull();
  });

  it('expands a family into its lines with Practice links', async () => {
    render(<OpeningEncyclopedia loadBook={loadBook} />);
    await userEvent.click(await screen.findByText('Sicilian Defense'));
    const lines = await screen.findByRole('list', { name: 'Sicilian Defense lines' });
    const first = within(lines).getAllByRole('listitem')[0]!;
    expect(first).toHaveTextContent('B20');
    expect(first).toHaveTextContent('1. e4 c5');
    expect(within(first).getByRole('link', { name: /Practice/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/analysis?fen='),
    );
  });

  it('searches as you type and shows the results', async () => {
    render(<OpeningEncyclopedia loadBook={loadBook} />);
    await screen.findByText('Sicilian Defense');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search openings' }), 'najdorf');
    const results = await screen.findByRole('list', { name: 'Search results' });
    await waitFor(() =>
      expect(within(results).getAllByRole('listitem')[0]).toHaveTextContent(
        'Sicilian Defense: Najdorf Variation',
      ),
    );
    expect(within(results).getAllByRole('listitem')[0]).toHaveTextContent('B90');
  });

  it('says so when nothing matches', async () => {
    render(<OpeningEncyclopedia loadBook={loadBook} />);
    await screen.findByText('Sicilian Defense');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search openings' }), 'zzzz');
    expect(await screen.findByText('No openings match “zzzz”.')).toBeInTheDocument();
  });
});
