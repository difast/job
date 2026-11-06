// Расход ИИ для админки: запросы и токены по функциям, моделям, дням, ошибки и пользователи с наибольшим расходом.
// Источник — AiCall (одна строка на запрос к провайдеру, без текстов). Стоимость — оценка по AI_PRICE_PER_1K_TOKENS (₽ за 1000 токенов).
import { Prisma } from '@prisma/client';
import { db } from '../db';
import { periodStart, type PeriodKey } from './period';

const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

export const AI_FEATURE_LABELS: Record<string, string> = {
  analyzeResume: 'Анализ резюме',
  analyzeVacancy: 'Разбор вакансии',
  adaptResume: 'Адаптация резюме',
  letter: 'Сопроводительное письмо',
  interviewQuestions: 'Вопросы под вакансию',
  evaluateAnswer: 'Оценка ответа',
};

/** Цена 1000 токенов в рублях (оценка из настроек) или null, если не задана. */
export function tokenPrice(env: Record<string, string | undefined> = process.env) {
  const v = Number((env.AI_PRICE_PER_1K_TOKENS ?? '').replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export interface AiRow { key: string; calls: number; failed: number; prompt: number; completion: number; total: number }

export async function aiReport(p: PeriodKey) {
  const from = periodStart(p);
  const where = { createdAt: { gte: from } };
  const day = Prisma.sql`to_char(("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Moscow')::date, 'YYYY-MM-DD')`;
  const [byFeature, byModel, errors, daily, top, first, users] = await Promise.all([
    db.aiCall.groupBy({ by: ['feature', 'ok'], where, _count: { _all: true }, _sum: { promptTokens: true, completionTokens: true, totalTokens: true } }),
    db.aiCall.groupBy({ by: ['provider', 'model'], where, _count: { _all: true }, _sum: { totalTokens: true } }),
    db.aiCall.groupBy({ by: ['errorKind'], where: { ...where, ok: false }, _count: { _all: true } }),
    db.$queryRaw<{ d: string; t: bigint; c: bigint }[]>`SELECT ${day} AS d, SUM("totalTokens") AS t, COUNT(*) AS c FROM "AiCall" WHERE "createdAt" >= ${from} GROUP BY 1`,
    db.aiCall.groupBy({ by: ['userId'], where: { ...where, userId: { not: null } }, _count: { _all: true }, _sum: { totalTokens: true }, orderBy: { _sum: { totalTokens: 'desc' } }, take: 10 }),
    db.aiCall.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    db.aiCall.findMany({ where: { ...where, userId: { not: null } }, distinct: ['userId'], select: { userId: true } }),
  ]);

  const features = new Map<string, AiRow>();
  for (const r of byFeature) {
    const row = features.get(r.feature) ?? { key: r.feature, calls: 0, failed: 0, prompt: 0, completion: 0, total: 0 };
    row.calls += r._count._all;
    if (!r.ok) row.failed += r._count._all;
    row.prompt += n(r._sum.promptTokens); row.completion += n(r._sum.completionTokens); row.total += n(r._sum.totalTokens);
    features.set(r.feature, row);
  }
  const rows = [...features.values()].sort((a, b) => b.total - a.total);
  const totals = rows.reduce((s, r) => ({ calls: s.calls + r.calls, failed: s.failed + r.failed, prompt: s.prompt + r.prompt, completion: s.completion + r.completion, total: s.total + r.total }), { calls: 0, failed: 0, prompt: 0, completion: 0, total: 0 });

  const topUsers = top.length ? await db.user.findMany({ where: { id: { in: top.map((t) => t.userId!) } }, select: { id: true, email: true, plan: true, planUntil: true, deletedAt: true } }) : [];
  return {
    totals: { ...totals, users: users.length },
    features: rows,
    models: byModel.map((m) => ({ provider: m.provider, model: m.model ?? '—', calls: m._count._all, total: n(m._sum.totalTokens) })).sort((a, b) => b.total - a.total),
    errors: errors.map((e) => ({ kind: e.errorKind ?? 'unknown', count: e._count._all })).sort((a, b) => b.count - a.count),
    tokensByDay: Object.fromEntries(daily.map((r) => [r.d, n(r.t)])),
    callsByDay: Object.fromEntries(daily.map((r) => [r.d, n(r.c)])),
    top: top.map((t) => {
      const u = topUsers.find((x) => x.id === t.userId);
      const pro = !!u && u.plan === 'pro' && !!u.planUntil && u.planUntil > new Date();
      return { userId: t.userId!, email: u?.deletedAt ? 'удалённый пользователь' : u?.email ?? '—', pro, calls: t._count._all, total: n(t._sum.totalTokens) };
    }),
    first: first?.createdAt ?? null,
  };
}
