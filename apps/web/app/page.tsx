import { Bot, BookOpen, LineChart } from 'lucide-react';
import Link from 'next/link';

const FEATURES = [
  {
    icon: Bot,
    title: 'Twelve bots',
    body: 'From a 250-rated beginner to a 3200 engine, each with its own style and chatter.',
  },
  {
    icon: LineChart,
    title: 'Game Review',
    body: 'Accuracy, move badges and a coach that explains every turning point. Coming next.',
  },
  {
    icon: BookOpen,
    title: 'Opening book',
    body: 'Nearly 3,900 named openings recognised live as you play.',
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:py-20">
      <section className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
          Play chess. Learn from every move.
        </h1>
        <p className="mt-4 text-lg text-text-muted">
          A focused board, honest feedback and opponents that feel human.
        </p>
        <Link
          href="/play/bots"
          className="mt-8 inline-flex min-h-12 items-center rounded-(--radius-control) bg-brand px-6 text-base font-semibold text-on-brand transition-colors duration-(--duration-base) hover:bg-brand-hover"
        >
          Play vs Bots
        </Link>
      </section>

      <ul className="mt-16 grid gap-4 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <li key={title} className="rounded-(--radius-panel) border border-border bg-surface p-4">
            <Icon aria-hidden className="size-5 text-brand" />
            <h2 className="mt-3 font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-text-muted">{body}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
