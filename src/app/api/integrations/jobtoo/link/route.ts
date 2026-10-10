import { cookies } from 'next/headers';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireApiUser } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';
import { LINK_COOKIE, PARTNER } from '@/lib/partners/config';
import { consumeCode, peekCode } from '@/lib/partners/codes';
import { applyImport, parseImport } from '@/lib/partners/imports';
import { enqueuePartnerEvent, flushOutbox, track } from '@/lib/partners/events';

export const maxDuration = 60;
const schema = z.object({ action: z.enum(['link', 'decline']) });

// Завершение привязки: пользователь вошёл в свой аккаунт Clymly и подтвердил связь с JobToo
export const POST = handler(async (req: Request) => {
  const user = await requireApiUser();
  const { action } = schema.parse(await req.json().catch(() => ({})));
  const jar = await cookies();
  const ticketValue = jar.get(LINK_COOKIE)?.value;
  const ticket = await peekCode(ticketValue, 'link_ticket');
  const imp = ticket?.importId ? await db.partnerImport.findUnique({ where: { id: ticket.importId } }) : null;
  if (!ticket || !imp) { jar.delete(LINK_COOKIE); throw new ApiError(410, 'Ссылка из JobToo устарела. Вернитесь в JobToo и нажмите «Перейти в Clymly» ещё раз.'); }

  if (action === 'decline') {
    await consumeCode(ticketValue, 'link_ticket');
    jar.delete(LINK_COOKIE);
    await db.partnerImport.deleteMany({ where: { id: imp.id } });
    await track({ direction: 'in', event: 'link_declined', requestId: ticket.requestId, userId: user.id });
    return json({ ok: true, landing: '/dashboard' });
  }

  const data = parseImport(imp.payload);
  const externalUserId = data.externalUserId;
  // Защита от навязанной привязки: только аккаунт с той же почтой и только если JobToo подтвердил владение ею.
  // Билет при отказе не гасится — можно выйти и войти в нужный аккаунт.
  if (data.email.toLowerCase() !== user.email.toLowerCase()) {
    await track({ direction: 'in', event: 'link_rejected', requestId: ticket.requestId, userId: user.id, errorCode: 'email_mismatch' });
    throw new ApiError(403, 'Почта этого аккаунта Clymly не совпадает с почтой в JobToo. Войдите в аккаунт Clymly с той же почтой, что и в JobToo.');
  }
  if (!data.emailVerified) {
    await track({ direction: 'in', event: 'link_rejected', requestId: ticket.requestId, userId: user.id, errorCode: 'email_unverified' });
    throw new ApiError(403, 'Почта в JobToo не подтверждена. Подтвердите её в JobToo и повторите переход.');
  }
  const busy = await db.partnerLink.findUnique({ where: { partner_externalUserId: { partner: PARTNER, externalUserId } } });
  if (busy && busy.userId !== user.id) throw new ApiError(409, 'Этот аккаунт JobToo уже связан с другим аккаунтом Clymly.');
  const mine = await db.partnerLink.findUnique({ where: { partner_userId: { partner: PARTNER, userId: user.id } } });
  if (mine && mine.externalUserId !== externalUserId) throw new ApiError(409, 'Ваш аккаунт Clymly уже связан с другим аккаунтом JobToo. Отвяжите его в настройках и повторите.');

  const r = await consumeCode(ticketValue, 'link_ticket');
  jar.delete(LINK_COOKIE);
  if (!r.ok) throw new ApiError(410, 'Ссылка из JobToo устарела. Вернитесь в JobToo и нажмите «Перейти в Clymly» ещё раз.');
  if (!mine) await db.partnerLink.create({ data: { partner: PARTNER, userId: user.id, externalUserId, lastInboundRequestId: ticket.requestId } });
  else await db.partnerLink.update({ where: { id: mine.id }, data: { lastInboundRequestId: ticket.requestId } });
  await db.partnerHandoff.updateMany({ where: { partner: PARTNER, direction: 'in', requestId: ticket.requestId }, data: { userId: user.id } });
  await track({ direction: 'in', event: 'account_linked', requestId: ticket.requestId, userId: user.id, partnerUserId: externalUserId });
  await enqueuePartnerEvent('account_linked', ticket.requestId, externalUserId);
  await enqueuePartnerEvent('login_completed', ticket.requestId, externalUserId);
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
