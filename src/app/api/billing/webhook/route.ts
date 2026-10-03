import { db } from '@/lib/db';
import { applyStatus } from '@/lib/billing/service';
import { getProvider } from '@/lib/billing/provider';

/**
 * Уведомления ЮKassa (payment.succeeded / payment.canceled).
 * Телу уведомления не доверяем: статус всегда перепроверяется запросом к API ЮKassa.
 * URL для настройки в личном кабинете ЮKassa: https://<ваш-домен>/api/billing/webhook
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { event?: string; object?: { id?: string } } | null;
  const providerId = body?.object?.id;
  if (!providerId || typeof providerId !== 'string') return Response.json({ ok: false }, { status: 400 });

  const provider = getProvider();
  if (provider.name !== 'yookassa') return Response.json({ ok: true, ignored: 'test-mode' });

  const payment = await db.payment.findUnique({ where: { providerPaymentId: providerId } });
  if (!payment) return Response.json({ ok: true, ignored: 'unknown-payment' }); // 200, чтобы ЮKassa не повторяла
  try {
    await applyStatus(payment.id, await provider.getStatus(providerId));
  } catch (e) {
    console.error('[billing] webhook verify failed', e);
    return Response.json({ ok: false }, { status: 500 }); // ЮKassa повторит уведомление
  }
  return Response.json({ ok: true });
}
