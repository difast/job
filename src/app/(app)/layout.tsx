import AppShell from '@/components/AppShell';
import { GoalProvider } from '@/components/GoalContext';
import { requirePageUser } from '@/lib/auth';
import type { LevelKey } from '@/lib/types';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const level = user.level as LevelKey;
  return (
    <GoalProvider goal={{ professionId: user.professionId!, professionName: user.profession!.name, level }}>
      <AppShell user={{ name: user.name, email: user.email }} professionName={user.profession!.name} level={level}>{children}</AppShell>
    </GoalProvider>
  );
}
