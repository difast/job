import { z } from 'zod';
import { requireApiUser } from '@/lib/auth';
import { handler, json } from '@/lib/http';
import { createCheckout } from '@/lib/billing/service';

// Клиент передаёт только id тарифа и способ оплаты; цена, срок и пользователь определяются на сервере
const schema = z.object({ planId: z.string().min(1).max(40), method: z.enum(['card', 'yoomoney']).default('card') });

/** Адрес сайта для return_url: APP_URL или заголовки прокси (Timeweb проксирует через HTTPS). */
function originOf(req: Request) {
  const base = process.env.APP_URL || process.env.FRONTEND_URL;
  if (base) return base.replace(/\/$/, '');
  const h = req.headers;
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '');
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

export const POST = handler(async (req: Request) => {
  const user = await requireApiUser();
  const { planId, method } = schema.parse(await req.json().catch(() => ({})));
  return json(await createCheckout(user, planId, originOf(req), method));
});
