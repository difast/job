import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession, hashPassword } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';

const schema = z.object({
  name: z.string().trim().min(1, 'Введите имя').max(80),
  email: z.string().trim().toLowerCase().email('Некорректный e-mail'),
  password: z.string().min(8, 'Пароль — минимум 8 символов').max(200),
});

export const POST = handler(async (req: Request) => {
  const data = schema.parse(await req.json().catch(() => ({})));
  if (await db.user.findUnique({ where: { email: data.email } })) throw new ApiError(409, 'Пользователь с таким e-mail уже существует');
  const user = await db.user.create({ data: { name: data.name, email: data.email, passwordHash: await hashPassword(data.password) } });
  await createSession(user.id);
  return json({ ok: true });
});
