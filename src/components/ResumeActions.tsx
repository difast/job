'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Spinner } from './ui';

export default function ResumeActions({ stale }: { stale: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function reanalyze() {
    setBusy(true);
    await fetch('/api/resume', { method: 'PUT' });
    setBusy(false); router.refresh();
  }
  async function remove() {
    if (!confirm('Удалить резюме? Анализы вакансий сохранятся.')) return;
    await fetch('/api/resume', { method: 'DELETE' });
    router.refresh();
  }
  return (
    <div className="flex gap-2">
      {stale && <Button onClick={reanalyze} disabled={busy}>{busy && <Spinner />}Пересчитать под новую профессию</Button>}
      <Button variant="danger" onClick={remove}>Удалить</Button>
    </div>
  );
}
