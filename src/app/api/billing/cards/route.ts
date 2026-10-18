import { requireApiUser } from '@/lib/auth';
import { handler, json } from '@/lib/http';
import { bindCard } from '@/lib/billing/autopay';

function originOf(req: Request) {
  const base = process.env.APP_URL || process.env.FRONTEND_URL;
  if (base) return base.replace(/\/$/, '');
  const h = req.headers;
  const host = h.get('x-forwarded-host') ?? h.get('host');
  return host ? `${h.get('x-forwarded-proto') ?? 'https'}://${host}` : new URL(req.url).origin;
}

// Привязать карту для автопродления: проверочный платёж 1 ₽ (сразу отменяется)
export const POST = handler(async (req: Request) => {
  const user = await requireApiUser();
  return json(await bindCard(user, originOf(req)));
});
