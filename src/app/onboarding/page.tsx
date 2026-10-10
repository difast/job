import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Onboarding from '@/components/Onboarding';
import { requirePageUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Настройка профиля', robots: { index: false, follow: false } };

export default async function Page() {
  const user = await requirePageUser({ onboarded: false });
  if (user.professionId && user.level) redirect('/dashboard');
  return <Onboarding name={user.name.split(' ')[0]} />;
}
