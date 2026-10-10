'use client';
import { useState } from 'react';
import { request } from '@/lib/client';
import { useToast } from './Toast';
import { Alert, Button, Spinner } from './ui';

/** Кнопка «Отправить письмо ещё раз» с защитой от повторных нажатий. */
export function ResendVerification({ size = 'sm', variant = 'secondary' }: { size?: 'sm' | 'md'; variant?: 'secondary' | 'ghost' }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  async function send() {
    if (busy) return;
    setBusy(true); setError('');
    const r = await request('/api/auth/verify-email/resend', { method: 'POST', timeoutMs: 30_000 });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setSent(true); toast('Письмо отправлено — проверьте почту');
  }
  return (
    <div>
      <Button size={size} variant={variant} onClick={send} disabled={busy || sent} data-testid="resend-verification">{busy ? <><Spinner />Отправляем…</> : sent ? 'Письмо отправлено' : 'Отправить письмо ещё раз'}</Button>
      {error && <Alert className="mt-2">{error}</Alert>}
    </div>
  );
}

/** Напоминание в кабинете: e-mail не подтверждён. */
export function VerifyEmailBanner({ email }: { email: string }) {
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-accent-100 bg-accent-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between" data-testid="verify-banner">
      <p className="text-sm leading-relaxed text-accent-700">Подтвердите e-mail <b className="font-medium user-text">{email}</b> — ссылка в письме, отправленном при регистрации. Это защищает аккаунт.</p>
      <div className="shrink-0"><ResendVerification /></div>
    </div>
  );
}
