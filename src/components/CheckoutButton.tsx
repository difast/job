'use client';
import { useState } from 'react';
import { Alert, Button, Spinner } from './ui';
import { request } from '@/lib/client';

/** Создаёт заказ и уводит пользователя на страницу оплаты выбранного способа (ЮKassa / ЮMoney / тестовая заглушка). */
export default function CheckoutButton({ planId, label, method = 'card', variant = 'primary', testid }: { planId: string; label: string; method?: 'card' | 'yoomoney'; variant?: 'primary' | 'secondary' | 'ghost'; testid?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    if (busy) return;
    setBusy(true); setError('');
    const r = await request<{ confirmationUrl?: string }>('/api/billing/checkout', { method: 'POST', json: { planId, method }, timeoutMs: 30_000 });
    if (!r.ok || !r.data.confirmationUrl) { setError(r.ok ? 'Не удалось создать платёж. Попробуйте ещё раз.' : r.error); setBusy(false); return; }
    window.location.href = r.data.confirmationUrl;
  }
  return (
    <div>
      <Button size="lg" variant={variant} className="w-full" onClick={go} disabled={busy} data-testid={testid} data-method={method}>{busy ? <><Spinner />Переходим к оплате…</> : label}</Button>
      {error && <Alert className="mt-3">{error}</Alert>}
    </div>
  );
}
