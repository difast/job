import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { LINK_COOKIE } from '@/lib/partners/config';
import { peekCode } from '@/lib/partners/codes';
import { parseImport } from '@/lib/partners/imports';
import PartnerFrame from '@/components/PartnerFrame';
import { LinkJobToo, SwitchAccount } from '@/components/PartnerClients';
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
  const data = parseImport(imp.payload);
  const email = data.email;
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
  // Почта в JobToo не подтверждена — связать нельзя: иначе любой мог бы указать в JobToo чужой адрес
  if (!data.emailVerified) {
    return (
      <PartnerFrame>
        <div className="text-[13px] font-medium text-accent-600">Переход из JobToo</div>
        <h1 className="mt-2 text-[24px] font-semibold leading-tight tracking-tight">Подтвердите почту в JobToo</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">Аккаунт Clymly с этой почтой уже существует. Связать его с JobToo можно только после того, как почта будет подтверждена в JobToo. Подтвердите её в JobToo и нажмите «Перейти в Clymly» ещё раз.</p>
        <Link href="/dashboard" className={buttonClass({ variant: 'secondary', className: 'mt-6' })} data-testid="link-unverified">Открыть Clymly</Link>
      </PartnerFrame>
    );
  }
  // Вошли не в тот аккаунт — привязка невозможна
  if (user.email.toLowerCase() !== email.toLowerCase()) {
    return (
      <PartnerFrame>
        <div className="text-[13px] font-medium text-accent-600">Переход из JobToo</div>
        <h1 className="mt-2 text-[24px] font-semibold leading-tight tracking-tight">Это другой аккаунт Clymly</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">Вы вошли как <b className="font-medium text-ink user-text">{user.email}</b>, а в JobToo указана почта <b className="font-medium text-ink">{mask(email)}</b>. Связать можно только аккаунты с одинаковой почтой. Выйдите и войдите в аккаунт Clymly с почтой из JobToo.</p>
        <SwitchAccount />
      </PartnerFrame>
    );
  }
  return (
    <PartnerFrame>
      <div className="text-[13px] font-medium text-accent-600">Переход из JobToo</div>
      <h1 className="mt-2 text-[24px] font-semibold leading-tight tracking-tight">Связать аккаунт Clymly с JobToo?</h1>
      <dl className="mt-4 space-y-2 rounded-xl bg-canvas p-4 text-sm" data-testid="link-emails">
        <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted">Аккаунт Clymly</dt><dd className="font-medium user-text">{user.email}</dd></div>
        <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted">Аккаунт JobToo</dt><dd className="font-medium user-text">{email} <span className="font-normal text-ok">· подтверждена</span></dd></div>
      </dl>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-2">После привязки резюме из JobToo появится в этом аккаунте, а следующие переходы из JobToo будут открывать Clymly без пароля. Связывайте, только если оба аккаунта ваши.</p>
      <LinkJobToo />
      <p className="mt-4 text-xs leading-relaxed text-muted">Не нажимали «Перейти в Clymly» в JobToo? Нажмите «Не связывать». Отвязать аккаунт можно в любой момент в разделе «Настройки».</p>
    </PartnerFrame>
  );
}
