import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import { GoalProvider } from '@/components/GoalContext';
import { ToastProvider } from '@/components/Toast';
import { ConfirmProvider } from '@/components/Confirm';
import { requirePageUser } from '@/lib/auth';
import type { LevelKey } from '@/lib/types';
import { currentTier } from '@/lib/billing/plans';

export const metadata: Metadata = { title: 'Личный кабинет', robots: { index: false, follow: false } };

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const level = user.level as LevelKey;
  return (
    <ToastProvider>
    <ConfirmProvider>
    <GoalProvider goal={{ professionId: user.professionId!, professionName: user.profession!.name, level }}>
      <AppShell user={{ name: user.name, email: user.email }} professionName={user.profession!.name} level={level} tier={currentTier(user).tier}>{children}</AppShell>
    </GoalProvider>
    </ConfirmProvider>
    </ToastProvider>
  );
}
