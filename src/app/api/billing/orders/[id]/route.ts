import { db } from '@/lib/db';
import { requireApiUser } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';
import { orderState, syncPayment } from '@/lib/billing/service';

// Статус своего заказа; незавершённый сверяется с ЮKassa (Pro включится даже без уведомления)
export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser();
  const { id } = await params;
  const before = await db.payment.findFirst({ where: { id, userId: user.id }, select: { status: true } });
  if (!before) throw new ApiError(404, 'Заказ не найден');
  if (before.status === 'pending') await syncPayment(id);
  const p = await db.payment.findUniqueOrThrow({ where: { id }, select: { status: true, issue: true, kind: true, accessUntil: true } });
  return json({ status: p.status, state: orderState(p), kind: p.kind, accessUntil: p.accessUntil });
});
