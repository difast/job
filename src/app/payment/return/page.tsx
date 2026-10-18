import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import PartnerFrame from '@/components/PartnerFrame';
import ReturnResume from '@/components/ReturnResume';

// Ключ возврата в адресе: страницу не индексируем и не передаём адрес как referrer
export const metadata: Metadata = { title: 'Возврат после оплаты', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';

/** Сюда ЮKassa возвращает покупателя. В том же браузере — сразу к результату; в другом — восстановление входа по ключу. */
export default async function PaymentReturn({ searchParams }: { searchParams: Promise<{ order?: string; r?: string }> }) {
  const { order, r } = await searchParams;
  const id = order && /^[a-z0-9]{20,40}$/.test(order) ? order : null;
  if (!id) redirect('/billing');
  if (await getUser()) redirect(`/billing/result?order=${id}`);
  return (
    <PartnerFrame>
      <ReturnResume order={id} k={r && /^[\w-]{20,64}$/.test(r) ? r : null} />
    </PartnerFrame>
  );
}
