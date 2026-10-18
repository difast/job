import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import { getUser } from '@/lib/auth';
import { safeNext } from '@/lib/safe-next';

export const metadata: Metadata = { title: 'Вход', alternates: { canonical: '/login' } };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; deleted?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next) ?? undefined;
  if (await getUser()) redirect(next ?? '/dashboard');
  return <AuthForm mode="login" next={next} notice={sp.deleted ? 'Аккаунт удалён. Мы отправили подтверждение на почту. Спасибо, что пользовались Clymly.' : undefined} />;
}
