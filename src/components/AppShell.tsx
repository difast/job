'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Icon, { type IconName } from './Icon';
import { useGoal } from './GoalContext';
import { Logo, LogoMark, cx, initials } from './ui';
import { LEVEL_SHORT, type LevelKey } from '@/lib/types';

// label — полное название, mid — для панели на средних экранах, short — для нижней мобильной навигации
const NAV: { href: string; label: string; mid: string; short: string; icon: IconName }[] = [
  { href: '/dashboard', label: 'Главная', mid: 'Главная', short: 'Главная', icon: 'home' },
  { href: '/resume', label: 'Моё резюме', mid: 'Моё резюме', short: 'Резюме', icon: 'file' },
  { href: '/vacancies', label: 'Вакансии', mid: 'Вакансии', short: 'Вакансии', icon: 'briefcase' },
  { href: '/cover-letter', label: 'Сопроводительное письмо', mid: 'Письмо', short: 'Письмо', icon: 'mail' },
  { href: '/interview', label: 'Собеседование', mid: 'Собеседование', short: 'Интервью', icon: 'mic' },
];

interface Props { user: { name: string; email: string }; professionName: string; level: LevelKey; tier: 'free' | 'pro' }

const isActive = (path: string, href: string) => path === href || path.startsWith(href + '/');

function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  return <span className="flex shrink-0 items-center justify-center rounded-full bg-accent-500 font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.36 }}>{initials(name)}</span>;
}

/** Цель (профессия и уровень) — всегда на виду и меняется в один клик. */
function GoalChip({ professionName, level, className }: { professionName: string; level: LevelKey; className?: string }) {
  const { openGoal } = useGoal();
  return (
    <button type="button" onClick={openGoal} aria-label={`Цель: ${professionName}, ${LEVEL_SHORT[level]}. Изменить`}
      className={cx('flex h-9 min-w-0 items-center gap-2 rounded-full border border-white/12 bg-white/[0.07] pl-3 pr-2.5 text-left text-[13px] text-milk transition-colors hover:bg-white/[0.13]', className)}>
      <Icon name="target" size={15} className="shrink-0 text-accent-300" />
      <span className="min-w-0 truncate font-medium" data-testid="target-profession">{professionName}</span><span className="shrink-0 text-milk/70"><span className="text-milk/45">· </span><span data-testid="target-level">{LEVEL_SHORT[level]}</span></span>
      <Icon name="chevron-down" size={14} className="ml-0.5 shrink-0 text-milk/50" />
    </button>
  );
}

function UserMenu({ user, tier }: Pick<Props, 'user' | 'tier'>) {
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', click); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', key); };
  }, [open]);
  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/'); router.refresh(); }
  const item = 'flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm text-ink transition-colors hover:bg-subtle';
  return (
    <div ref={ref} className="relative shrink-0">
      <button onClick={() => setOpen(!open)} aria-label="Профиль и настройки" aria-expanded={open} aria-haspopup="menu" className="flex items-center gap-2 rounded-full p-0.5 transition-opacity hover:opacity-90">
        <Avatar name={user.name} />
      </button>
      {open && (
        <div role="menu" className="fade-in absolute right-0 top-12 z-50 w-64 rounded-xl border border-line bg-white p-1.5 text-ink shadow-pop">
          <div className="px-3 pb-2.5 pt-2"><div className="truncate text-sm font-medium">{user.name}</div><div className="truncate text-xs text-muted">{user.email}</div></div>
          <div className="my-1 h-px bg-line" />
          <Link role="menuitem" href="/billing" className={item} data-testid="plan-link">
            <Icon name="shield" size={16} className="text-muted" /><span className="flex-1">Тариф: {tier === 'pro' ? 'Pro' : 'Бесплатный'}</span>
            {tier === 'free' && <span className="text-xs font-medium text-accent-600">Улучшить</span>}
          </Link>
          <Link role="menuitem" href="/settings" className={item}><Icon name="sliders" size={16} className="text-muted" />Настройки</Link>
          <div className="my-1 h-px bg-line" />
          <button role="menuitem" onClick={logout} className={item}><Icon name="logout" size={16} className="text-muted" />Выйти</button>
        </div>
      )}
    </div>
  );
}

export default function AppShell({ children, user, professionName, level, tier }: Props & { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="min-h-dvh">
      {/* Верхняя панель — графит, как первый экран лендинга */}
      <header className="sticky top-0 z-40 bg-graphite text-milk">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-3 px-4 sm:px-8 lg:h-16 lg:gap-6">
          <Link href="/dashboard" aria-label="Главная" className="shrink-0">
            <span className="lg:hidden"><LogoMark size={30} inverted /></span>
            <span className="hidden lg:block"><Logo inverted className="text-[16px] text-milk xl:text-[17px]" /></span>
          </Link>
          <nav aria-label="Основное меню" className="hidden h-full items-stretch lg:flex">
            {NAV.map((n) => {
              const active = isActive(path, n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined}
                  className={cx('relative flex items-center whitespace-nowrap px-3 text-[14.5px] transition-colors xl:px-3.5', active ? 'font-medium text-milk' : 'text-milk/60 hover:text-milk')}>
                  <span className="2xl:hidden">{n.mid}</span><span className="hidden 2xl:inline">{n.label}</span>
                  {active && <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-accent-300" />}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2.5 lg:flex-none">
            <GoalChip professionName={professionName} level={level} className="flex-1 lg:max-w-[320px] lg:flex-none" />
            <UserMenu user={user} tier={tier} />
          </div>
        </div>
      </header>

      <main key={path} className="page-in mx-auto w-full max-w-[1240px] px-4 pb-28 pt-7 sm:px-8 sm:pt-10 lg:pb-16">{children}</main>

      {/* Мобильная навигация */}
      <nav aria-label="Основное меню" data-testid="bottom-nav" className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-milk/95 backdrop-blur-md lg:hidden">
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {NAV.map((n) => {
            const active = isActive(path, n.href);
            return (
              <li key={n.href}>
                <Link href={n.href} aria-current={active ? 'page' : undefined} aria-label={n.label} className={cx('flex h-[58px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors', active ? 'text-accent-600' : 'text-muted hover:text-ink')}>
                  <Icon name={n.icon} size={21} strokeWidth={active ? 1.9 : 1.6} />{n.short}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
