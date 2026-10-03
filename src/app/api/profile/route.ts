import { z } from 'zod';
import { db } from '@/lib/db';
import { requireApiUser } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';
import { LEVELS } from '@/lib/types';

const schema = z.object({
  professionId: z.string().min(1).optional(),
  level: z.enum(LEVELS as [string, ...string[]]).optional(),
  name: z.string().trim().min(1).max(80).optional(),
});

export const PATCH = handler(async (req: Request) => {
  const user = await requireApiUser();
  const data = schema.parse(await req.json().catch(() => ({})));
  if (data.professionId && !(await db.profession.findFirst({ where: { id: data.professionId, active: true } }))) throw new ApiError(404, 'Профессия не найдена');
  const updated = await db.user.update({ where: { id: user.id }, data });
  return json({ ok: true, professionId: updated.professionId, level: updated.level, name: updated.name });
});
