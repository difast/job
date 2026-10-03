import { z } from 'zod';
import { db } from '@/lib/db';
import { requireApiUser } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';
import { LEVELS } from '@/lib/types';
import { analyzeResume } from '@/lib/ai';
import { getProfessionContext } from '@/lib/profession';
import { latestResume } from '@/lib/context';

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
  // Профессия — основа продукта: при смене цели оценка резюме пересчитывается под неё
  const goalChanged = (data.professionId && data.professionId !== user.professionId) || (data.level && data.level !== user.level);
  if (goalChanged && updated.professionId && updated.level) {
    try {
      const resume = await latestResume(user.id);
      const ctx = resume && (await getProfessionContext(updated.professionId, updated.level as 'junior'));
      if (resume && ctx) {
        const analysis = await analyzeResume(resume.text, ctx);
        await db.resume.update({ where: { id: resume.id }, data: { analysis: JSON.stringify(analysis), professionId: ctx.id, level: ctx.level, analyzedAt: new Date() } });
      }
    } catch (e) { console.warn('[profile] resume re-analysis failed', e); }
  }
  return json({ ok: true, professionId: updated.professionId, level: updated.level, name: updated.name });
});
