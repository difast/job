'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Icon from './Icon';
import LevelPicker from './LevelPicker';
import ProfessionPicker from './ProfessionPicker';
import { Alert, Button, Logo, Spinner, cx } from './ui';
import { LEVEL_SHORT, type LevelKey } from '@/lib/types';

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
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? 'Не удалось сохранить. Попробуйте ещё раз.'); setBusy(false); return; }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="На главную"><Logo /></Link>
          <div className="flex items-center gap-2 text-[13px] text-muted" aria-label={`Шаг ${step} из 2`}>
            <span>Шаг {step} из 2</span>
            <span className="flex gap-1">{[1, 2].map((i) => <span key={i} className={cx('h-1 w-6 rounded-full transition-colors', i <= step ? 'bg-accent-600' : 'bg-line-strong')} />)}</span>
          </div>
        </div>
      </header>
      <main className="page-in mx-auto max-w-3xl px-5 pb-32 pt-10 sm:px-8 sm:pt-14">
        {step === 1 ? (
          <>
            <h1 className="text-[28px] font-semibold tracking-tight">{name}, кем вы хотите работать?</h1>
            <p className="mb-8 mt-2 max-w-xl text-[15px] text-ink-2">Мы адаптируем анализ резюме, письма и подготовку к собеседованию под выбранную профессию.</p>
            <ProfessionPicker value={profId} onChange={(id, n) => { setProfId(id); setProfName(n); }} />
          </>
        ) : (
          <>
            <h1 className="text-[28px] font-semibold tracking-tight">Какой у вас уровень?</h1>
            <p className="mb-8 mt-2 max-w-xl text-[15px] text-ink-2">Профессия: <b className="font-medium text-ink">{profName}</b>. От уровня зависят критерии оценки резюме и сложность вопросов на собеседовании.</p>
            <LevelPicker value={level} onChange={setLevel} />
            {error && <Alert className="mt-5">{error}</Alert>}
          </>
        )}
      </main>
      <div className="safe-bottom fixed inset-x-0 bottom-0 border-t border-line bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          {step === 1 ? (
            <>
              <span className="min-w-0 truncate text-sm text-ink-2">{profName ? <>Выбрано: <b className="font-medium text-ink">{profName}</b></> : 'Выберите профессию из списка'}</span>
              <Button disabled={!profId} onClick={() => setStep(2)}>Далее<Icon name="arrow-right" size={15} /></Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep(1)}><Icon name="arrow-left" size={15} />Назад</Button>
              <div className="flex min-w-0 items-center gap-3">
                <span className="hidden truncate text-sm text-ink-2 sm:block">{profName}{level ? ` · ${LEVEL_SHORT[level]}` : ''}</span>
                <Button disabled={!level || busy} onClick={finish}>{busy && <Spinner />}Перейти в кабинет</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
