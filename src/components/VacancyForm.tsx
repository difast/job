'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { request } from '@/lib/client';

const DRAFT_KEY = 'clymly:vacancy-draft';
import Link from 'next/link';
import Icon from './Icon';
import { Alert, Button, Card, Skeleton, Spinner } from './ui';

export default function VacancyForm({ hasResume }: { hasResume: boolean }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [restored, setRestored] = useState(false);
  // Черновик сохраняется в браузере: текст не теряется при переходе в другой раздел или ошибке
  useEffect(() => { try { const d = localStorage.getItem(DRAFT_KEY); if (d) { setText(d); setRestored(true); } } catch {} }, []);
  useEffect(() => { try { if (text.trim()) localStorage.setItem(DRAFT_KEY, text); else localStorage.removeItem(DRAFT_KEY); } catch {} }, [text]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (busy) return;
    setBusy(true); setError('');
    const r = await request<{ id: string }>('/api/vacancies', { method: 'POST', json: { text }, timeoutMs: 120_000 });
    if (!r.ok) { setError(r.error); setBusy(false); return; }
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    router.push(`/vacancies/${r.data.id}`);
    router.refresh();
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
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2"><label htmlFor="vacancy-text" className="text-sm font-medium">Описание вакансии <span className="text-accent-600" aria-hidden="true">*</span> <span className="font-normal text-muted">— название, обязанности и требования</span></label>{restored && text && <button type="button" onClick={() => { setText(''); setRestored(false); }} className="text-[13px] text-muted hover:text-ink">Очистить черновик</button>}</div>
      <textarea id="vacancy-text" value={text} onChange={(e) => setText(e.target.value)} rows={12} disabled={!hasResume} required aria-required="true" aria-invalid={!!error} aria-describedby="vacancy-hint"
        placeholder="Вставьте описание вакансии…"
        className="w-full resize-y rounded-lg border border-line-strong bg-white p-4 text-[15px] leading-relaxed outline-none transition-shadow placeholder:text-muted focus:border-accent-500 focus:shadow-[0_0_0_3px_var(--color-accent-100)] disabled:bg-subtle" />
      {!hasResume && <Alert tone="warn" className="mt-3">Сначала загрузите резюме — без него вакансию не с чем сравнивать. <Link href="/resume" className="font-medium underline underline-offset-2">Загрузить резюме</Link></Alert>}
      {error && <Alert className="mt-3">{error} Текст вакансии сохранён — можно нажать «Анализировать» ещё раз.</Alert>}
      <div className="mt-4 flex items-center justify-between gap-3">
        <span id="vacancy-hint" className="tabular text-[13px] text-muted">{text.trim().length < 60 ? 'Минимум 60 символов' : `${text.trim().length.toLocaleString('ru-RU')} символов · готово к анализу`}</span>
        <Button size="lg" onClick={submit} disabled={!hasResume || text.trim().length < 60}><Icon name="search" size={16} />Анализировать</Button>
      </div>
    </Card>
  );
}
