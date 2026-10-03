'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Icon, { type IconName } from './Icon';
import { useGoal } from './GoalContext';
import { Logo, LogoMark, cx, initials } from './ui';
import { LEVEL_SHORT, type LevelKey } from '@/lib/types';

const NAV: { href: string; label: string; short: string; icon: IconName }[] = [
  { href: '/dashboard', label: 'Главная', short: 'Главная', icon: 'home' },
  { href: '/resume', label: 'Моё резюме', short: 'Резюме', icon: 'file' },
  { href: '/vacancies', label: 'Вакансии', short: 'Вакансии', icon: 'briefcase' },
  { href: '/cover-letter', label: 'Сопроводительное письмо', short: 'Письмо', icon: 'mail' },
  { href: '/interview', label: 'Собеседование', short: 'Интервью', icon: 'mic' },
];

function useLogout() {
  const router = useRouter();
  return async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/'); router.refresh(); };
}

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return <span className="flex shrink-0 items-center justify-center rounded-full bg-accent-100 font-semibold text-accent-700" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials(name)}</span>;
}

/* ───────── Desktop: боковая панель ───────── */
function Sidebar({ user, professionName, level }: Props) {
  const path = usePathname();
  const { openGoal } = useGoal();
  const logout = useLogout();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] flex-col border-r border-line bg-white lg:flex">
      <div className="px-5 pb-4 pt-5"><Link href="/dashboard"><Logo /></Link></div>
      <nav className="flex-1 space-y-0.5 px-3" aria-label="Основное меню">
        {NAV.map((n) => {
          const active = path === n.href || path.startsWith(n.href + '/');
          return (
            <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined}
              className={cx('group flex h-10 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors', active ? 'bg-subtle font-medium text-ink' : 'text-ink-2 hover:bg-subtle/70 hover:text-ink')}>
              <Icon name={n.icon} size={18} className={active ? 'text-accent-600' : 'text-muted group-hover:text-ink-2'} />{n.label}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-2 border-t border-line p-3">
        <button type="button" onClick={openGoal} className="group w-full rounded-lg border border-line bg-canvas p-3 text-left transition-colors hover:border-line-strong hover:bg-white" aria-label="Изменить цель">
          <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted"><span>Ваша цель</span><Icon name="edit" size={13} className="opacity-0 transition-opacity group-hover:opacity-100" /></div>
          <div className="mt-1.5 flex items-center gap-2"><Icon name="target" size={16} className="shrink-0 text-accent-600" /><span className="truncate text-sm font-medium" data-testid="target-profession">{professionName}</span></div>
          <div className="mt-1 pl-6 text-[13px] text-ink-2" data-testid="target-level">{LEVEL_SHORT[level]}</div>
        </button>
        <div className="flex items-center gap-2.5 rounded-lg p-1.5">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1 leading-tight"><div className="truncate text-sm font-medium">{user.name}</div><div className="truncate text-xs text-muted">{user.email}</div></div>
          <Link href="/settings" aria-label="Настройки" title="Настройки" className={cx('flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-subtle', path.startsWith('/settings') ? 'text-accent-600' : 'text-muted hover:text-ink')}><Icon name="sliders" size={17} /></Link>
          <button onClick={logout} aria-label="Выйти" title="Выйти" className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-ink"><Icon name="logout" size={17} /></button>
        </div>
      </div>
    </aside>
  );
}

/* ───────── Mobile / tablet: верхняя панель + нижняя навигация ───────── */
function MobileBars({ user, professionName, level }: Props) {
  const path = usePathname();
  const { openGoal } = useGoal();
  const logout = useLogout();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setMenu(false); }, [path]);
  useEffect(() => {
    if (!menu) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menu]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2.5 border-b border-line bg-white/90 px-4 backdrop-blur-md sm:px-6 lg:hidden">
        <Link href="/dashboard" aria-label="Главная" className="shrink-0"><LogoMark size={28} /></Link>
        <button type="button" onClick={openGoal} aria-label="Изменить цель" className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-1.5 text-left transition-colors hover:border-line-strong">
          <Icon name="target" size={15} className="shrink-0 text-accent-600" />
          <span className="min-w-0 truncate text-[13px] font-medium"><span data-testid="target-profession-m">{professionName}</span><span className="font-normal text-muted"> · {LEVEL_SHORT[level]}</span></span>
          <Icon name="chevron-down" size={14} className="ml-auto shrink-0 text-muted" />
        </button>
        <div ref={ref} className="relative shrink-0">
          <button onClick={() => setMenu(!menu)} aria-label="Профиль" aria-expanded={menu} className="rounded-full"><Avatar name={user.name} size={34} /></button>
          {menu && (
            <div className="fade-in absolute right-0 top-11 w-60 rounded-xl border border-line bg-white p-1.5 shadow-pop">
              <div className="border-b border-line px-3 py-2.5"><div className="truncate text-sm font-medium">{user.name}</div><div className="truncate text-xs text-muted">{user.email}</div></div>
              <Link href="/settings" className="mt-1 flex h-10 items-center gap-2.5 rounded-lg px-3 text-sm hover:bg-subtle"><Icon name="sliders" size={16} className="text-muted" />Настройки</Link>
              <button onClick={logout} className="flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm hover:bg-subtle"><Icon name="logout" size={16} className="text-muted" />Выйти</button>
            </div>
          )}
        </div>
      </header>
      <nav aria-label="Основное меню" className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur-md lg:hidden">
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {NAV.map((n) => {
            const active = path === n.href || path.startsWith(n.href + '/');
            return (
              <li key={n.href}>
                <Link href={n.href} aria-current={active ? 'page' : undefined} aria-label={n.label} className={cx('flex h-[58px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors', active ? 'text-accent-600' : 'text-muted')}>
                  <Icon name={n.icon} size={21} strokeWidth={active ? 1.9 : 1.6} />{n.short}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

interface Props { user: { name: string; email: string }; professionName: string; level: LevelKey }

export default function AppShell({ children, ...p }: Props & { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="min-h-dvh lg:pl-[272px]">
      <Sidebar {...p} />
      <MobileBars {...p} />
      <main key={path} className="page-in mx-auto w-full max-w-[1040px] px-4 pb-28 pt-7 sm:px-8 sm:pt-9 lg:pb-16 lg:pt-12">{children}</main>
    </div>
  );
}
