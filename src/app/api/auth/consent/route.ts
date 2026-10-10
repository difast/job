import { z } from 'zod';
import { db } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';
import { LEGAL_EDITION } from '@/lib/legal';

const schema = z.object({ consent: z.literal(true, { message: 'Необходимо согласие на обработку персональных данных' }) });

// Согласие на обработку ПД для аккаунтов, созданных при переходе из JobToo
export const POST = handler(async (req: Request) => {
  const user = await getUser();
  if (!user) throw new ApiError(401, 'Необходима авторизация');
  schema.parse(await req.json().catch(() => ({})));
  if (!user.pdConsentAt) await db.user.update({ where: { id: user.id }, data: { pdConsentAt: new Date(), pdConsentVer: LEGAL_EDITION } });
  return json({ ok: true });
});
