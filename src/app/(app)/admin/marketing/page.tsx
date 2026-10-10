import { requireAdminPage } from '@/lib/admin/auth';
import { DIMENSIONS, filterOptions, linkCards, marketingReport, parseDimension, parseModel, techBreakdown, type Dimension } from '@/lib/admin/marketing';
import { PERIODS, dayRange, fmtMoney, parsePeriod, pct } from '@/lib/admin/period';
import { dailySeries } from '@/lib/admin/data';
import { Chips, DayBars, Funnel, Kpi, Section, TableWrap, qs, td, th } from '@/components/admin/parts';
import CopyLink from '@/components/admin/CopyLink';
import NewLinkForm from '@/components/admin/NewLinkForm';
import { SITE_URL } from '@/lib/brand';
import { cx } from '@/components/ui';

type SP = Record<string, string | undefined>;
const money = (r: { currency: string; amount: number }[]) => (r.length ? r.map((x) => fmtMoney(x.amount, x.currency)).join(' + ') : fmtMoney(0));
const select = 'h-9 rounded-lg border border-line-strong bg-white px-2.5 text-[13px] outline-none focus:border-accent-500';

export default async function AdminMarketing({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const period = parsePeriod(sp.period), model = parseModel(sp.model), dim: Dimension = parseDimension(sp.dim);
  const clean = (v: string | undefined) => (v && /^[a-z0-9._-]{1,64}$/.test(v) ? v : undefined);
  const f = { period, model, source: clean(sp.source), campaign: clean(sp.campaign) };
  const origin = new URL(SITE_URL).origin;
  const [cards, report, tech, opts, series] = await Promise.all([linkCards(f), marketingReport(f, dim), techBreakdown(period), filterOptions(), dailySeries(period)]);
  const t = report.totals;
  const days = dayRange(period, series.first);
  const base = { period, model, dim, source: f.source, campaign: f.campaign };
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Маркетинг</h1>
        <div className="flex flex-wrap gap-3">
          <Chips label="Период" items={PERIODS.map((p) => ({ value: p.key, label: p.label }))} current={period} href={(v) => qs('/admin/marketing', { ...base, period: v })} />
          <Chips label="Модель атрибуции" items={[{ value: 'first', label: 'First-touch' }, { value: 'last', label: 'Last-touch' }]} current={model} href={(v) => qs('/admin/marketing', { ...base, model: v })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7" data-testid="mk-totals">
        <Kpi label="Переходы" value={t.clicks} sub={t.anonymousClicks ? `из них без cookie: ${t.anonymousClicks}` : undefined} testid="mk-clicks" />
        <Kpi label="Уникальные" value={t.visitors} hint="Различные посетители по cookie cl_vid (90 дней). Повторные клики одного посетителя считаются один раз; переходы после отказа от cookie не учитываются." testid="mk-visitors" />
        <Kpi label="Регистрации" value={t.registrations} hint={model === 'first' ? 'First-touch: первый переход по ссылке до регистрации.' : 'Last-touch: последний переход перед регистрацией.'} testid="mk-regs" />
        <Kpi label="Оплатили" value={t.payers} sub={`${t.payments} оплат`} hint="Уникальные пользователи с успешной оплатой, атрибутированной по выбранной модели." testid="mk-payers" />
        <Kpi label="Выручка" value={money(t.revenue)} hint="Сумма успешных оплат атрибутированных пользователей. Ожидающие и отменённые не учитываются." testid="mk-revenue" />
        <Kpi label="Переход → регистрация" value={pct(t.registrations, t.visitors)} hint="Регистрации / уникальные посетители × 100%" testid="mk-conv-reg" />
        <Kpi label="Переход → оплата" value={pct(t.payers, t.visitors)} hint="Оплатившие / уникальные посетители × 100%" testid="mk-conv-pay" />
      </div>

      <h2 className="mb-2 mt-7 text-[15px] font-semibold">Ссылки</h2>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2" data-testid="link-cards">
        {cards.map(({ link, stats }) => (
          <article key={link.id} className="min-w-0 rounded-2xl border border-line bg-white p-5" data-testid={`link-card-${link.slug}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5"><h3 className="min-w-0 break-words text-[15px] font-semibold">{link.name}</h3><span className="min-w-0 break-all text-[12px] text-muted">{[link.utmSource, link.utmMedium, link.utmCampaign].filter(Boolean).join(' · ') || 'без меток'}</span></div>
            <div className="mt-3"><CopyLink url={`${origin}/go/${link.slug}`} /></div>
            <dl className="mt-4 grid grid-cols-3 gap-x-3 gap-y-2 text-[13px] sm:grid-cols-4">
              {[['Переходы', stats?.clicks ?? 0], ['Уникальные', stats?.visitors ?? 0], ['Регистрации', stats?.registrations ?? 0], ['Оплаты', stats?.payments ?? 0], ['Выручка', money(stats?.revenue ?? [])], ['→ регистрация', pct(stats?.registrations ?? 0, stats?.visitors ?? 0)], ['→ оплата', pct(stats?.payers ?? 0, stats?.visitors ?? 0)]].map(([k, v]) => (
                <div key={k as string}><dt className="text-[11.5px] text-muted">{k}</dt><dd className="tabular font-medium" data-testid={`card-${link.slug}-${k}`}>{v}</dd></div>
              ))}
            </dl>
          </article>
        ))}
      </div>
      <Section title="Новая ссылка" className="mt-3"><NewLinkForm origin={origin} /><p className="mt-3 text-[12px] text-muted">UTM из адреса ссылки (например, …/go/instagram?utm_campaign=launch) важнее меток по умолчанию. Переход всегда ведёт на главную Clymly.</p></Section>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Section title="Переходы по дням (МСК)"><DayBars title="Переходы" days={days} values={series.clicks} testid="mk-chart-clicks" /></Section>
        <Section title="Воронка"><Funnel steps={[{ label: 'Уникальные посетители', value: t.visitors }, { label: 'Регистрации', value: t.registrations, conv: pct(t.registrations, t.visitors) }, { label: 'Оплатили', value: t.payers, conv: pct(t.payers, t.visitors) }]} /></Section>
      </div>

      <Section title="Разбивка" className="mt-4" action={<Chips label="Срез" items={Object.entries(DIMENSIONS).map(([v, l]) => ({ value: v, label: l.replace(/ \(.*\)/, '') }))} current={dim} href={(v) => qs('/admin/marketing', { ...base, dim: v })} />}>
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2" aria-label="Фильтры разбивки">
          <input type="hidden" name="period" value={period} /><input type="hidden" name="model" value={model} /><input type="hidden" name="dim" value={dim} />
          <label className="flex flex-col gap-1 text-[12px] text-muted">utm_source<select name="source" defaultValue={f.source ?? ''} className={select}><option value="">Все</option>{opts.sources.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-[12px] text-muted">utm_campaign<select name="campaign" defaultValue={f.campaign ?? ''} className={select}><option value="">Все</option>{opts.campaigns.map((s) => <option key={s}>{s}</option>)}</select></label>
          <button type="submit" className="h-9 rounded-lg border border-line-strong bg-white px-3 text-[13px] font-medium hover:bg-subtle">Применить</button>
        </form>
        {report.rows.length === 0 ? <p className="text-sm text-muted">Переходов и атрибутированных событий за период нет.</p> : (
          <TableWrap>
            <thead><tr><th className={th}>{DIMENSIONS[dim]}</th><th className={th}>Переходы</th><th className={th}>Уникальные</th><th className={th}>Регистрации</th><th className={th}>Оплатили</th><th className={th}>Выручка</th><th className={th}>→ регистрация</th><th className={th}>→ оплата</th></tr></thead>
            <tbody data-testid="mk-breakdown">
              {report.rows.map((r) => (
                <tr key={r.key}><td className={cx(td, 'font-medium')}>{r.label}</td><td className={cx(td, 'tabular')}>{r.clicks}</td><td className={cx(td, 'tabular')}>{r.visitors}</td><td className={cx(td, 'tabular')}>{r.registrations}</td><td className={cx(td, 'tabular')}>{r.payers}</td><td className={cx(td, 'tabular whitespace-nowrap')}>{money(r.revenue)}</td><td className={cx(td, 'tabular')}>{pct(r.registrations, r.visitors)}</td><td className={cx(td, 'tabular')}>{pct(r.payers, r.visitors)}</td></tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Section>

      <Section title="Технические данные переходов" className="mt-4">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {([['Устройство', tech.device], ['ОС', tech.os], ['Браузер', tech.browser], ['Язык', tech.lang], ['Реферер', tech.referrerHost], ['Посадочная', tech.landing]] as const).map(([title, items]) => (
            <div key={title}><h3 className="mb-1.5 text-[12.5px] font-medium text-muted">{title}</h3>
              {items.length ? <ul className="space-y-1 text-[13px]">{items.map((i) => <li key={i.label} className="flex justify-between gap-2"><span className="truncate">{i.label}</span><span className="tabular text-ink-2">{i.count}</span></li>)}</ul> : <p className="text-[13px] text-muted">Нет данных</p>}
            </div>
          ))}
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-muted">IP-адреса не сохраняются, поэтому страна и регион не определяются. Отпечаток устройства не строится; уникальность — по cookie посетителя (90 дней), если он не отказался от аналитических cookie.</p>
      </Section>
      <p className="mt-4 text-[12px] leading-relaxed text-muted">Аккаунты, созданные переходом из JobToo, в маркетинговую атрибуцию не входят — их аналитика во вкладке «Интеграции». Выручка Clymly и JobToo не смешивается: здесь только оплаты в Clymly.</p>
    </>
  );
}
