import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession, verifyPassword } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';
import { cookies } from 'next/headers';
import { VISITOR_COOKIE, linkVisitsOnLogin } from '@/lib/marketing/track';

const schema = z.object({ email: z.string().trim().toLowerCase().email('Некорректный e-mail'), password: z.string().min(1, 'Введите пароль') });

export const POST = handler(async (req: Request) => {
  const data = schema.parse(await req.json().catch(() => ({})));
  const user = await db.user.findUnique({ where: { email: data.email } });
  if (!user || !(await verifyPassword(data.password, user.passwordHash))) throw new ApiError(401, 'Неверный e-mail или пароль');
  await createSession(user.id);
  await linkVisitsOnLogin(user.id, (await cookies()).get(VISITOR_COOKIE)?.value);
  return json({ ok: true, onboarded: !!(user.professionId && user.level) });
});
