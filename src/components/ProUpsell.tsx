// Предложение Clymly Pro для бесплатного тарифа: баннер, замок на разделе, пометка «Pro», остаток лимита.
import Link from 'next/link';
import { PLANS, formatRub, monthlyPrice } from '@/lib/billing/plans';
import type { Quota } from '@/lib/billing/entitlements';
import Icon from './Icon';
import { LinkButton, cx } from './ui';

const minMonthly = () => Math.min(...PLANS.filter((p) => p.price > 0).map(monthlyPrice));
export const PRO_BENEFITS = [
  'Адаптация резюме под каждую вакансию',
  'Сопроводительные письма в трёх стилях',
  'Тренажёр собеседований с разбором ответов',
  'Анализ резюме и вакансий без ограничений',
];

/** Пометка «Pro» рядом с названием функции. */
export function ProBadge({ className }: { className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-md bg-accent-50 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent-700', className)} data-testid="pro-badge"><Icon name="lock" size={11} />Pro</span>;
}

/** Баннер для пользователей Free. */
export function ProBanner({ title = 'Подключите Clymly Pro', text, className, testid = 'pro-banner' }: { title?: string; text?: string; className?: string; testid?: string }) {
  return (
    <section className={cx('flex flex-col gap-4 rounded-2xl border border-accent-100 bg-accent-50 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6', className)} data-testid={testid}>
      <div className="min-w-0">
        <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">{text ?? `${PRO_BENEFITS.slice(0, 3).map((b, i) => (i ? b[0].toLowerCase() + b.slice(1) : b)).join(', ')} — от ${formatRub(minMonthly())} в месяц.`}</p>
      </div>
      <LinkButton href="/billing" className="shrink-0" data-testid={`${testid}-cta`}>Подключить Pro<Icon name="arrow-right" size={15} /></LinkButton>
    </section>
  );
}

/** Раздел недоступен на Free: что даёт Pro и кнопка подключения. */
export function ProPaywall({ title, text, note }: { title: string; text: string; note?: string }) {
  return (
    <section className="mx-auto max-w-[640px] rounded-2xl border border-line bg-white p-6 text-center sm:p-10" data-testid="pro-paywall">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-50 text-accent-600"><Icon name="lock" size={22} /></span>
      <h2 className="mt-4 text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{text}</p>
      <ul className="mx-auto mt-5 max-w-sm space-y-2 text-left text-sm">
        {PRO_BENEFITS.map((b) => <li key={b} className="flex items-start gap-2"><Icon name="check" size={16} className="mt-0.5 shrink-0 text-accent-600" />{b}</li>)}
      </ul>
      <div className="mt-6 flex flex-col items-center gap-2">
        <LinkButton href="/billing" size="lg" data-testid="pro-paywall-cta">Подключить Pro — от {formatRub(minMonthly())} в месяц</LinkButton>
        {note && <p className="text-xs text-muted">{note}</p>}
      </div>
    </section>
  );
}

const fmtDay = (d: Date) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });

/** Остаток месячного лимита Free: «Осталось 1 из 2 анализов резюме в этом месяце». */
export function QuotaNote({ q, what, resetsAt, className, testid }: { q: Quota; what: string; resetsAt: Date; className?: string; testid?: string }) {
  if (!Number.isFinite(q.limit)) return null;
  const out = q.left === 0;
  return (
    <p className={cx('flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]', out ? 'text-bad' : 'text-ink-2', className)} data-testid={testid}>
      <span>{out ? `Лимит бесплатного тарифа исчерпан: ${what} — ${q.limit} в месяц. Обновится ${fmtDay(resetsAt)}.` : `Бесплатно осталось ${q.left} из ${q.limit} — ${what} в этом месяце.`}</span>
      <Link href="/billing" className="font-medium text-accent-600 hover:text-accent-700">{out ? 'Без ограничений — в Pro' : 'Pro — без ограничений'}</Link>
    </p>
  );
}
