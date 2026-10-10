'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Icon from './Icon';
import { useConfirm } from './Confirm';
import { useToast } from './Toast';
import { Alert, Button, Spinner, buttonClass } from './ui';
import { request } from '@/lib/client';

/** Главное действие — адаптация резюме: запускается сразу, показывает ход выполнения и открывает результат. */
export function AdaptButton({ id, hasAdaptation, size = 'lg', label }: { id: string; hasAdaptation: boolean; size?: 'md' | 'lg'; label?: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function adapt(again: boolean) {
    if (busy) return;
    if (again && !(await confirm({ title: 'Подготовить правки заново?', text: 'Текущие принятые и отредактированные правки для этой вакансии будут заменены новыми предложениями.', confirm: 'Заменить правки' }))) return;
    setBusy(true); setError('');
    const r = await request(`/api/vacancies/${id}/adapt`, { method: 'POST', timeoutMs: 120_000 });
    if (!r.ok) { setError(r.error); setBusy(false); return; }
    router.push(`/vacancies/${id}/adapt`);
  }
  return (
    <div className="w-full">
      <div className="flex flex-col gap-2 sm:flex-row">
        {hasAdaptation ? (
          <>
            <Link href={`/vacancies/${id}/adapt`} className={buttonClass({ size, className: 'w-full sm:flex-1' })}><Icon name="layers" size={17} />Открыть адаптацию</Link>
            <Button size={size} variant="secondary" className="w-full sm:w-auto" onClick={() => adapt(true)} disabled={busy}>{busy ? <><Spinner />Готовим правки…</> : 'Подготовить заново'}</Button>
          </>
        ) : (
          <Button size={size} className="w-full sm:flex-1" onClick={() => adapt(false)} disabled={busy}>{busy ? <><Spinner />Готовим правки…</> : <><Icon name="layers" size={17} />{label ?? 'Адаптировать резюме'}</>}</Button>
        )}
      </div>
      {error && <Alert className="mt-3">{error}</Alert>}
    </div>
  );
}

export function DeleteVacancyButton({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!(await confirm({ title: 'Удалить вакансию?', text: 'Будут удалены анализ, адаптация резюме и сопроводительные письма для этой вакансии. Действие нельзя отменить.', confirm: 'Удалить вакансию', danger: true }))) return;
    setBusy(true);
    const r = await request(`/api/vacancies/${id}`, { method: 'DELETE' });
    if (!r.ok) { setBusy(false); toast(r.error, 'bad'); return; }
    toast('Вакансия удалена');
    router.push('/vacancies'); router.refresh();
  }
  return (
    <button type="button" onClick={remove} disabled={busy} className="inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-bad disabled:opacity-50">
      {busy ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="trash" size={13} />}Удалить вакансию
    </button>
  );
}
