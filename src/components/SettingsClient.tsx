'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ChangeGoalButton } from './GoalContext';
import Icon from './Icon';
import Link from 'next/link';
import { Alert, Button, Card, CardTitle, Spinner, buttonClass, initials } from './ui';
import { LEVEL_LABELS, type LevelKey } from '@/lib/types';

export default function SettingsClient({ name, email, professionName, level, tierLabel }: { name: string; email: string; professionName: string; level: LevelKey; tierLabel: string }) {
  const router = useRouter();
  const [n, setN] = useState(name);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true); setOk(false); setError('');
    const r = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n }) });
    setBusy(false);
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? 'Не удалось сохранить'); return; }
    setOk(true); router.refresh();
  }
  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/'); router.refresh(); }

  return (
    <div className="stagger max-w-2xl space-y-5">
      <Card>
        <CardTitle icon="user">Профиль</CardTitle>
        <div className="mb-5 flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-100 text-lg font-semibold text-accent-700">{initials(n || name)}</span>
          <div className="min-w-0"><div className="truncate font-medium">{name}</div><div className="truncate text-sm text-muted">{email}</div></div>
        </div>
        <label className="block text-sm font-medium">Имя
          <input value={n} onChange={(e) => { setN(e.target.value); setOk(false); }} className="mt-1.5 h-11 w-full rounded-lg border border-line-strong px-3.5 text-[15px] outline-none focus:border-accent-500 focus:shadow-[0_0_0_3px_var(--color-accent-100)]" />
        </label>
        {error && <Alert className="mt-4">{error}</Alert>}
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={save} disabled={busy || !n.trim() || n.trim() === name}>{busy && <Spinner />}Сохранить</Button>
          {ok && <span role="status" className="inline-flex items-center gap-1.5 text-sm text-ok"><Icon name="check" size={15} strokeWidth={2.3} />Сохранено</span>}
        </div>
      </Card>
      <Card>
        <CardTitle icon="target">Цель</CardTitle>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><div className="font-medium">{professionName}</div><div className="text-sm text-ink-2">{LEVEL_LABELS[level]}</div></div>
          <ChangeGoalButton size="md" />
        </div>
        <p className="mt-3 text-[13px] text-muted">При смене цели резюме оценивается заново, а вопросы собеседования подбираются под новую профессию и уровень.</p>
      </Card>
      <Card>
        <CardTitle icon="shield">Тариф</CardTitle>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><div className="font-medium" data-testid="settings-tier">{tierLabel}</div><div className="text-sm text-ink-2">Оплата и история платежей</div></div>
          <Link href="/billing" className={buttonClass({ variant: 'secondary' })}>Тариф и оплата</Link>
        </div>
      </Card>
      <Card>
        <CardTitle icon="logout">Сеанс</CardTitle>
        <Button variant="secondary" onClick={logout}>Выйти из аккаунта</Button>
      </Card>
    </div>
  );
}
