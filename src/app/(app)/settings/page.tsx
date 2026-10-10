import { requirePageUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import SettingsClient from '@/components/SettingsClient';
import type { LevelKey } from '@/lib/types';
import { currentTier } from '@/lib/billing/plans';
import { db } from '@/lib/db';
import SettingsExtra from '@/components/SettingsExtra';
import { PARTNER, jobtoo } from '@/lib/partners/config';
import { activeConsent } from '@/lib/partners/outbound';
import { mailEnabled } from '@/lib/mail';

export default async function SettingsPage() {
  const user = await requirePageUser();
  const [link, consent, history] = await Promise.all([
    db.partnerLink.findUnique({ where: { partner_userId: { partner: PARTNER, userId: user.id } } }),
    activeConsent(user.id),
    db.partnerHandoff.findMany({ where: { partner: PARTNER, userId: user.id }, orderBy: { createdAt: 'desc' }, take: 10 }),
  ]);
  // Раздел интеграции показываем, если она включена или у пользователя уже есть связь / история
  const showIntegration = jobtoo.enabled() || !!link || history.length > 0;
  return (
    <>
      <PageHeader title="Настройки" subtitle="Профиль и целевая профессия" />
      <SettingsClient name={user.name} email={user.email} professionName={user.profession!.name} level={user.level as LevelKey} tierLabel={(() => { const t = currentTier(user); return t.tier === 'pro' && t.until ? `Clymly Pro до ${t.until.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })}` : 'Free — все функции доступны'; })()} />
      <SettingsExtra email={user.email} emailVerified={!!user.emailVerifiedAt} mailOn={mailEnabled()} hasPassword={user.hasPassword} integration={showIntegration ? {
        linkedAt: link?.linkedAt.toISOString() ?? null, consentAt: consent?.acceptedAt.toISOString() ?? null,
        history: history.map((h) => ({ id: h.id, date: h.createdAt.toISOString(), direction: h.direction as 'out' | 'in', status: h.status, fields: JSON.parse(h.fields) as string[] })),
      } : null} />
    </>
  );
}
