import AppShell from '@/components/AppShell';
import { requirePageUser } from '@/lib/auth';
import type { LevelKey } from '@/lib/types';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <AppShell userName={user.name} professionId={user.professionId!} professionName={user.profession!.name} level={user.level as LevelKey}>
      {children}
    </AppShell>
  );
}
