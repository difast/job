'use client';
import { useState } from 'react';
import { Alert, Button, Spinner } from './ui';

/** Создаёт платёж и уводит пользователя на страницу оплаты (ЮKassa или тестовую заглушку). */
export default function CheckoutButton({ planId, label, variant = 'primary' }: { planId: string; label: string; variant?: 'primary' | 'secondary' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.confirmationUrl) { setError(d.error ?? 'Не удалось создать платёж'); setBusy(false); return; }
      window.location.href = d.confirmationUrl;
    } catch { setError('Нет соединения с сервером. Повторите попытку.'); setBusy(false); }
  }
  return (
    <div>
      <Button size="lg" variant={variant} className="w-full" onClick={go} disabled={busy}>{busy ? <><Spinner />Переходим к оплате…</> : label}</Button>
      {error && <Alert className="mt-3">{error}</Alert>}
    </div>
  );
}
