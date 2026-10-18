'use client';
import { useState } from 'react';
import { Alert, Button, cx } from './ui';
import Icon from './Icon';
import { request } from '@/lib/client';

// ВРЕМЕННО: выбор тестовой карты на демо-форме привязки (скриншоты ЮKassa).
export default function CardDemoForm({ cards }: { cards: string[] }) {
  const [card, setCard] = useState(cards[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function bind() {
    if (busy) return;
    setBusy(true); setError('');
    const r = await request<{ redirect: string }>('/api/billing/card-demo', { method: 'POST', json: { action: 'bind', card }, timeoutMs: 20_000 });
    if (!r.ok) { setBusy(false); setError(r.error); return; }
    window.location.href = r.data.redirect;
  }
  return (
    <div className="space-y-2.5">
      <div className="text-sm font-medium">Тестовая карта</div>
      {cards.map((c) => (
        <button key={c} type="button" onClick={() => setCard(c)} aria-pressed={card === c}
          className={cx('flex h-12 w-full items-center gap-3 rounded-lg border px-4 text-left text-sm', card === c ? 'border-accent-600 shadow-[0_0_0_1px_var(--color-accent-600)]' : 'border-line-strong')}>
          <Icon name="lock" size={15} className="text-muted" />{c}
        </button>
      ))}
      {error && <Alert>{error}</Alert>}
      <Button size="lg" className="mt-2 w-full" loading={busy} onClick={bind} data-testid="demo-bind">Привязать карту</Button>
    </div>
  );
}
