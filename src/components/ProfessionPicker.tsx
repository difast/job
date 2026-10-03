'use client';
import { useEffect, useState } from 'react';
import { cx } from './ui';

interface Cat { id: string; name: string; professions: { id: string; name: string; nameEn: string | null; description: string }[] }

// Список профессий загружается из БД через /api/professions (с поиском)
export default function ProfessionPicker({ value, onChange, compact }: { value: string | null; onChange: (id: string, name: string) => void; compact?: boolean }) {
  const [q, setQ] = useState('');
  const [cats, setCats] = useState<Cat[] | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await fetch(`/api/professions?q=${encodeURIComponent(q)}`);
      setCats((await r.json()).categories);
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <div className="relative mb-4">
        <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск профессии: например, аналитик или SQL" aria-label="Поиск профессии"
          className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100" />
      </div>
      <div className={cx('space-y-6 overflow-y-auto pr-1', compact ? 'max-h-[50vh]' : '')}>
        {cats === null && <p className="text-sm text-muted">Загрузка…</p>}
        {cats?.length === 0 && <p className="py-8 text-center text-sm text-muted">Ничего не найдено. Попробуйте другое слово.</p>}
        {cats?.map((c) => (
          <section key={c.id}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{c.name}</h3>
            <div className="flex flex-wrap gap-2">
              {c.professions.map((p) => (
                <button key={p.id} type="button" onClick={() => onChange(p.id, p.name)} title={p.description} aria-pressed={value === p.id}
                  className={cx('rounded-lg border px-3 py-2 text-sm transition', value === p.id ? 'border-accent-600 bg-accent-50 font-medium text-accent-700' : 'border-line bg-white hover:border-slate-300 hover:bg-slate-50')}>
                  {p.name}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
