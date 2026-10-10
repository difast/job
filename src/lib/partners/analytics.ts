// Отчёт по переходам между Clymly и JobToo (для администраторов, ADMIN_EMAILS).
import { db } from '../db';
import { PARTNER } from './config';

export const isAdmin = (email: string) => (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());

export interface Filters { days: number; placement?: string; platform?: string }

export const parseFilters = (sp: Record<string, string | undefined>): Filters => ({
  days: [7, 30, 90, 365].includes(Number(sp.days)) ? Number(sp.days) : 30,
  placement: sp.placement && /^[a-z_]{1,40}$/.test(sp.placement) ? sp.placement : undefined,
  platform: sp.platform && /^[a-z_]{1,20}$/.test(sp.platform) ? sp.platform : undefined,
});

export const where = (f: Filters) => ({
  partner: PARTNER, createdAt: { gte: new Date(Date.now() - f.days * 86_400_000) },
  ...(f.placement ? { placement: f.placement } : {}), ...(f.platform ? { platform: f.platform } : {}),
});

// Шаги воронок: [событие, подпись]
export const FUNNEL_OUT: [string, string][] = [
  ['button_shown', 'Показы кнопки'], ['button_clicked', 'Клики'], ['consent_accepted', 'Согласия'], ['handoff_succeeded', 'Успешные передачи'],
  ['redirect_opened', 'Открыта ссылка'], ['partner_login_completed', 'Вход в JobToo'], ['partner_first_action', 'Первое действие в JobToo'],
];
export const FUNNEL_IN: [string, string][] = [
  ['start_opened', 'Открыта страница перехода'], ['inbound_consent_accepted', 'Согласие с условиями Clymly'], ['pull_succeeded', 'Данные получены от JobToo'],
  ['login_completed', 'Вход в Clymly'], ['account_linked', 'Привязка аккаунта'], ['first_action', 'Первое действие в Clymly'],
];

export async function report(f: Filters) {
  const w = where(f);
  const [counts, errors, avgOut, avgIn, rows, placements, platforms] = await Promise.all([
    db.integrationEvent.groupBy({ by: ['direction', 'event'], where: w, _count: { _all: true } }),
    db.integrationEvent.groupBy({ by: ['direction', 'errorCode'], where: { ...w, errorCode: { not: null } }, _count: { _all: true }, orderBy: { _count: { errorCode: 'desc' } }, take: 10 }),
    db.integrationEvent.aggregate({ where: { ...w, direction: 'out', event: { in: ['handoff_succeeded', 'handoff_failed'] } }, _avg: { durationMs: true } }),
    db.integrationEvent.aggregate({ where: { ...w, direction: 'in', event: { in: ['pull_succeeded', 'pull_failed'] } }, _avg: { durationMs: true } }),
    db.integrationEvent.findMany({ where: { ...w, event: { in: ['button_clicked', 'handoff_succeeded', 'partner_login_completed', 'pull_succeeded', 'login_completed'] } }, select: { createdAt: true, direction: true, event: true }, take: 50_000 }),
    db.integrationEvent.findMany({ where: { partner: PARTNER, placement: { not: null } }, distinct: ['placement'], select: { placement: true } }),
    db.integrationEvent.findMany({ where: { partner: PARTNER, platform: { not: null } }, distinct: ['platform'], select: { platform: true } }),
  ]);
  const count = (dir: string, ev: string) => counts.find((c) => c.direction === dir && c.event === ev)?._count._all ?? 0;
  const funnel = (dir: string, steps: [string, string][]) => steps.map(([ev, label], i) => {
    const n = count(dir, ev);
    const prev = i ? count(dir, steps[i - 1][0]) : null;
    return { event: ev, label, n, conv: prev ? Math.round((n / prev) * 100) : null };
  });
  const byDay = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const d = r.createdAt.toISOString().slice(0, 10);
    const k = `${r.direction}:${r.event}`;
    const m = byDay.get(d) ?? {};
    m[k] = (m[k] ?? 0) + 1;
    byDay.set(d, m);
  }
  return {
    out: funnel('out', FUNNEL_OUT), in: funnel('in', FUNNEL_IN),
    errors: errors.map((e) => ({ direction: e.direction, code: e.errorCode!, n: e._count._all })),
    avgOutMs: Math.round(avgOut._avg.durationMs ?? 0), avgInMs: Math.round(avgIn._avg.durationMs ?? 0),
    days: [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])),
    placements: placements.map((p) => p.placement!).sort(), platforms: platforms.map((p) => p.platform!).sort(),
  };
}
