'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ProfessionPicker from './ProfessionPicker';
import LevelPicker from './LevelPicker';
import { Button, Card, Spinner } from './ui';
import type { LevelKey } from '@/lib/types';

export default function SettingsClient({ name, email, professionId, professionName, level }: { name: string; email: string; professionId: string; professionName: string; level: LevelKey }) {
  const router = useRouter();
  const [n, setN] = useState(name);
  const [prof, setProf] = useState(professionId);
  const [profName, setProfName] = useState(professionName);
  const [lvl, setLvl] = useState<LevelKey>(level);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function save() {
    setBusy(true); setMsg(''); setError('');
    const r = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n, professionId: prof, level: lvl }) });
    setBusy(false);
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? 'Не удалось сохранить'); return; }
    setMsg('Сохранено'); router.refresh();
  }
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login'); router.refresh();
  }

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="mb-4 text-sm font-semibold text-muted">Профиль</h2>
        <label className="block text-sm font-medium">Имя
          <input value={n} onChange={(e) => setN(e.target.value)} className="mt-1.5 h-10 w-full max-w-sm rounded-lg border border-line px-3 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100" />
        </label>
        <p className="mt-3 text-sm text-muted">E-mail: {email}</p>
      </Card>
      <Card>
        <h2 className="mb-1 text-sm font-semibold text-muted">Целевая профессия</h2>
        <p className="mb-4 text-sm">Сейчас: <b>{profName}</b></p>
        <ProfessionPicker value={prof} onChange={(id, nm) => { setProf(id); setProfName(nm); }} compact />
      </Card>
      <Card>
        <h2 className="mb-4 text-sm font-semibold text-muted">Уровень</h2>
        <LevelPicker value={lvl} onChange={setLvl} />
      </Card>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy || !n.trim()}>{busy && <Spinner />}Сохранить изменения</Button>
        {msg && <span className="text-sm text-emerald-600" role="status">{msg}</span>}
        <Button variant="secondary" className="ml-auto" onClick={logout}>Выйти</Button>
      </div>
    </div>
  );
}
