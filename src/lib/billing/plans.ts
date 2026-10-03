// Тарифы. Цены и состав — заглушки: поменяйте здесь, UI и оплата подхватят изменения.
// Ограничения тарифов пока НЕ применяются к функциям продукта — это только витрина и оплата.

export type Tier = 'free' | 'pro';

export interface Plan {
  id: string;
  tier: Tier;
  name: string;
  period: string; // подпись к цене
  months: number; // на сколько месяцев продлевает Pro (0 — бесплатный)
  price: number; // в копейках
  description: string;
  features: string[];
  highlight?: boolean;
  note?: string;
}

export const PLANS: Plan[] = [
  {
    id: 'free', tier: 'free', name: 'Бесплатный', period: 'навсегда', months: 0, price: 0,
    description: 'Чтобы попробовать сервис и оценить резюме.',
    features: ['Анализ резюме под профессию', 'Анализ вакансий', 'Сопроводительные письма', 'Тренажёр собеседования'],
  },
  {
    id: 'pro-month', tier: 'pro', name: 'Pro', period: 'в месяц', months: 1, price: 490_00, highlight: true,
    description: 'Для активного поиска работы.',
    features: ['Всё из бесплатного тарифа', 'Глубокий AI-анализ резюме и вакансий', 'Безлимитная адаптация резюме и письма', 'Приоритетная поддержка'],
  },
  {
    id: 'pro-quarter', tier: 'pro', name: 'Pro на 3 месяца', period: 'за 3 месяца', months: 3, price: 1190_00,
    description: 'Типичный срок поиска работы — выгоднее помесячной оплаты.',
    features: ['Всё из тарифа Pro', 'Экономия 19% по сравнению с помесячной оплатой'],
    note: '≈ 397 ₽ в месяц',
  },
];

export const getPlan = (id: string) => PLANS.find((p) => p.id === id) ?? null;

export const formatRub = (kopecks: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: kopecks % 100 ? 2 : 0 }).format(kopecks / 100);

/** Текущий тариф пользователя с учётом срока действия Pro. */
export function currentTier(u: { plan: string; planUntil: Date | null }, now = new Date()): { tier: Tier; until: Date | null } {
  if (u.plan === 'pro' && u.planUntil && u.planUntil > now) return { tier: 'pro', until: u.planUntil };
  return { tier: 'free', until: null };
}

/** Новый срок Pro после оплаты: продление считается от конца текущего периода, если он ещё не истёк. */
export function extendUntil(current: Date | null, months: number, now = new Date()): Date {
  const base = current && current > now ? new Date(current) : new Date(now);
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== base.getDate()) d.setDate(0); // 31 янв + 1 мес → последний день февраля
  return d;
}
