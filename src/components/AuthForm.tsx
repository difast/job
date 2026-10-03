'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Spinner } from './ui';

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isReg = mode === 'register';

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError('');
    const f = new FormData(e.currentTarget);
    const res = await fetch(`/api/auth/${mode}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(f)),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? 'Что-то пошло не так'); setBusy(false); return; }
    router.push(isReg || data.onboarded === false ? '/onboarding' : '/dashboard');
    router.refresh();
  }

  const input = 'h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-100';
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-600 text-lg font-bold text-white">К</div>
          <h1 className="text-2xl font-semibold tracking-tight">{isReg ? 'Создайте аккаунт' : 'С возвращением'}</h1>
          <p className="mt-1 text-sm text-muted">{isReg ? 'Подготовьтесь к поиску работы под вашу профессию' : 'Войдите, чтобы продолжить подготовку'}</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-white p-6 shadow-sm">
          {isReg && (
            <label className="block text-sm font-medium">Имя
              <input name="name" required autoComplete="name" className={`${input} mt-1.5`} placeholder="Анна Иванова" />
            </label>
          )}
          <label className="block text-sm font-medium">E-mail
            <input name="email" type="email" required autoComplete="email" className={`${input} mt-1.5`} placeholder="you@example.com" />
          </label>
          <label className="block text-sm font-medium">Пароль
            <input name="password" type="password" required minLength={isReg ? 8 : 1} autoComplete={isReg ? 'new-password' : 'current-password'} className={`${input} mt-1.5`} placeholder={isReg ? 'Минимум 8 символов' : ''} />
          </label>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">{busy && <Spinner />}{isReg ? 'Зарегистрироваться' : 'Войти'}</Button>
        </form>
        <p className="mt-5 text-center text-sm text-muted">
          {isReg ? 'Уже есть аккаунт? ' : 'Нет аккаунта? '}
          <Link href={isReg ? '/login' : '/register'} className="font-medium text-accent-600 hover:underline">{isReg ? 'Войти' : 'Зарегистрироваться'}</Link>
        </p>
      </div>
    </main>
  );
}
