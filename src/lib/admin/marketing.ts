// Маркетинговая аналитика и атрибуция.
//
// Определения (одинаковые во всех отчётах):
// • Переходы — все записи Visit за период (повторные клики тоже).
// • Уникальные посетители — различные visitorId среди переходов периода (переходы без cookie — после отказа — не учитываются).
// • Регистрации:  first-touch — пользователь, у которого первый визит до регистрации (User.firstVisitId) относится к ссылке/метке;
//                 last-touch  — последний визит перед регистрацией (User.signupVisitId). Регистрация считается в период по дате регистрации.
// • Оплаты: успешные платежи, созданные в периоде. first-touch — по first-touch пользователя;
//           last-touch — по последнему визиту пользователя не позже создания платежа.
// • Оплатившие — уникальные пользователи с хотя бы одной такой оплатой; выручка — сумма этих оплат по валютам.
// • Конверсия переход → регистрация = регистрации / уникальные посетители × 100%;
//   переход → оплата = оплатившие / уникальные посетители × 100%. При нулевом знаменателе — «—».
// JobToo: аккаунты, созданные переходом из JobToo (User.source = 'jobtoo'), сюда не попадают — у них своя аналитика (/admin/integrations).
import { db } from '../db';
import { periodStart, type PeriodKey } from './period';

export type Model = 'first' | 'last';
export const parseModel = (v: string | undefined): Model => (v === 'last' ? 'last' : 'first');
export const DIMENSIONS = { link: 'Ссылка', utmSource: 'Источник (utm_source)', utmMedium: 'Канал (utm_medium)', utmCampaign: 'Кампания (utm_campaign)', utmContent: 'Контент (utm_content)', utmTerm: 'Ключевое слово (utm_term)' } as const;
export type Dimension = keyof typeof DIMENSIONS;
export const parseDimension = (v: string | undefined): Dimension => (v && v in DIMENSIONS ? (v as Dimension) : 'link');

export interface MarketingFilters { period: PeriodKey; model: Model; source?: string; campaign?: string; link?: string }
type VisitLite = { id: string; createdAt: Date; linkId: string | null; visitorId: string | null; userId: string | null; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; utmContent: string | null; utmTerm: string | null };

const key = (v: VisitLite, d: Dimension) => (d === 'link' ? v.linkId : v[d]) ?? '(не задано)';
const matches = (v: VisitLite | undefined, f: MarketingFilters, linkId?: string) =>
  !!v && (!f.source || v.utmSource === f.source) && (!f.campaign || v.utmCampaign === f.campaign) && (!linkId || v.linkId === linkId);

export interface Row { key: string; label: string; clicks: number; visitors: number; registrations: number; payers: number; revenue: { currency: string; amount: number }[]; payments: number }

export async function marketingReport(f: MarketingFilters, dim: Dimension) {
  const from = periodStart(f.period);
  const links = await db.marketingLink.findMany({ orderBy: { createdAt: 'asc' } });
  const linkId = f.link ? links.find((l) => l.slug === f.link)?.id ?? '—' : undefined;
  const sel = { id: true, createdAt: true, linkId: true, visitorId: true, userId: true, utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true, utmTerm: true } as const;

  const visits: VisitLite[] = await db.visit.findMany({ where: { createdAt: { gte: from } }, select: sel });
  const periodVisits = visits.filter((v) => matches(v, f, linkId));

  // регистрации периода с атрибуцией по выбранной модели
  const users = await db.user.findMany({ where: { createdAt: { gte: from }, OR: [{ firstVisitId: { not: null } }, { signupVisitId: { not: null } }] }, select: { id: true, firstVisitId: true, signupVisitId: true } });
  // успешные оплаты периода
  const payments = await db.payment.findMany({ where: { status: 'succeeded', createdAt: { gte: from } }, select: { id: true, userId: true, amount: true, currency: true, createdAt: true, user: { select: { firstVisitId: true } } } });
  const payerIds = [...new Set(payments.map((p) => p.userId))];
  const userVisits: VisitLite[] = payerIds.length ? await db.visit.findMany({ where: { userId: { in: payerIds } }, select: sel, orderBy: { createdAt: 'asc' } }) : [];
  const neededIds = [...users.flatMap((u) => [u.firstVisitId, u.signupVisitId]), ...payments.map((p) => p.user.firstVisitId)].filter(Boolean) as string[];
  const attrVisits = new Map((neededIds.length ? await db.visit.findMany({ where: { id: { in: neededIds } }, select: sel }) : []).map((v) => [v.id, v]));
  userVisits.forEach((v) => attrVisits.set(v.id, v));

  const regVisit = (u: (typeof users)[number]) => attrVisits.get((f.model === 'first' ? u.firstVisitId : u.signupVisitId) ?? '');
  const payVisit = (p: (typeof payments)[number]) => f.model === 'first'
    ? attrVisits.get(p.user.firstVisitId ?? '')
    : [...userVisits].reverse().find((v) => v.userId === p.userId && v.createdAt <= p.createdAt);

  const rows = new Map<string, Row & { visitorSet: Set<string>; payerSet: Set<string> }>();
  const row = (k: string) => {
    if (!rows.has(k)) rows.set(k, { key: k, label: k, clicks: 0, visitors: 0, registrations: 0, payers: 0, revenue: [], payments: 0, visitorSet: new Set(), payerSet: new Set() });
    return rows.get(k)!;
  };
  for (const v of periodVisits) { const r = row(key(v, dim)); r.clicks++; if (v.visitorId) r.visitorSet.add(v.visitorId); }
  for (const u of users) { const v = regVisit(u); if (matches(v, f, linkId)) row(key(v!, dim)).registrations++; }
  for (const p of payments) {
    const v = payVisit(p);
    if (!matches(v, f, linkId)) continue;
    const r = row(key(v!, dim));
    r.payments++; r.payerSet.add(p.userId);
    const m = r.revenue.find((x) => x.currency === p.currency);
    if (m) m.amount += p.amount; else r.revenue.push({ currency: p.currency, amount: p.amount });
  }
  const linkName = (id: string) => links.find((l) => l.id === id)?.name ?? (id === '(не задано)' ? '(без ссылки)' : 'Ссылка удалена');
  const out: Row[] = [...rows.values()].map(({ visitorSet, payerSet, ...r }) => ({ ...r, label: dim === 'link' ? linkName(r.key) : r.key, visitors: visitorSet.size, payers: payerSet.size }))
    .sort((a, b) => b.clicks - a.clicks || b.registrations - a.registrations);

  // итоги — по тем же правилам (уникальность по всему периоду, а не сумма по строкам)
  const totalVisitors = new Set(periodVisits.map((v) => v.visitorId).filter(Boolean)).size;
  const attributedPayers = new Set<string>(), revenue: { currency: string; amount: number }[] = [];
  let attributedPayments = 0;
  for (const p of payments) {
    if (!matches(payVisit(p), f, linkId)) continue;
    attributedPayers.add(p.userId); attributedPayments++;
    const m = revenue.find((x) => x.currency === p.currency);
    if (m) m.amount += p.amount; else revenue.push({ currency: p.currency, amount: p.amount });
  }
  const totals = {
    clicks: periodVisits.length, visitors: totalVisitors, anonymousClicks: periodVisits.filter((v) => !v.visitorId).length,
    registrations: users.filter((u) => matches(regVisit(u), f, linkId)).length,
    payers: attributedPayers.size, payments: attributedPayments, revenue,
  };
  return { rows: out, totals, links };
}

/** Статистика по каждой ссылке (для карточек) — по выбранному периоду и модели. */
export async function linkCards(f: MarketingFilters) {
  const r = await marketingReport({ ...f, source: undefined, campaign: undefined, link: undefined }, 'link');
  return r.links.map((l) => ({ link: l, stats: r.rows.find((x) => x.key === l.id) ?? null }));
}

/** Технические срезы переходов: устройство, ОС, браузер, язык, реферер, посадочная страница. */
export async function techBreakdown(period: PeriodKey) {
  const from = periodStart(period);
  const by = async (field: 'device' | 'os' | 'browser' | 'lang' | 'referrerHost' | 'landing') =>
    (await db.visit.groupBy({ by: [field], where: { createdAt: { gte: from } }, _count: { _all: true }, orderBy: { _count: { id: 'desc' } }, take: 8 }))
      .map((g) => ({ label: (g[field] as string | null) ?? '(нет данных)', count: g._count._all }));
  const [device, os, browser, lang, referrerHost, landing] = await Promise.all([by('device'), by('os'), by('browser'), by('lang'), by('referrerHost'), by('landing')]);
  return { device, os, browser, lang, referrerHost, landing };
}

/** Значения для фильтров (только реально встречавшиеся). */
export async function filterOptions() {
  const [sources, campaigns] = await Promise.all([
    db.visit.findMany({ where: { utmSource: { not: null } }, distinct: ['utmSource'], select: { utmSource: true }, take: 50 }),
    db.visit.findMany({ where: { utmCampaign: { not: null } }, distinct: ['utmCampaign'], select: { utmCampaign: true }, take: 50 }),
  ]);
  return { sources: sources.map((s) => s.utmSource!), campaigns: campaigns.map((c) => c.utmCampaign!) };
}
