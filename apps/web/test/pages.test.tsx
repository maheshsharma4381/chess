import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from '@/app/page';
import LicensesPage from '@/app/about/licenses/page';

describe('home page', () => {
  it('leads with a Play vs Bots call to action', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /play vs bots/i })).toHaveAttribute(
      'href',
      '/play/bots',
    );
  });
});

describe('licenses page', () => {
  it('credits Stockfish (GPL-3.0, with source) and the cburnett pieces (BSD)', () => {
    render(<LicensesPage />);
    expect(screen.getByRole('heading', { name: /Stockfish/ })).toBeInTheDocument();
    expect(screen.getAllByText(/GPL-3\.0/).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /stockfish source/i })).toHaveAttribute(
      'href',
      expect.stringContaining('github.com'),
    );
    expect(screen.getByText(/Colin M\. L\. Burnett/)).toBeInTheDocument();
    expect(screen.getAllByText(/BSD/).length).toBeGreaterThan(0);
  });
});
