import { z } from 'zod';
import { ApiError, handler, json } from '@/lib/http';
import { createSession } from '@/lib/auth';
import { allow } from '@/lib/partners/ratelimit';
import { resetPassword } from '@/lib/password-reset';

const schema = z.object({ token: z.string().min(1).max(200), password: z.string().min(8, 'Пароль — минимум 8 символов').max(200) });

/** Новый пароль по ссылке из письма. После смены — вход в аккаунт (прежние сеансы завершены). */
export const POST = handler(async (req: Request) => {
  if (!allow('reset-submit:all', 30, 60_000)) throw new ApiError(429, 'Слишком много попыток. Попробуйте позже.');
  const { token, password } = schema.parse(await req.json().catch(() => ({})));
  const r = await resetPassword(token, password);
  if (!r.ok) throw new ApiError(400, r.reason === 'expired' ? 'Ссылка устарела или уже использована. Запросите новую.' : 'Ссылка недействительна. Запросите новую.');
  await createSession(r.userId);
  return json({ ok: true });
});
