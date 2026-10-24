import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Licenses' };

const CREDITS = [
  {
    name: 'Stockfish 19',
    license: 'GPL-3.0',
    detail:
      'The engine runs in your browser as a separate WebAssembly program: stockfish.js 19.0.1 (lite, single-threaded) by Nathan Rugg, built from Stockfish 19. The exact source of the shipped build is the stockfish.js v19.0.1 release.',
    links: [
      {
        label: 'stockfish.js source (v19.0.1)',
        href: 'https://github.com/nmrugg/stockfish.js/tree/v19.0.1',
      },
      { label: 'Stockfish source', href: 'https://github.com/official-stockfish/Stockfish' },
      { label: 'GPL-3.0 license text (Copying.txt)', href: '/engine/Copying.txt' },
    ],
  },
  {
    name: 'Chess pieces "cburnett"',
    license: 'BSD (author offers GFDL / CC BY-SA 3.0 / BSD / GPL)',
    detail:
      'Piece artwork by Colin M. L. Burnett, via Wikimedia Commons, used under the BSD license. Copyright (c) 2006.',
    links: [
      { label: 'BSD notice (LICENSE.txt)', href: '/pieces/cburnett/LICENSE.txt' },
      {
        label: 'Wikimedia Commons',
        href: 'https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces',
      },
    ],
  },
  {
    name: 'Opening names',
    license: 'CC0-1.0',
    detail: 'ECO codes and opening names from the lichess-org/chess-openings dataset.',
    links: [{ label: 'chess-openings', href: 'https://github.com/lichess-org/chess-openings' }],
  },
  {
    name: 'Opening explorer statistics',
    license: 'Lichess API terms',
    detail:
      'Masters and Lichess game statistics come from the Lichess opening explorer, fetched through this site’s server.',
    links: [{ label: 'Lichess API', href: 'https://lichess.org/api' }],
  },
  {
    name: 'chess.js',
    license: 'BSD-2-Clause',
    detail: 'Move generation and PGN/FEN handling. Copyright (c) Jeff Hlywa.',
    links: [{ label: 'chess.js', href: 'https://github.com/jhlywa/chess.js' }],
  },
  {
    name: 'gifenc',
    license: 'MIT',
    detail: 'Animated GIF export. Copyright (c) 2017 Matt DesLauriers.',
    links: [{ label: 'gifenc', href: 'https://github.com/mattdesl/gifenc' }],
  },
  {
    name: 'Inter typeface',
    license: 'SIL Open Font License 1.1',
    detail: 'By Rasmus Andersson.',
    links: [{ label: 'Inter', href: 'https://rsms.me/inter/' }],
  },
];

export default function LicensesPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold">Licenses</h1>
      <ul className="mt-6 space-y-4">
        {CREDITS.map((c) => (
          <li key={c.name} className="rounded-(--radius-panel) border border-border bg-surface p-4">
            <h2 className="font-semibold">{c.name}</h2>
            <p className="mt-1 text-sm text-accent">{c.license}</p>
            <p className="mt-2 text-sm text-text-muted">{c.detail}</p>
            <p className="mt-2 flex flex-wrap gap-x-4 text-sm">
              {c.links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="text-brand underline-offset-4 hover:underline"
                >
                  {l.label}
                </a>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
