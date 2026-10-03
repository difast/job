'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import TargetBar from './TargetBar';
import { cx } from './ui';
import type { LevelKey } from '@/lib/types';

const ICONS: Record<string, string> = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  doc: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
  brief: 'M3 8h18v12H3zM8 8V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3M3 13h18',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  chat: 'M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
};

const NAV = [
  { href: '/dashboard', label: 'Главная', icon: 'home' },
  { href: '/resume', label: 'Моё резюме', icon: 'doc' },
  { href: '/vacancies', label: 'Вакансии', icon: 'brief' },
  { href: '/cover-letter', label: 'Сопроводительное письмо', icon: 'mail' },
  { href: '/interview', label: 'Собеседование', icon: 'chat' },
  { href: '/settings', label: 'Настройки', icon: 'gear' },
];

export default function AppShell({ children, userName, professionId, professionName, level }: { children: React.ReactNode; userName: string; professionId: string; professionName: string; level: LevelKey }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen lg:pl-64">
      {open && <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={cx('fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-white transition-transform lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-600 font-bold text-white">К</div>
          <span className="font-semibold tracking-tight">Карьерный навигатор</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-3" aria-label="Основное меню">
          {NAV.map((n) => {
            const active = path === n.href || path.startsWith(n.href + '/');
            return (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} aria-current={active ? 'page' : undefined}
                className={cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition', active ? 'bg-accent-50 font-medium text-accent-700' : 'text-slate-600 hover:bg-slate-50 hover:text-ink')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[n.icon]} /></svg>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line px-5 py-4 text-sm">
          <div className="truncate font-medium">{userName}</div>
        </div>
      </aside>
      <TargetBar professionId={professionId} professionName={professionName} level={level} onMenu={() => setOpen(true)} />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-10">{children}</main>
    </div>
  );
}
