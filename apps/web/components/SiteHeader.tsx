import Link from 'next/link';

const NAV = [
  { href: '/play/bots', label: 'Play' },
  { href: '/analysis', label: 'Analysis' },
  { href: '/review', label: 'Review' },
];

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4"
      >
        <Link href="/" className="text-lg font-bold tracking-tight">
          Chess<span className="text-brand">Platform</span>
        </Link>
        <ul className="flex items-center gap-1 text-sm font-medium">
          {NAV.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className="inline-flex min-h-11 items-center rounded-(--radius-control) px-3 text-text-muted transition-colors duration-(--duration-base) hover:bg-surface-raised hover:text-text"
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
