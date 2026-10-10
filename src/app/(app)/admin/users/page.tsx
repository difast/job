import { requireAdminPage } from '@/lib/admin/auth';
import { PAGE_SIZE, USER_SORTS, listUsers, type UserFilters, type UserSort } from '@/lib/admin/data';
import { fmtDate, fmtMoney } from '@/lib/admin/period';
import { SUB_LABEL, periodStartFromPayments, subStatus } from '@/lib/admin/subscription';
import { currentTier } from '@/lib/billing/plans';
import { db } from '@/lib/db';
import { Pager, Section, TableWrap, qs, td, th } from '@/components/admin/parts';
import { cx } from '@/components/ui';

type SP = Record<string, string | undefined>;
const pick = <T extends string>(v: string | undefined, allowed: readonly T[]) => (allowed.includes(v as T) ? (v as T) : undefined);

function parse(sp: SP): UserFilters {
  return {
    q: (sp.q ?? '').trim().slice(0, 100) || undefined,
    plan: pick(sp.plan, ['free', 'pro'] as const), account: pick(sp.account, ['active', 'pending'] as const), sub: pick(sp.sub, ['none', 'active', 'expired'] as const),
    source: sp.source && /^[a-z0-9-]{1,40}$/.test(sp.source) ? sp.source : undefined,
    sort: (sp.sort && sp.sort in USER_SORTS ? sp.sort : 'created') as UserSort, dir: sp.dir === 'asc' ? 'asc' : 'desc',
    page: Math.min(10_000, Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1)),
  };
}

const select = 'h-9 rounded-lg border border-line-strong bg-white px-2.5 text-[13px] outline-none focus:border-accent-500';

export default async function AdminUsers({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage();
  const f = parse(await searchParams);
  const [{ rows, total }, links] = await Promise.all([listUsers(f), db.marketingLink.findMany({ select: { slug: true, name: true } })]);
  const base = { q: f.q, plan: f.plan, account: f.account, sub: f.sub, source: f.source, sort: f.sort, dir: f.dir };
  const sortLink = (s: UserSort, label: string) => {
    const active = f.sort === s;
    return <a href={qs('/admin/users', { ...base, sort: s, dir: active && f.dir === 'desc' ? 'asc' : 'desc' })} className={cx('hover:text-ink', active && 'text-ink')}>{label}{active ? (f.dir === 'desc' ? ' ↓' : ' ↑') : ''}</a>;
  };
  return (
    <>
      <h1 className="mb-5 text-[26px] font-semibold tracking-[-0.02em]">Пользователи</h1>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2" role="search" aria-label="Поиск и фильтры пользователей">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[12px] text-muted">E-mail
          <input name="q" defaultValue={f.q} placeholder="часть адреса" className="h-9 rounded-lg border border-line-strong bg-white px-3 text-[13px] text-ink outline-none focus:border-accent-500" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">Тариф<select name="plan" defaultValue={f.plan ?? ''} className={select}><option value="">Все</option><option value="free">Free</option><option value="pro">Pro</option></select></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">Аккаунт<select name="account" defaultValue={f.account ?? ''} className={select}><option value="">Все</option><option value="active">Активен</option><option value="pending">Не принял условия</option></select></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">Подписка<select name="sub" defaultValue={f.sub ?? ''} className={select}><option value="">Все</option><option value="active">Активна</option><option value="expired">Истекла</option><option value="none">Не оформлялась</option></select></label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">Первый источник<select name="source" defaultValue={f.source ?? ''} className={select}><option value="">Все</option>{links.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}<option value="jobtoo">JobToo</option><option value="none">Неизвестен</option></select></label>
        <input type="hidden" name="sort" value={f.sort} /><input type="hidden" name="dir" value={f.dir} />
        <button type="submit" className="h-9 rounded-lg bg-accent-600 px-4 text-[13px] font-medium text-white hover:bg-accent-700">Применить</button>
        {(f.q || f.plan || f.account || f.sub || f.source) && <a href="/admin/users" className="inline-flex h-9 items-center px-2 text-[13px] text-ink-2 hover:text-ink">Сбросить</a>}
      </form>
      <Section title={`Найдено: ${total}`}>
        {rows.length === 0 ? <p className="text-sm text-muted" data-testid="users-empty">Никого не нашли. Измените фильтры.</p> : (
          <TableWrap>
            <thead><tr>
              <th className={th}>ID</th><th className={th}>E-mail</th><th className={th}>{sortLink('created', 'Регистрация')}</th><th className={th}>Аккаунт</th><th className={th}>Тариф</th>
              <th className={th}>Подписка</th><th className={th}>Начало / окончание</th><th className={th}>Последняя оплата</th><th className={th}>{sortLink('paid', 'Всего оплат')}</th>
              <th className={th}>{sortLink('activity', 'Активность')}</th><th className={th}>Первый источник</th><th className={th}>Источник регистрации</th>
            </tr></thead>
            <tbody data-testid="users-table">
              {rows.map((u) => {
                const st = subStatus(u, u.paid_count);
                const start = u.payments.length ? periodStartFromPayments(u.payments) : null;
                const regSource = u.source === 'jobtoo' ? 'JobToo' : u.signup_link ? `${u.signup_link}${u.signup_utm ? ` · ${u.signup_utm}` : ''}` : 'Прямая';
                return (
                  <tr key={u.id} data-testid="user-row">
                    <td className={cx(td, 'font-mono text-[11px] text-muted')} title={u.id}>{u.id.slice(-8)}</td>
                    <td className={cx(td, 'max-w-[220px] truncate')} title={u.email}>{u.email}</td>
                    <td className={cx(td, 'whitespace-nowrap')}>{fmtDate(u.createdAt)}</td>
                    <td className={cx(td, "whitespace-nowrap")}>{u.pdConsentAt ? "Активен" : <span className="text-warn">Не принял условия</span>}</td>
                    <td className={td} data-testid="user-plan">{currentTier(u).tier === 'pro' ? 'Pro' : 'Free'}</td>
                    <td className={cx(td, "whitespace-nowrap")} data-testid="user-sub">{SUB_LABEL[st]}</td>
                    <td className={cx(td, 'whitespace-nowrap text-ink-2')}>{st === 'none' ? '—' : `${fmtDate(start)} — ${fmtDate(u.planUntil)}`}</td>
                    <td className={cx(td, 'whitespace-nowrap')}>{u.last_amount != null ? <>{fmtMoney(u.last_amount, u.last_currency ?? 'RUB')}<div className="text-[11px] text-muted">{fmtDate(u.last_paid_at)}</div></> : '—'}</td>
                    <td className={cx(td, 'tabular whitespace-nowrap')}>{u.paid_count ? fmtMoney(u.total) : '—'}</td>
                    <td className={cx(td, 'whitespace-nowrap')}>{fmtDate(u.last_at)}</td>
                    <td className={td}>{u.first_link ? `${u.first_link}${u.first_utm ? ` · ${u.first_utm}` : ''}` : u.source === 'jobtoo' ? 'JobToo' : <span className="text-muted">Неизвестен</span>}</td>
                    <td className={td}>{regSource}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
        <Pager page={f.page} total={total} size={PAGE_SIZE} href={(p) => qs('/admin/users', { ...base, page: p })} />
        <p className="mt-3 text-[12px] leading-relaxed text-muted">Блокировка аккаунтов в системе не предусмотрена. «Не принял условия» — аккаунт создан переходом из JobToo, вход не завершён. Подписка Pro разовая (без автопродления): начало — первая оплата текущего непрерывного периода. Сумма «Всего оплат» — в рублях. Первый источник — самый ранний переход по маркетинговой ссылке, связанный с аккаунтом; источник регистрации — последний переход перед регистрацией (last-touch).</p>
      </Section>
    </>
  );
}
