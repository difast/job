import { z } from 'zod';
import { after } from 'next/server';
import { ApiError, handler, json } from '@/lib/http';
import { mailEnabled } from '@/lib/mail';
import { COMPANY } from '@/lib/legal';
import { allow } from '@/lib/partners/ratelimit';
import { requestReset } from '@/lib/password-reset';

const schema = z.object({ email: z.string().trim().toLowerCase().email('Некорректный e-mail').max(200) });

/** Запрос ссылки для смены пароля. Ответ не раскрывает, есть ли аккаунт с таким адресом. */
export const POST = handler(async (req: Request) => {
  const { email } = schema.parse(await req.json().catch(() => ({})));
  if (!mailEnabled()) throw new ApiError(503, `Восстановление пароля по почте временно недоступно. Напишите нам на ${COMPANY.email}.`);
  if (!allow(`reset:${email}`, 3, 60 * 60_000) || !allow('reset:all', 60, 60_000)) throw new ApiError(429, 'Слишком много запросов. Попробуйте через час.');
  after(() => requestReset(email).catch((e) => console.error('[auth] reset request failed', (e as Error).message)));
  return json({ ok: true });
});
