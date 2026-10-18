import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin/auth';
import { ACTIVE_HINT, dailySeries, overview, planStats, type MoneyByCurrency } from '@/lib/admin/data';
import { marketingReport } from '@/lib/admin/marketing';
import { PERIODS, dayRange, fmtDate, fmtMoney, parsePeriod, pct, periodStart } from '@/lib/admin/period';
import { Chips, DayBars, Funnel, Kpi, Section, qs } from '@/components/admin/parts';
import { PaymentStatusBadge } from '@/components/billing';
import { planLabel } from '@/lib/billing/plans';
import { PROVIDER_LABEL } from '@/lib/billing/provider';
import PlanStatsTable from '@/components/admin/PlanStatsTable';

const money = (m: MoneyByCurrency) => (m.length ? m.map((x) => fmtMoney(x.amount, x.currency)).join(' + ') : fmtMoney(0));
const count = (m: MoneyByCurrency) => m.reduce((a, x) => a + x.count, 0);

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireAdminPage();
  const period = parsePeriod((await searchParams).period);
  const [o, series, mk, plans] = await Promise.all([overview(), dailySeries(period), marketingReport({ period, model: 'first' }, 'link'), planStats({ createdAt: { gte: periodStart(period) } })]);
  const days = dayRange(period, series.first);
  const t = mk.totals;
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Обзор</h1>
        <Chips label="Период графиков и маркетинга" items={PERIODS.map((p) => ({ value: p.key, label: p.label }))} current={period} href={(v) => qs('/admin', { period: v })} />
      </div>

      <h2 className="mb-2 text-[13px] font-medium text-muted">Пользователи</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7" data-testid="kpi-users">
        <Kpi label="Всего" value={o.users.total} testid="kpi-users-total" />
        <Kpi label="Сегодня" value={o.users.today} />
        <Kpi label="7 дней" value={o.users.week} />
        <Kpi label="30 дней" value={o.users.month} />
        <Kpi label="Активные" value={o.users.active} hint={ACTIVE_HINT} sub="за 30 дней" testid="kpi-users-active" />
        <Kpi label="Free" value={o.users.free} testid="kpi-users-free" />
        <Kpi label="Pro" value={o.users.pro} sub="оплачен сейчас" testid="kpi-users-pro" />
      </div>
      <p className="mt-2 text-[12px] text-muted">Источник регистрации: прямая — {o.signupSources.direct ?? 0}, по маркетинговой ссылке — {o.signupSources.marketing ?? 0}, переход из JobToo — {o.signupSources.jobtoo ?? 0}.</p>

      <h2 className="mb-2 mt-7 text-[13px] font-medium text-muted">Платежи и подписки</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="kpi-payments">
        <Kpi label="Подтверждённые оплаты" value={money(o.payments.all)} sub={`${count(o.payments.all)} платежей · за всё время`} hint="Сумма успешных платежей (status = succeeded). Ожидающие и отменённые не учитываются. Возвратов в системе нет. Это оборот, а не прибыль." testid="kpi-paid-all" />
        <Kpi label="Сегодня" value={money(o.payments.today)} sub={`${count(o.payments.today)} платежей`} />
        <Kpi label="7 дней" value={money(o.payments.d7)} sub={`${count(o.payments.d7)} платежей`} />
        <Kpi label="30 дней" value={money(o.payments.d30)} sub={`${count(o.payments.d30)} платежей`} testid="kpi-paid-30" />
        <Kpi label="Активные подписки" value={o.subscriptions.active} hint="Пользователи с оплаченным Clymly Pro на текущий момент." testid="kpi-subs-active" />
        <Kpi label="Истёкшие подписки" value={o.subscriptions.expired} hint="Pro был оплачен, но срок закончился." />
        <Kpi label="С автопродлением" value={o.subscriptions.autopay} hint="Активный Pro и включённое автопродление (сохранённая карта ЮKassa). Отключение автопродления — удаление всех карт пользователем или после неудачных списаний." testid="kpi-autopay" />
        <Kpi label="Неуспешные платежи" value={o.payments.failed} sub={`ожидают оплаты: ${o.payments.pending}`} hint="Отменённые платежи (status = canceled). Ожидающие показаны отдельно." testid="kpi-failed" />
      </div>
      <p className="mt-2 text-[12px] text-muted">Регулярная выручка (MRR) не рассчитывается: автопродление включается по желанию пользователя, автосписания учитываются как обычные подтверждённые оплаты.</p>

      <Section title={`Покупки по тарифам · ${PERIODS.find((p) => p.key === period)?.label ?? ''}`} className="mt-4" action={<Link href={qs('/admin/payments', { period, status: 'succeeded' })} className="text-[13px] font-medium text-accent-600 hover:text-accent-700">Платежи →</Link>}>
        <PlanStatsTable stats={plans} />
      </Section>

      <div className="mt-7 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Section title="Динамика по дням (МСК)">
          <div className="grid gap-6 sm:grid-cols-2">
            <DayBars title="Регистрации" days={days} values={series.regs} testid="chart-regs" />
            <DayBars title="Переходы по ссылкам" days={days} values={series.clicks} testid="chart-clicks" />
            <DayBars title="Успешные оплаты" days={days} values={series.pays} testid="chart-pays" />
            <DayBars title="Выручка, ₽" days={days} values={series.revenue} format={(v) => fmtMoney(v)} testid="chart-revenue" />
          </div>
          {series.otherCurrencies.length > 0 && <p className="mt-3 text-[12px] text-muted">В графике выручки только рубли. Есть оплаты в: {series.otherCurrencies.join(', ')}.</p>}
        </Section>
        <Section title="Маркетинг · first-touch" action={<Link href={qs('/admin/marketing', { period })} className="text-[13px] font-medium text-accent-600 hover:text-accent-700">Подробнее →</Link>}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="kpi-marketing">
            <Kpi label="Переходы" value={t.clicks} testid="kpi-mk-clicks" />
            <Kpi label="Уникальные" value={t.visitors} hint="Различные посетители по cookie (90 дней). Переходы без cookie (после отказа) не учитываются." testid="kpi-mk-visitors" />
            <Kpi label="Регистрации" value={t.registrations} sub={pct(t.registrations, t.visitors)} testid="kpi-mk-regs" />
            <Kpi label="Оплатили" value={t.payers} sub={pct(t.payers, t.visitors)} testid="kpi-mk-payers" />
          </div>
          <div className="mt-5"><Funnel steps={[{ label: 'Уникальные посетители', value: t.visitors }, { label: 'Регистрации', value: t.registrations, conv: pct(t.registrations, t.visitors) }, { label: 'Оплатили Pro', value: t.payers, conv: pct(t.payers, t.visitors) }]} /></div>
          <p className="mt-4 text-sm">Атрибутированная выручка: <b className="tabular" data-testid="mk-revenue">{t.revenue.length ? t.revenue.map((r) => fmtMoney(r.amount, r.currency)).join(' + ') : fmtMoney(0)}</b></p>
        </Section>
      </div>

      <Section title="Последние платежи" className="mt-4" action={<Link href="/admin/payments" className="text-[13px] font-medium text-accent-600 hover:text-accent-700">Все платежи →</Link>}>
        {o.recent.length ? (
          <ul className="divide-y divide-line text-[13px]">
            {o.recent.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <span className="w-32 shrink-0 text-muted">{fmtDate(p.createdAt, true)}</span>
                <span className="min-w-0 flex-1 truncate">{p.user.email}</span>
                <span className="text-ink-2">{planLabel(p.planId, p)}</span>
                <span className="w-16 text-[12px] text-muted">{PROVIDER_LABEL[p.provider] ?? p.provider}</span>
                <span className="tabular w-24 text-right">{fmtMoney(p.amount, p.currency)}</span>
                <PaymentStatusBadge status={p.status} issue={p.issue} />
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Платежей пока нет.</p>}
      </Section>
    </>
  );
}
