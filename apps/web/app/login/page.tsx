import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/AuthForm';

export const metadata: Metadata = { title: 'Log in' };

interface Props {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto max-w-sm space-y-6 px-4 py-10">
      <h1 className="text-2xl font-bold">Log in</h1>
      <AuthForm mode="login" next={next} error={error} />
    </main>
  );
}
