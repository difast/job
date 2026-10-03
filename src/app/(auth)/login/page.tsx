import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import { getUser } from '@/lib/auth';

export default async function Page() {
  if (await getUser()) redirect('/');
  return <AuthForm mode="login" />;
}
