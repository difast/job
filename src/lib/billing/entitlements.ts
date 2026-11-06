// Что доступно на тарифе. Free: анализ резюме — 2 раза и разбор вакансии — 1 раз в календарный месяц (по Москве).
// Адаптация резюме, сопроводительные письма и тренажёр собеседований — только Pro.
// PLAN_LIMITS=off отключает ограничения (для отладки и старых тестов) — в рабочем окружении не задавать.
import { db } from '../db';
import { ApiError } from '../http';
import { currentTier } from './plans';

export type QuotaFeature = 'resume' | 'vacancy';
export type ProFeature = 'adapt' | 'letter' | 'interview';

export const FREE_LIMITS: Record<QuotaFeature, number> = { resume: 2, vacancy: 1 };
export const PRO_FEATURES: Record<ProFeature, string> = {
  adapt: 'Адаптация резюме под вакансию',
  letter: 'Сопроводительные письма',
  interview: 'Тренажёр собеседований',
};
const QUOTA_TEXT: Record<QuotaFeature, (n: number) => string> = {
  resume: (n) => `${n} ${n === 1 ? 'анализ' : n < 5 ? 'анализа' : 'анализов'} резюме`,
  vacancy: (n) => `${n} ${n === 1 ? 'разбор вакансии' : n < 5 ? 'разбора вакансий' : 'разборов вакансий'}`,
};

export const limitsOn = () => process.env.PLAN_LIMITS !== 'off';

type PlanUser = { id: string; plan: string; planUntil: Date | null };
export const isPro = (u: PlanUser) => !limitsOn() || currentTier(u).tier === 'pro';

const MSK = 3 * 3600_000;
/** Начало текущего календарного месяца по Москве. */
export function monthStart(now = new Date()) {
  const m = new Date(now.getTime() + MSK);
  return new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), 1) - MSK);
}
export function nextMonthStart(now = new Date()) {
  const m = new Date(now.getTime() + MSK);
  return new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1) - MSK);
}
const resetText = (now = new Date()) => nextMonthStart(now).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });

export interface Quota { used: number; limit: number; left: number }
export interface Entitlements { pro: boolean; resume: Quota; vacancy: Quota; resetsAt: Date }

/** Состояние лимитов пользователя на текущий месяц (для интерфейса). У Pro лимитов нет. */
export async function entitlements(user: PlanUser, now = new Date()): Promise<Entitlements> {
  const pro = isPro(user);
  const rows = await db.featureUse.groupBy({ by: ['feature'], where: { userId: user.id, createdAt: { gte: monthStart(now) } }, _count: { _all: true } });
  const q = (f: QuotaFeature): Quota => {
    const used = rows.find((r) => r.feature === f)?._count._all ?? 0;
    return pro ? { used, limit: Infinity, left: Infinity } : { used, limit: FREE_LIMITS[f], left: Math.max(0, FREE_LIMITS[f] - used) };
  };
  return { pro, resume: q('resume'), vacancy: q('vacancy'), resetsAt: nextMonthStart(now) };
}

/** Функция только для Pro: иначе 402 с понятным текстом и признаком upgrade для интерфейса. */
export function requirePro(user: PlanUser, feature: ProFeature) {
  if (isPro(user)) return;
  throw new ApiError(402, `${PRO_FEATURES[feature]} — в тарифе Pro. На бесплатном тарифе доступны анализ резюме и разбор вакансии.`, { upgrade: true, feature });
}

/**
 * Резервирует одно использование до обращения к ИИ: на Free сверх лимита — 402. Возвращает функцию отмены —
 * её вызывают, если операция не удалась (неудачная попытка лимит не тратит). enforce: false — только учёт
 * (импорт из JobToo не должен прерываться из-за лимита).
 */
export async function reserveQuota(user: PlanUser, feature: QuotaFeature, opts: { source?: 'user' | 'jobtoo' | 'profile'; enforce?: boolean } = {}) {
  if (!isPro(user) && opts.enforce !== false) {
    const used = await db.featureUse.count({ where: { userId: user.id, feature, createdAt: { gte: monthStart() } } });
    if (used >= FREE_LIMITS[feature]) {
      throw new ApiError(402, `На бесплатном тарифе — ${QUOTA_TEXT[feature](FREE_LIMITS[feature])} в месяц, лимит этого месяца исчерпан. Новые станут доступны ${resetText()}. С Pro — без ограничений.`, { upgrade: true, quota: feature });
    }
  }
  const row = await db.featureUse.create({ data: { userId: user.id, feature, source: opts.source ?? 'user' } });
  return async () => { await db.featureUse.deleteMany({ where: { id: row.id } }); };
}
