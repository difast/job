'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Icon from './Icon';
import { useConfirm } from './Confirm';
import { useToast } from './Toast';
import { Alert, Button, Spinner } from './ui';
import { request } from '@/lib/client';

/** Повторный анализ под текущую цель: показывает ход выполнения и результат. */
export function ReanalyzeButton({ label = 'Обновить анализ', size = 'sm', className }: { label?: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run() {
    setBusy(true); setError('');
    const r = await request('/api/resume', { method: 'PUT', timeoutMs: 120_000 });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    toast('Анализ обновлён под текущую цель'); router.refresh();
  }
  return (
    <div>
      <Button size={size} className={className} disabled={busy} onClick={run}>{busy ? <><Spinner />Анализируем…</> : label}</Button>
      {error && <Alert className="mt-3">{error} <button className="font-medium underline" onClick={run}>Повторить</button></Alert>}
    </div>
  );
}

export function DeleteResumeButton() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  async function remove() {
    const ok = await confirm({ title: 'Удалить резюме?', text: 'Файл и результаты анализа будут удалены. Проанализированные вакансии, адаптации и письма сохранятся. Действие нельзя отменить.', confirm: 'Удалить резюме', danger: true });
    if (!ok) return;
    setBusy(true);
    const r = await request('/api/resume', { method: 'DELETE' });
    setBusy(false);
    if (!r.ok) { toast(r.error, 'bad'); return; }
    toast('Резюме удалено'); router.refresh();
  }
  return (
    <button type="button" onClick={remove} disabled={busy} className="inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-bad disabled:opacity-50">
      {busy ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="trash" size={13} />}Удалить резюме
    </button>
  );
}
