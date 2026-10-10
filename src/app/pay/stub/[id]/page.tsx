import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatRub, getPlan } from '@/lib/billing/plans';
import { isTestMode } from '@/lib/billing/provider';
import { Logo } from '@/components/ui';
import Icon from '@/components/Icon';
import StubCheckout from '@/components/StubCheckout';

// Заглушка платёжной страницы ЮKassa (тестовый режим). После подключения ЮKassa пользователь попадает на её страницу.
export const metadata: Metadata = { title: 'Оплата', robots: { index: false, follow: false } };

export default async function StubPayPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isTestMode()) notFound();
  const user = await requirePageUser({ onboarded: false });
  const { id } = await params;
  const p = await db.payment.findFirst({ where: { id, userId: user.id, provider: 'stub' } });
  if (!p) notFound();
  const plan = getPlan(p.planId);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <div className="rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8">
          <div className="mb-5 flex items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn"><Icon name="alert" size={15} />Тестовая оплата — деньги не списываются</div>
          <div className="text-[13px] text-muted">К оплате</div>
          <div className="tabular mt-1 text-[32px] font-semibold tracking-tight">{formatRub(p.amount)}</div>
          <div className="mt-1 text-sm text-ink-2">{plan?.name ?? p.planId} · {user.email}</div>
          <div className="my-6 h-px bg-line" />
          {p.status === 'pending' ? (
            <StubCheckout paymentId={p.id} amountLabel={formatRub(p.amount)} />
          ) : (
            <div className="space-y-4 text-center text-sm text-ink-2"><p>Этот платёж уже {p.status === 'succeeded' ? 'оплачен' : 'отменён'}.</p><Link href={`/billing?payment=${p.id}`} className="font-medium text-accent-600 hover:underline">Вернуться к тарифам</Link></div>
          )}
        </div>
        <p className="mt-5 text-center text-xs leading-relaxed text-muted">Здесь будет платёжная страница ЮKassa. Чтобы включить реальные платежи, задайте PAYMENT_PROVIDER=yookassa и ключи магазина.</p>
      </div>
    </main>
  );
}
