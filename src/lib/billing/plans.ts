// Тарифы — единый источник цен и названий для лендинга, оплаты, кабинета, условий и админки.
// Pro — на 1 или 3 месяца; автопродление по согласию пользователя (billing/autopay.ts). При покупке в Payment сохраняется снимок: название, срок, сумма.
// Ограничения тарифов пока НЕ применяются к функциям продукта — это только витрина и оплата.

export type Tier = 'free' | 'pro';

export interface Plan {
  id: string; // стабильный id предложения (offer id): хранится в Payment.planId, не меняется при переименовании
  tier: Tier;
  name: string; // название в интерфейсе: «Pro — 1 месяц»
  label: string; // короткая метка для таблиц и админки: «Pro · 1 месяц»
  period: string; // подпись к цене
  months: number; // на сколько календарных месяцев продлевает Pro (0 — бесплатный)
  price: number; // полная цена в копейках
  description: string;
  features: string[];
  highlight?: boolean;
}

/**
 * Цена из переменной окружения: «490» или «490.50» (рубли, до двух знаков). Неверное значение — тариф скрывается
 * (цена 0), а сервер пишет причину в лог. Без переменной действует текущая цена Clymly.
 */
function envPrice(name: string, fallback: number): number {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return fallback;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(raw) || Number(raw) <= 0) {
    console.error(`[billing] ${name}="${raw.slice(0, 20)}" — неверная цена (нужно число больше нуля, до двух знаков после точки). Тариф скрыт.`);
    return 0;
  }
  return Math.round(Number(raw) * 100);
}

export const PLANS: Plan[] = [
  {
    id: 'free', tier: 'free', name: 'Free', label: 'Free', period: 'навсегда', months: 0, price: 0,
    description: 'Для знакомства с платформой',
    features: ['Анализ резюме', 'Адаптация резюме под вакансию', 'Создание сопроводительного письма', 'Подготовка к собеседованию'],
  },
  {
    id: 'pro-month', tier: 'pro', name: 'Pro — 1 месяц', label: 'Pro · 1 месяц', period: 'за 1 месяц', months: 1, price: envPrice('PRO_MONTH_PRICE', 499_00), highlight: true,
    description: 'Для активного поиска работы',
    features: ['Все основные инструменты Clymly', 'Анализ и улучшение резюме', 'Адаптация резюме под вакансии', 'Создание сопроводительных писем', 'Подготовка к собеседованию и AI-тренажёр'],
  },
  {
    id: 'pro-quarter', tier: 'pro', name: 'Pro — 3 месяца', label: 'Pro · 3 месяца', period: 'за 3 месяца', months: 3, price: envPrice('PRO_QUARTER_PRICE', 1190_00),
    description: 'Типичный срок поиска работы — выгоднее помесячной оплаты',
    features: ['Всё из тарифа Pro — 1 месяц', 'Один платёж на 3 месяца'],
  },
];

export const getPlan = (id: string) => PLANS.find((p) => p.id === id) ?? null;

/** Базовый месячный тариф — от него считаются эквивалент в месяц и экономия. */
const MONTHLY = () => PLANS.find((p) => p.tier === 'pro' && p.months === 1)!;

/** Цена в месяц, округлённая до рубля (копейки): 1 190 ₽ / 3 → 397 ₽. */
export const monthlyPrice = (p: Plan) => (p.months > 0 ? Math.round(p.price / p.months / 100) * 100 : 0);

/** Экономия против помесячной оплаты того же срока: 3 × 499 − 1 190 = 307 ₽ (≈ 20,5 %). */
export function savings(p: Plan): { amount: number; percent: number } | null {
  if (p.months <= 1 || !(MONTHLY()?.price > 0)) return null;
  const full = MONTHLY().price * p.months;
  const amount = full - p.price;
  return amount > 0 ? { amount, percent: Math.round((amount / full) * 1000) / 10 } : null;
}

/** Метка тарифа покупки: из снимка на момент покупки, иначе по id предложения. Сумма для этого не используется. */
export function planLabel(planId: string, snapshot?: { planName?: string | null; months?: number | null }) {
  const p = getPlan(planId);
  if (p) return p.label;
  if (snapshot?.months) return `Pro · ${snapshot.months} ${snapshot.months === 1 ? 'месяц' : snapshot.months < 5 ? 'месяца' : 'месяцев'}`;
  return snapshot?.planName ?? planId;
}

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

/** Подпись про автопродление — одинаковая на всех экранах. */
export const AUTOPAY_NOTE = 'Автопродление — только если отметите «Запомнить данные карты»';

/** Порядок тарифов по сроку: при действующем автопродлении можно перейти только на более длинный. */
export const planRank = (id: string) => getPlan(id)?.months ?? 0;

/** Сумма в рублях строкой для API ЮKassa: 49000 → "490.00". */
export const rubString = (kopecks: number) => (kopecks / 100).toFixed(2);

const pct = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

/** Подписи цены, одинаковые на всех экранах. */
export function priceNotes(p: Plan) {
  const s = savings(p);
  return {
    perMonth: p.months > 1 ? `≈ ${formatRub(monthlyPrice(p))} в месяц` : p.months === 1 ? `${formatRub(p.price)} в месяц` : '',
    savings: s ? `Экономия ${formatRub(s.amount)} (≈ ${pct(s.percent)} %) по сравнению с оплатой помесячно` : '',
    badge: s ? `Экономия ${formatRub(s.amount)}` : '',
    oneTime: p.months > 0 ? AUTOPAY_NOTE : '',
  };
}
