// Периоды и сутки админки — по московскому времени (UTC+3, без перехода на летнее время).
export const TZ = 'Europe/Moscow';
export type PeriodKey = '7' | '30' | '90' | 'all';
export const PERIODS: { key: PeriodKey; label: string }[] = [{ key: '7', label: '7 дней' }, { key: '30', label: '30 дней' }, { key: '90', label: '90 дней' }, { key: 'all', label: 'Всё время' }];

export const parsePeriod = (v: string | undefined): PeriodKey => (v === '7' || v === '90' || v === 'all' ? v : '30');

const DAY = 86_400_000;
/** Дата YYYY-MM-DD в Москве. */
export const mskDate = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: TZ });
/** Начало московских суток n дней назад (0 — сегодня). */
export const mskDayStart = (daysAgo = 0) => new Date(Date.parse(`${mskDate(new Date())}T00:00:00+03:00`) - daysAgo * DAY);

/** Начало периода: «7 дней» — сегодня и 6 предыдущих суток; «всё время» — без ограничения. */
export const periodStart = (p: PeriodKey) => (p === 'all' ? new Date(0) : mskDayStart(Number(p) - 1));

/** Список дней периода (для графиков). Для «всего времени» — от первой даты в данных. */
export function dayRange(p: PeriodKey, first: Date | null): string[] {
  const start = p === 'all' ? (first ? new Date(Date.parse(`${mskDate(first)}T00:00:00+03:00`)) : mskDayStart(29)) : periodStart(p);
  const out: string[] = [];
  for (let t = start.getTime(); t <= Date.now(); t += DAY) out.push(mskDate(new Date(t)));
  return out;
}

export const fmtMoney = (kopecks: number, currency = 'RUB') =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: kopecks % 100 ? 2 : 0 }).format(kopecks / 100);
export const fmtDate = (d: Date | null | undefined, time = false) =>
  d ? d.toLocaleString('ru-RU', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) }) : '—';
/** Конверсия в %, при нулевом знаменателе — прочерк. */
export const pct = (num: number, den: number) => (den > 0 ? `${((num / den) * 100).toFixed(1).replace('.', ',')}%` : '—');
