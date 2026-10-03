'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Icon from './Icon';
import { Alert, Button, Spinner } from './ui';

export default function StubCheckout({ paymentId, amountLabel }: { paymentId: string; amountLabel: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'succeed' | 'cancel' | null>(null);
  const [error, setError] = useState('');
  async function act(action: 'succeed' | 'cancel') {
    setBusy(action); setError('');
    const r = await fetch(`/api/billing/stub/${paymentId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error ?? 'Не удалось обработать платёж'); setBusy(null); return; }
    router.push(d.redirect); router.refresh();
  }
  return (
    <div className="space-y-2.5">
      {error && <Alert>{error}</Alert>}
      <Button size="lg" className="w-full" onClick={() => act('succeed')} disabled={!!busy}>{busy === 'succeed' ? <Spinner /> : <Icon name="lock" size={16} />}Оплатить {amountLabel}</Button>
      <Button size="lg" variant="ghost" className="w-full" onClick={() => act('cancel')} disabled={!!busy}>{busy === 'cancel' && <Spinner />}Отменить и вернуться</Button>
    </div>
  );
}
