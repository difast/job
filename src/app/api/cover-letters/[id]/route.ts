import { z } from 'zod';
import { db } from '@/lib/db';
import { requireApiUser } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';
import { requirePro } from '@/lib/billing/entitlements';

export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser();
  requirePro(user, 'letter');
  const { id } = await params;
  const { text } = z.object({ text: z.string().trim().min(1).max(8000) }).parse(await req.json().catch(() => ({})));
  const r = await db.coverLetter.updateMany({ where: { id, vacancy: { userId: user.id } }, data: { text } });
  if (!r.count) throw new ApiError(404, 'Письмо не найдено');
  return json({ ok: true });
});
