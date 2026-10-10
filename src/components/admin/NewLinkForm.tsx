'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { request } from '@/lib/client';
import { ActionError, Button } from '../ui';

const input = 'h-9 w-full rounded-lg border border-line-strong bg-white px-3 text-[13px] outline-none focus:border-accent-500';

export default function NewLinkForm({ origin }: { origin: string }) {
  const router = useRouter();
  const [f, setF] = useState({ slug: '', name: '', utmSource: '', utmMedium: '', utmCampaign: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    const r = await request('/api/admin/marketing/links', { method: 'POST', json: f, timeoutMs: 15_000 });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setF({ slug: '', name: '', utmSource: '', utmMedium: '', utmCampaign: '' }); router.refresh();
  }
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" data-testid="new-link-form">
      <label className="text-[12px] text-muted lg:col-span-2">Название<input value={f.name} onChange={set('name')} placeholder="Reels 10 октября" className={input} required /></label>
      <label className="text-[12px] text-muted lg:col-span-2">Адрес: {origin}/go/<input value={f.slug} onChange={set('slug')} placeholder="reels-1010" className={input} required pattern="[a-z0-9-]{2,40}" /></label>
      <label className="text-[12px] text-muted">utm_source<input value={f.utmSource} onChange={set('utmSource')} placeholder="instagram" className={input} /></label>
      <label className="text-[12px] text-muted">utm_medium<input value={f.utmMedium} onChange={set('utmMedium')} placeholder="reels" className={input} /></label>
      <label className="text-[12px] text-muted lg:col-span-2">utm_campaign<input value={f.utmCampaign} onChange={set('utmCampaign')} placeholder="launch" className={input} /></label>
      <div className="flex items-end lg:col-span-4"><Button type="submit" size="sm" loading={busy} loadingText="Создаём…">Создать ссылку</Button></div>
      {error && <ActionError className="sm:col-span-2 lg:col-span-6" message={error} />}
    </form>
  );
}
