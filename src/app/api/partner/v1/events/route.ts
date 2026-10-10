import { z } from 'zod';
import { db } from '@/lib/db';
import { PARTNER, jobtoo } from '@/lib/partners/config';
import { verify } from '@/lib/partners/signing';
import { allow } from '@/lib/partners/ratelimit';
import { track } from '@/lib/partners/events';
import { PartnerError, errorResponse } from '@/lib/partners/inbound';

export const dynamic = 'force-dynamic';

// События от JobToo о наших переходах к ним: вход, привязка, первое целевое действие
const ALLOWED = ['login_completed', 'account_linked', 'first_action'] as const;
const schema = z.object({
  events: z.array(z.object({
    request_id: z.string().min(8).max(64), event: z.string().max(40), occurred_at: z.string().max(40).optional(), partner_user_id: z.string().max(100).optional().nullable(),
  })).min(1).max(100),
});

export async function POST(req: Request) {
  const rid = req.headers.get('x-request-id');
  if (!jobtoo.inboundReady()) return errorResponse(rid, new PartnerError('unavailable', 'Интеграция временно недоступна', 503, 300));
  const raw = Buffer.from(await req.arrayBuffer());
  if (raw.length > 200_000) return errorResponse(rid, new PartnerError('invalid_payload', 'Слишком большой запрос', 413));
  const v = verify(jobtoo.inboundSecret(), { partnerId: req.headers.get('x-partner-id'), requestId: rid, timestamp: req.headers.get('x-timestamp'), signature: req.headers.get('x-signature') }, PARTNER, raw);
  if (!v.ok) return errorResponse(rid, new PartnerError('invalid_signature', v.message, 401));
  if (!allow(`events:${PARTNER}`, 100)) return errorResponse(rid, new PartnerError('rate_limited', 'Слишком много запросов', 429, 30));
  let body: unknown;
  try { body = JSON.parse(raw.toString('utf8')); } catch { return errorResponse(rid, new PartnerError('invalid_payload', 'Некорректный JSON')); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return errorResponse(rid, new PartnerError('invalid_payload', 'Некорректный формат событий'));

  let accepted = 0;
  for (const e of parsed.data.events) {
    if (!(ALLOWED as readonly string[]).includes(e.event)) continue;
    // Событие должно относиться к нашему исходящему переходу
    const h = await db.partnerHandoff.findUnique({ where: { partner_direction_requestId: { partner: PARTNER, direction: 'out', requestId: e.request_id } } });
    if (!h) continue;
    const name = `partner_${e.event}`;
    if (await db.integrationEvent.findFirst({ where: { partner: PARTNER, direction: 'out', event: name, requestId: e.request_id } })) { accepted++; continue; }
    await track({ direction: 'out', event: name, requestId: e.request_id, userId: h.userId, partnerUserId: e.partner_user_id ?? h.externalUserId, placement: h.placement, platform: h.platform });
    accepted++;
  }
  return Response.json({ status: 'ok', request_id: v.requestId, accepted });
}
