import { z } from 'zod';
import { db } from '@/lib/db';
import { requireApiUser } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';
import { applyChanges } from '@/lib/changes';
import { parseJson, type Change } from '@/lib/types';

const schema = z.union([
  z.object({ all: z.enum(['accepted', 'rejected', 'pending']) }),
  z.object({ changeId: z.string(), status: z.enum(['accepted', 'rejected', 'pending']).optional(), edited: z.string().max(5000).nullable().optional() }),
]);

// Принять / отклонить / отредактировать правку
export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser();
  const { id } = await params;
  const a = await db.adaptation.findFirst({ where: { id, vacancy: { userId: user.id } }, include: { resume: true } });
  if (!a) throw new ApiError(404, 'Адаптация не найдена');
  const body = schema.parse(await req.json().catch(() => ({})));
  const changes = parseJson<Change[]>(a.changes, []);
  if ('all' in body) changes.forEach((c) => (c.status = body.all));
  else {
    const c = changes.find((x) => x.id === body.changeId);
    if (!c) throw new ApiError(404, 'Правка не найдена');
    if (body.status) c.status = body.status;
    if (body.edited !== undefined) {
      if (body.edited === null || body.edited === c.adapted) delete c.edited;
      else { c.edited = body.edited; if (!body.status) c.status = 'accepted'; }
    }
  }
  await db.adaptation.update({ where: { id }, data: { changes: JSON.stringify(changes) } });
  return json({ changes, finalText: applyChanges(a.resume.text, changes) });
});
