import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/admin/auth';
import AdminTabs from '@/components/admin/AdminTabs';

export const metadata: Metadata = { title: 'Админка', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

// Админка: проверка прав на сервере (каждая страница и API проверяют права ещё раз сами).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return (
    <>
      <div className="mb-2 text-[13px] font-medium text-accent-600">Админка Clymly</div>
      <AdminTabs />
      {children}
    </>
  );
}
