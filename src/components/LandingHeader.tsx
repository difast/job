'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Icon from './Icon';
import { Logo, cx } from './ui';

const LINKS: [string, string][] = [['Возможности', '/#features'], ['Как это работает', '/#how'], ['Профессии', '/#professions']];
const wrap = 'mx-auto w-full max-w-[1240px] px-5 sm:px-8';

export default function LandingHeader({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 bg-canvas/85 backdrop-blur-md">
      <div className={cx(wrap, 'flex h-[72px] items-center justify-between gap-6')}>
        <Link href="/" aria-label="Clymly — на главную" className="shrink-0"><Logo size={24} /></Link>
        <nav aria-label="Разделы" className="hidden items-center gap-8 text-[15px] text-ink-2 lg:flex">
          {LINKS.map(([t, h]) => <a key={h} href={h} className="transition-colors hover:text-ink">{t}</a>)}
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <Link href="/dashboard" className="hidden h-11 items-center rounded-full bg-ink px-5 text-[15px] font-medium text-milk transition-colors hover:bg-black sm:inline-flex">Личный кабинет</Link>
          ) : (
            <>
              <Link href="/login" className="hidden h-11 items-center rounded-full bg-stone px-5 text-[15px] font-medium text-ink transition-colors hover:bg-[#e2d9cc] sm:inline-flex">Войти</Link>
              <Link href="/register" className="hidden h-11 items-center rounded-full bg-ink px-5 text-[15px] font-medium text-milk transition-colors hover:bg-black md:inline-flex">Попробовать бесплатно</Link>
            </>
          )}
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-stone text-ink transition-colors hover:bg-[#e2d9cc] lg:hidden">
            <Icon name={open ? 'x' : 'list'} size={19} />
          </button>
        </div>
      </div>
      {open && (
        <div id="mobile-nav" className="fade-in border-t border-line bg-canvas lg:hidden">
          <nav aria-label="Разделы" className={cx(wrap, 'flex flex-col py-3')}>
            {LINKS.map(([t, h]) => <a key={h} href={h} onClick={() => setOpen(false)} className="flex h-12 items-center justify-between border-b border-line text-[17px] font-medium">{t}<Icon name="arrow-right" size={16} className="text-muted" /></a>)}
            {signedIn ? (
              <div className="pb-3 pt-5"><Link href="/dashboard" className="flex h-12 items-center justify-center rounded-full bg-ink text-[15px] font-medium text-milk">Личный кабинет</Link></div>
            ) : (
              <div className="grid gap-2.5 pb-3 pt-5">
                <Link href="/register" className="flex h-12 items-center justify-center rounded-full bg-accent-600 text-[15px] font-semibold text-white">Попробовать бесплатно</Link>
                <Link href="/login" className="flex h-12 items-center justify-center rounded-full bg-stone text-[15px] font-medium">Войти</Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
