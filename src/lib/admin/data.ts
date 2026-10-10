// Данные админки. Все суммы — в копейках и по валютам (без конвертации). Успешный платёж — status=succeeded
// (статус меняется только из pending, поэтому повторные уведомления провайдера не создают дублей).
// Во всех отчётах платёж относится к периоду по дате создания (createdAt, МСК).
import { Prisma } from '@prisma/client';
import { db } from '../db';
import { PLANS } from '../billing/plans';
import { mskDayStart, periodStart, type PeriodKey } from './period';

const n = (v: unknown) => Number(v ?? 0);
const ACTIVE_DAYS = 30;
export const ACTIVE_HINT = `Активный — за последние ${ACTIVE_DAYS} дней входил в аккаунт или пользовался сервисом: загружал резюме, анализировал вакансию, создавал письмо, отвечал в тренажёре или оплачивал.`;

/** Последняя активность по каждому пользователю (вход, действия в сервисе, платежи). */
const ACTIVITY_SQL = Prisma.sql`
  SELECT "userId", MAX(t) AS last_at FROM (
    SELECT "userId", "createdAt" AS t FROM "Session"
    UNION ALL SELECT "userId", "createdAt" FROM "Resume"
    UNION ALL SELECT "userId", "createdAt" FROM "Vacancy"
    UNION ALL SELECT "userId", "createdAt" FROM "PracticeAttempt"
    UNION ALL SELECT v."userId", c."createdAt" FROM "CoverLetter" c JOIN "Vacancy" v ON v.id = c."vacancyId"
    UNION ALL SELECT "userId", "createdAt" FROM "Payment"
  ) a GROUP BY "userId"`;

export type MoneyByCurrency = { currency: string; amount: number; count: number }[];

/* ───────── Обзор ───────── */
export async function overview() {
  const now = new Date();
  const [d0, d7, d30] = [mskDayStart(0), mskDayStart(6), mskDayStart(29)];
  const [total, today, week, month, pro, active, paidAgg, paidToday, paid7, paid30, failed, pending, expired, recent, sources] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: d0 } } }),
    db.user.count({ where: { createdAt: { gte: d7 } } }),
    db.user.count({ where: { createdAt: { gte: d30 } } }),
    db.user.count({ where: { plan: 'pro', planUntil: { gt: now } } }),
    db.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*) AS c FROM (${ACTIVITY_SQL}) x WHERE last_at >= ${new Date(Date.now() - ACTIVE_DAYS * 86_400_000)}`,
    db.payment.groupBy({ by: ['currency'], where: { status: 'succeeded' }, _sum: { amount: true }, _count: { _all: true } }),
    db.payment.groupBy({ by: ['currency'], where: { status: 'succeeded', createdAt: { gte: d0 } }, _sum: { amount: true }, _count: { _all: true } }),
    db.payment.groupBy({ by: ['currency'], where: { status: 'succeeded', createdAt: { gte: d7 } }, _sum: { amount: true }, _count: { _all: true } }),
    db.payment.groupBy({ by: ['currency'], where: { status: 'succeeded', createdAt: { gte: d30 } }, _sum: { amount: true }, _count: { _all: true } }),
    db.payment.count({ where: { status: 'canceled' } }),
    db.payment.count({ where: { status: 'pending' } }),
    db.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*) AS c FROM "User" u WHERE NOT (u.plan = 'pro' AND u."planUntil" > ${now})
      AND (u.plan = 'pro' OR EXISTS (SELECT 1 FROM "Payment" p WHERE p."userId" = u.id AND p.status = 'succeeded'))`,
    db.payment.findMany({ orderBy: { createdAt: 'desc' }, take: 6, include: { user: { select: { email: true } } } }),
    db.$queryRaw<{ src: string; c: bigint }[]>`SELECT CASE WHEN u.source = 'jobtoo' THEN 'jobtoo' WHEN u."signupVisitId" IS NOT NULL THEN 'marketing' ELSE 'direct' END AS src, COUNT(*) AS c FROM "User" u GROUP BY 1`,
  ]);
  const money = (g: typeof paidAgg): MoneyByCurrency => g.map((x) => ({ currency: x.currency, amount: x._sum.amount ?? 0, count: x._count._all }));
  return {
    users: { total, today, week, month, active: n(active[0]?.c), pro, free: total - pro },
    payments: { all: money(paidAgg), today: money(paidToday), d7: money(paid7), d30: money(paid30), failed, pending },
    subscriptions: { active: pro, expired: n(expired[0]?.c) },
    recent,
    signupSources: Object.fromEntries(sources.map((s) => [s.src, n(s.c)])) as Record<'jobtoo' | 'marketing' | 'direct', number>,
  };
}

/** Ряды по дням (МСК) за период: регистрации, переходы, успешные оплаты и выручка (по валютам). */
export async function dailySeries(p: PeriodKey) {
  const from = periodStart(p);
  const day = (col: Prisma.Sql) => Prisma.sql`to_char((${col} AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Moscow')::date, 'YYYY-MM-DD')`;
  const [regs, clicks, pays, first] = await Promise.all([
    db.$queryRaw<{ d: string; c: bigint }[]>`SELECT ${day(Prisma.sql`"createdAt"`)} AS d, COUNT(*) AS c FROM "User" WHERE "createdAt" >= ${from} GROUP BY 1`,
    db.$queryRaw<{ d: string; c: bigint }[]>`SELECT ${day(Prisma.sql`"createdAt"`)} AS d, COUNT(*) AS c FROM "Visit" WHERE "createdAt" >= ${from} GROUP BY 1`,
    db.$queryRaw<{ d: string; currency: string; c: bigint; s: bigint }[]>`SELECT ${day(Prisma.sql`"createdAt"`)} AS d, currency, COUNT(*) AS c, SUM(amount) AS s FROM "Payment" WHERE status = 'succeeded' AND "createdAt" >= ${from} GROUP BY 1, 2`,
    db.$queryRaw<{ f: Date | null }[]>`SELECT LEAST((SELECT MIN("createdAt") FROM "User"), (SELECT MIN("createdAt") FROM "Visit")) AS f`,
  ]);
  const map = (rows: { d: string; c: bigint }[]) => Object.fromEntries(rows.map((r) => [r.d, n(r.c)]));
  const paysByDay: Record<string, number> = {}, revenueByDay: Record<string, number> = {};
  for (const r of pays) { paysByDay[r.d] = (paysByDay[r.d] ?? 0) + n(r.c); if (r.currency === 'RUB') revenueByDay[r.d] = (revenueByDay[r.d] ?? 0) + n(r.s); }
  return { regs: map(regs), clicks: map(clicks), pays: paysByDay, revenue: revenueByDay, first: first[0]?.f ?? null, otherCurrencies: [...new Set(pays.map((r) => r.currency).filter((c) => c !== 'RUB'))] };
}

/* ───────── Пользователи ───────── */
export const USER_SORTS = { created: Prisma.sql`u."createdAt"`, activity: Prisma.sql`act.last_at`, paid: Prisma.sql`COALESCE(pay.total, 0)` } as const;
export type UserSort = keyof typeof USER_SORTS;
export interface UserFilters { q?: string; plan?: 'free' | 'pro'; account?: 'active' | 'pending'; sub?: 'none' | 'active' | 'expired'; source?: string; sort: UserSort; dir: 'asc' | 'desc'; page: number }
export const PAGE_SIZE = 25;

export interface UserRow {
  id: string; email: string; createdAt: Date; pdConsentAt: Date | null; plan: string; planUntil: Date | null; source: string | null;
  paid_count: number; total: number; last_paid_at: Date | null; last_amount: number | null; last_currency: string | null;
  last_at: Date | null; first_link: string | null; first_utm: string | null; signup_link: string | null; signup_utm: string | null;
}

export async function listUsers(f: UserFilters) {
  const now = new Date();
  const where: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (f.q) where.push(Prisma.sql`u.email ILIKE ${'%' + f.q.replace(/[\\%_]/g, (m) => '\\' + m) + '%'}`);
  if (f.plan === 'pro') where.push(Prisma.sql`u.plan = 'pro' AND u."planUntil" > ${now}`);
  if (f.plan === 'free') where.push(Prisma.sql`NOT (u.plan = 'pro' AND COALESCE(u."planUntil" > ${now}, FALSE))`);
  if (f.account === 'active') where.push(Prisma.sql`u."pdConsentAt" IS NOT NULL`);
  if (f.account === 'pending') where.push(Prisma.sql`u."pdConsentAt" IS NULL`);
  if (f.sub === 'active') where.push(Prisma.sql`u.plan = 'pro' AND u."planUntil" > ${now}`);
  if (f.sub === 'expired') where.push(Prisma.sql`NOT (u.plan = 'pro' AND COALESCE(u."planUntil" > ${now}, FALSE)) AND (u.plan = 'pro' OR COALESCE(pay.cnt, 0) > 0)`);
  if (f.sub === 'none') where.push(Prisma.sql`u.plan <> 'pro' AND COALESCE(pay.cnt, 0) = 0`);
  if (f.source === 'jobtoo') where.push(Prisma.sql`u.source = 'jobtoo'`);
  else if (f.source === 'none') where.push(Prisma.sql`ft."linkId" IS NULL AND COALESCE(u.source, '') <> 'jobtoo'`);
  else if (f.source) where.push(Prisma.sql`fl.slug = ${f.source}`);
  const base = Prisma.sql`
    FROM "User" u
    LEFT JOIN (SELECT "userId", COUNT(*) FILTER (WHERE status = 'succeeded') AS cnt, SUM(amount) FILTER (WHERE status = 'succeeded') AS total,
                      MAX("updatedAt") FILTER (WHERE status = 'succeeded') AS last_paid_at FROM "Payment" GROUP BY "userId") pay ON pay."userId" = u.id
    LEFT JOIN (${ACTIVITY_SQL}) act ON act."userId" = u.id
    LEFT JOIN (SELECT DISTINCT ON ("userId") "userId", "linkId", "utmSource" FROM "Visit" WHERE "userId" IS NOT NULL ORDER BY "userId", "createdAt") ft ON ft."userId" = u.id
    LEFT JOIN "MarketingLink" fl ON fl.id = ft."linkId"
    LEFT JOIN "Visit" sv ON sv.id = u."signupVisitId"
    LEFT JOIN "MarketingLink" sl ON sl.id = sv."linkId"
    WHERE ${Prisma.join(where, ' AND ')}`;
  const order = Prisma.sql`ORDER BY ${USER_SORTS[f.sort]} ${f.dir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`} NULLS LAST, u.id`;
  const [rows, count] = await Promise.all([
    db.$queryRaw<UserRow[]>`SELECT u.id, u.email, u."createdAt", u."pdConsentAt", u.plan, u."planUntil", u.source,
        COALESCE(pay.cnt, 0)::int AS paid_count, COALESCE(pay.total, 0)::int AS total, pay.last_paid_at,
        (SELECT amount FROM "Payment" lp WHERE lp."userId" = u.id AND lp.status = 'succeeded' ORDER BY lp."updatedAt" DESC LIMIT 1) AS last_amount,
        (SELECT currency FROM "Payment" lp WHERE lp."userId" = u.id AND lp.status = 'succeeded' ORDER BY lp."updatedAt" DESC LIMIT 1) AS last_currency,
        act.last_at, fl.name AS first_link, ft."utmSource" AS first_utm, sl.name AS signup_link, sv."utmSource" AS signup_utm
      ${base} ${order} LIMIT ${PAGE_SIZE} OFFSET ${(f.page - 1) * PAGE_SIZE}`,
    db.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*) AS c ${base}`,
  ]);
  // начало текущего периода Pro — по успешным платежам этих пользователей
  const ids = rows.map((r) => r.id);
  const paid = ids.length ? await db.payment.findMany({ where: { userId: { in: ids }, status: 'succeeded' }, select: { userId: true, planId: true, updatedAt: true } }) : [];
  return { rows: rows.map((r) => ({ ...r, paid_count: n(r.paid_count), total: n(r.total), last_amount: r.last_amount == null ? null : n(r.last_amount), payments: paid.filter((p) => p.userId === r.id).map((p) => ({ planId: p.planId, paidAt: p.updatedAt })) })), total: n(count[0]?.c) };
}

/* ───────── Платежи ───────── */
export interface PaymentFilters { period: PeriodKey; status?: 'succeeded' | 'pending' | 'canceled'; plan?: string; provider?: string; source?: string; page: number }

export async function listPayments(f: PaymentFilters) {
  const from = periodStart(f.period);
  const sourceFilter: Prisma.PaymentWhereInput = f.source === 'none'
    ? { user: { firstVisitId: null } }
    : f.source ? { user: { firstVisitId: { in: (await db.visit.findMany({ where: { link: { slug: f.source } }, select: { id: true } })).map((v) => v.id) } } } : {};
  const where: Prisma.PaymentWhereInput = {
    createdAt: { gte: from },
    ...(f.status ? { status: f.status } : {}),
    ...(f.plan && PLANS.some((p) => p.id === f.plan) ? { planId: f.plan } : {}),
    ...(f.provider ? { provider: f.provider } : {}),
    ...sourceFilter,
  };
  const [rows, count, totals, providers] = await Promise.all([
    db.payment.findMany({ where, orderBy: { createdAt: 'desc' }, take: PAGE_SIZE, skip: (f.page - 1) * PAGE_SIZE, include: { user: { select: { id: true, email: true, firstVisitId: true } } } }),
    db.payment.count({ where }),
    db.payment.groupBy({ by: ['status', 'currency'], where, _sum: { amount: true }, _count: { _all: true } }),
    db.payment.findMany({ distinct: ['provider'], select: { provider: true } }),
  ]);
  const visitIds = rows.map((r) => r.user.firstVisitId).filter(Boolean) as string[];
  const visits = visitIds.length ? await db.visit.findMany({ where: { id: { in: visitIds } }, include: { link: { select: { name: true } } } }) : [];
  const src = (id: string | null) => { const v = visits.find((x) => x.id === id); return v ? v.link?.name ?? v.utmSource ?? 'Ссылка удалена' : null; };
  return {
    rows: rows.map((r) => ({ ...r, source: src(r.user.firstVisitId) })), total: count,
    succeeded: totals.filter((t) => t.status === 'succeeded').map((t) => ({ currency: t.currency, amount: t._sum.amount ?? 0, count: t._count._all })),
    failed: totals.filter((t) => t.status === 'canceled').reduce((a, t) => a + t._count._all, 0),
    pending: totals.filter((t) => t.status === 'pending').reduce((a, t) => a + t._count._all, 0),
    providers: providers.map((p) => p.provider),
  };
}
