import { requirePageUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import SettingsClient from '@/components/SettingsClient';
import type { LevelKey } from '@/lib/types';
import { currentTier } from '@/lib/billing/plans';

export default async function SettingsPage() {
  const user = await requirePageUser();
  return (
    <>
      <PageHeader title="Настройки" subtitle="Профиль и целевая профессия" />
      <SettingsClient name={user.name} email={user.email} professionName={user.profession!.name} level={user.level as LevelKey} tierLabel={(() => { const t = currentTier(user); return t.tier === 'pro' && t.until ? `Clymly Pro до ${t.until.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })}` : 'Free — все функции доступны'; })()} />
    </>
  );
}
