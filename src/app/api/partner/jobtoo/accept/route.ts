import { cookies } from 'next/headers';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';
import { LINK_COOKIE, LINK_TICKET_TTL_MS } from '@/lib/partners/config';
import { acceptInbound } from '@/lib/partners/inbound';
import { clearStart, readStart } from '@/lib/partners/start-cookie';
import { allow } from '@/lib/partners/ratelimit';
import { sha256Hex } from '@/lib/partners/signing';
import { track } from '@/lib/partners/events';

export const maxDuration = 60;
const schema = z.object({ consent: z.literal(true, { message: 'Нужно согласие с условиями Clymly' }) });

// Человек принял условия Clymly на странице приёма → забираем данные у JobToo и входим
export const POST = handler(async (req: Request) => {
  schema.parse(await req.json().catch(() => ({})));
  const start = await readStart();
  if (!start) throw new ApiError(410, 'Ссылка из JobToo устарела. Вернитесь в JobToo и нажмите «Перейти в Clymly» ещё раз.');
  if (!allow(`accept:${sha256Hex(start.code)}`, 5)) throw new ApiError(429, 'Слишком много попыток. Подождите минуту.');
  await track({ direction: 'in', event: 'inbound_consent_accepted', placement: start.placement });
  let r;
  try { r = await acceptInbound(start.code, { placement: start.placement }); }
  catch (e) {
    // код гасится первым успешным запросом у JobToo — при отказе (410) он уже бесполезен
    if (e instanceof ApiError && [410, 422, 415, 413].includes(e.status)) await clearStart();
    throw e;
  }
  await clearStart();
  if (r.kind === 'link') {
    (await cookies()).set(LINK_COOKIE, r.ticket, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: LINK_TICKET_TTL_MS / 1000 });
    return json({ ok: true, landing: '/link/jobtoo' });
  }
  await createSession(r.userId);
  const user = await db.user.findUnique({ where: { id: r.userId } });
  if (!user?.professionId || !user.level) return json({ ok: true, landing: '/onboarding' });
  return json({ ok: true, landing: r.landing === '/onboarding' ? '/dashboard' : r.landing });
});
