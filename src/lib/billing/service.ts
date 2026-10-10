import { db } from '../db';
import { ApiError } from '../http';
import { extendUntil, getPlan } from './plans';
import { getProvider, type PaymentStatus } from './provider';
import { BRAND } from '../brand';

/** Создаёт платёж у провайдера и возвращает ссылку, куда отправить пользователя. */
export async function createCheckout(user: { id: string; email: string }, planId: string, origin: string) {
  const plan = getPlan(planId);
  if (!plan || plan.price <= 0) throw new ApiError(400, 'Тариф недоступен для оплаты');
  const provider = getProvider();
  const payment = await db.payment.create({ data: { userId: user.id, provider: provider.name, planId: plan.id, amount: plan.price, status: 'pending' } });
  try {
    const res = await provider.createPayment({
      paymentId: payment.id, amount: plan.price, description: plan.name.startsWith(BRAND.name) ? plan.name : `${BRAND.name}: ${plan.name}`,
      returnUrl: `${origin}/billing?payment=${payment.id}`, customerEmail: user.email,
    });
    await db.payment.update({ where: { id: payment.id }, data: { providerPaymentId: res.providerPaymentId, confirmationUrl: res.confirmationUrl, status: res.status } });
    return { paymentId: payment.id, confirmationUrl: res.confirmationUrl };
  } catch (e) {
    await db.payment.update({ where: { id: payment.id }, data: { status: 'canceled' } });
    console.error('[billing] create payment failed', e);
    throw new ApiError(502, 'Платёжный сервис временно недоступен. Попробуйте позже.');
  }
}

/** Применяет новый статус платежа. Идемпотентно: Pro продлевается ровно один раз — при переходе pending → succeeded. */
export async function applyStatus(paymentId: string, status: PaymentStatus) {
  if (status === 'pending') return;
  const moved = await db.payment.updateMany({ where: { id: paymentId, status: 'pending' }, data: { status } });
  if (!moved.count || status !== 'succeeded') return;
  const p = await db.payment.findUnique({ where: { id: paymentId }, include: { user: true } });
  const plan = p && getPlan(p.planId);
  if (!p || !plan || plan.months <= 0) return;
  await db.user.update({ where: { id: p.userId }, data: { plan: 'pro', planUntil: extendUntil(p.user.planUntil, plan.months) } });
}

/** Сверяет незавершённый платёж с провайдером (когда пользователь вернулся раньше уведомления). */
export async function syncPayment(paymentId: string) {
  const p = await db.payment.findUnique({ where: { id: paymentId } });
  if (!p || p.status !== 'pending' || !p.providerPaymentId || p.provider !== getProvider().name || p.provider === 'stub') return;
  try { await applyStatus(p.id, await getProvider().getStatus(p.providerPaymentId)); } catch (e) { console.warn('[billing] sync failed', e); }
}
