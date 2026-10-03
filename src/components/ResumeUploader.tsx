'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button, Spinner } from './ui';

export default function ResumeUploader({ label = 'Загрузить резюме', variant = 'primary' }: { label?: string; variant?: 'primary' | 'secondary' }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function upload(file: File) {
    setBusy(true); setError('');
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/resume', { method: 'POST', body: fd });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(data.error ?? 'Не удалось загрузить файл'); return; }
    router.push('/resume');
    router.refresh();
  }

  return (
    <div>
      <input ref={input} type="file" accept=".pdf,.docx,.txt" hidden data-testid="resume-file"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
      <Button variant={variant} onClick={() => input.current?.click()} disabled={busy}>
        {busy ? <><Spinner />Анализируем…</> : label}
      </Button>
      <p className="mt-2 text-xs text-muted">PDF или DOCX, до 5 МБ</p>
      {error && <p role="alert" className="mt-2 max-w-md rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
