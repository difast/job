import { z } from 'zod';
import { db } from '@/lib/db';
import { SESSION_COOKIE, requireApiUser, verifyPassword } from '@/lib/auth';
import { cookies } from 'next/headers';
import { mailEnabled } from '@/lib/mail';
import { consumeCode } from '@/lib/email-code';
import { deleteAccount } from '@/lib/account-delete';
import { ApiError, handler, json } from '@/lib/http';
import { LEVELS } from '@/lib/types';
import { analyzeResume } from '@/lib/ai';
import { getProfessionContext } from '@/lib/profession';
import { latestResume } from '@/lib/context';
import { applyPendingImports } from '@/lib/partners/imports';

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
    } catch (e) { console.warn('[profile] resume re-analysis failed:', (e as Error).message); }
  }
  // Данные из JobToo, ожидавшие выбора профессии, применяются сразу после него
  let landing: string | null = null;
  if (updated.professionId && updated.level) landing = await applyPendingImports(user.id).catch(() => null);
  return json({ ok: true, professionId: updated.professionId, level: updated.level, name: updated.name, landing });
});

const delSchema = z.object({ code: z.string().max(20).optional(), password: z.string().max(200).optional() });

/** Удаление аккаунта: подтверждение кодом из письма (без почты — паролем). */
export const DELETE = handler(async (req: Request) => {
  const user = await requireApiUser();
  const { code, password } = delSchema.parse(await req.json().catch(() => ({})));
  if (mailEnabled()) await consumeCode(user, 'delete', code);
  else if (!(user.hasPassword && password && (await verifyPassword(password, user.passwordHash)))) throw new ApiError(400, user.hasPassword ? 'Пароль указан неверно' : 'Чтобы удалить аккаунт, напишите нам на support@clymly.ru');
  await deleteAccount(user.id);
  (await cookies()).delete(SESSION_COOKIE);
  return json({ ok: true });
});
