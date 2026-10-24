import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-4 text-sm text-text-muted">
        <span>Engine: Stockfish 19 (GPL-3.0)</span>
        <Link
          href="/about/licenses"
          className="inline-flex min-h-11 items-center underline-offset-4 hover:text-text hover:underline"
        >
          Licenses
        </Link>
      </div>
    </footer>
  );
}
