import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword, requireApiUser, verifyPassword } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';

const schema = z.object({ current: z.string().max(200).optional(), password: z.string().min(8, 'Пароль — минимум 8 символов').max(200) });

// Задать пароль (аккаунт создан через JobToo) или сменить его
export const POST = handler(async (req: Request) => {
  const user = await requireApiUser();
  const { current, password } = schema.parse(await req.json().catch(() => ({})));
  if (user.hasPassword && !(current && (await verifyPassword(current, user.passwordHash)))) throw new ApiError(400, 'Текущий пароль указан неверно');
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), hasPassword: true } });
  return json({ ok: true });
});
