import { requireAdminPage } from '@/lib/admin/auth';
import { PAGE_SIZE, listPayments, type PaymentFilters } from '@/lib/admin/data';
import { PERIODS, fmtDate, fmtMoney, parsePeriod } from '@/lib/admin/period';
import { PLANS, getPlan } from '@/lib/billing/plans';
import { db } from '@/lib/db';
import { Kpi, Pager, Section, TableWrap, qs, td, th } from '@/components/admin/parts';
import { PaymentStatusBadge } from '@/components/billing';
import { cx } from '@/components/ui';

type SP = Record<string, string | undefined>;
const select = 'h-9 rounded-lg border border-line-strong bg-white px-2.5 text-[13px] outline-none focus:border-accent-500';

export default async function AdminPayments({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const f: PaymentFilters = {
    period: parsePeriod(sp.period),
    status: (['succeeded', 'pending', 'canceled'] as const).find((s) => s === sp.status),
    plan: PLANS.some((p) => p.id === sp.plan) ? sp.plan : undefined,
    provider: sp.provider && /^[a-z]{2,20}$/.test(sp.provider) ? sp.provider : undefined,
    source: sp.source && /^[a-z0-9-]{1,40}$/.test(sp.source) ? sp.source : undefined,
    page: Math.min(10_000, Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1)),
  };
  const [r, links] = await Promise.all([listPayments(f), db.marketingLink.findMany({ select: { slug: true, name: true } })]);
  const base = { period: f.period, status: f.status, plan: f.plan, provider: f.provider, source: f.source };
  return (
    <>
      <h1 className="mb-5 text-[26px] font-semibold tracking-[-0.02em]">Платежи</h1>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2" aria-label="Фильтры платежей">
        <label className="flex flex-col gap-1 text-[12px] text-muted">Период<select name="period" defaultValue={f.period} className={select}>{PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">Статус<select name="status" defaultValue={f.status ?? ''} className={select}><option value="">Все</option><option value="succeeded">Оплачен</option><option value="pending">Ожидает оплаты</option><option value="canceled">Отменён</option></select></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">Тариф<select name="plan" defaultValue={f.plan ?? ''} className={select}><option value="">Все</option>{PLANS.filter((p) => p.price > 0).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">Провайдер<select name="provider" defaultValue={f.provider ?? ''} className={select}><option value="">Все</option>{r.providers.map((p) => <option key={p} value={p}>{p === 'stub' ? 'Тестовый (stub)' : p === 'yookassa' ? 'ЮKassa' : p}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">Источник<select name="source" defaultValue={f.source ?? ''} className={select}><option value="">Все</option>{links.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}<option value="none">Неизвестен</option></select></label>
        <button type="submit" className="h-9 rounded-lg bg-accent-600 px-4 text-[13px] font-medium text-white hover:bg-accent-700">Применить</button>
        {(f.status || f.plan || f.provider || f.source || f.period !== '30') && <a href="/admin/payments" className="inline-flex h-9 items-center px-2 text-[13px] text-ink-2 hover:text-ink">Сбросить</a>}
      </form>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="payments-totals">
        <Kpi label="Успешные за период" value={r.succeeded.length ? r.succeeded.map((s) => fmtMoney(s.amount, s.currency)).join(' + ') : fmtMoney(0)} sub={`${r.succeeded.reduce((a, s) => a + s.count, 0)} платежей`} testid="pay-sum" />
        <Kpi label="Всего платежей" value={r.total} testid="pay-count" />
        <Kpi label="Неуспешные" value={r.failed} hint="Отменённые платежи. В выручку не входят." testid="pay-failed" />
        <Kpi label="Ожидают оплаты" value={r.pending} hint="Ещё не подтверждены — в выручку не входят." testid="pay-pending" />
      </div>
      <Section title="Транзакции">
        {r.rows.length === 0 ? <p className="text-sm text-muted">Платежей за выбранный период нет.</p> : (
          <TableWrap>
            <thead><tr>
              <th className={th}>Создан</th><th className={th}>Пользователь</th><th className={th}>Тариф</th><th className={th}>Сумма</th><th className={th}>Статус</th>
              <th className={th}>ID платежа</th><th className={th}>Провайдер</th><th className={th}>Подтверждён / отменён</th><th className={th}>Источник (first-touch)</th>
            </tr></thead>
            <tbody data-testid="payments-table">
              {r.rows.map((p) => (
                <tr key={p.id} data-testid="payment-row">
                  <td className={cx(td, 'whitespace-nowrap')}>{fmtDate(p.createdAt, true)}</td>
                  <td className={cx(td, 'max-w-[220px] truncate')} title={p.user.email}>{p.user.email}<div className="font-mono text-[11px] text-muted">{p.user.id.slice(-8)}</div></td>
                  <td className={td}>{getPlan(p.planId)?.name ?? p.planId}</td>
                  <td className={cx(td, 'tabular whitespace-nowrap')}>{fmtMoney(p.amount, p.currency)} <span className="text-[11px] text-muted">{p.currency}</span></td>
                  <td className={td}><PaymentStatusBadge status={p.status} /></td>
                  <td className={cx(td, 'font-mono text-[11px] text-ink-2')} title={p.providerPaymentId ?? undefined}>{p.id.slice(-10)}{p.providerPaymentId && <div className="text-muted">{p.providerPaymentId.slice(0, 16)}</div>}</td>
                  <td className={td}>{p.provider === 'stub' ? 'Тестовый' : p.provider === 'yookassa' ? 'ЮKassa' : p.provider}</td>
                  <td className={cx(td, 'whitespace-nowrap')}>{p.status === 'pending' ? '—' : fmtDate(p.updatedAt, true)}</td>
                  <td className={td}>{p.source ?? <span className="text-muted">Неизвестен</span>}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <Pager page={f.page} total={r.total} size={PAGE_SIZE} href={(p) => qs('/admin/payments', { ...base, page: p })} />
        <p className="mt-3 text-[12px] leading-relaxed text-muted">Период — по дате создания платежа (МСК). Успешные суммы не конвертируются между валютами. Способ оплаты (карта, СБП) в системе не сохраняется — его видно в кабинете ЮKassa. Возвратов в системе нет. Повторные уведомления провайдера не создают новых записей: статус меняется только из «ожидает оплаты».</p>
      </Section>
    </>
  );
}
