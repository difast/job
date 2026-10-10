import { z } from 'zod';
import { db } from '@/lib/db';
import { requireApiUser } from '@/lib/auth';
import { handler, json } from '@/lib/http';
import { PARTNER } from '@/lib/partners/config';
import { track } from '@/lib/partners/events';
import { allow } from '@/lib/partners/ratelimit';

// Клиентские события воронки «Перейти в JobToo»
const schema = z.object({
  event: z.enum(['button_shown', 'button_clicked', 'consent_shown', 'consent_declined', 'redirect_opened']),
  placement: z.string().max(40).optional().nullable(),
  requestId: z.string().max(64).optional().nullable(),
});

export const POST = handler(async (req: Request) => {
  const user = await requireApiUser();
  const e = schema.parse(await req.json().catch(() => ({})));
  if (!allow(`track:${user.id}`, 60)) return json({ ok: true });
  // redirect_opened принимаем только для своей успешной передачи
  if (e.event === 'redirect_opened') {
    const h = e.requestId ? await db.partnerHandoff.findUnique({ where: { partner_direction_requestId: { partner: PARTNER, direction: 'out', requestId: e.requestId } } }) : null;
    if (!h || h.userId !== user.id || h.status !== 'ok') return json({ ok: true });
  }
  await track({ direction: 'out', event: e.event, userId: user.id, placement: e.placement, platform: 'web', requestId: e.event === 'redirect_opened' ? e.requestId : null });
  return json({ ok: true });
});
