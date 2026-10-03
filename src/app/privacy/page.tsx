import type { Metadata } from 'next';
import Link from 'next/link';
import { LandingFooter, LandingHeader } from '@/components/landing';
import { getUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Политика конфиденциальности — Карьерный навигатор' };

export default async function Page() {
  const signedIn = !!(await getUser());
  return (
    <>
      <LandingHeader signedIn={signedIn} />
      <main className="mx-auto w-full max-w-2xl px-5 py-16 sm:py-24">
        <h1 className="text-[28px] font-semibold tracking-tight">Политика конфиденциальности</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
          Этот документ находится в подготовке. Полный текст будет опубликован на этой странице до начала коммерческого использования сервиса.
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          Пока вы можете пользоваться сервисом в ознакомительном режиме. Загруженные вами резюме и тексты вакансий доступны только вашей учётной записи.
        </p>
        <Link href="/" className="mt-8 inline-block text-sm font-medium text-accent-600 hover:underline">← Вернуться на главную</Link>
      </main>
      <LandingFooter />
    </>
  );
}
