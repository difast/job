import { requireApiUser } from '@/lib/auth';
import { handler, json } from '@/lib/http';
import { deleteCard } from '@/lib/billing/autopay';

export const POST = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser();
  return json({ ok: true, ...(await deleteCard(user.id, (await params).id)) });
});
