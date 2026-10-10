// Общие элементы админки: KPI, график по дням, воронка, фильтры-чипы, пагинация.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cx } from '../ui';

export function Kpi({ label, value, hint, sub, testid }: { label: string; value: ReactNode; hint?: string; sub?: ReactNode; testid?: string }) {
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3.5" data-testid={testid}>
      <div className="flex items-center gap-1 text-[12.5px] text-muted">{label}{hint && <span title={hint} aria-label={hint} className="cursor-help rounded-full border border-line-strong px-1 text-[10px] leading-[14px]">?</span>}</div>
      <div className="tabular mt-1 text-[22px] font-semibold leading-tight tracking-[-0.02em]">{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-muted">{sub}</div>}
    </div>
  );
}

export function Section({ title, children, action, className }: { title: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-2xl border border-line bg-white', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5"><h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>{action}</div>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Столбчатый график по дням (одна серия). Подсказка — при наведении; значения доступны и в таблице под графиком. */
export function DayBars({ title, days, values, format = (v) => String(v), testid }: { title: string; days: string[]; values: Record<string, number>; format?: (v: number) => string; testid?: string }) {
  const data = days.map((d) => ({ d, v: values[d] ?? 0 }));
  const max = Math.max(1, ...data.map((x) => x.v));
  const total = data.reduce((a, x) => a + x.v, 0);
  const label = (d: string) => new Date(`${d}T12:00:00+03:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  return (
    <figure className="min-w-0" data-testid={testid}>
      <figcaption className="flex items-baseline justify-between gap-2"><span className="text-[13px] font-medium">{title}</span><span className="tabular text-[13px] text-ink-2">{format(total)}</span></figcaption>
      <div className="mt-3 flex h-28 items-end gap-[2px] border-b border-line" role="img" aria-label={`${title}: всего ${format(total)} за период`}>
        {data.map((x) => (
          <div key={x.d} className="group relative flex h-full flex-1 items-end">
            <div className="w-full rounded-t-[3px] bg-[#c95a37] transition-opacity group-hover:opacity-80" style={{ height: x.v ? `${Math.max(3, (x.v / max) * 100)}%` : 0 }} />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] text-milk group-hover:block">{label(x.d)}: {format(x.v)}</div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted"><span>{data[0] && label(data[0].d)}</span><span>{data.at(-1) && label(data.at(-1)!.d)}</span></div>
    </figure>
  );
}

/** Воронка: ширина полос — доля от первого шага, рядом — абсолютное значение и конверсия от первого шага. */
export function Funnel({ steps }: { steps: { label: string; value: number; conv?: string }[] }) {
  const max = Math.max(1, steps[0]?.value ?? 1);
  return (
    <ol className="space-y-3" data-testid="funnel">
      {steps.map((s) => (
        <li key={s.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm"><span>{s.label}</span><span className="tabular"><b className="font-semibold">{s.value}</b>{s.conv && <span className="ml-2 text-xs text-muted">{s.conv}</span>}</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-subtle"><div className="h-full rounded-full bg-[#c95a37]" style={{ width: `${(s.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ol>
  );
}

/** Фильтр-ссылки: состояние в адресе (работают «Назад» и прямые ссылки). */
export function Chips({ items, current, href, label }: { items: { value: string; label: string }[]; current: string; href: (v: string) => string; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      {items.map((i) => (
        <Link key={i.value} href={href(i.value)} aria-current={current === i.value ? 'true' : undefined}
          className={cx('inline-flex h-8 items-center rounded-full px-3 text-[13px] font-medium transition-colors', current === i.value ? 'bg-ink text-milk' : 'bg-stone text-ink-2 hover:text-ink')}>{i.label}</Link>
      ))}
    </div>
  );
}

export function Pager({ page, total, size, href }: { page: number; total: number; size: number; href: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return <p className="mt-3 text-[13px] text-muted">Всего: {total}</p>;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px]">
      <span className="text-muted">Всего: {total} · страница {page} из {pages}</span>
      <div className="flex gap-1.5">
        {page > 1 ? <Link href={href(page - 1)} className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-white px-3 hover:bg-subtle">← Назад</Link> : null}
        {page < pages ? <Link href={href(page + 1)} className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-white px-3 hover:bg-subtle">Вперёд →</Link> : null}
      </div>
    </div>
  );
}

/** Таблица с прокруткой только внутри своего контейнера. */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="-mx-5 overflow-x-auto px-5"><table className="w-full min-w-[720px] border-collapse text-[13px]">{children}</table></div>;
}
export const th = 'border-b border-line px-2.5 py-2 text-left text-[12px] font-medium text-muted whitespace-nowrap';
export const td = 'border-b border-line px-2.5 py-2.5 align-top';

/** Сборка адреса с параметрами фильтров (пустые значения отбрасываются). */
export function qs(base: string, params: Record<string, string | number | undefined | null>) {
  const p = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}
