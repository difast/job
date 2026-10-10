'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button } from './ui';
import { request } from '@/lib/client';

const input = 'mt-1.5 h-11 w-full rounded-lg border border-line-strong bg-white px-3.5 text-[15px] outline-none transition-shadow placeholder:text-muted focus:border-accent-500 focus:shadow-[0_0_0_3px_var(--color-accent-100)]';

/** Запрос ссылки для восстановления пароля. */
export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    const r = await request('/api/auth/password/forgot', { method: 'POST', json: { email }, timeoutMs: 20_000 });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setSent(true);
  }
  if (sent) return (
    <div data-testid="forgot-sent">
      <Alert tone="ok">Если аккаунт с адресом {email} существует, мы отправили на него письмо со ссылкой для смены пароля. Ссылка действует 60 минут.</Alert>
      <p className="mt-4 text-sm leading-relaxed text-ink-2">Письма нет? Проверьте папку «Спам» или <button type="button" className="font-medium text-accent-600 hover:underline" onClick={() => setSent(false)}>отправьте ещё раз</button>.</p>
    </div>
  );
  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-medium">E-mail аккаунта
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="you@example.com" />
      </label>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" size="lg" className="w-full" loading={busy}>Отправить ссылку</Button>
    </form>
  );
}

/** Новый пароль по ссылке из письма. */
export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (pass.length < 8) return setError('Пароль — минимум 8 символов');
    if (pass !== pass2) return setError('Пароли не совпадают');
    setBusy(true); setError('');
    const r = await request('/api/auth/password/reset', { method: 'POST', json: { token, password: pass }, timeoutMs: 20_000 });
    if (!r.ok) { setError(r.error); setBusy(false); return; }
    router.replace('/dashboard');
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-medium">Новый пароль
        <input type="password" required minLength={8} autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} className={input} placeholder="Минимум 8 символов" />
      </label>
      <label className="block text-sm font-medium">Повторите пароль
        <input type="password" required minLength={8} autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} className={input} />
      </label>
      {error && <Alert>{error}{/устарела|недействительна/.test(error) && <> <Link href="/forgot-password" className="font-medium underline">Запросить новую ссылку</Link></>}</Alert>}
      <Button type="submit" size="lg" className="w-full" loading={busy}>Сохранить пароль и войти</Button>
    </form>
  );
}
