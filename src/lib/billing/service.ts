// Заказы и оплата Pro — общая логика для всех провайдеров (заглушка, ЮKassa, ЮMoney).
// Статусы разделены: статус платежа (Payment.status), состояние заказа (orderState) и доступ Pro (accessState).
import { Prisma } from '@prisma/client';
import { db } from '../db';
import { ApiError } from '../http';
import { extendUntil, getPlan } from './plans';
import { providerByName, providerForMethod, type PaymentMethod, type PaymentStatus } from './provider';
import { BRAND } from '../brand';

/** Незавершённый заказ того же тарифа тем же способом переиспользуется, а не создаётся заново. */
const REUSE_MS = 30 * 60_000;

type Tx = Prisma.TransactionClient;

export async function logEvent(paymentId: string, status: string, source: string, note?: string, tx: Tx | typeof db = db) {
  await tx.paymentEvent.create({ data: { paymentId, status, source, note: note?.slice(0, 300) } });
}

/** Создаёт заказ у провайдера и возвращает ссылку, куда отправить пользователя. Цена и срок — только с сервера. */
export async function createCheckout(user: { id: string; email: string }, planId: string, origin: string, method: PaymentMethod = 'card') {
  const plan = getPlan(planId);
  if (!plan || plan.price <= 0 || plan.months <= 0) throw new ApiError(400, 'Тариф недоступен для оплаты');
  const provider = providerForMethod(method);

  // Блокировка по пользователю: параллельные нажатия не создают два заказа
  const { payment, reused } = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'checkout:' + user.id}))`;
    const open = await tx.payment.findFirst({
      where: { userId: user.id, planId: plan.id, provider: provider.name, status: 'pending', issue: null, amount: plan.price, createdAt: { gte: new Date(Date.now() - REUSE_MS) }, OR: [{ confirmationUrl: { not: null } }, { createdAt: { gte: new Date(Date.now() - 60_000) } }] },
      orderBy: { createdAt: 'desc' },
    });
    if (open) return { payment: open, reused: true };
    const created = await tx.payment.create({ data: { userId: user.id, provider: provider.name, planId: plan.id, planName: plan.name, months: plan.months, amount: plan.price, currency: 'RUB', status: 'pending' } });
    await logEvent(created.id, 'pending', 'checkout', `${plan.id}, ${plan.price / 100} RUB`, tx);
    return { payment: created, reused: false };
  });
  if (reused) {
    // Заказ мог только что создаться параллельным запросом — дожидаемся ссылки на оплату от провайдера
    for (let i = 0; i < 50; i++) {
      const cur = i ? await db.payment.findUnique({ where: { id: payment.id } }) : payment;
      if (cur?.confirmationUrl && cur.status === 'pending') return { paymentId: cur.id, confirmationUrl: cur.confirmationUrl };
      if (!cur || cur.status !== 'pending') break;
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new ApiError(409, 'Платёж уже создаётся. Обновите страницу через несколько секунд.');
  }

  try {
    const res = await provider.createPayment({
      paymentId: payment.id, amount: plan.price, description: `${BRAND.name} ${plan.name}`,
      returnUrl: `${origin}/billing/result?order=${payment.id}`, customerEmail: user.email,
    });
    await db.payment.update({ where: { id: payment.id }, data: { providerPaymentId: res.providerPaymentId, confirmationUrl: res.confirmationUrl } });
    if (res.status !== 'pending') await applyStatus(payment.id, res.status, 'provider');
    return { paymentId: payment.id, confirmationUrl: res.confirmationUrl };
  } catch (e) {
    await db.payment.update({ where: { id: payment.id }, data: { status: 'canceled' } });
    await logEvent(payment.id, 'canceled', 'provider', 'не удалось создать платёж у провайдера');
    console.error(`[billing] create payment failed (${provider.name}, order ${payment.id}):`, e instanceof Error ? e.message.slice(0, 300) : e);
    throw new ApiError(502, 'Платёжный сервис временно недоступен. Попробуйте позже.');
  }
}

/**
 * Применяет подтверждённый статус. Идемпотентно: переход возможен только из pending, поэтому повторное
 * уведомление ничего не меняет, а Pro продлевается ровно один раз. Срок берётся из снимка заказа (months),
 * продление — от конца текущего периода Pro, если он не истёк.
 */
export async function applyStatus(paymentId: string, status: PaymentStatus, source = 'provider', note?: string): Promise<boolean> {
  if (status === 'pending') return false;
  const activated = await db.$transaction(async (tx) => {
    const p = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!p) return false;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${p.userId} FOR UPDATE`; // одна активация за раз на пользователя
    const now = new Date();
    const moved = await tx.payment.updateMany({ where: { id: paymentId, status: 'pending' }, data: { status, ...(status === 'succeeded' ? { paidAt: now } : {}) } });
    if (!moved.count) { await logEvent(paymentId, 'duplicate', source, `повторно: ${status}; текущий статус ${p.status}`, tx); return false; }
    await logEvent(paymentId, status, source, note, tx);
    if (status !== 'succeeded') return true;
    const months = p.months ?? getPlan(p.planId)?.months ?? 0;
    if (months <= 0) return true;
    const user = await tx.user.findUniqueOrThrow({ where: { id: p.userId }, select: { planUntil: true, plan: true } });
    const active = user.plan === 'pro' && user.planUntil && user.planUntil > now ? user.planUntil : null;
    const from = active ?? now;
    const until = extendUntil(active, months, now);
    await tx.user.update({ where: { id: p.userId }, data: { plan: 'pro', planUntil: until } });
    await tx.payment.update({ where: { id: paymentId }, data: { accessFrom: from, accessUntil: until } });
    return 'activated' as const;
  });
  // Письмо об оплате — ровно один раз (сюда доходит только переход pending → succeeded), не задерживая ответ
  if (activated === 'activated') void import('../emails').then((m) => m.sendPaymentSucceeded(paymentId)).catch((e) => console.error('[mail] payment', (e as Error).message));
  return !!activated;
}

/** Помечает заказ для ручной проверки, не меняя статус платежа и доступ. */
export async function flagIssue(paymentId: string, issue: string, source: string, note?: string) {
  await db.payment.update({ where: { id: paymentId }, data: { issue } });
  await logEvent(paymentId, 'review', source, note ? `${issue}: ${note}` : issue);
}

/** Сверяет незавершённый платёж с провайдером (пользователь вернулся раньше уведомления). Только провайдеры с API статуса. */
export async function syncPayment(paymentId: string) {
  const p = await db.payment.findUnique({ where: { id: paymentId } });
  if (!p || p.status !== 'pending' || !p.providerPaymentId) return;
  const provider = providerByName(p.provider);
  if (!provider || provider.name !== 'yookassa' || process.env.PAYMENT_PROVIDER !== 'yookassa') return;
  try {
    const st = await provider.getStatus(p.providerPaymentId);
    if (st) await applyStatus(p.id, st, 'sync');
  } catch (e) { console.warn('[billing] sync failed', e instanceof Error ? e.message.slice(0, 200) : e); }
}

/* ───────── Состояния для интерфейса ───────── */

export type OrderState = 'awaiting' | 'paid' | 'not_paid' | 'review';
export const ORDER_LABEL: Record<OrderState, string> = { awaiting: 'Ожидает оплаты', paid: 'Оплачен', not_paid: 'Не оплачен', review: 'Требует проверки' };

export function orderState(p: { status: string; issue: string | null }): OrderState {
  if (p.issue) return 'review';
  return p.status === 'succeeded' ? 'paid' : p.status === 'canceled' ? 'not_paid' : 'awaiting';
}

export type AccessState = 'none' | 'scheduled' | 'active' | 'ended';
export const ACCESS_LABEL: Record<AccessState, string> = { none: '—', scheduled: 'Начнётся позже', active: 'Действует', ended: 'Закончился' };

export function accessState(p: { accessFrom: Date | null; accessUntil: Date | null }, now = new Date()): AccessState {
  if (!p.accessFrom || !p.accessUntil) return 'none';
  return p.accessFrom > now ? 'scheduled' : p.accessUntil > now ? 'active' : 'ended';
}

/** Оплата, период которой действует сейчас (для названия текущего тарифа: «Pro — 3 месяца»). */
export function currentPurchase(userId: string, now = new Date()) {
  return db.payment.findFirst({ where: { userId, status: 'succeeded', accessFrom: { lte: now }, accessUntil: { gt: now } }, orderBy: { paidAt: 'desc' } });
}
