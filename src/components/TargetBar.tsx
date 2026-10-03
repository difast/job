'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ProfessionPicker from './ProfessionPicker';
import LevelPicker from './LevelPicker';
import { Button, Spinner } from './ui';
import { LEVEL_SHORT, type LevelKey } from '@/lib/types';

// Постоянная верхняя панель: целевая профессия и уровень + возможность изменить
export default function TargetBar({ professionId, professionName, level, onMenu }: { professionId: string; professionName: string; level: LevelKey; onMenu: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [prof, setProf] = useState(professionId);
  const [lvl, setLvl] = useState<LevelKey>(level);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ professionId: prof, level: lvl }) });
    setBusy(false); setOpen(false); router.refresh();
  }

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-white/90 px-4 py-3 backdrop-blur sm:px-8">
        <button onClick={onMenu} aria-label="Открыть меню" className="-ml-1 rounded-lg p-2 text-muted hover:bg-slate-100 lg:hidden">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-0.5 text-sm">
          <span className="truncate"><span className="text-muted">Целевая профессия: </span><b data-testid="target-profession">{professionName}</b></span>
          <span><span className="text-muted">Уровень: </span><b data-testid="target-level">{LEVEL_SHORT[level]}</b></span>
        </div>
        <Button variant="secondary" size="sm" onClick={() => { setProf(professionId); setLvl(level); setOpen(true); }}>Изменить</Button>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Изменить профессию и уровень" onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
            <h2 className="text-lg font-semibold">Целевая профессия и уровень</h2>
            <p className="mb-5 mt-1 text-sm text-muted">Анализ резюме и вопросы собеседования будут пересчитаны под новый выбор.</p>
            <ProfessionPicker value={prof} onChange={(id) => setProf(id)} compact />
            <h3 className="mb-3 mt-6 text-sm font-medium">Уровень</h3>
            <LevelPicker value={lvl} onChange={setLvl} />
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Отмена</Button>
              <Button onClick={save} disabled={busy}>{busy && <Spinner />}Сохранить</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
