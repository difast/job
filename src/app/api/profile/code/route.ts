import { z } from 'zod';
import { requireApiUser } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';
import { mailEnabled } from '@/lib/mail';
import { issueCode } from '@/lib/email-code';
import { CODE_TTL_MIN } from '@/lib/emails';

const schema = z.object({ purpose: z.enum(['password', 'delete']) });

/** Отправляет на почту пользователя код для смены пароля или удаления аккаунта. */
export const POST = handler(async (req: Request) => {
  const user = await requireApiUser();
  const { purpose } = schema.parse(await req.json().catch(() => ({})));
  if (!mailEnabled()) throw new ApiError(503, 'Отправка писем временно недоступна.');
  await issueCode(user, purpose);
  return json({ ok: true, ttlMin: CODE_TTL_MIN });
});
