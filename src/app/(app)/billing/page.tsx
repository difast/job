import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { AUTOPAY_NOTE, PLANS, currentTier, formatRub, getPlan, planLabel, planRank } from '@/lib/billing/plans';
import { chargeDate } from '@/lib/billing/autopay';
import { ykReady } from '@/lib/billing/yookassa';
import CardsManager from '@/components/CardsManager';
import { demoState, isCardDemo } from '@/lib/billing/card-demo';
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
  const [payments, active, me] = await Promise.all([
    db.payment.findMany({ where: { userId: user.id, kind: 'pro', OR: [{ status: { in: ['succeeded', 'canceled', 'refunded'] } }, { issue: { not: null } }] }, orderBy: { createdAt: 'desc' }, take: 20 }),
    currentPurchase(user.id),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { autopayPlan: true, autopayAmount: true, autopayNotice: true, autopayNoticeAt: true, planUntil: true, cards: { orderBy: { createdAt: 'asc' }, select: { id: true, title: true, isPrimary: true } } } }),
  ]);
  const autopay = !!me.autopayPlan && me.cards.length > 0 && tier === 'pro';
  const apPlan = me.autopayPlan ? getPlan(me.autopayPlan) : null;
  const nextCharge = autopay && me.planUntil
    ? { date: fmtDate(me.autopayNoticeAt && me.autopayNotice?.getTime() === me.planUntil.getTime() ? chargeDate(me.planUntil, me.autopayNoticeAt) : new Date(me.planUntil.getTime() - 86_400_000)), amount: formatRub(me.autopayAmount ?? apPlan?.price ?? 0) }
    : null;
  const showCards = (tier === 'pro' && ykReady()) || me.cards.length > 0;
  // ВРЕМЕННО: демо привязки карт для скриншотов ЮKassa (CARD_DEMO_EMAILS) — только отображение, база не меняется
  const demo = isCardDemo(user.email) ? demoState(user.id) : null;
  const test = isTestMode() && !demo;
  // Демо привязки карт (временно): тарифы показываются как при активном Pro · 1 месяц с автопродлением.
  const vTier = demo ? 'pro' : tier;
  const vActiveId = demo ? 'pro-month' : active?.planId;
  const vAutopay = demo ? demo.cards.length > 0 : autopay;
  const vApPlan = demo ? getPlan('pro-month') : apPlan;
  const vNext = demo ? { date: fmtDate(new Date(demo.until.getTime() - 86_400_000)) } : nextCharge;
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
            <div className="text-xl font-semibold tracking-tight" data-testid="current-tier">{demo ? 'Pro · 1 месяц' : tier === 'pro' ? (active ? planLabel(active.planId, active) : 'Pro') : 'Free'}</div>
            <div className="mt-0.5 text-sm text-ink-2">{demo ? `Оплачен до ${fmtDate(demo.until)}` : tier === 'pro' && until ? `Оплачен до ${fmtDate(until)}` : 'Все функции Clymly доступны'}</div>
          </div>
          {(tier === 'pro' || demo) && <span className="inline-flex items-center gap-1.5 text-sm text-ok"><Icon name="check-circle" size={16} />Активен{(demo ? demo.cards.length > 0 : autopay) ? ' · автопродление включено' : ''}</span>}
        </div>
      </Card>

      {demo
        ? <CardsManager demo cards={demo.cards.map(({ id, title, isPrimary }) => ({ id, title, isPrimary }))} autopay={demo.cards.length > 0} canBind
            next={{ date: vNext!.date, amount: formatRub(getPlan('pro-month')?.price ?? 0) }} />
        : showCards && <CardsManager cards={me.cards} autopay={autopay} next={nextCharge} canBind={tier === 'pro' && ykReady()} />}

      <section aria-labelledby="plans">
        <h2 id="plans" className="mb-4 text-lg font-semibold tracking-tight">Тарифы</h2>
        <div className="grid gap-4 md:grid-cols-3 md:gap-5">
          {PLANS.filter((p) => p.tier === 'free' || p.price > 0).map((p) => (
            <PlanCard key={p.id} plan={p} selected={chosen && chosen.price > 0 ? chosen.id === p.id : undefined} current={p.tier === vTier && (p.tier === 'free' || p.id === vActiveId)}
              action={p.price === 0
                ? <div className="flex h-11 items-center justify-center rounded-lg border border-line text-sm text-muted">{vTier === 'free' ? 'Ваш текущий тариф' : 'Входит в Clymly Pro'}</div>
                : vAutopay && vApPlan && planRank(p.id) <= planRank(vApPlan.id)
                  ? <div className="flex min-h-11 items-center justify-center rounded-lg border border-line px-3 text-center text-sm text-muted" data-testid="autopay-covers">{p.id === vApPlan.id ? `Продлится автоматически${vNext ? ` ${vNext.date}` : ''}` : 'Доступен после отключения автопродления'}</div>
                  : <div className="space-y-2">
                    <CheckoutButton planId={p.id} variant={(chosen && chosen.price > 0 ? chosen.id === p.id : p.highlight) ? 'primary' : 'secondary'} label={(p.months === 1 ? (vTier === 'pro' ? 'Продлить на 1 месяц' : 'Подключить Pro на 1 месяц') : (vTier === 'pro' ? 'Продлить на 3 месяца' : 'Оформить на 3 месяца')) + (ym ? ' картой' : '')} testid="pay-card" />
                    {ym && <CheckoutButton planId={p.id} method="yoomoney" variant="ghost" label="Оплатить через ЮMoney" testid="pay-yoomoney" />}
                  </div>} />
          ))}
        </div>
        <p className="mt-4 flex items-start gap-1.5 text-xs leading-relaxed text-muted"><Icon name="lock" size={13} className="mt-0.5 shrink-0" /><span>{ym ? `Оплата картой — через ${cardName}; через ЮMoney — картой или кошельком ЮMoney.` : 'Банковские карты, СБП и другие способы оплаты — через ЮKassa.'} {AUTOPAY_NOTE}: тогда Pro будет продлеваться на тот же срок, с напоминанием на почту за 3 дня до списания; удалить карту можно здесь в любой момент. Срок считается в календарных месяцах и при продлении добавляется к текущему. Реквизиты карты хранит ЮKassa; у нас для автопродления — только тип карты и последние 4 цифры. Оплачивая тариф, вы принимаете условия <Link href="/terms#tariffs" className="underline underline-offset-2 hover:text-ink">Пользовательского соглашения</Link>, включая порядок оплаты, продления и возврата.</span></p>
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
