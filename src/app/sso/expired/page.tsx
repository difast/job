import type { Metadata } from 'next';
import Link from 'next/link';
import PartnerFrame from '@/components/PartnerFrame';
import { buttonClass } from '@/components/ui';

export const metadata: Metadata = { title: 'Ссылка устарела', robots: { index: false, follow: false } };

export default function Expired() {
  return (
    <PartnerFrame>
      <h1 className="text-[24px] font-semibold tracking-tight">Ссылка устарела</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">Ссылка для входа одноразовая и действует пару минут. Вернитесь в JobToo и нажмите «Перейти в Clymly» ещё раз.</p>
      <div className="mt-6 flex flex-wrap gap-2"><Link href="/login" className={buttonClass({ variant: 'secondary' })}>Войти в Clymly</Link></div>
    </PartnerFrame>
  );
}
