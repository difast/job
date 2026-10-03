import { z } from 'zod';
import { requireApiUser } from '@/lib/auth';
import { handler, json } from '@/lib/http';
import { createCheckout } from '@/lib/billing/service';

const schema = z.object({ planId: z.string().min(1) });

/** Адрес сайта для return_url: APP_URL или заголовки прокси (Timeweb проксирует через HTTPS). */
function originOf(req: Request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const h = req.headers;
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '');
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

export const POST = handler(async (req: Request) => {
  const user = await requireApiUser();
  const { planId } = schema.parse(await req.json().catch(() => ({})));
  return json(await createCheckout(user, planId, originOf(req)));
});
