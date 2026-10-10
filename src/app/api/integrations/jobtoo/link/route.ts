import { cookies } from 'next/headers';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireApiUser } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';
import { LINK_COOKIE, PARTNER } from '@/lib/partners/config';
import { consumeCode } from '@/lib/partners/codes';
import { applyImport, parseImport } from '@/lib/partners/imports';
import { enqueuePartnerEvent, flushOutbox, track } from '@/lib/partners/events';

export const maxDuration = 60;
const schema = z.object({ action: z.enum(['link', 'decline']) });

// Завершение привязки: пользователь вошёл в свой аккаунт Clymly и подтвердил связь с JobToo
export const POST = handler(async (req: Request) => {
  const user = await requireApiUser();
  const { action } = schema.parse(await req.json().catch(() => ({})));
  const jar = await cookies();
  const r = await consumeCode(jar.get(LINK_COOKIE)?.value, 'link_ticket');
  jar.delete(LINK_COOKIE);
  if (!r.ok) throw new ApiError(410, 'Ссылка из JobToo устарела. Вернитесь в JobToo и нажмите «Перейти в Clymly» ещё раз.');
  const imp = r.code.importId ? await db.partnerImport.findUnique({ where: { id: r.code.importId } }) : null;
  if (action === 'decline') {
    if (imp) await db.partnerImport.delete({ where: { id: imp.id } });
    await track({ direction: 'in', event: 'link_declined', requestId: r.code.requestId, userId: user.id });
    return json({ ok: true, landing: '/dashboard' });
  }
  if (!imp) throw new ApiError(410, 'Данные из JobToo уже недоступны. Повторите переход из JobToo.');
  const externalUserId = parseImport(imp.payload).externalUserId;
  const busy = await db.partnerLink.findUnique({ where: { partner_externalUserId: { partner: PARTNER, externalUserId } } });
  if (busy && busy.userId !== user.id) throw new ApiError(409, 'Этот аккаунт JobToo уже связан с другим аккаунтом Clymly.');
  const mine = await db.partnerLink.findUnique({ where: { partner_userId: { partner: PARTNER, userId: user.id } } });
  if (mine && mine.externalUserId !== externalUserId) throw new ApiError(409, 'Ваш аккаунт Clymly уже связан с другим аккаунтом JobToo. Отвяжите его в настройках и повторите.');
  if (!mine) await db.partnerLink.create({ data: { partner: PARTNER, userId: user.id, externalUserId, lastInboundRequestId: r.code.requestId } });
  else await db.partnerLink.update({ where: { id: mine.id }, data: { lastInboundRequestId: r.code.requestId } });
  await db.partnerHandoff.updateMany({ where: { partner: PARTNER, direction: 'in', requestId: r.code.requestId }, data: { userId: user.id } });
  await track({ direction: 'in', event: 'account_linked', requestId: r.code.requestId, userId: user.id, partnerUserId: externalUserId });
  await enqueuePartnerEvent('account_linked', r.code.requestId, externalUserId);
  await enqueuePartnerEvent('login_completed', r.code.requestId, externalUserId);
  void flushOutbox();
  const { landing } = await applyImport(imp.id, user.id);
  return json({ ok: true, landing });
});

// Отвязать аккаунт JobToo (из настроек)
export const DELETE = handler(async () => {
  const user = await requireApiUser();
  const r = await db.partnerLink.deleteMany({ where: { partner: PARTNER, userId: user.id } });
  if (r.count) await track({ direction: 'out', event: 'unlinked', userId: user.id, platform: 'web' });
  return json({ ok: true });
});
