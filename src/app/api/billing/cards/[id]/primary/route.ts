import { requireApiUser } from '@/lib/auth';
import { handler, json } from '@/lib/http';
import { setPrimaryCard } from '@/lib/billing/autopay';

export const POST = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser();
  await setPrimaryCard(user.id, (await params).id);
  return json({ ok: true });
});
