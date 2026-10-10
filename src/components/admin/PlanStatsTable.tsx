import type { PlanStat, MoneyByCurrency } from '@/lib/admin/data';
import { fmtMoney } from '@/lib/admin/period';
import { TableWrap, td, th } from './parts';
import { cx } from '../ui';

const money = (m: MoneyByCurrency) => (m.length ? m.map((x) => fmtMoney(x.amount, x.currency)).join(' + ') : fmtMoney(0));

/** Подтверждённые покупки по тарифам: покупки, выручка, уникальные покупатели. */
export default function PlanStatsTable({ stats }: { stats: { rows: PlanStat[]; total: MoneyByCurrency; buyers: number } }) {
  return (
    <>
      <TableWrap>
        <thead><tr><th className={th}>Тариф</th><th className={th}>Покупок</th><th className={th}>Выручка</th><th className={th}>Уникальных покупателей</th></tr></thead>
        <tbody data-testid="plan-stats">
          {stats.rows.map((r) => (
            <tr key={r.planId} data-testid="plan-stat" data-plan={r.planId}>
              <td className={cx(td, 'whitespace-nowrap font-medium')}>{r.label}</td>
              <td className={cx(td, 'tabular')} data-testid="plan-stat-purchases">{r.purchases}</td>
              <td className={cx(td, 'tabular whitespace-nowrap')} data-testid="plan-stat-revenue">{money(r.revenue)}</td>
              <td className={cx(td, 'tabular')} data-testid="plan-stat-buyers">{r.buyers}</td>
            </tr>
          ))}
          <tr className="font-medium">
            <td className={td}>Итого</td>
            <td className={cx(td, 'tabular')}>{stats.total.reduce((a, x) => a + x.count, 0)}</td>
            <td className={cx(td, 'tabular whitespace-nowrap')} data-testid="plan-stat-total">{money(stats.total)}</td>
            <td className={cx(td, 'tabular')} data-testid="plan-stat-buyers-total">{stats.buyers}</td>
          </tr>
        </tbody>
      </TableWrap>
      <p className="mt-2 text-[12px] text-muted">Только подтверждённые оплаты. «Покупок» — число оплаченных заказов; «уникальных покупателей» — разные пользователи. Купивший оба тарифа учтён в каждом, а в «Итого» — один раз.</p>
    </>
  );
}
