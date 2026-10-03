import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { PLANS, currentTier, formatRub, getPlan } from '@/lib/billing/plans';
import { isTestMode } from '@/lib/billing/provider';
import { syncPayment } from '@/lib/billing/service';
import { Alert, Card, CardTitle, PageHeader } from '@/components/ui';
import Icon from '@/components/Icon';
import { PaymentStatusBadge, PlanCard } from '@/components/billing';
import CheckoutButton from '@/components/CheckoutButton';

const fmtDate = (d: Date) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  let user = await requirePageUser();
  const { payment: returnedId } = await searchParams;

  // Пользователь вернулся со страницы оплаты: сверяем статус с провайдером
  let returned = null;
  if (returnedId) {
    await syncPayment(returnedId);
    returned = await db.payment.findFirst({ where: { id: returnedId, userId: user.id } });
    user = (await db.user.findUnique({ where: { id: user.id }, include: { profession: true } })) ?? user;
  }
  const { tier, until } = currentTier(user);
  const payments = await db.payment.findMany({ where: { userId: user.id, status: { in: ['succeeded', 'canceled'] } }, orderBy: { createdAt: 'desc' }, take: 20 });
  const test = isTestMode();

  return (
    <>
      <PageHeader title="Тариф и оплата" subtitle="Выберите тариф. Оплата проходит на защищённой странице ЮKassa." />

      {test && <Alert tone="info" className="mb-6">Тестовый режим: приём платежей через ЮKassa ещё не подключён, деньги не списываются. Тарифы пока не ограничивают функции сервиса.</Alert>}
      {returned?.status === 'succeeded' && <Alert tone="ok" className="mb-6">Оплата прошла успешно. Тариф Pro активен до {until ? fmtDate(until) : '—'}</Alert>}
      {returned?.status === 'canceled' && <Alert tone="warn" className="mb-6">Оплата не завершена — деньги не списаны. Можно попробовать ещё раз.</Alert>}
      {returned?.status === 'pending' && <Alert tone="info" className="mb-6">Ждём подтверждения оплаты от банка. Обычно это занимает до минуты — обновите страницу.</Alert>}

      <Card className="mb-8">
        <CardTitle icon="shield">Текущий тариф</CardTitle>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold tracking-tight" data-testid="current-tier">{tier === 'pro' ? 'Pro' : 'Бесплатный'}</div>
            <div className="mt-0.5 text-sm text-ink-2">{tier === 'pro' && until ? `Оплачен до ${fmtDate(until)}` : 'Базовый доступ ко всем разделам'}</div>
          </div>
          {tier === 'pro' && <span className="inline-flex items-center gap-1.5 text-sm text-ok"><Icon name="check-circle" size={16} />Активен</span>}
        </div>
      </Card>

      <section aria-labelledby="plans">
        <h2 id="plans" className="mb-4 text-lg font-semibold tracking-tight">Тарифы</h2>
        <div className="grid gap-4 md:grid-cols-3 md:gap-5">
          {PLANS.map((p) => (
            <PlanCard key={p.id} plan={p} current={p.tier === tier && (p.tier === 'free' || p.id === 'pro-month')}
              action={p.price === 0
                ? <div className="flex h-11 items-center justify-center rounded-lg border border-line text-sm text-muted">{tier === 'free' ? 'Подключён' : 'Включён в Pro'}</div>
                : <CheckoutButton planId={p.id} variant={p.highlight ? 'primary' : 'secondary'} label={tier === 'pro' ? 'Продлить' : 'Оформить'} />} />
          ))}
        </div>
        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted"><Icon name="lock" size={13} />Банковские карты, СБП и другие способы оплаты — через ЮKassa. Данные карты не передаются и не хранятся у нас.</p>
      </section>

      {payments.length > 0 && (
        <section className="mt-12" aria-labelledby="hist">
          <h2 id="hist" className="mb-3 text-lg font-semibold tracking-tight">История платежей</h2>
          <ul className="overflow-hidden rounded-xl border border-line bg-white shadow-card" data-testid="payments">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-3.5 text-sm last:border-b-0 sm:px-5">
                <span className="w-36 text-muted">{fmtDate(p.createdAt)}</span>
                <span className="min-w-0 flex-1 font-medium">{getPlan(p.planId)?.name ?? p.planId}</span>
                <span className="tabular">{formatRub(p.amount)}</span>
                <PaymentStatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
