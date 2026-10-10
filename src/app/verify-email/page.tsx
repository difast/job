import type { Metadata } from 'next';
import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { verifyToken } from '@/lib/email-verify';
import PartnerFrame from '@/components/PartnerFrame';
import { buttonClass } from '@/components/ui';

export const metadata: Metadata = { title: 'Подтверждение e-mail', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const TEXT = {
  verified: ['E-mail подтверждён', 'Спасибо! Адрес подтверждён — теперь аккаунт защищён лучше, а переход из партнёрских сервисов работает без пароля.'],
  already: ['E-mail уже подтверждён', 'Этот адрес уже подтверждён — ничего делать не нужно.'],
  expired: ['Ссылка устарела', 'Ссылка из письма действует 24 часа и срабатывает один раз. Отправьте новое письмо из личного кабинета: «Настройки → Профиль».'],
  invalid: ['Ссылка недействительна', 'Проверьте, что ссылка скопирована полностью, или отправьте новое письмо из личного кабинета.'],
} as const;

export default async function VerifyEmail({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { result } = await verifyToken((await searchParams).token);
  const user = await getUser();
  const [title, text] = TEXT[result];
  return (
    <PartnerFrame>
      <h1 className="text-[24px] font-semibold tracking-tight" data-testid="verify-result" data-result={result}>{title}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{text}</p>
      <Link href={user ? '/dashboard' : '/login'} className={buttonClass({ size: 'lg', className: 'mt-6' })}>{user ? 'Перейти в кабинет' : 'Войти'}</Link>
    </PartnerFrame>
  );
}
