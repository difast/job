import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { PLANS, currentTier, formatRub, getPlan, planLabel } from '@/lib/billing/plans';
import { PROVIDER_LABEL, getProvider, isTestMode, yooMoneyOffered } from '@/lib/billing/provider';
import { currentPurchase } from '@/lib/billing/service';
import { Alert, Card, CardTitle, PageHeader } from '@/components/ui';
import Icon from '@/components/Icon';
import { PaymentStatusBadge, PlanCard } from '@/components/billing';
import CheckoutButton from '@/components/CheckoutButton';

const fmtDate = (d: Date) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ payment?: string; plan?: string }> }) {
  const user = await requirePageUser();
  const { payment: returnedId, plan: chosenId } = await searchParams;
  // Старый адрес возврата: итог оплаты показывает отдельная страница по данным сервера
  if (returnedId && /^[a-z0-9]{20,40}$/.test(returnedId)) redirect(`/billing/result?order=${returnedId}`);
  const chosen = chosenId ? getPlan(chosenId) : null;

  const { tier, until } = currentTier(user);
  const [payments, active] = await Promise.all([
    db.payment.findMany({ where: { userId: user.id, OR: [{ status: { in: ['succeeded', 'canceled'] } }, { issue: { not: null } }] }, orderBy: { createdAt: 'desc' }, take: 20 }),
    currentPurchase(user.id),
  ]);
  const test = isTestMode();
  const ym = yooMoneyOffered();
  const cardName = getProvider().name === 'yookassa' ? 'ЮKassa' : 'тестовую оплату';

  return (
    <>
      <PageHeader title="Тариф и оплата" subtitle={ym ? 'Выберите тариф и способ оплаты. Оплата проходит на защищённой странице платёжного сервиса.' : 'Выберите тариф. Оплата проходит на защищённой странице ЮKassa.'} />

      {test && <Alert tone="info" className="mb-6">Тестовый режим: приём платежей через ЮKassa ещё не подключён, деньги не списываются. Тарифы пока не ограничивают функции сервиса.</Alert>}

      {chosen && chosen.price > 0 && <Alert tone="info" className="mb-6">{`Вы выбрали тариф «${chosen.name}» — ${formatRub(chosen.price)} ${chosen.period}. Нажмите кнопку на карточке тарифа ниже, чтобы перейти к оплате.`}</Alert>}

      <Card className="mb-8">
        <CardTitle icon="shield">Текущий тариф</CardTitle>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold tracking-tight" data-testid="current-tier">{tier === 'pro' ? (active ? planLabel(active.planId, active) : 'Pro') : 'Free'}</div>
            <div className="mt-0.5 text-sm text-ink-2">{tier === 'pro' && until ? `Оплачен до ${fmtDate(until)}` : 'Все функции Clymly доступны'}</div>
          </div>
          {tier === 'pro' && <span className="inline-flex items-center gap-1.5 text-sm text-ok"><Icon name="check-circle" size={16} />Активен</span>}
        </div>
      </Card>

      <section aria-labelledby="plans">
        <h2 id="plans" className="mb-4 text-lg font-semibold tracking-tight">Тарифы</h2>
        <div className="grid gap-4 md:grid-cols-3 md:gap-5">
          {PLANS.map((p) => (
            <PlanCard key={p.id} plan={p} selected={chosen && chosen.price > 0 ? chosen.id === p.id : undefined} current={p.tier === tier && (p.tier === 'free' || p.id === active?.planId)}
              action={p.price === 0
                ? <div className="flex h-11 items-center justify-center rounded-lg border border-line text-sm text-muted">{tier === 'free' ? 'Ваш текущий тариф' : 'Входит в Clymly Pro'}</div>
                : <div className="space-y-2">
                    <CheckoutButton planId={p.id} variant={(chosen && chosen.price > 0 ? chosen.id === p.id : p.highlight) ? 'primary' : 'secondary'} label={(p.months === 1 ? (tier === 'pro' ? 'Продлить на 1 месяц' : 'Подключить Pro на 1 месяц') : (tier === 'pro' ? 'Продлить на 3 месяца' : 'Оформить на 3 месяца')) + (ym ? ' картой' : '')} testid="pay-card" />
                    {ym && <CheckoutButton planId={p.id} method="yoomoney" variant="ghost" label="Оплатить через ЮMoney" testid="pay-yoomoney" />}
                  </div>} />
          ))}
        </div>
        <p className="mt-4 flex items-start gap-1.5 text-xs leading-relaxed text-muted"><Icon name="lock" size={13} className="mt-0.5 shrink-0" /><span>{ym ? `Оплата картой — через ${cardName}; через ЮMoney — картой или кошельком ЮMoney.` : 'Банковские карты, СБП и другие способы оплаты — через ЮKassa.'} Pro оплачивается разово, без автопродления; срок считается в календарных месяцах и при продлении добавляется к текущему. Данные карты не передаются и не хранятся у нас. Оплачивая тариф, вы принимаете условия <Link href="/terms#tariffs" className="underline underline-offset-2 hover:text-ink">Пользовательского соглашения</Link>, включая порядок оплаты, продления и возврата.</span></p>
      </section>

      {payments.length > 0 && (
        <section className="mt-12" aria-labelledby="hist">
          <h2 id="hist" className="mb-3 text-lg font-semibold tracking-tight">История платежей</h2>
          <ul className="overflow-hidden rounded-xl border border-line bg-white shadow-card" data-testid="payments">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-3.5 text-sm last:border-b-0 sm:px-5" data-testid="payment-item">
                <span className="w-36 text-muted">{fmtDate(p.paidAt ?? p.createdAt)}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{p.planName ?? getPlan(p.planId)?.name ?? p.planId}</span>
                  {p.accessFrom && p.accessUntil && <span className="block text-xs text-muted">Pro с {fmtDate(p.accessFrom)} по {fmtDate(p.accessUntil)}</span>}
                </span>
                <span className="text-xs text-muted">{PROVIDER_LABEL[p.provider] ?? p.provider}</span>
                <span className="tabular">{formatRub(p.amount)}</span>
                <PaymentStatusBadge status={p.status} issue={p.issue} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
