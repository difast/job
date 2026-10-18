'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Spinner, buttonClass } from './ui';
import { request } from '@/lib/client';

/** Возврат после оплаты в другом браузере: одноразовый ключ из ссылки восстанавливает вход и открывает результат. */
export default function ReturnResume({ order, k }: { order: string; k: string | null }) {
  const [error, setError] = useState(k ? '' : 'Войдите, чтобы увидеть результат оплаты.');
  useEffect(() => {
    if (!k) return;
    request('/api/billing/resume', { method: 'POST', json: { order, r: k }, timeoutMs: 20_000 }).then((r) => {
      if (r.ok) window.location.replace(`/billing/result?order=${order}`);
      else setError(r.error);
    });
  }, [order, k]);
  const next = encodeURIComponent(`/billing/result?order=${order}`);
  return error ? (
    <div data-testid="return-login">
      <h1 className="text-[22px] font-semibold tracking-tight">Результат оплаты</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{error} Оплата при этом обработается — статус будет в разделе «Тариф и оплата».</p>
      <Link href={`/login?next=${next}`} className={buttonClass({ size: 'lg', className: 'mt-6' })}>Войти</Link>
    </div>
  ) : (
    <p className="flex items-center gap-2 text-[15px] text-ink-2" data-testid="return-wait"><Spinner />Проверяем оплату…</p>
  );
}
