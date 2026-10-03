'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Icon from './Icon';
import { Button, Spinner } from './ui';

export function ReanalyzeButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <Button size="sm" disabled={busy} onClick={async () => { setBusy(true); await fetch('/api/resume', { method: 'PUT' }); setBusy(false); router.refresh(); }}>{busy && <Spinner />}Пересчитать под новую профессию</Button>;
}

export function DeleteResumeButton() {
  const router = useRouter();
  return (
    <Button variant="ghost" size="sm" onClick={async () => { if (!confirm('Удалить резюме? Проанализированные вакансии сохранятся.')) return; await fetch('/api/resume', { method: 'DELETE' }); router.refresh(); }}>
      <Icon name="trash" size={14} />Удалить резюме
    </Button>
  );
}
