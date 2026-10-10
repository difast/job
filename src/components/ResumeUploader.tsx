'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import Icon from './Icon';
import { Alert, Button, Spinner, cx } from './ui';

/** Загрузка резюме. hero — большая карточка с drag&drop (пустое состояние), button — кнопка. */
export default function ResumeUploader({ variant = 'hero', label = 'Загрузить резюме', goalLabel, redirect = true }: { variant?: 'hero' | 'button'; label?: string; goalLabel?: string; redirect?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');

  async function upload(file: File) {
    setBusy(true); setError('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch('/api/resume', { method: 'POST', body: fd });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setError(data.error ?? 'Не удалось загрузить файл. Попробуйте ещё раз.'); setBusy(false); return; }
      if (redirect) router.push('/resume');
      router.refresh();
    } catch { setError('Нет соединения с сервером. Проверьте интернет и повторите.'); }
    setBusy(false);
  }

  const picker = (
    <input ref={input} type="file" accept=".pdf,.docx,.txt" hidden data-testid="resume-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
  );

  if (variant === 'button') {
    return (
      <div>
        {picker}
        <Button variant="secondary" className="w-full" onClick={() => input.current?.click()} disabled={busy}>{busy ? <><Spinner />Анализируем…</> : <><Icon name="upload" size={16} />{label}</>}</Button>
        {error && <Alert className="mt-3 max-w-md">{error}</Alert>}
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!busy) setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f && !busy) upload(f); }}
      className={cx('rounded-2xl border bg-white p-6 transition-colors sm:p-10', drag ? 'border-accent-500 bg-accent-50' : 'border-line')}>
      {picker}
      {busy ? (
        <div className="mx-auto flex max-w-md flex-col items-center py-4 text-center" role="status" aria-live="polite">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-50 text-accent-600"><Spinner className="h-5 w-5" /></div>
          <h2 className="text-lg font-semibold tracking-tight">Анализируем резюме</h2>
          <p className="mt-1.5 text-sm text-ink-2">Извлекаем текст и оцениваем{goalLabel ? ` под цель «${goalLabel}»` : ''}. Обычно это занимает несколько секунд.</p>
          <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-subtle"><div className="indeterminate h-full w-1/3 rounded-full bg-accent-600" /></div>
        </div>
      ) : (
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-50 text-accent-600"><Icon name="file" size={22} /></div>
          <h2 className="text-xl font-semibold tracking-tight">Начните с резюме</h2>
          <p className="mt-2 text-[15px] text-ink-2">Загрузите резюме, чтобы получить персональный анализ и рекомендации.</p>
          <Button size="lg" className="mt-7" onClick={() => input.current?.click()}><Icon name="upload" size={17} />{label}</Button>
          <p className="mt-3 text-[13px] text-muted">PDF или DOCX до 5 МБ — можно перетащить файл сюда</p>
          {error && <Alert className="mt-5 w-full text-left">{error}</Alert>}
        </div>
      )}
    </div>
  );
}
