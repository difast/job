'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Spinner } from './ui';

export default function VacancyActions({ id, hasAdaptation }: { id: string; hasAdaptation: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function adapt() {
    setBusy(true); setError('');
    const r = await fetch(`/api/vacancies/${id}/adapt`, { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error ?? 'Не удалось адаптировать резюме'); setBusy(false); return; }
    router.push(`/vacancies/${id}/adapt`);
  }
  async function remove() {
    if (!confirm('Удалить вакансию вместе с адаптацией и письмами?')) return;
    await fetch(`/api/vacancies/${id}`, { method: 'DELETE' });
    router.push('/vacancies'); router.refresh();
  }
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={adapt} disabled={busy}>{busy && <Spinner />}{hasAdaptation ? 'Адаптировать заново' : 'Адаптировать резюме'}</Button>
        {hasAdaptation && <Link href={`/vacancies/${id}/adapt`} className="inline-flex h-10 items-center rounded-lg border border-line bg-white px-4 text-sm font-medium hover:bg-slate-50">Открыть адаптацию</Link>}
        <Link href={`/cover-letter?vacancy=${id}`} className="inline-flex h-10 items-center rounded-lg border border-line bg-white px-4 text-sm font-medium hover:bg-slate-50">Сопроводительное письмо</Link>
        <Button variant="danger" onClick={remove}>Удалить</Button>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
