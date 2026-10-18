'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Icon from './Icon';
import { Alert, Button } from './ui';
import { useConfirm } from './Confirm';
import { request } from '@/lib/client';

export interface CardView { id: string; title: string; isPrimary: boolean }

/** «Привязанные карты»: основная, сделать основной, удалить по одной, привязать новую (проверочный 1 ₽). */
export default function CardsManager({ cards, autopay, next, canBind, demo = false }: {
  cards: CardView[]; autopay: boolean; next: { date: string; amount: string } | null; canBind: boolean; demo?: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  // Список меняется сразу после успешного ответа сервера; свежие данные страницы подтягиваются следом
  const [list, setList] = useState(cards);
  const [on, setOn] = useState(autopay);
  useEffect(() => { setList(cards); setOn(autopay); }, [cards, autopay]);

  // ВРЕМЕННО: в демо-режиме (скриншоты для ЮKassa) те же действия идут в /api/billing/card-demo
  const DEMO = '/api/billing/card-demo';
  async function act(key: string, url: string, after?: (d: Record<string, unknown>) => void) {
    if (busy) return;
    setBusy(key); setError('');
    let json: Record<string, string> | undefined;
    if (demo) {
      const m = url.match(/\/cards\/([^/]+)\/(primary|delete)$/);
      json = m ? { action: m[2], id: m[1] } : url === '/api/billing/cards' ? { action: 'bind' } : { action: 'reset' };
      url = DEMO;
    }
    const r = await request<Record<string, unknown>>(url, { method: 'POST', json, timeoutMs: 30_000 });
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    if (after) return after(r.data);
    const m = key.match(/^(pri|del):(.+)$/);
    if (m?.[1] === 'pri') setList((l) => l.map((c) => ({ ...c, isPrimary: c.id === m[2] })));
    if (m?.[1] === 'del') setList((l) => {
      const removed = l.find((c) => c.id === m[2]);
      const rest = l.filter((c) => c.id !== m[2]);
      if (removed?.isPrimary && rest.length && !rest.some((c) => c.isPrimary)) rest[0] = { ...rest[0], isPrimary: true };
      if (!rest.length) setOn(false);
      return rest;
    });
    router.refresh();
  }
  const bind = () => act('bind', '/api/billing/cards', (d) => { if (typeof d.confirmationUrl === 'string' && d.confirmationUrl) window.location.href = d.confirmationUrl; });
  async function remove(c: CardView) {
    const last = list.length === 1;
    if (!(await confirm({ title: `Удалить карту ${c.title}?`, text: last ? 'Это последняя карта — автопродление отключится. Оплаченный срок Pro сохранится.' : 'Автопродление продолжит работать с остальными картами.', confirm: 'Удалить', danger: true }))) return;
    await act(`del:${c.id}`, `/api/billing/cards/${c.id}/delete`);
  }

  return (
    <section id="cards" className="mb-8 scroll-mt-24 rounded-xl border border-line bg-white p-5 shadow-card sm:p-6" aria-labelledby="cards-h" data-testid="cards">
      <h2 id="cards-h" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight"><Icon name="lock" size={17} className="text-muted" />Привязанные карты и автопродление</h2>
      {on && list.length > 0 ? (
        <>
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line" data-testid="cards-list">
            {list.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm" data-testid="card-row">
                <span className="font-medium">{c.title}</span>
                {c.isPrimary && <span className="rounded-md bg-ok-soft px-2 py-0.5 text-xs font-medium text-ok" data-testid="card-primary">основная</span>}
                <span className="ml-auto flex gap-1">
                  {!c.isPrimary && <Button size="sm" variant="ghost" loading={busy === `pri:${c.id}`} disabled={!!busy} onClick={() => act(`pri:${c.id}`, `/api/billing/cards/${c.id}/primary`)}>Сделать основной</Button>}
                  <Button size="sm" variant="ghost" loading={busy === `del:${c.id}`} disabled={!!busy} onClick={() => remove(c)} data-testid="card-delete">Удалить</Button>
                </span>
              </li>
            ))}
          </ul>
          {next && <p className="mt-3 text-sm text-ink-2" data-testid="next-charge">Следующее списание: <b className="font-semibold text-ink">{next.date}</b>, <b className="tabular font-semibold text-ink">{next.amount}</b> с основной карты. За 3 дня до него придёт письмо.</p>}
          {canBind && list.length < 5 && (
            <div className="mt-4">
              <Button variant="secondary" size="sm" loading={busy === 'bind'} disabled={!!busy} onClick={bind} data-testid="card-bind">Привязать другую карту</Button>
              <p className="mt-1.5 text-xs text-muted">Новая карта станет основной, прежние останутся запасными. Для проверки спишем и сразу отменим 1 ₽ — деньги вернутся, срок зависит от банка.</p>
            </div>
          )}
        </>
      ) : (
        <div className="mt-3" data-testid="autopay-off">
          <p className="text-sm leading-relaxed text-ink-2">Автопродление выключено: по окончании срока деньги не спишутся. Включить его можно, привязав карту, — Pro будет продлеваться на тот же срок с напоминанием за 3 дня до списания.</p>
          {canBind && <Button className="mt-3" variant="secondary" size="sm" loading={busy === 'bind'} disabled={!!busy} onClick={bind} data-testid="card-bind">Привязать карту</Button>}
          {canBind && <p className="mt-1.5 text-xs text-muted">Проверочный платёж 1 ₽ сразу отменяется. Условия — в <Link href="/terms#autorenew" className="underline underline-offset-2 hover:text-ink">оферте</Link>.</p>}
        </div>
      )}
      {error && <Alert className="mt-3">{error}</Alert>}
      {demo && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-dashed border-line pt-3 text-xs text-muted" data-testid="demo-panel">
          <span>Демо-режим для скриншотов: карты не настоящие, запросов в ЮKassa нет.</span>
          <Button size="sm" variant="ghost" loading={busy === 'reset'} disabled={!!busy} onClick={() => act('reset', '/api/billing/card-demo/reset', (d) => { if (Array.isArray(d.cards)) { setList(d.cards as CardView[]); setOn(d.cards.length > 0); } router.refresh(); })} data-testid="demo-reset">Сбросить демо</Button>
        </div>
      )}
    </section>
  );
}
