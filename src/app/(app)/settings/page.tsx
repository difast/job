import { requirePageUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import SettingsClient from '@/components/SettingsClient';
import type { LevelKey } from '@/lib/types';

export default async function SettingsPage() {
  const user = await requirePageUser();
  return (
    <>
      <PageHeader title="Настройки" subtitle="Профиль и целевая профессия" />
      <SettingsClient name={user.name} email={user.email} professionName={user.profession!.name} level={user.level as LevelKey} />
    </>
  );
}
