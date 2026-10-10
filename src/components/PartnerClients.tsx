'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { request, safeNext } from '@/lib/client';
import { Alert, Button, Spinner } from './ui';

/** Согласие на обработку данных для аккаунта, созданного при переходе из JobToo. */
export function WelcomeConsent({ next }: { next?: string }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    if (busy) return;
    setBusy(true); setError('');
    const r = await request('/api/auth/consent', { method: 'POST', json: { consent: true }, timeoutMs: 20_000 });
    if (!r.ok) { setBusy(false); setError(r.error); return; }
    router.push(safeNext(next) ?? '/dashboard'); router.refresh();
  }
  return (
    <div className="mt-6 space-y-4">
      <label className="flex items-start gap-3 rounded-lg border border-line bg-canvas p-3.5 text-[13px] leading-relaxed text-ink-2">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent-600)]" data-testid="consent" />
        <span>Даю <Link href="/consent" target="_blank" className="font-medium text-ink underline underline-offset-2">согласие на обработку персональных данных</Link>, принимаю <Link href="/terms" target="_blank" className="underline underline-offset-2">Пользовательское соглашение</Link> и ознакомлен(а) с <Link href="/privacy" target="_blank" className="underline underline-offset-2">Политикой конфиденциальности</Link></span>
      </label>
      {error && <Alert>{error}</Alert>}
      <Button size="lg" className="w-full" disabled={!checked || busy} onClick={go}>{busy ? <><Spinner />Сохраняем…</> : 'Продолжить'}</Button>
    </div>
  );
}

/** Подтверждение привязки аккаунта Clymly к аккаунту JobToo. */
export function LinkJobToo() {
  const router = useRouter();
  const [busy, setBusy] = useState<'link' | 'decline' | null>(null);
  const [error, setError] = useState('');
  async function act(action: 'link' | 'decline') {
    if (busy) return;
    setBusy(action); setError('');
    const r = await request<{ landing: string }>('/api/integrations/jobtoo/link', { method: 'POST', json: { action }, timeoutMs: 90_000 });
    if (!r.ok) { setBusy(null); setError(r.error); return; }
    router.push(safeNext(r.data.landing) ?? '/dashboard'); router.refresh();
  }
  return (
    <div className="mt-6 space-y-2.5">
      {error && <Alert className="mb-2">{error}</Alert>}
      <Button size="lg" className="w-full" disabled={!!busy} onClick={() => act('link')} data-testid="link-confirm">{busy === 'link' ? <><Spinner />Связываем и загружаем данные…</> : 'Связать аккаунты'}</Button>
      <Button size="lg" variant="ghost" className="w-full" disabled={!!busy} onClick={() => act('decline')}>{busy === 'decline' && <Spinner />}Не связывать</Button>
    </div>
  );
}

/** Выйти и войти в другой аккаунт, сохранив возврат на страницу привязки. */
export function SwitchAccount() {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    await request('/api/auth/logout', { method: 'POST', timeoutMs: 15_000 });
    window.location.assign('/login?next=%2Flink%2Fjobtoo');
  }
  return <Button size="lg" className="mt-6 w-full" disabled={busy} onClick={go} data-testid="link-switch">{busy && <Spinner />}Выйти и войти в другой аккаунт</Button>;
}
