import type { Metadata } from 'next';
import { AnalysisStudio } from '@/components/analysis/AnalysisStudio';

export const metadata: Metadata = { title: 'Analysis' };

interface Props {
  searchParams: Promise<{ fen?: string; pgn?: string; explorer?: string }>;
}

export default async function AnalysisPage({ searchParams }: Props) {
  const { fen, pgn, explorer } = await searchParams;
  // Keyed so a client-side navigation to a new ?fen= / ?pgn= starts a fresh board.
  return (
    <AnalysisStudio
      key={`${fen ?? ''}|${pgn ?? ''}`}
      initialFen={fen}
      initialPgn={pgn}
      showExplorer={explorer === '1'}
    />
  );
}
