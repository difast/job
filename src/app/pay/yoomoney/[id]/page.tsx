import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatRub, getPlan } from '@/lib/billing/plans';
import { PAYMENT_TYPES, QUICKPAY_URL, quickpayFields, yooMoneyState, type QuickpayType } from '@/lib/billing/yoomoney';
import { BRAND } from '@/lib/brand';
import { Alert, Logo, buttonClass } from '@/components/ui';
import Icon from '@/components/Icon';

// Переход к оплате заказа через ЮMoney: форма Quickpay отправляется прямо на yoomoney.ru.
// Страница доступна только владельцу незавершённого заказа; цена берётся из заказа, а не из адреса.
export const metadata: Metadata = { title: 'Оплата через ЮMoney', robots: { index: false, follow: false } };

async function origin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  return `${h.get('x-forwarded-proto') ?? 'https'}://${host}`;
}

export default async function YooMoneyPayPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser({ onboarded: false });
  const { id } = await params;
  const p = await db.payment.findFirst({ where: { id, userId: user.id, provider: 'yoomoney' } });
  if (!p) notFound();
  if (p.status !== 'pending' || p.issue) redirect(`/billing/result?order=${p.id}`);
  const st = yooMoneyState();
  const name = p.planName ?? getPlan(p.planId)?.name ?? p.planId;
  const successURL = `${await origin()}/billing/result?order=${p.id}`;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <div className="rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8">
          <div className="text-[13px] text-muted">Заказ {BRAND.name}</div>
          <div className="mt-1 text-[17px] font-semibold tracking-tight" data-testid="ym-plan">{name}</div>
          <div className="tabular mt-3 text-[32px] font-semibold tracking-tight" data-testid="ym-amount">{formatRub(p.amount)}</div>
          <div className="mt-1 text-[13px] text-ink-2">Разовый платёж, без автопродления</div>
          <div className="my-6 h-px bg-line" />
          {st.state !== 'ready' ? (
            <Alert tone="warn">Оплата через ЮMoney временно недоступна. <Link href="/billing" className="underline">Выберите другой способ оплаты</Link>.</Alert>
          ) : (
            <div className="space-y-2.5" data-testid="ym-forms">
              {(Object.keys(PAYMENT_TYPES) as QuickpayType[]).map((t, i) => (
                <form key={t} method="POST" action={QUICKPAY_URL}>
                  {Object.entries(quickpayFields(st.config, { orderId: p.id, amount: p.amount, description: `${BRAND.name} ${name}`, successURL, paymentType: t })).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
                  <button type="submit" className={buttonClass({ variant: i === 0 ? 'primary' : 'secondary', size: 'lg', className: 'w-full' })}>
                    <Icon name={i === 0 ? 'lock' : 'arrow-right'} size={16} />{PAYMENT_TYPES[t]}
                  </button>
                </form>
              ))}
            </div>
          )}
          <p className="mt-5 text-xs leading-relaxed text-muted">Оплата проходит на сайте ЮMoney. Данные карты вводятся там и не передаются {BRAND.name}. Тариф включится после того, как ЮMoney подтвердит перевод — обычно в течение минуты.</p>
        </div>
        <div className="mt-5 text-center"><Link href="/billing" className="text-sm text-ink-2 hover:text-ink">Вернуться к тарифам</Link></div>
      </div>
    </main>
  );
}
