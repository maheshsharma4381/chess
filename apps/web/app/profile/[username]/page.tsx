import type { Metadata } from 'next';
import { ProfileView } from '@/components/profile/ProfileView';

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return { title: `${username}'s profile` };
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <ProfileView username={username} />
    </main>
  );
}
