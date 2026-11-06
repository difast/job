'use client';
import { useEffect, useState } from 'react';
import Icon from './Icon';
import { Skeleton, cx } from './ui';

interface Cat { id: string; name: string; professions: { id: string; name: string; nameEn: string | null; description: string }[] }

// Список профессий загружается из БД через /api/professions (с поиском)
export const CUSTOM_ID = 'custom';

// value = 'custom' — «Моей профессии нет в списке»: onChange('custom', своё название)
export default function ProfessionPicker({ value, onChange, maxHeight, customTitle = '' }: { value: string | null; onChange: (id: string, name: string) => void; maxHeight?: string; customTitle?: string }) {
  const [q, setQ] = useState('');
  const [own, setOwn] = useState(value === CUSTOM_ID);
  const [title, setTitle] = useState(customTitle);
  const pickOwn = (t: string) => { const v = t.trim().replace(/\s+/g, ' '); if (v.length >= 2) onChange(CUSTOM_ID, v); };
  const [cats, setCats] = useState<Cat[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/professions?q=${encodeURIComponent(q)}`);
        if (!r.ok) throw new Error();
        setCats((await r.json()).categories); setFailed(false);
      } catch { setFailed(true); }
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <div className="relative mb-5">
        <Icon name="search" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Профессия или должность, например «бухгалтер» или «специалист по сбыту»" aria-label="Поиск профессии"
          className="h-11 w-full rounded-lg border border-line-strong bg-white pl-10 pr-3 text-sm outline-none transition-shadow placeholder:text-muted focus:border-accent-500 focus:shadow-[0_0_0_3px_var(--color-accent-100)]" />
      </div>
      <div className={cx('space-y-6', maxHeight && 'overflow-y-auto pr-1')} style={maxHeight ? { maxHeight } : undefined}>
        {failed && <p className="py-6 text-center text-sm text-bad">Не удалось загрузить список. Обновите страницу.</p>}
        {!failed && cats === null && <div className="space-y-5">{[0, 1, 2].map((i) => <div key={i}><Skeleton className="mb-3 h-3 w-40" /><div className="flex flex-wrap gap-2">{[0, 1, 2, 3].map((j) => <Skeleton key={j} className="h-9 w-32" />)}</div></div>)}</div>}
        {cats?.length === 0 && <p className="pb-2 pt-6 text-center text-sm text-muted">Ничего не найдено. Попробуйте другое слово или укажите профессию сами.</p>}
        {cats?.map((c) => (
          <section key={c.id}>
            <h3 className="mb-2.5 text-xs font-medium uppercase tracking-wider text-muted">{c.name}</h3>
            <div className="flex flex-wrap gap-2">
              {c.professions.map((p) => {
                const on = value === p.id;
                return (
                  <button key={p.id} type="button" onClick={() => onChange(p.id, p.name)} title={p.description} aria-pressed={on}
                    className={cx('inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors', on ? 'border-accent-600 bg-accent-50 font-medium text-accent-700' : 'border-line-strong bg-white text-ink hover:border-[#c2b8aa] hover:bg-subtle')}>
                    {on && <Icon name="check" size={14} strokeWidth={2.2} />}{p.name}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        {cats !== null && (
          <section className="rounded-xl border border-dashed border-line-strong p-4" data-testid="own-profession">
            {!own ? (
              <button type="button" onClick={() => { setOwn(true); if (!title && q.trim()) setTitle(q.trim()); }} className="flex w-full items-center gap-2 text-left text-sm font-medium text-accent-600 hover:text-accent-700" data-testid="own-profession-open">
                <Icon name="plus" size={16} />Моей профессии нет в списке
              </button>
            ) : (
              <div>
                <label htmlFor="own-title" className="text-sm font-medium">Кем вы хотите работать?</label>
                <p className="mt-0.5 text-xs text-muted">Оценим резюме по общим требованиям к этой профессии и по тексту вакансий.</p>
                <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                  <input id="own-title" value={title} maxLength={80} onChange={(e) => { setTitle(e.target.value); if (value === CUSTOM_ID) pickOwn(e.target.value); }} placeholder="Например, «Сомелье» или «Инженер-гидролог»"
                    className="h-10 w-full min-w-0 shrink-0 rounded-lg border sm:w-auto sm:flex-1 sm:shrink border-line-strong bg-white px-3 text-sm outline-none focus:border-accent-500 focus:shadow-[0_0_0_3px_var(--color-accent-100)]" data-testid="own-profession-input" />
                  <button type="button" disabled={title.trim().length < 2} onClick={() => pickOwn(title)} aria-pressed={value === CUSTOM_ID}
                    className={cx('inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-4 text-sm transition-colors disabled:opacity-50', value === CUSTOM_ID ? 'border-accent-600 bg-accent-50 font-medium text-accent-700' : 'border-line-strong bg-white hover:bg-subtle')} data-testid="own-profession-pick">
                    {value === CUSTOM_ID && <Icon name="check" size={14} strokeWidth={2.2} />}{value === CUSTOM_ID ? 'Выбрано' : 'Выбрать'}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
