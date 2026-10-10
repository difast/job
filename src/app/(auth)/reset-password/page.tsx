import type { Metadata } from 'next';
import Link from 'next/link';
import PartnerFrame from '@/components/PartnerFrame';
import { ResetForm } from '@/components/PasswordForms';
import { checkResetToken } from '@/lib/password-reset';
import { buttonClass } from '@/components/ui';

// Токен в адресе: страницу не индексируем и не передаём адрес как referrer
export const metadata: Metadata = { title: 'Новый пароль', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const st = await checkResetToken(token);
  return (
    <PartnerFrame>
      {st === 'ok' ? (
        <>
          <h1 className="text-[24px] font-semibold tracking-tight" data-testid="reset-state" data-state="ok">Новый пароль</h1>
          <p className="mb-6 mt-2 text-[15px] leading-relaxed text-ink-2">Придумайте новый пароль. После сохранения все прежние сеансы входа будут завершены.</p>
          <ResetForm token={token!} />
        </>
      ) : (
        <>
          <h1 className="text-[24px] font-semibold tracking-tight" data-testid="reset-state" data-state={st}>{st === 'expired' ? 'Ссылка устарела' : 'Ссылка недействительна'}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{st === 'expired' ? 'Ссылка действует 60 минут и срабатывает один раз. Запросите новую.' : 'Проверьте, что ссылка скопирована полностью, или запросите новую.'}</p>
          <Link href="/forgot-password" className={buttonClass({ size: 'lg', className: 'mt-6' })}>Запросить новую ссылку</Link>
        </>
      )}
    </PartnerFrame>
  );
}
