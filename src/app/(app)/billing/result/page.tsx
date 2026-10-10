import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatRub, getPlan } from '@/lib/billing/plans';
import { orderState, syncPayment } from '@/lib/billing/service';
import { COMPANY } from '@/lib/legal';
import { PageHeader, buttonClass } from '@/components/ui';
import Icon from '@/components/Icon';
import AutoRefresh from '@/components/AutoRefresh';

export const metadata: Metadata = { title: 'Результат оплаты', robots: { index: false, follow: false } };

const fmtDate = (d: Date) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });

/**
 * Возврат с платёжной страницы. Итог определяется только данными заказа на сервере
 * (подтверждение провайдера), а не адресом возврата или параметрами в нём.
 */
export default async function BillingResult({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const user = await requirePageUser();
  const { order } = await searchParams;
  const id = order && /^[a-z0-9]{20,40}$/.test(order) ? order : null;
  if (id) await syncPayment(id); // ЮKassa: сверка статуса по API, если уведомление ещё не пришло
  const p = id ? await db.payment.findFirst({ where: { id, userId: user.id } }) : null;
  const state = p ? orderState(p) : 'unknown';
  const name = p ? p.planName ?? getPlan(p.planId)?.name ?? p.planId : '';

  const view = {
    paid: { icon: 'check-circle', tone: 'text-ok', title: 'Оплата подтверждена', text: p?.accessUntil ? `${name} оплачен. Pro действует до ${fmtDate(p.accessUntil)}.` : `${name} оплачен.` },
    awaiting: { icon: 'clock', tone: 'text-warn', title: 'Ждём подтверждения оплаты', text: 'Платёжный сервис ещё не подтвердил оплату. Обычно это занимает до минуты — страница обновится сама. Если вы не завершили оплату, деньги не списаны.' },
    not_paid: { icon: 'alert', tone: 'text-ink-2', title: 'Оплата не завершена', text: 'Платёж не прошёл или был отменён — деньги не списаны. Можно попробовать ещё раз.' },
    review: { icon: 'alert', tone: 'text-bad', title: 'Не удалось проверить оплату', text: `Платёж получен, но не совпал с заказом, поэтому тариф не включён автоматически. Напишите на ${COMPANY.email} и укажите номер заказа — мы разберёмся.` },
    unknown: { icon: 'alert', tone: 'text-bad', title: 'Не удалось проверить оплату', text: `Заказ не найден. Если деньги списаны, напишите на ${COMPANY.email}.` },
  }[state] as { icon: 'check-circle' | 'clock' | 'alert'; tone: string; title: string; text: string };

  return (
    <>
      <PageHeader back={{ href: '/billing', label: 'Тариф и оплата' }} title="Результат оплаты" />
      <section className="max-w-[560px] rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8" data-testid="pay-result" data-state={state}>
        <div className={`flex items-center gap-2.5 ${view.tone}`}><Icon name={view.icon} size={22} /><h2 className="text-[19px] font-semibold tracking-tight text-ink">{view.title}</h2></div>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{view.text}</p>
        {p && (
          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
            <dt className="text-muted">Тариф</dt><dd>{name}</dd>
            <dt className="text-muted">Сумма</dt><dd className="tabular">{formatRub(p.amount)}</dd>
            <dt className="text-muted">Номер заказа</dt><dd className="font-mono text-[13px]">{p.id}</dd>
          </dl>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          {state === 'awaiting' && <Link href={`/billing/result?order=${p!.id}`} className={buttonClass({ variant: 'primary' })} data-testid="pay-refresh">Обновить статус</Link>}
          {state === 'paid' && <Link href="/dashboard" className={buttonClass({ variant: 'primary' })}>Перейти в кабинет</Link>}
          {(state === 'not_paid' || state === 'unknown') && <Link href={p ? `/billing?plan=${p.planId}` : '/billing'} className={buttonClass({ variant: 'primary' })}>Выбрать тариф снова</Link>}
          <Link href="/billing" className={buttonClass({ variant: 'ghost' })}>Тариф и оплата</Link>
        </div>
        {state === 'awaiting' && <AutoRefresh everyMs={5000} maxTimes={24} />}
      </section>
    </>
  );
}
