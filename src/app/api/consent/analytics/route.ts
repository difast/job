import { cookies } from 'next/headers';
import { z } from 'zod';
import { handler, json } from '@/lib/http';
import { CONSENT_COOKIE, VISITOR_COOKIE, forgetVisitor } from '@/lib/marketing/track';

const schema = z.object({ accept: z.boolean() });

// Решение пользователя об аналитических cookie (учёт рекламных переходов).
// Отказ: cookie посетителя удаляется, его визиты обезличиваются, атрибуция снимается.
export const POST = handler(async (req: Request) => {
  const { accept } = schema.parse(await req.json().catch(() => ({})));
  const jar = await cookies();
  const secure = process.env.NODE_ENV === 'production';
  jar.set(CONSENT_COOKIE, accept ? '1' : '0', { httpOnly: false, sameSite: 'lax', secure, path: '/', maxAge: 365 * 24 * 3600 });
  if (!accept) {
    await forgetVisitor(jar.get(VISITOR_COOKIE)?.value);
    jar.delete(VISITOR_COOKIE);
    jar.delete('cl_mk');
  }
  return json({ ok: true, accept });
});
