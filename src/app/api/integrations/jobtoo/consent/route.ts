import { db } from '@/lib/db';
import { requireApiUser } from '@/lib/auth';
import { handler, json } from '@/lib/http';
import { JOBTOO_CONSENT_VERSION, PARTNER } from '@/lib/partners/config';
import { track } from '@/lib/partners/events';

// Согласие на передачу данных в JobToo: дать (POST) и отозвать (DELETE)
export const POST = handler(async (req: Request) => {
  const user = await requireApiUser();
  const { placement } = (await req.json().catch(() => ({}))) as { placement?: string };
  await db.partnerConsent.create({ data: { partner: PARTNER, userId: user.id, version: JOBTOO_CONSENT_VERSION } });
  await track({ direction: 'out', event: 'consent_accepted', userId: user.id, placement: typeof placement === 'string' ? placement : null, platform: 'web' });
  return json({ ok: true, version: JOBTOO_CONSENT_VERSION });
});

export const DELETE = handler(async () => {
  const user = await requireApiUser();
  const r = await db.partnerConsent.updateMany({ where: { userId: user.id, partner: PARTNER, revokedAt: null }, data: { revokedAt: new Date() } });
  if (r.count) await track({ direction: 'out', event: 'consent_revoked', userId: user.id, platform: 'web' });
  return json({ ok: true });
});
