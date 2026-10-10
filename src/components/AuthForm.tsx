'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Icon from './Icon';
import { ProductPreview } from './landing';
import { Alert, Button, Logo, Spinner } from './ui';

const input = 'h-11 w-full rounded-lg border border-line-strong bg-white px-3.5 text-[15px] outline-none transition-shadow placeholder:text-muted focus:border-accent-500 focus:shadow-[0_0_0_3px_var(--color-accent-100)]';

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isReg = mode === 'register';

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError('');
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(f)) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? 'Что-то пошло не так. Попробуйте ещё раз.'); setBusy(false); return; }
      router.push(isReg || data.onboarded === false ? '/onboarding' : '/dashboard');
      router.refresh();
    } catch { setError('Нет соединения с сервером. Проверьте интернет и повторите.'); setBusy(false); }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <main className="flex flex-col px-5 py-6 sm:px-10">
        <Link href="/" aria-label="На главную" className="w-fit"><Logo /></Link>
        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-10">
          <h1 className="text-[28px] font-semibold tracking-tight">{isReg ? 'Создайте аккаунт' : 'С возвращением'}</h1>
          <p className="mt-2 text-[15px] text-ink-2">{isReg ? 'Подготовьтесь к поиску работы под вашу профессию. Это бесплатно.' : 'Войдите, чтобы продолжить подготовку.'}</p>
          <form onSubmit={submit} className="mt-8 space-y-4" noValidate={false}>
            {isReg && (
              <label className="block text-sm font-medium">Имя
                <input name="name" required autoComplete="name" className={`${input} mt-1.5`} placeholder="Анна Иванова" />
              </label>
            )}
            <label className="block text-sm font-medium">E-mail
              <input name="email" type="email" required autoComplete="email" className={`${input} mt-1.5`} placeholder="you@example.com" />
            </label>
            <label className="block text-sm font-medium">Пароль
              <input name="password" type="password" required minLength={isReg ? 8 : 1} autoComplete={isReg ? 'new-password' : 'current-password'} className={`${input} mt-1.5`} placeholder={isReg ? 'Минимум 8 символов' : 'Ваш пароль'} />
            </label>
            {isReg && (
              <label className="flex items-start gap-3 rounded-lg border border-line bg-white p-3.5 text-[13px] leading-relaxed text-ink-2">
                <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent-600)]" data-testid="consent" />
                <span>Даю <Link href="/consent" target="_blank" className="font-medium text-ink underline underline-offset-2 hover:text-accent-700">согласие на обработку персональных данных</Link></span>
              </label>
            )}
            {error && <Alert>{error}</Alert>}
            <Button type="submit" size="lg" disabled={busy} className="w-full">{busy && <Spinner />}{isReg ? 'Зарегистрироваться' : 'Войти'}</Button>
          </form>
          {isReg && <p className="mt-4 text-xs leading-relaxed text-muted">Нажимая «Зарегистрироваться», вы принимаете <Link href="/terms" target="_blank" className="underline underline-offset-2 hover:text-ink">Пользовательское соглашение</Link> и подтверждаете, что ознакомились с <Link href="/privacy" target="_blank" className="underline underline-offset-2 hover:text-ink">Политикой конфиденциальности</Link>.</p>}
          <p className="mt-6 text-sm text-ink-2">
            {isReg ? 'Уже есть аккаунт? ' : 'Нет аккаунта? '}
            <Link href={isReg ? '/login' : '/register'} className="font-medium text-accent-600 hover:underline">{isReg ? 'Войти' : 'Зарегистрироваться'}</Link>
          </p>
        </div>
      </main>
      <aside className="hidden border-l border-line bg-white lg:flex lg:flex-col lg:justify-center lg:px-12 xl:px-16">
        <div className="mx-auto w-full max-w-[520px]">
          <ProductPreview />
          <ul className="mt-8 space-y-3 text-sm text-ink-2">
            {['Оценка резюме с учётом вашей профессии и уровня', 'Адаптация под вакансию без выдуманных фактов', 'Вопросы для собеседования и тренажёр ответов'].map((t) => (
              <li key={t} className="flex items-center gap-2.5"><Icon name="check-circle" size={16} className="shrink-0 text-accent-600" />{t}</li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
