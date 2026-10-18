import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';
import { hashReturnKey } from '@/lib/billing/service';
import { allow } from '@/lib/partners/ratelimit';

const schema = z.object({ order: z.string().regex(/^[a-z0-9]{20,40}$/), r: z.string().regex(/^[\w-]{20,64}$/) });

/**
 * Возврат с платёжной страницы в другом браузере (банковское приложение открыло Safari): одноразовый ключ из ссылки
 * возврата (в базе — sha256, 24 часа, один раз) восстанавливает вход владельца заказа.
 */
export const POST = handler(async (req: Request) => {
  if (!allow('billing-resume', 30, 60_000)) throw new ApiError(429, 'Слишком много попыток. Подождите минуту.');
  const { order, r } = schema.parse(await req.json().catch(() => ({})));
  const p = await db.payment.findUnique({ where: { id: order }, select: { id: true, userId: true, returnKeyHash: true, returnKeyUntil: true, user: { select: { pdConsentAt: true } } } });
  if (!p || !p.returnKeyHash || !p.returnKeyUntil || p.returnKeyUntil < new Date() || p.returnKeyHash !== hashReturnKey(r) || !p.user.pdConsentAt) throw new ApiError(403, 'Ссылка устарела. Войдите, чтобы увидеть результат оплаты.');
  const used = await db.payment.updateMany({ where: { id: p.id, returnKeyHash: p.returnKeyHash }, data: { returnKeyHash: null, returnKeyUntil: null } });
  if (!used.count) throw new ApiError(403, 'Ссылка уже использована. Войдите, чтобы увидеть результат оплаты.');
  await createSession(p.userId);
  return json({ ok: true });
});
