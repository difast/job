'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Icon from './Icon';
import { Alert, Button, Spinner, buttonClass } from './ui';

/** Главное действие страницы — адаптация резюме. */
export function AdaptButton({ id, hasAdaptation }: { id: string; hasAdaptation: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function adapt() {
    setBusy(true); setError('');
    try {
      const r = await fetch(`/api/vacancies/${id}/adapt`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? 'Не удалось адаптировать резюме'); setBusy(false); return; }
      router.push(`/vacancies/${id}/adapt`);
    } catch { setError('Нет соединения с сервером. Повторите попытку.'); setBusy(false); }
  }
  return (
    <div className="w-full">
      <div className="flex flex-col gap-2 sm:flex-row">
        {hasAdaptation ? (
          <>
            <Link href={`/vacancies/${id}/adapt`} className={buttonClass({ size: 'lg', className: 'w-full sm:flex-1' })}><Icon name="layers" size={17} />Открыть адаптацию</Link>
            <Button size="lg" variant="secondary" className="w-full sm:w-auto" onClick={adapt} disabled={busy}>{busy ? <><Spinner />Адаптируем…</> : 'Адаптировать заново'}</Button>
          </>
        ) : (
          <Button size="lg" className="w-full sm:flex-1" onClick={adapt} disabled={busy}>{busy ? <><Spinner />Адаптируем резюме…</> : <><Icon name="layers" size={17} />Адаптировать резюме</>}</Button>
        )}
      </div>
      {error && <Alert className="mt-3">{error}</Alert>}
    </div>
  );
}

export function DeleteVacancyButton({ id }: { id: string }) {
  const router = useRouter();
  async function remove() {
    if (!confirm('Удалить вакансию вместе с адаптацией и письмами?')) return;
    await fetch(`/api/vacancies/${id}`, { method: 'DELETE' });
    router.push('/vacancies'); router.refresh();
  }
  return <Button variant="ghost" size="sm" onClick={remove} className="text-muted"><Icon name="trash" size={14} />Удалить вакансию</Button>;
}
