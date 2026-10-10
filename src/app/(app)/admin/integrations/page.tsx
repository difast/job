import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { isAdmin, parseFilters, report } from '@/lib/partners/analytics';
import { PageHeader, buttonClass, cx } from '@/components/ui';

export const dynamic = 'force-dynamic';

const LABELS: Record<string, string> = { 'out:button_clicked': 'Клики «Перейти в JobToo»', 'out:handoff_succeeded': 'Передано в JobToo', 'out:partner_login_completed': 'Вошли в JobToo', 'in:pull_succeeded': 'Получено от JobToo', 'in:login_completed': 'Вошли в Clymly' };

function Funnel({ title, steps }: { title: string; steps: { event: string; label: string; n: number; conv: number | null }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.n));
  return (
    <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
      <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
      <ol className="mt-4 space-y-3">
        {steps.map((s) => (
          <li key={s.event} data-testid={`funnel-${s.event}`}>
            <div className="flex items-baseline justify-between gap-3 text-sm"><span>{s.label}</span><span className="tabular"><b className="font-semibold">{s.n}</b>{s.conv !== null && <span className="ml-2 text-xs text-muted">{s.conv}%</span>}</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-subtle"><div className="h-full rounded-full bg-accent-500" style={{ width: `${(s.n / max) * 100}%` }} /></div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default async function IntegrationsAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePageUser();
  if (!isAdmin(user.email)) notFound();
  const sp = await searchParams;
  const f = parseFilters(sp);
  const r = await report(f);
  const q = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ days: String(f.days), placement: f.placement, platform: f.platform, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `?${p}`;
  };
  const chip = (active: boolean) => cx('inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium', active ? 'bg-ink text-milk' : 'bg-stone text-ink-2 hover:text-ink');
  return (
    <>
      <PageHeader title="Интеграция с JobToo" subtitle="Воронка переходов в обе стороны. События сопоставляются с JobToo по request_id." action={<a href={`/api/admin/integrations/export${q({})}`} className={buttonClass({ variant: 'secondary' })}>Выгрузить CSV</a>} />
      <div className="mb-6 flex flex-wrap gap-2" aria-label="Фильтры">
        {[7, 30, 90, 365].map((d) => <Link key={d} href={q({ days: String(d) })} className={chip(f.days === d)}>{d === 365 ? 'Год' : `${d} дней`}</Link>)}
        <span className="mx-1 w-px bg-line" />
        <Link href={q({ placement: undefined })} className={chip(!f.placement)}>Все места</Link>
        {r.placements.map((p) => <Link key={p} href={q({ placement: p })} className={chip(f.placement === p)}>{p}</Link>)}
        <span className="mx-1 w-px bg-line" />
        <Link href={q({ platform: undefined })} className={chip(!f.platform)}>Все платформы</Link>
        {r.platforms.map((p) => <Link key={p} href={q({ platform: p })} className={chip(f.platform === p)}>{p}</Link>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Funnel title="Clymly → JobToo" steps={r.out} />
        <Funnel title="JobToo → Clymly" steps={r.in} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
          <h2 className="text-[17px] font-semibold tracking-tight">Время ответа</h2>
          <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-muted">JobToo на наши передачи</dt><dd className="tabular mt-1 text-xl font-semibold">{r.avgOutMs ? `${r.avgOutMs} мс` : '—'}</dd></div>
            <div><dt className="text-muted">JobToo на наши запросы pull</dt><dd className="tabular mt-1 text-xl font-semibold">{r.avgInMs ? `${r.avgInMs} мс` : '—'}</dd></div>
          </dl>
        </section>
        <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
          <h2 className="text-[17px] font-semibold tracking-tight">Частые ошибки</h2>
          {r.errors.length ? <ul className="mt-3 divide-y divide-line text-sm">{r.errors.map((e) => <li key={e.direction + e.code} className="flex justify-between py-2"><span><code className="text-[13px]">{e.code}</code> <span className="text-muted">· {e.direction === 'out' ? 'Clymly → JobToo' : 'JobToo → Clymly'}</span></span><b className="tabular font-semibold">{e.n}</b></li>)}</ul> : <p className="mt-3 text-sm text-muted">Ошибок нет.</p>}
        </section>
      </div>
      <section className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b border-line text-left text-[13px] text-muted"><th className="px-5 py-3 font-medium">День</th>{Object.values(LABELS).map((l) => <th key={l} className="px-3 py-3 text-right font-medium">{l}</th>)}</tr></thead>
          <tbody>
            {r.days.length ? r.days.map(([d, m]) => <tr key={d} className="border-b border-line last:border-0"><td className="px-5 py-2.5 tabular">{d}</td>{Object.keys(LABELS).map((k) => <td key={k} className="tabular px-3 py-2.5 text-right">{m[k] ?? 0}</td>)}</tr>)
              : <tr><td colSpan={6} className="px-5 py-6 text-center text-muted">За период переходов не было.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}
