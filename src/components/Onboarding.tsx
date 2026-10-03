'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ProfessionPicker from './ProfessionPicker';
import LevelPicker from './LevelPicker';
import { Button, Spinner } from './ui';
import type { LevelKey } from '@/lib/types';

export default function Onboarding({ name }: { name: string }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [profId, setProfId] = useState<string | null>(null);
  const [profName, setProfName] = useState('');
  const [level, setLevel] = useState<LevelKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function finish() {
    if (!profId || !level) return;
    setBusy(true); setError('');
    const r = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ professionId: profId, level }) });
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? 'Не удалось сохранить'); setBusy(false); return; }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:py-16">
      <div className="mb-8 flex items-center gap-2 text-sm text-muted">
        <span className={step === 1 ? 'font-medium text-accent-600' : ''}>1. Профессия</span><span>→</span>
        <span className={step === 2 ? 'font-medium text-accent-600' : ''}>2. Уровень</span>
      </div>
      {step === 1 ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">{name}, кем вы хотите работать?</h1>
          <p className="mb-6 mt-1 text-sm text-muted">Мы адаптируем резюме, письма и подготовку к собеседованию под выбранную профессию.</p>
          <ProfessionPicker value={profId} onChange={(id, n) => { setProfId(id); setProfName(n); }} />
          <div className="sticky bottom-0 -mx-4 mt-6 flex items-center justify-between border-t border-line bg-surface/90 px-4 py-4 backdrop-blur">
            <span className="text-sm text-muted">{profName ? `Выбрано: ${profName}` : 'Выберите профессию'}</span>
            <Button disabled={!profId} onClick={() => setStep(2)}>Далее</Button>
          </div>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Какой у вас уровень?</h1>
          <p className="mb-6 mt-1 text-sm text-muted">Профессия: <b className="text-ink">{profName}</b>. От уровня зависят оценка резюме и вопросы на собеседовании.</p>
          <LevelPicker value={level} onChange={setLevel} />
          {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="mt-8 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>Назад</Button>
            <Button disabled={!level || busy} onClick={finish}>{busy && <Spinner />}Перейти к дашборду</Button>
          </div>
        </>
      )}
    </main>
  );
}
