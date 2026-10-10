import type { Metadata } from 'next';
import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { jobtoo } from '@/lib/partners/config';
import { JOBTOO_INBOUND_FIELDS } from '@/lib/partners/shared';
import { readStart } from '@/lib/partners/start-cookie';
import PartnerFrame from '@/components/PartnerFrame';
import { InboundConsent } from '@/components/PartnerClients';
import Icon from '@/components/Icon';
import { buttonClass } from '@/components/ui';

export const metadata: Metadata = { title: 'Переход из JobToo', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function JobTooStart() {
  const start = jobtoo.inboundReady() ? await readStart() : null;
  if (!start) {
    return (
      <PartnerFrame>
        <h1 className="text-[24px] font-semibold tracking-tight" data-testid="inbound-expired">{jobtoo.inboundReady() ? 'Ссылка устарела' : 'Переход временно недоступен'}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{jobtoo.inboundReady() ? 'Ссылка из JobToo действует 15 минут и срабатывает один раз. Вернитесь в JobToo и нажмите «Перейти в Clymly» ещё раз.' : 'Попробуйте позже или войдите в Clymly напрямую.'}</p>
        <Link href="/login" className={buttonClass({ variant: 'secondary', className: 'mt-6' })}>Войти в Clymly</Link>
      </PartnerFrame>
    );
  }
  const user = await getUser();
  return (
    <PartnerFrame>
      <div className="text-[13px] font-medium text-accent-600">Переход из JobToo</div>
      <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-tight">Продолжить в Clymly</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">Clymly проанализирует резюме под вашу профессию, поможет адаптировать его под вакансию, подготовить сопроводительное письмо и потренироваться перед собеседованием. Регистрироваться заново не нужно.</p>
      <div className="mt-5">
        <div className="text-sm font-medium">После вашего согласия Clymly получит от JobToo:</div>
        <ul className="mt-2 space-y-1.5 text-sm text-ink-2">{JOBTOO_INBOUND_FIELDS.map((f) => <li key={f} className="flex gap-2"><Icon name="check" size={15} className="mt-0.5 shrink-0 text-accent-600" />{f}</li>)}</ul>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">Оператор — ООО «Интегро». Данные хранятся и обрабатываются в России. До вашего согласия Clymly ничего не запрашивает у JobToo. Вопросы — <a href="mailto:support@clymly.ru" className="underline underline-offset-2">support@clymly.ru</a>.</p>
      </div>
      {user && <p className="mt-4 rounded-lg bg-subtle px-3.5 py-2.5 text-[13px] text-ink-2" data-testid="inbound-signed-in">Вы вошли в Clymly как <b className="font-medium user-text">{user.email}</b>. Аккаунт для перехода определится по почте из JobToo.</p>}
      <InboundConsent />
    </PartnerFrame>
  );
}
