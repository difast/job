'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ChangeGoalButton } from './GoalContext';
import Icon from './Icon';
import { useToast } from './Toast';
import { Alert, Button, Spinner, buttonClass, initials } from './ui';
import { LEVEL_LABELS, type LevelKey } from '@/lib/types';

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 border-b border-line px-6 py-6 last:border-b-0 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-8">
      <div><h2 className="font-sans text-[15px] font-semibold" style={{ letterSpacing: 0 }}>{title}</h2>{hint && <p className="mt-1 text-[13px] leading-relaxed text-muted">{hint}</p>}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default function SettingsClient({ name, email, professionName, level, tierLabel }: { name: string; email: string; professionName: string; level: LevelKey; tierLabel: string }) {
  const router = useRouter();
  const toast = useToast();
  const [n, setN] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const r = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n }) });
    setBusy(false);
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? 'Не удалось сохранить'); return; }
    toast('Имя сохранено'); router.refresh();
  }
  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/'); router.refresh(); }

  return (
    <div className="max-w-[860px] rounded-2xl border border-line bg-white">
      <Row title="Профиль" hint="Имя используется в приветствии и сопроводительных письмах.">
        <form onSubmit={save}>
          <div className="mb-5 flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-500 text-base font-semibold text-white">{initials(n || name)}</span>
            <div className="min-w-0"><div className="truncate font-medium">{name}</div><div className="truncate text-sm text-muted">{email}</div></div>
          </div>
          <label htmlFor="name" className="block text-sm font-medium">Имя</label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <input id="name" value={n} onChange={(e) => setN(e.target.value)} className="h-10 w-full max-w-sm rounded-lg border border-line-strong px-3.5 text-[15px] outline-none focus:border-accent-500 focus:shadow-[0_0_0_3px_var(--color-accent-100)]" />
            <Button type="submit" variant="dark" disabled={busy || !n.trim() || n.trim() === name}>{busy && <Spinner />}Сохранить</Button>
          </div>
          {error && <Alert className="mt-3">{error}</Alert>}
        </form>
      </Row>
      <Row title="Цель" hint="При смене цели резюме оценивается заново, а вопросы собеседования подбираются под новую профессию и уровень.">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3"><Icon name="target" size={18} className="text-accent-600" /><div><div className="font-medium">{professionName}</div><div className="text-sm text-ink-2">{LEVEL_LABELS[level]}</div></div></div>
          <ChangeGoalButton size="md" />
        </div>
      </Row>
      <Row title="Тариф" hint="Оплата и история платежей.">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="font-medium" data-testid="settings-tier">{tierLabel}</div>
          <Link href="/billing" className={buttonClass({ variant: 'secondary' })}>Тариф и оплата</Link>
        </div>
      </Row>
      <Row title="Сеанс">
        <Button variant="secondary" onClick={logout}><Icon name="logout" size={15} />Выйти из аккаунта</Button>
      </Row>
    </div>
  );
}
