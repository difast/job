import { db } from '@/lib/db';
import { requireApiUser } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';

export const DELETE = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser();
  const { id } = await params;
  const r = await db.vacancy.deleteMany({ where: { id, userId: user.id } });
  if (!r.count) throw new ApiError(404, 'Вакансия не найдена');
  return json({ ok: true });
});
