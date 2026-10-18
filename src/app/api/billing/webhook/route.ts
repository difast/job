import { processYkPayment, processYkRefund } from '@/lib/billing/autopay';
import { YkError, getYkPayment, getYkRefund, ykConfig, ykIpAllowed, ykReady } from '@/lib/billing/yookassa';

/**
 * Уведомления ЮKassa: payment.succeeded, payment.waiting_for_capture, payment.canceled, refund.succeeded.
 * Из тела берём только id объекта — состояние всегда запрашиваем у API ЮKassa и сверяем заказ, сумму и валюту.
 * Адрес для кабинета ЮKassa: https://<домен>/api/billing/yookassa (или прежний /api/billing/webhook).
 * Ответ 200 — всегда, кроме временной ошибки: тогда 500, и ЮKassa повторит уведомление.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { event?: string; object?: { id?: string } } | null;
  const id = body?.object?.id;
  if (!id || typeof id !== 'string') return Response.json({ ok: false }, { status: 400 });
  if (!ykReady()) return Response.json({ ok: true, ignored: 'test-mode' });
  if (!/^[\w-]{10,64}$/.test(id)) return Response.json({ ok: false }, { status: 400 });
  const cfg = ykConfig();
  if (cfg.ok && cfg.config.ipCheck) {
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0] || req.headers.get('x-real-ip') || '';
    if (!ykIpAllowed(ip)) { console.warn('[billing] уведомление ЮKassa с чужого адреса отклонено'); return Response.json({ ok: false }, { status: 403 }); }
  }
  try {
    if (body?.event?.startsWith('refund.')) await processYkRefund(await getYkRefund(id), 'notification');
    else await processYkPayment(await getYkPayment(id), 'notification');
  } catch (e) {
    // ЮKassa не знает такой объект — это не наш платёж, повторять уведомление незачем
    if (e instanceof YkError && e.status === 404) return Response.json({ ok: true, ignored: 'unknown' });
    console.error(`[billing] уведомление ЮKassa ${body?.event ?? ''}: ${(e as Error).message}`);
    return Response.json({ ok: false }, { status: 500 });
  }
  return Response.json({ ok: true });
}
