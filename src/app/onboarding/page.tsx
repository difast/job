import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Onboarding from '@/components/Onboarding';
import { requirePageUser } from '@/lib/auth';
import { safeNext } from '@/lib/safe-next';

export const metadata: Metadata = { title: 'Настройка профиля', robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next) ?? undefined;
  const user = await requirePageUser({ onboarded: false });
  if (user.professionId && user.level) redirect(next ?? '/dashboard');
  return <Onboarding name={user.name.split(' ')[0]} next={next} />;
}
