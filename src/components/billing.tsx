import type { ReactNode } from 'react';
import Icon from './Icon';
import { cx } from './ui';
import { formatRub, type Plan } from '@/lib/billing/plans';

/** Карточка тарифа — общая для лендинга и страницы оплаты. */
export function PlanCard({ plan, action, current }: { plan: Plan; action: ReactNode; current?: boolean }) {
  return (
    <div className={cx('relative flex flex-col rounded-xl border bg-white p-6 shadow-card', plan.highlight ? 'border-accent-600 shadow-[0_0_0_1px_var(--color-accent-600)]' : 'border-line')} data-testid={`plan-${plan.id}`}>
      {plan.highlight && <span className="absolute -top-2.5 left-6 rounded-md bg-accent-600 px-2 py-0.5 text-[11px] font-medium text-white">Популярный</span>}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[17px] font-semibold tracking-tight">{plan.name}</h3>
        {current && <span className="rounded-md bg-ok-soft px-2 py-0.5 text-xs font-medium text-ok">Ваш тариф</span>}
      </div>
      <p className="mt-1 text-[13px] text-ink-2">{plan.description}</p>
      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="tabular text-[32px] font-semibold leading-none tracking-tight">{plan.price ? formatRub(plan.price) : '0 ₽'}</span>
        <span className="text-[13px] text-muted">{plan.period}</span>
      </div>
      <div className="mt-1 h-4 text-xs text-muted">{plan.note}</div>
      <ul className="mt-5 flex-1 space-y-2.5">
        {plan.features.map((f) => <li key={f} className="flex gap-2.5 text-sm"><Icon name="check" size={16} strokeWidth={2.2} className="mt-0.5 shrink-0 text-accent-600" />{f}</li>)}
      </ul>
      <div className="mt-6">{action}</div>
    </div>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  succeeded: { label: 'Оплачен', cls: 'bg-ok-soft text-ok' },
  pending: { label: 'Ожидает оплаты', cls: 'bg-warn-soft text-warn' },
  canceled: { label: 'Отменён', cls: 'bg-subtle text-ink-2' },
};

export function PaymentStatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.pending;
  return <span className={cx('inline-flex rounded-md px-2 py-0.5 text-xs font-medium', s.cls)}>{s.label}</span>;
}
