import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { LINK_COOKIE } from '@/lib/partners/config';
import { peekCode } from '@/lib/partners/codes';
import { parseImport } from '@/lib/partners/imports';
import PartnerFrame from '@/components/PartnerFrame';
import { LinkJobToo } from '@/components/PartnerClients';
import { buttonClass } from '@/components/ui';

export const metadata: Metadata = { title: 'Связать аккаунт с JobToo', robots: { index: false, follow: false } };

const mask = (e: string) => e.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '•'.repeat(Math.min(6, b.length)) + c);

export default async function LinkPage() {
  const ticket = await peekCode((await cookies()).get(LINK_COOKIE)?.value, 'link_ticket');
  const imp = ticket?.importId ? await db.partnerImport.findUnique({ where: { id: ticket.importId } }) : null;
  if (!ticket || !imp) {
    return (
      <PartnerFrame>
        <h1 className="text-[24px] font-semibold tracking-tight">Ссылка устарела</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">Вернитесь в JobToo и нажмите «Перейти в Clymly» ещё раз — ссылка действует несколько минут.</p>
        <Link href="/dashboard" className={buttonClass({ variant: 'secondary', className: 'mt-6' })}>Открыть Clymly</Link>
      </PartnerFrame>
    );
  }
  const user = await getUser();
  const email = parseImport(imp.payload).email;
  if (!user) {
    return (
      <PartnerFrame>
        <div className="text-[13px] font-medium text-accent-600">Переход из JobToo</div>
        <h1 className="mt-2 text-[24px] font-semibold leading-tight tracking-tight">У вас уже есть аккаунт Clymly</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">В Clymly уже зарегистрирован e-mail <b className="font-medium text-ink">{mask(email)}</b>. Войдите в него — после этого свяжем аккаунт с JobToo и загрузим резюме. Это нужно один раз.</p>
        <Link href="/login?next=%2Flink%2Fjobtoo" className={buttonClass({ size: 'lg', className: 'mt-6 w-full' })} data-testid="link-login">Войти и связать</Link>
      </PartnerFrame>
    );
  }
  return (
    <PartnerFrame>
      <div className="text-[13px] font-medium text-accent-600">Переход из JobToo</div>
      <h1 className="mt-2 text-[24px] font-semibold leading-tight tracking-tight">Связать аккаунт Clymly с JobToo?</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
        В JobToo указан e-mail <b className="font-medium text-ink">{mask(email)}</b>. Вы вошли в Clymly как <b className="font-medium text-ink">{user.email}</b>.
        После привязки резюме из JobToo появится в этом аккаунте, а следующие переходы будут без пароля.
      </p>
      <LinkJobToo />
      <p className="mt-4 text-xs leading-relaxed text-muted">Если это не ваш аккаунт JobToo — нажмите «Не связывать». Отвязать аккаунт можно в любой момент в разделе «Настройки».</p>
    </PartnerFrame>
  );
}
