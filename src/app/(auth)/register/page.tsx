import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import { getUser } from '@/lib/auth';
import { safeNext } from '@/lib/safe-next';

export const metadata: Metadata = { title: 'Регистрация', alternates: { canonical: '/register' } };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next) ?? undefined;
  if (await getUser()) redirect(next ?? '/dashboard');
  return <AuthForm mode="register" next={next} />;
}
