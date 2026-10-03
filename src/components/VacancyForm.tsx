'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Spinner } from './ui';

export default function VacancyForm({ hasResume }: { hasResume: boolean }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setBusy(true); setError('');
    const r = await fetch('/api/vacancies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error ?? 'Не удалось проанализировать вакансию'); setBusy(false); return; }
    router.push(`/vacancies/${d.id}`);
    router.refresh();
  }

  return (
    <Card>
      <label htmlFor="vacancy-text" className="mb-2 block text-sm font-medium">Вставьте описание вакансии</label>
      <textarea id="vacancy-text" value={text} onChange={(e) => setText(e.target.value)} rows={12} disabled={!hasResume || busy}
        placeholder={'Название вакансии\n\nТребования:\n— опыт от 3 лет\n— …'}
        className="w-full resize-y rounded-lg border border-line bg-white p-3 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100 disabled:bg-slate-50" />
      {!hasResume && <p className="mt-2 text-sm text-amber-700">Сначала загрузите резюме — без него мы не сможем сравнить его с вакансией.</p>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="mt-4"><Button onClick={submit} disabled={!hasResume || busy || text.trim().length < 60}>{busy && <Spinner />}Анализировать вакансию</Button></div>
    </Card>
  );
}
