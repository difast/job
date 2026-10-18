import { requireAdminPage } from '@/lib/admin/auth';
import { PAGE_SIZE, listPayments, type PaymentFilters } from '@/lib/admin/data';
import { PERIODS, fmtDate, fmtMoney, parsePeriod } from '@/lib/admin/period';
import { PLANS, planLabel } from '@/lib/billing/plans';
import { PROVIDER_LABEL } from '@/lib/billing/provider';
import { ACCESS_LABEL, accessState } from '@/lib/billing/service';
import { db } from '@/lib/db';
import { Kpi, Pager, Section, TableWrap, qs, td, th } from '@/components/admin/parts';
import PlanStatsTable from '@/components/admin/PlanStatsTable';
import { PaymentStatusBadge } from '@/components/billing';
import { cx } from '@/components/ui';

type SP = Record<string, string | undefined>;
const select = 'h-9 rounded-lg border border-line-strong bg-white px-2.5 text-[13px] outline-none focus:border-accent-500';
const ISSUE: Record<string, string> = {
  amount_mismatch: 'Сумма не совпала с заказом', currency_mismatch: 'Валюта не совпала', duplicate_payment: 'Повторная оплата заказа',
  paid_after_cancel: 'Оплата отменённого заказа', unaccepted: 'Перевод не зачислен', verify_failed: 'Провайдер не подтвердил операцию',
};
const EVENT: Record<string, string> = { pending: 'Создан', succeeded: 'Оплачен', canceled: 'Отменён', duplicate: 'Повтор', review: 'На проверку', rejected: 'Отклонено' };

export default async function AdminPayments({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const f: PaymentFilters = {
    period: parsePeriod(sp.period),
    status: (['succeeded', 'pending', 'canceled', 'refunded', 'review'] as const).find((s) => s === sp.status),
    plan: PLANS.some((p) => p.id === sp.plan && p.price > 0) ? sp.plan : undefined,
    provider: sp.provider && /^[a-z]{2,20}$/.test(sp.provider) ? sp.provider : undefined,
    source: sp.source && /^[a-z0-9-]{1,40}$/.test(sp.source) ? sp.source : undefined,
    page: Math.min(10_000, Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1)),
  };
  const [r, links] = await Promise.all([listPayments(f), db.marketingLink.findMany({ select: { slug: true, name: true } })]);
  const base = { period: f.period, status: f.status, plan: f.plan, provider: f.provider, source: f.source };
  const now = new Date();
  return (
    <>
      <h1 className="mb-5 text-[26px] font-semibold tracking-[-0.02em]">Платежи</h1>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2" aria-label="Фильтры платежей">
        <label className="flex flex-col gap-1 text-[12px] text-muted">Период<select name="period" defaultValue={f.period} className={select}>{PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">Статус<select name="status" defaultValue={f.status ?? ''} className={select}><option value="">Все</option><option value="succeeded">Оплачен</option><option value="pending">Ожидает оплаты</option><option value="canceled">Отменён</option><option value="refunded">Возврат</option><option value="review">Требует проверки</option></select></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">Тариф<select name="plan" defaultValue={f.plan ?? ''} className={select}><option value="">Все</option>{PLANS.filter((p) => p.price > 0).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">Провайдер<select name="provider" defaultValue={f.provider ?? ''} className={select}><option value="">Все</option>{r.providers.map((p) => <option key={p} value={p}>{p === 'stub' ? 'Тестовый (stub)' : PROVIDER_LABEL[p] ?? p}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">Источник<select name="source" defaultValue={f.source ?? ''} className={select}><option value="">Все</option>{links.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}<option value="none">Неизвестен</option></select></label>
        <button type="submit" className="h-9 rounded-lg bg-accent-600 px-4 text-[13px] font-medium text-white hover:bg-accent-700">Применить</button>
        {(f.status || f.plan || f.provider || f.source || f.period !== '30') && <a href="/admin/payments" className="inline-flex h-9 items-center px-2 text-[13px] text-ink-2 hover:text-ink">Сбросить</a>}
      </form>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="payments-totals">
        <Kpi label="Подтверждённая выручка" value={r.succeeded.length ? r.succeeded.map((s) => fmtMoney(s.amount, s.currency)).join(' + ') : fmtMoney(0)} sub={`${r.succeeded.reduce((a, s) => a + s.count, 0)} покупок`} testid="pay-sum" />
        <Kpi label="Всего заказов" value={r.total} testid="pay-count" />
        <Kpi label="Неуспешные" value={r.failed} hint="Отменённые платежи. В выручку не входят." testid="pay-failed" />
        <Kpi label="Ожидают оплаты" value={r.pending} hint="Ещё не подтверждены провайдером — в выручку не входят." testid="pay-pending" />
        <Kpi label="Требуют проверки" value={r.review} hint="Уведомление провайдера не совпало с заказом (сумма, валюта, повторная оплата). Pro по ним не включён, в выручку не входят." testid="pay-review" />
      </div>
      <Section title="По тарифам" className="mb-4">
        <PlanStatsTable stats={r.byPlan} />
      </Section>
      <Section title="Заказы и транзакции">
        {r.rows.length === 0 ? <p className="text-sm text-muted">Платежей за выбранный период нет.</p> : (
          <TableWrap>
            <thead><tr>
              <th className={th}>Создан</th><th className={th}>Пользователь</th><th className={th}>Тариф</th><th className={th}>Сумма</th><th className={th}>Статус</th>
              <th className={th}>Провайдер</th><th className={th}>Заказ / транзакция</th><th className={th}>Оплачен</th><th className={th}>Доступ Pro</th><th className={th}>Источник (first-touch)</th><th className={th}>История</th>
            </tr></thead>
            <tbody data-testid="payments-table">
              {r.rows.map((p) => {
                const acc = accessState(p, now);
                return (
                  <tr key={p.id} data-testid="payment-row" data-provider={p.provider} data-plan={p.planId}>
                    <td className={cx(td, 'whitespace-nowrap')}>{fmtDate(p.createdAt, true)}</td>
                    <td className={cx(td, 'max-w-[220px] truncate')} title={p.user.email}>{p.user.email}<div className="font-mono text-[11px] text-muted">{p.user.id.slice(-8)}</div></td>
                    <td className={cx(td, 'whitespace-nowrap')} data-testid="payment-plan">{planLabel(p.planId, p)}{p.recurring && <div className="text-[11px] text-muted">автопродление</div>}</td>
                    <td className={cx(td, 'tabular whitespace-nowrap')}>{fmtMoney(p.amount, p.currency)} <span className="text-[11px] text-muted">{p.currency}</span></td>
                    <td className={td}><PaymentStatusBadge status={p.status} issue={p.issue} />{p.issue && <div className="mt-1 text-[11px] text-bad">{ISSUE[p.issue] ?? p.issue}</div>}</td>
                    <td className={td} data-testid="payment-provider">{PROVIDER_LABEL[p.provider] ?? p.provider}</td>
                    <td className={cx(td, 'font-mono text-[11px] text-ink-2')}><span title={p.id}>{p.id}</span>{p.providerPaymentId ? <div className="text-muted" title={p.providerPaymentId}>{p.providerPaymentId.slice(0, 24)}</div> : <div className="text-muted">—</div>}</td>
                    <td className={cx(td, 'whitespace-nowrap')}>{p.status === 'succeeded' ? fmtDate(p.paidAt ?? p.updatedAt, true) : '—'}</td>
                    <td className={cx(td, 'whitespace-nowrap')}>{p.accessFrom && p.accessUntil ? <>{fmtDate(p.accessFrom)} — {fmtDate(p.accessUntil)}<div className="text-[11px] text-muted">{ACCESS_LABEL[acc]}</div></> : '—'}</td>
                    <td className={td}>{p.source ?? <span className="text-muted">Неизвестен</span>}</td>
                    <td className={cx(td, 'min-w-[180px]')}>
                      {p.events.length ? (
                        <details><summary className="cursor-pointer text-[12px] text-ink-2 hover:text-ink">{p.events.length} {p.events.length === 1 ? 'событие' : p.events.length < 5 ? 'события' : 'событий'}</summary>
                          <ol className="mt-1.5 space-y-1 text-[11px] text-ink-2">{p.events.map((e) => <li key={e.id}><span className="text-muted">{fmtDate(e.createdAt, true)}</span> · {EVENT[e.status] ?? e.status} <span className="text-muted">({e.source})</span>{e.note && <div className="text-muted">{e.note}</div>}</li>)}</ol>
                        </details>
                      ) : <span className="text-[12px] text-muted">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
        <Pager page={f.page} total={r.total} size={PAGE_SIZE} href={(p) => qs('/admin/payments', { ...base, page: p })} />
        <p className="mt-3 text-[12px] leading-relaxed text-muted">Период — по дате создания заказа (МСК). Тариф — из заказа (id предложения и снимок названия/срока на момент покупки), сумма — фактическая сумма заказа; тариф по сумме не определяется. Подтверждённая выручка — только оплаты, подтверждённые провайдером; ожидающие, отменённые и «требуют проверки» не входят. Способ оплаты внутри провайдера (карта, СБП, кошелёк) не сохраняется. «Автопродление» — автосписание с сохранённой карты. Полный возврат из кабинета ЮKassa переводит оплату в «Возврат» (не входит в выручку) и сокращает срок Pro. Проверочные платежи 1 ₽ за привязку карты здесь не показываются. Повторные уведомления провайдера не создают новых записей и не продлевают Pro повторно — они видны в истории заказа.</p>
      </Section>
    </>
  );
}
