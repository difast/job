'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Уведомление об аналитических cookie. Показывается только тем, кто пришёл по маркетинговой ссылке (/go/…)
 * и ещё не принял решение. «Отказаться» обезличивает визиты и удаляет идентификатор посетителя.
 */
export default function AnalyticsConsent() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const c = document.cookie;
    setShow(/(?:^|;\s*)cl_mk=1/.test(c) && !/(?:^|;\s*)cl_consent=/.test(c));
  }, []);
  async function decide(accept: boolean) {
    setBusy(true);
    await fetch('/api/consent/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept }) }).catch(() => {});
    setShow(false);
  }
  if (!show) return null;
  return (
    <div role="dialog" aria-label="Аналитические cookie" data-testid="analytics-consent"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-[640px] rounded-xl border border-line bg-white p-4 text-[13px] leading-relaxed text-ink-2 shadow-pop sm:inset-x-6 sm:bottom-6 lg:bottom-6">
      <p>Мы сохраняем cookie, чтобы понимать, по какой рекламной ссылке вы пришли. IP-адрес не сохраняется. <Link href="/privacy#cookies" className="underline underline-offset-2 hover:text-ink">Подробнее</Link></p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => decide(true)} className="inline-flex h-9 items-center rounded-lg bg-accent-600 px-3.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-50" data-testid="consent-accept">Принять</button>
        <button type="button" disabled={busy} onClick={() => decide(false)} className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-white px-3.5 text-[13px] font-medium text-ink hover:bg-subtle disabled:opacity-50" data-testid="consent-decline">Отказаться</button>
      </div>
    </div>
  );
}
