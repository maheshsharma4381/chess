import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/AuthForm';

export const metadata: Metadata = { title: 'Sign up' };

interface Props {
  searchParams: Promise<{ next?: string }>;
}

export default async function SignupPage({ searchParams }: Props) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto max-w-sm space-y-6 px-4 py-10">
      <h1 className="text-2xl font-bold">Create your account</h1>
      <p className="text-text-muted">Save your games, keep your reviews and track your progress.</p>
      <AuthForm mode="signup" next={next} />
    </main>
  );
}
