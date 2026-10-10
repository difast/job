import Link from 'next/link';
import { Logo } from './ui';

/** Простая страница-«карточка» для шагов перехода из JobToo (вне кабинета). */
export default function PartnerFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-5 sm:px-8"><Link href="/" aria-label="Clymly — на главную"><Logo /></Link></div>
      </header>
      <main className="page-in mx-auto max-w-[560px] px-5 py-10 sm:py-16">
        <div className="rounded-2xl border border-line bg-white p-6 sm:p-8">{children}</div>
      </main>
    </div>
  );
}
