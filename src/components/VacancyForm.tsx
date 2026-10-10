'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import Icon from './Icon';
import { Alert, Button, Card, Skeleton, Spinner } from './ui';

export default function VacancyForm({ hasResume }: { hasResume: boolean }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/vacancies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? 'Не удалось проанализировать вакансию'); setBusy(false); return; }
      router.push(`/vacancies/${d.id}`);
      router.refresh();
    } catch { setError('Нет соединения с сервером. Проверьте интернет и повторите.'); setBusy(false); }
  }

  if (busy) {
    return (
      <Card>
        <div className="flex items-center gap-3 text-sm font-medium" role="status" aria-live="polite"><Spinner className="text-accent-600" />Сравниваем вакансию с вашим резюме…</div>
        <div className="mt-5 space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>
      </Card>
    );
  }

  return (
    <Card>
      <label htmlFor="vacancy-text" className="mb-2.5 block text-sm font-medium">Описание вакансии <span className="font-normal text-muted">— название, обязанности и требования</span></label>
      <textarea id="vacancy-text" value={text} onChange={(e) => setText(e.target.value)} rows={12} disabled={!hasResume}
        placeholder="Вставьте описание вакансии…"
        className="w-full resize-y rounded-lg border border-line-strong bg-white p-4 text-[15px] leading-relaxed outline-none transition-shadow placeholder:text-muted focus:border-accent-500 focus:shadow-[0_0_0_3px_var(--color-accent-100)] disabled:bg-subtle" />
      {!hasResume && <Alert tone="warn" className="mt-3">Сначала загрузите резюме — без него вакансию не с чем сравнивать. <Link href="/resume" className="font-medium underline underline-offset-2">Загрузить резюме</Link></Alert>}
      {error && <Alert className="mt-3">{error}</Alert>}
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="tabular text-[13px] text-muted">{text.trim().length < 60 ? 'Минимум 60 символов' : `${text.trim().length.toLocaleString('ru-RU')} символов · готово к анализу`}</span>
        <Button size="lg" onClick={submit} disabled={!hasResume || text.trim().length < 60}><Icon name="search" size={16} />Анализировать</Button>
      </div>
    </Card>
  );
}
