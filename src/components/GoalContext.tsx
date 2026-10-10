'use client';
import { request } from '@/lib/client';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useState } from 'react';
import Icon from './Icon';
import LevelPicker from './LevelPicker';
import Modal from './Modal';
import ProfessionPicker from './ProfessionPicker';
import { Alert, Button, Spinner } from './ui';
import { useToast } from './Toast';
import type { LevelKey } from '@/lib/types';

interface Goal { professionId: string; professionName: string; level: LevelKey }
const Ctx = createContext<{ openGoal: () => void } | null>(null);
export const useGoal = () => useContext(Ctx)!;

/** Профессия — основа интерфейса: один диалог смены цели на всё приложение. */
export function GoalProvider({ goal, children }: { goal: Goal; children: React.ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [prof, setProf] = useState(goal.professionId);
  const [lvl, setLvl] = useState<LevelKey>(goal.level);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const close = useCallback(() => setOpen(false), []);
  const openGoal = useCallback(() => { setProf(goal.professionId); setLvl(goal.level); setError(''); setOpen(true); }, [goal]);
  const changed = prof !== goal.professionId || lvl !== goal.level;

  async function save() {
    if (busy) return;
    setBusy(true); setError('');
    const r = await request('/api/profile', { method: 'PATCH', json: { professionId: prof, level: lvl }, timeoutMs: 120_000 });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setOpen(false); router.refresh();
    toast('Цель обновлена — рекомендации и вопросы подобраны заново');
  }

  return (
    <Ctx.Provider value={{ openGoal }}>
      {children}
      <Modal open={open} onClose={close} title="Ваша цель" description="От цели зависят оценка резюме, требования и вопросы для собеседования."
        footer={<><Button variant="ghost" onClick={close} disabled={busy}>Отмена</Button><Button onClick={save} disabled={busy || !changed}>{busy && <Spinner />}{busy ? 'Обновляем рекомендации…' : 'Сохранить'}</Button></>}>
        <ProfessionPicker value={prof} onChange={(id) => setProf(id)} maxHeight="38dvh" />
        <h3 className="mb-3 mt-7 text-sm font-medium">Уровень</h3>
        <LevelPicker value={lvl} onChange={setLvl} />
        {changed && <Alert tone="info" className="mt-5">Резюме будет заново оценено под новую цель, а вопросы для собеседования обновятся.</Alert>}
        {error && <Alert className="mt-5">{error}</Alert>}
      </Modal>
    </Ctx.Provider>
  );
}

export function ChangeGoalButton({ variant = 'secondary', size = 'sm', label = 'Изменить цель' }: { variant?: 'secondary' | 'ghost'; size?: 'sm' | 'md'; label?: string }) {
  const { openGoal } = useGoal();
  const cls = variant === 'ghost'
    ? 'inline-flex items-center gap-1.5 text-sm font-medium text-accent-600 transition-colors hover:text-accent-700'
    : `inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-white font-medium text-ink transition-colors hover:bg-subtle ${size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm'}`;
  return <button type="button" onClick={openGoal} className={cls}><Icon name="edit" size={14} />{label}</button>;
}
