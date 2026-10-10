import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import { getUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Регистрация', alternates: { canonical: '/register' } };

export default async function Page() {
  if (await getUser()) redirect('/');
  return <AuthForm mode="register" />;
}
