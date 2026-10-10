import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { safeNext } from '@/lib/safe-next';
import PartnerFrame from '@/components/PartnerFrame';
import { WelcomeConsent } from '@/components/PartnerClients';

export const metadata: Metadata = { title: 'Добро пожаловать', robots: { index: false, follow: false } };

export default async function Welcome({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next) ?? undefined;
  const user = await getUser();
  if (!user) redirect('/login');
  if (user.pdConsentAt) redirect(next ?? '/dashboard');
  return (
    <PartnerFrame>
      <div className="text-[13px] font-medium text-accent-600">Переход из JobToo</div>
      <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-tight">{user.name.split(' ')[0]}, добро пожаловать в Clymly</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">Мы получили ваш профиль и резюме из JobToo. Clymly проанализирует резюме под вашу профессию, поможет адаптировать его под вакансию, подготовить сопроводительное письмо и потренироваться перед собеседованием.</p>
      <WelcomeConsent next={next} />
      <p className="mt-4 text-xs leading-relaxed text-muted">Аккаунт создан по вашему e-mail {user.email}. Чтобы входить в Clymly напрямую, задайте пароль в разделе «Настройки».</p>
    </PartnerFrame>
  );
}
