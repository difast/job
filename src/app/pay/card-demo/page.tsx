import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { DEMO_TEST_CARDS, isCardDemo } from '@/lib/billing/card-demo';
import { Logo } from '@/components/ui';
import Icon from '@/components/Icon';
import CardDemoForm from '@/components/CardDemoForm';

// ВРЕМЕННО: демо-форма привязки карты для скриншотов ЮKassa (CARD_DEMO_EMAILS). Удалить после скриншотов.
export const metadata: Metadata = { title: 'Привязка карты', robots: { index: false, follow: false } };

export default async function CardDemoPage() {
  const user = await requirePageUser({ onboarded: false });
  if (!isCardDemo(user.email)) notFound();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <div className="rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8">
          <div className="mb-5 flex items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn" data-testid="demo-badge"><Icon name="alert" size={15} />ДЕМО — данные не отправляются, деньги не списываются</div>
          <div className="text-[13px] text-muted">Привязка карты для автопродления Clymly Pro</div>
          <div className="tabular mt-1 text-[32px] font-semibold tracking-tight">1 ₽</div>
          <div className="mt-1 text-sm text-ink-2">Проверочный платёж — сразу отменяется, деньги вернутся на карту</div>
          <div className="my-6 h-px bg-line" />
          <CardDemoForm cards={DEMO_TEST_CARDS.slice(1)} />
          <label className="mt-4 flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-2"><input type="checkbox" checked readOnly className="mt-0.5 h-4 w-4 accent-[var(--color-accent-600)]" /><span>Запомнить данные карты — согласен на автопродление Pro по условиям <Link href="/terms#autorenew" className="underline underline-offset-2">оферты</Link></span></label>
        </div>
        <div className="mt-5 text-center"><Link href="/billing" className="text-sm text-ink-2 hover:text-ink">Отмена</Link></div>
      </div>
    </main>
  );
}
