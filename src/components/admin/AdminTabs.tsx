'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '../ui';

const TABS = [
  { href: '/admin', label: 'Обзор' },
  { href: '/admin/users', label: 'Пользователи' },
  { href: '/admin/payments', label: 'Платежи' },
  { href: '/admin/marketing', label: 'Маркетинг' },
  { href: '/admin/integrations', label: 'Интеграции' },
];

/** Вкладки админки. На узких экранах — горизонтальная прокрутка внутри панели, без переполнения страницы. */
export default function AdminTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Разделы админки" className="no-scrollbar -mx-4 mb-7 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {TABS.map((t) => {
          const active = t.href === '/admin' ? path === '/admin' : path === t.href || path.startsWith(t.href + '/');
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={active ? 'page' : undefined} data-testid={`admin-tab-${t.href.split('/')[2] ?? 'overview'}`}
                className={cx('relative flex h-11 items-center whitespace-nowrap px-3.5 text-sm transition-colors', active ? 'font-medium text-ink' : 'text-ink-2 hover:text-ink')}>
                {t.label}
                {active && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t bg-accent-600" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
