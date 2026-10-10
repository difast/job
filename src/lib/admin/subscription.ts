// Подписка Clymly Pro: отдельной сущности нет — Pro оплачивается разово (1 или 3 месяца) без автопродления.
// Статус и даты выводятся из User.plan/planUntil и успешных платежей тем же правилом, что и продление (extendUntil).
import { extendUntil, getPlan } from '../billing/plans';

export type SubStatus = 'none' | 'active' | 'expired';
export const SUB_LABEL: Record<SubStatus, string> = { none: 'Не оформлялась', active: 'Активна', expired: 'Истекла' };

export function subStatus(u: { plan: string; planUntil: Date | null }, paidCount: number, now = new Date()): SubStatus {
  if (u.plan === 'pro' && u.planUntil && u.planUntil > now) return 'active';
  return paidCount > 0 || u.plan === 'pro' ? 'expired' : 'none';
}

/** Начало текущего (последнего) непрерывного периода Pro по успешным платежам. */
export function periodStartFromPayments(payments: { planId: string; paidAt: Date }[]): Date | null {
  let until: Date | null = null, start: Date | null = null;
  for (const p of [...payments].sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime())) {
    const months = getPlan(p.planId)?.months ?? 0;
    if (months <= 0) continue;
    if (!until || until < p.paidAt) start = p.paidAt;
    until = extendUntil(until, months, p.paidAt);
  }
  return start;
}
