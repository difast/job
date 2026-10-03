import { z } from 'zod';
import { db } from '@/lib/db';
import { requireApiUser } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';
import { applyStatus } from '@/lib/billing/service';
import { isTestMode } from '@/lib/billing/provider';

// Тестовая оплата: доступна только пока не подключена ЮKassa и только для своего платежа
export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  if (!isTestMode()) throw new ApiError(404, 'Не найдено');
  const user = await requireApiUser();
  const { id } = await params;
  const { action } = z.object({ action: z.enum(['succeed', 'cancel']) }).parse(await req.json().catch(() => ({})));
  const p = await db.payment.findFirst({ where: { id, userId: user.id, provider: 'stub' } });
  if (!p) throw new ApiError(404, 'Платёж не найден');
  if (p.status !== 'pending') throw new ApiError(409, 'Платёж уже завершён');
  await applyStatus(p.id, action === 'succeed' ? 'succeeded' : 'canceled');
  return json({ ok: true, redirect: `/billing?payment=${p.id}` });
});
