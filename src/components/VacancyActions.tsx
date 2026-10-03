'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Icon from './Icon';
import { Alert, Button, Spinner, buttonClass } from './ui';

export default function VacancyActions({ id, hasAdaptation }: { id: string; hasAdaptation: boolean }) {
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
  async function remove() {
    if (!confirm('Удалить вакансию вместе с адаптацией и письмами?')) return;
    await fetch(`/api/vacancies/${id}`, { method: 'DELETE' });
    router.push('/vacancies'); router.refresh();
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button size="lg" onClick={adapt} disabled={busy}>{busy ? <><Spinner />Адаптируем…</> : <><Icon name="layers" size={17} />{hasAdaptation ? 'Адаптировать заново' : 'Адаптировать резюме'}</>}</Button>
        {hasAdaptation && <Link href={`/vacancies/${id}/adapt`} className={buttonClass({ variant: 'secondary', size: 'lg' })}>Открыть адаптацию</Link>}
        <Link href={`/cover-letter?vacancy=${id}`} className={buttonClass({ variant: 'secondary', size: 'lg' })}><Icon name="mail" size={16} />Сопроводительное письмо</Link>
        <Button variant="ghost" size="lg" onClick={remove} aria-label="Удалить вакансию" className="ml-auto text-muted"><Icon name="trash" size={16} /></Button>
      </div>
      {error && <Alert className="mt-3">{error}</Alert>}
    </div>
  );
}
