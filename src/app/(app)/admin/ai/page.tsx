import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin/auth';
import { AI_FEATURE_LABELS, aiReport, tokenPrice } from '@/lib/admin/ai';
import { PERIODS, dayRange, parsePeriod } from '@/lib/admin/period';
import { aiStatus } from '@/lib/ai/provider';
import { Chips, DayBars, Kpi, Section, TableWrap, qs, td, th } from '@/components/admin/parts';
import { cx } from '@/components/ui';

type SP = Record<string, string | undefined>;
const num = (v: number) => v.toLocaleString('ru-RU');
const rub = (v: number) => `${v.toLocaleString('ru-RU', { maximumFractionDigits: v < 10 ? 2 : 0 })} ₽`;
const ERROR_LABELS: Record<string, string> = {
  unavailable: 'Не ответил (сеть, таймаут, 5xx)', rate_limit: 'Лимит частоты провайдера (429)', quota: 'Закончились токены (402)',
  auth: 'Ключ отклонён', forbidden: 'Нет доступа к модели', config: 'Ошибка настройки', bad_response: 'Ответ не по формату', refused: 'Фильтр провайдера', unknown: 'Прочее',
};

export default async function AdminAi({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage();
  const period = parsePeriod((await searchParams).period);
  const r = await aiReport(period);
  const price = tokenPrice();
  const cost = (t: number) => (price ? rub((t / 1000) * price) : null);
  const days = dayRange(period, r.first);
  const st = aiStatus();
  const t = r.totals;
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">ИИ</h1>
          <p className="mt-1 text-[13px] text-ink-2" data-testid="ai-provider">Провайдер: {st.provider === 'none' ? 'не подключён (упрощённый режим)' : `${st.provider}${st.model ? ` · ${st.model}` : ''}${st.configured ? '' : ' · не настроен'}`}</p>
        </div>
        <Chips label="Период" items={PERIODS.map((p) => ({ value: p.key, label: p.label }))} current={period} href={(v) => qs('/admin/ai', { period: v })} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="ai-totals">
        <Kpi label="Токены" value={num(t.total)} sub={cost(t.total) ?? undefined} hint="Все токены запросов к ИИ за период: запрос + ответ, включая повторы для исправления формата." testid="ai-tokens" />
        <Kpi label="Запрос (prompt)" value={num(t.prompt)} testid="ai-prompt" />
        <Kpi label="Ответ (completion)" value={num(t.completion)} testid="ai-completion" />
        <Kpi label="Запросы к ИИ" value={num(t.calls)} sub={t.calls ? `≈ ${num(Math.round(t.total / t.calls))} токенов на запрос` : undefined} testid="ai-calls" />
        <Kpi label="Ошибки" value={num(t.failed)} sub={t.calls ? `${((t.failed / t.calls) * 100).toFixed(1).replace('.', ',')}% запросов` : undefined} testid="ai-failed" />
        <Kpi label="Пользователи" value={num(t.users)} sub={t.users ? `≈ ${num(Math.round(t.total / t.users))} токенов на пользователя` : undefined} testid="ai-users" />
      </div>
      {!price && <p className="mt-2 text-xs text-muted">Чтобы видеть оценку в рублях, задайте AI_PRICE_PER_1K_TOKENS — цену 1000 токенов по вашему тарифу GigaChat.</p>}

      <Section title="По дням" className="mt-8">
        <div className="grid gap-6 md:grid-cols-2">
          <DayBars title="Токены" days={days} values={r.tokensByDay} format={num} testid="ai-days-tokens" />
          <DayBars title="Запросы" days={days} values={r.callsByDay} format={num} testid="ai-days-calls" />
        </div>
      </Section>

      <Section title="По функциям" className="mt-8">
        <TableWrap>
          <table className="w-full text-sm" data-testid="ai-features">
            <thead><tr><th className={th}>Функция</th><th className={cx(th, 'text-right')}>Запросы</th><th className={cx(th, 'text-right')}>Ошибки</th><th className={cx(th, 'text-right')}>Токены</th><th className={cx(th, 'text-right')}>В среднем</th>{price && <th className={cx(th, 'text-right')}>Стоимость</th>}</tr></thead>
            <tbody>
              {r.features.length === 0 && <tr><td className={td} colSpan={6}>За период запросов к ИИ не было.</td></tr>}
              {r.features.map((f) => (
                <tr key={f.key}>
                  <td className={td}>{AI_FEATURE_LABELS[f.key] ?? f.key}</td>
                  <td className={cx(td, 'tabular text-right')}>{num(f.calls)}</td>
                  <td className={cx(td, 'tabular text-right', f.failed > 0 && 'text-bad')}>{num(f.failed)}</td>
                  <td className={cx(td, 'tabular text-right font-medium')}>{num(f.total)}</td>
                  <td className={cx(td, 'tabular text-right text-ink-2')}>{num(Math.round(f.total / Math.max(1, f.calls)))}</td>
                  {price && <td className={cx(td, 'tabular text-right')}>{cost(f.total)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Section>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <Section title="По моделям" className="min-w-0">
          <TableWrap>
            <table className="w-full text-sm" data-testid="ai-models">
              <thead><tr><th className={th}>Модель</th><th className={cx(th, 'text-right')}>Запросы</th><th className={cx(th, 'text-right')}>Токены</th></tr></thead>
              <tbody>
                {r.models.length === 0 && <tr><td className={td} colSpan={3}>Нет данных</td></tr>}
                {r.models.map((m) => <tr key={`${m.provider}:${m.model}`}><td className={td}>{m.provider} · {m.model}</td><td className={cx(td, 'tabular text-right')}>{num(m.calls)}</td><td className={cx(td, 'tabular text-right')}>{num(m.total)}</td></tr>)}
              </tbody>
            </table>
          </TableWrap>
        </Section>
        <Section title="Ошибки" className="min-w-0">
          <TableWrap>
            <table className="w-full text-sm" data-testid="ai-errors">
              <thead><tr><th className={th}>Тип</th><th className={cx(th, 'text-right')}>Запросы</th></tr></thead>
              <tbody>
                {r.errors.length === 0 && <tr><td className={td} colSpan={2}>Ошибок не было</td></tr>}
                {r.errors.map((e) => <tr key={e.kind}><td className={td}>{ERROR_LABELS[e.kind] ?? e.kind}</td><td className={cx(td, 'tabular text-right')}>{num(e.count)}</td></tr>)}
              </tbody>
            </table>
          </TableWrap>
        </Section>
      </div>

      <Section title="Больше всего токенов" className="mt-8">
        <TableWrap>
          <table className="w-full text-sm" data-testid="ai-top-users">
            <thead><tr><th className={th}>Пользователь</th><th className={th}>Тариф</th><th className={cx(th, 'text-right')}>Запросы</th><th className={cx(th, 'text-right')}>Токены</th>{price && <th className={cx(th, 'text-right')}>Стоимость</th>}</tr></thead>
            <tbody>
              {r.top.length === 0 && <tr><td className={td} colSpan={5}>Нет данных</td></tr>}
              {r.top.map((u) => (
                <tr key={u.userId}>
                  <td className={cx(td, 'max-w-[260px] truncate')} title={u.email}><Link href={qs('/admin/users', { q: u.email })} className="hover:text-accent-700">{u.email}</Link></td>
                  <td className={td}>{u.pro ? 'Pro' : 'Free'}</td>
                  <td className={cx(td, 'tabular text-right')}>{num(u.calls)}</td>
                  <td className={cx(td, 'tabular text-right font-medium')}>{num(u.total)}</td>
                  {price && <td className={cx(td, 'tabular text-right')}>{cost(u.total)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Section>
      <p className="mt-4 text-xs text-muted">Учитывается каждый запрос к провайдеру, в том числе повторный для исправления формата. Тексты резюме, вакансий и ответов не хранятся. Токены считает провайдер (поле usage в ответе).</p>
    </>
  );
}
