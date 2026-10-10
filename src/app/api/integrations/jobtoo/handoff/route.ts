import { z } from 'zod';
import { requireApiUser } from '@/lib/auth';
import { handler, json } from '@/lib/http';
import { sendToJobToo } from '@/lib/partners/outbound';
import { JOBTOO_PLACEMENTS } from '@/lib/partners/shared';

export const maxDuration = 30;
const schema = z.object({ placement: z.enum(JOBTOO_PLACEMENTS), vacancyId: z.string().max(40).optional().nullable() });

// «Перейти в JobToo»: сервер передаёт данные и возвращает одноразовую ссылку
export const POST = handler(async (req: Request) => {
  const user = await requireApiUser();
  const { placement, vacancyId } = schema.parse(await req.json().catch(() => ({})));
  return json(await sendToJobToo(user, { placement, vacancyId, platform: 'web' }));
});
