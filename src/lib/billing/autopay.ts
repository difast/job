// ЮKassa: обработка платежей и возвратов, сохранённые карты и автопродление Pro.
//
// Правила (совпадают с офертой, раздел «Автопродление»):
// • автопродление включается только по явному согласию: галочка «Запомнить данные карты» на странице ЮKassa
//   (payment_method.saved) или привязка карты проверочным платежом 1 ₽ в «Тариф и оплата»;
// • до 5 карт, одна основная; реквизиты карт хранит ЮKassa, у нас — id способа оплаты и подпись «MasterCard •• 4444»;
// • напоминание на почту за 1–5 дней до окончания (10:00–20:00 МСК) с датой и суммой; без него списания нет;
//   списание — не раньше чем за сутки до окончания и не раньше чем через 3 дня после напоминания, по сумме из него;
// • неудача: до 3 попыток с основной карты не чаще раза в 8 часов, затем по одной с каждой другой; не прошло ни с одной —
//   автопродление выключается, карты удаляются; отозванная/просроченная карта удаляется сразу.
// Телу уведомления не доверяем: статус и данные платежа всегда берутся из API ЮKassa.
import { db } from '../db';
import { ApiError } from '../http';
import { BRAND } from '../brand';
import { allow } from '../partners/ratelimit';
import { getPlan, rubString } from './plans';
import { applyStatus, flagIssue, logEvent, newReturnKey, returnUrl } from './service';
import { YkError, cancelYkPayment, cardTitle, createYkPayment, getYkPayment, ykReady, type YkPayment, type YkRefund } from './yookassa';

export const MAX_CARDS = 5;
export const PRIMARY_TRIES = 3;
const H = 3_600_000, D = 24 * H;
export const AUTOPAY = {
  remindWithin: 5 * D, // напоминание, когда до окончания Pro не больше 5 дней
  chargeBefore: D, // списание — за сутки до окончания
  noticeLead: 3 * D, // и не раньше чем через 3 дня после напоминания
  grace: 3 * D, // после окончания пробуем ещё 3 дня
  retryGap: 8 * H, // повтор с основной карты
  backupGap: 2 * 60_000, // пауза перед запасной картой
  pendingRecurring: 15 * 60_000, pendingCard: 5 * 60_000, // сверка зависших платежей
};
const PERMANENT = new Set(['permission_revoked', 'card_expired', 'payment_method_restricted', 'payment_method_limit_exceeded']);

const mail = (f: (m: typeof import('../emails')) => Promise<unknown>) => { void import('../emails').then(f).catch((e) => console.error('[mail] billing:', (e as Error).message)); };

/* ───────── Карты и автопродление ───────── */
async function saveCard(userId: string, pm: NonNullable<YkPayment['payment_method']>, primary: boolean) {
  if (!pm.id) return null;
  const title = cardTitle(pm);
  return db.$transaction(async (tx) => {
    const cards = await tx.userCard.findMany({ where: { userId } });
    const same = cards.find((c) => c.method === pm.id);
    const makePrimary = primary || !cards.some((c) => c.isPrimary && c.method !== pm.id);
    if (!same && cards.length >= MAX_CARDS) return null;
    if (makePrimary) await tx.userCard.updateMany({ where: { userId }, data: { isPrimary: false } });
    return same
      ? tx.userCard.update({ where: { id: same.id }, data: { title, ...(makePrimary ? { isPrimary: true } : {}), failedCycle: null } })
      : tx.userCard.create({ data: { userId, method: pm.id!, title, isPrimary: makePrimary } });
  });
}

async function enableAutopay(userId: string, planId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { autopayPlan: true } });
  await db.user.update({ where: { id: userId }, data: { autopayPlan: planId, ...(u?.autopayPlan ? {} : { autopaySince: new Date() }), autopayFails: 0, autopayNotice: null, autopayNoticeAt: null, autopayAmount: null, autopayLastTry: null } });
}

/** Выключает автопродление и удаляет сохранённые карты. Оплаченный срок Pro сохраняется. */
export async function disableAutopay(userId: string) {
  await db.$transaction([
    db.userCard.deleteMany({ where: { userId } }),
    db.user.update({ where: { id: userId }, data: { autopayPlan: null, autopaySince: null, autopayFails: 0, autopayNotice: null, autopayNoticeAt: null, autopayAmount: null, autopayLastTry: null } }),
  ]);
}

/* ───────── Обработка платежа ЮKassa ───────── */
async function findPayment(remote: YkPayment) {
  const byId = await db.payment.findUnique({ where: { providerPaymentId: remote.id } });
  if (byId) return byId;
  // ответ на создание мог потеряться: заказ находим по metadata.order_id и закрепляем id платежа
  const orderId = remote.metadata?.order_id;
  if (!orderId) return null;
  const p = await db.payment.findFirst({ where: { id: orderId, provider: 'yookassa', providerPaymentId: null } });
  if (!p) return null;
  try { return await db.payment.update({ where: { id: p.id }, data: { providerPaymentId: remote.id } }); } catch { return null; }
}

/** Единая обработка состояния платежа из API ЮKassa: уведомление, сверка, возврат пользователя, автосписание. */
export async function processYkPayment(remote: YkPayment, source: string): Promise<void> {
  const p = await findPayment(remote);
  if (!p || p.provider !== 'yookassa') return;
  if (remote.metadata?.order_id && remote.metadata.order_id !== p.id) { await flagIssue(p.id, 'verify_failed', source, 'order_id не совпадает'); return; }
  if (remote.amount?.value !== rubString(p.amount) || remote.amount?.currency !== 'RUB') { await flagIssue(p.id, 'amount_mismatch', source, `${remote.amount?.value} ${remote.amount?.currency}`); return; }
  const pm = remote.payment_method;
  if (pm?.id && p.method !== pm.id) await db.payment.update({ where: { id: p.id }, data: { method: pm.id } });

  if (p.kind === 'card') return processCardPayment(p, remote, source);

  if (remote.status === 'succeeded') {
    const activated = await applyStatus(p.id, 'succeeded', source, `ЮKassa ${remote.id}`, { silent: true });
    if (!activated) return; // повторное уведомление — ничего не меняем
    if (p.recurring) {
      await db.$transaction([
        db.user.update({ where: { id: p.userId }, data: { autopayFails: 0, autopayLastTry: null } }),
        db.userCard.updateMany({ where: { userId: p.userId }, data: { failedCycle: null } }),
      ]);
      mail((m) => m.sendProRenewed(p.id));
      return;
    }
    const plan = getPlan(p.planId);
    if (pm?.saved && pm.id && plan && plan.months > 0) {
      if (await saveCard(p.userId, pm, true)) await enableAutopay(p.userId, plan.id);
    } else {
      // переход на тариф с большим сроком при включённом автопродлении: дальше продлеваем новый тариф
      const u = await db.user.findUnique({ where: { id: p.userId }, select: { autopayPlan: true } });
      if (u?.autopayPlan && plan) await db.user.update({ where: { id: p.userId }, data: { autopayPlan: plan.id, autopayNotice: null, autopayNoticeAt: null, autopayAmount: null } });
    }
    mail((m) => m.sendPaymentSucceeded(p.id));
    return;
  }
  if (remote.status === 'canceled' && p.status === 'pending') {
    const reason = remote.cancellation_details?.reason ?? 'canceled';
    const moved = await applyStatus(p.id, 'canceled', source, `причина: ${reason}`, { silent: true, failReason: reason });
    if (moved && p.recurring) await onRecurringFailure(p.id, reason);
  }
}

async function processCardPayment(p: { id: string; userId: string; planId: string; status: string }, remote: YkPayment, source: string) {
  const pm = remote.payment_method;
  if (remote.status === 'waiting_for_capture' || remote.status === 'succeeded') {
    if (p.status === 'pending') {
      // Новая привязанная карта сразу становится основной; прежние остаются запасными
      const card = pm?.saved && pm.id ? await saveCard(p.userId, pm, true) : null;
      const moved = await db.payment.updateMany({ where: { id: p.id, status: 'pending' }, data: card ? { status: 'card_saved', cardId: card.id } : { status: 'canceled', failReason: pm?.saved ? 'cards_limit' : 'not_saved' } });
      if (moved.count) {
        await logEvent(p.id, card ? 'card_saved' : 'canceled', source, card ? card.title : 'карта не сохранена');
        if (card) {
          const u = await db.user.findUnique({ where: { id: p.userId }, select: { autopayPlan: true } });
          if (!u?.autopayPlan) await enableAutopay(p.userId, p.planId);
          else await db.user.update({ where: { id: p.userId }, data: { autopayFails: 0, autopayLastTry: null } }); // у новой основной — свои попытки
          mail((m) => m.sendCardBound(p.userId, card.title));
        }
      }
    }
    // Проверочный 1 ₽ никогда не списываем: отменяем блокировку в любом случае
    if (remote.status === 'waiting_for_capture') await cancelYkPayment(remote.id, p.id).catch((e) => console.warn('[billing] cancel 1 ₽ failed:', (e as Error).message));
    return;
  }
  if (remote.status === 'canceled' && p.status === 'pending') {
    await db.payment.updateMany({ where: { id: p.id, status: 'pending' }, data: { status: 'canceled', failReason: remote.cancellation_details?.reason ?? 'canceled' } });
    await logEvent(p.id, 'canceled', source, 'карта не привязана');
  }
}

/** Возврат: полный возврат сокращает срок на оплаченный период и выключает автопродление. */
export async function processYkRefund(refund: YkRefund, source: string) {
  if (refund.status !== 'succeeded') return;
  const p = await db.payment.findUnique({ where: { providerPaymentId: refund.payment_id } });
  if (!p || p.kind !== 'pro') return;
  if (refund.amount?.value !== rubString(p.amount)) { await logEvent(p.id, 'refund_partial', source, `${refund.amount?.value} RUB`); return; }
  const moved = await db.payment.updateMany({ where: { id: p.id, status: 'succeeded' }, data: { status: 'refunded', refundedAt: new Date() } });
  if (!moved.count) return;
  await logEvent(p.id, 'refunded', source, `возврат ${refund.id}`);
  const u = await db.user.findUnique({ where: { id: p.userId }, select: { planUntil: true } });
  if (u?.planUntil && p.accessFrom && p.accessUntil) {
    const now = Date.now();
    const shortened = Math.max(now, u.planUntil.getTime() - (p.accessUntil.getTime() - p.accessFrom.getTime()));
    await db.user.update({ where: { id: p.userId }, data: { planUntil: new Date(shortened) } });
  }
  await disableAutopay(p.userId);
}

/* ───────── Неудачное автосписание ───────── */
async function onRecurringFailure(paymentId: string, reason: string) {
  const p = await db.payment.findUnique({ where: { id: paymentId } });
  if (!p) return;
  const u = await db.user.findUnique({ where: { id: p.userId }, include: { cards: { orderBy: { createdAt: 'asc' } } } });
  if (!u || !u.autopayPlan || !u.planUntil) return;
  const card = u.cards.find((c) => c.id === p.cardId);
  const cycle = u.planUntil;
  let fails = u.autopayFails;
  if (card && PERMANENT.has(reason)) {
    await db.userCard.delete({ where: { id: card.id } });
    if (card.isPrimary) {
      const next = u.cards.find((c) => c.id !== card.id);
      if (next) await db.userCard.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
  } else if (card?.isPrimary) {
    fails += 1;
    await db.user.update({ where: { id: u.id }, data: { autopayFails: fails } });
  } else if (card) {
    await db.userCard.update({ where: { id: card.id }, data: { failedCycle: cycle } });
  }
  const left = await db.userCard.findMany({ where: { userId: u.id } });
  const primary = left.find((c) => c.isPrimary);
  const backups = left.filter((c) => !c.isPrimary && c.failedCycle?.getTime() !== cycle.getTime());
  const usable = (primary && fails < PRIMARY_TRIES) || backups.length > 0;
  if (!usable) {
    await disableAutopay(u.id);
    mail((m) => m.sendAutopayDisabled(u.id));
    return;
  }
  if (card?.isPrimary && !PERMANENT.has(reason)) mail((m) => m.sendAutopayFailed(u.id, fails < PRIMARY_TRIES ? 'retry' : 'other'));
  else if (card && PERMANENT.has(reason) && card.isPrimary) mail((m) => m.sendAutopayFailed(u.id, 'other'));
}

/* ───────── Привязка карты (1 ₽) и управление картами ───────── */
export async function bindCard(user: { id: string; email: string }, origin: string) {
  if (!ykReady()) throw new ApiError(503, 'Привязка карты сейчас недоступна.');
  if (!allow(`card:${user.id}`, 6, 60_000)) throw new ApiError(429, 'Слишком много попыток. Подождите минуту.');
  const u = await db.user.findUniqueOrThrow({ where: { id: user.id }, include: { cards: true } });
  if (!(u.plan === 'pro' && u.planUntil && u.planUntil > new Date())) throw new ApiError(409, 'Привязать карту можно при действующей подписке Pro.');
  if (u.cards.length >= MAX_CARDS) throw new ApiError(409, `Можно привязать не больше ${MAX_CARDS} карт. Удалите одну, чтобы добавить новую.`);
  const current = await db.payment.findFirst({ where: { userId: user.id, kind: 'pro', status: 'succeeded' }, orderBy: { paidAt: 'desc' } });
  const planId = u.autopayPlan ?? current?.planId ?? 'pro-month';
  const plan = getPlan(planId);
  if (!plan || plan.months <= 0) throw new ApiError(409, 'Автопродление доступно для тарифов на 1 и 3 месяца.');
  const rk = newReturnKey();
  const p = await db.payment.create({ data: { userId: user.id, provider: 'yookassa', kind: 'card', planId: plan.id, planName: plan.name, months: 0, amount: 100, status: 'pending', returnKeyHash: rk.hash, returnKeyUntil: rk.until } });
  await logEvent(p.id, 'pending', 'card', 'проверочный платёж 1 ₽');
  try {
    const remote = await createYkPayment({ orderId: p.id, userId: user.id, kopecks: 100, description: `${BRAND.name}: привязка карты для автопродления (1 ₽ вернётся)`, email: user.email, returnUrl: returnUrl(origin, p.id, rk.key), capture: false, savePaymentMethod: true, kind: 'card' });
    await db.payment.update({ where: { id: p.id }, data: { providerPaymentId: remote.id, confirmationUrl: remote.confirmation?.confirmation_url } });
    return { orderId: p.id, confirmationUrl: remote.confirmation?.confirmation_url ?? '' };
  } catch (e) {
    await db.payment.update({ where: { id: p.id }, data: { status: 'canceled', failReason: 'create_failed' } });
    console.error(`[billing] bind card failed (order ${p.id}):`, (e as Error).message);
    throw new ApiError(502, 'Платёжный сервис временно недоступен. Попробуйте позже.');
  }
}

export async function setPrimaryCard(userId: string, cardId: string) {
  const card = await db.userCard.findFirst({ where: { id: cardId, userId } });
  if (!card) throw new ApiError(404, 'Карта не найдена');
  await db.$transaction([
    db.userCard.updateMany({ where: { userId }, data: { isPrimary: false } }),
    db.userCard.update({ where: { id: card.id }, data: { isPrimary: true } }),
  ]);
}

/** Удаление по одной: удалили основную — основной становится самая ранняя; удалили последнюю — автопродление выключено. */
export async function deleteCard(userId: string, cardId: string) {
  const card = await db.userCard.findFirst({ where: { id: cardId, userId } });
  if (!card) throw new ApiError(404, 'Карта не найдена');
  await db.userCard.delete({ where: { id: card.id } });
  const left = await db.userCard.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  if (!left.length) {
    await disableAutopay(userId);
    mail((m) => m.sendCardUnlinked(userId, card.title));
    return { autopay: false };
  }
  if (card.isPrimary || !left.some((c) => c.isPrimary)) await db.userCard.update({ where: { id: left[0].id }, data: { isPrimary: true } });
  mail((m) => m.sendCardRemoved(userId, card.title));
  return { autopay: true };
}

/* ───────── Планировщик ───────── */
/** Окно дневных уведомлений по Москве (REMINDER_HOURS, по умолчанию 10-20). */
export function isDaytime(now = new Date()) {
  const [from, to] = (process.env.REMINDER_HOURS ?? '10-20').split('-').map(Number);
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Moscow' }).format(now));
  return h >= (from || 0) && h < (to || 24);
}

/** Дата списания, которую обещает напоминание: за сутки до окончания, но не раньше чем через 3 дня после напоминания. */
export const chargeDate = (planUntil: Date, noticeAt: Date) => new Date(Math.max(planUntil.getTime() - AUTOPAY.chargeBefore, noticeAt.getTime() + AUTOPAY.noticeLead));

async function runReminders(now: Date) {
  if (!isDaytime(now)) return;
  const users = await db.user.findMany({ where: { autopayPlan: { not: null }, planUntil: { gt: now, lte: new Date(now.getTime() + AUTOPAY.remindWithin) } }, select: { id: true, planUntil: true, autopayPlan: true, autopayNotice: true }, take: 200 });
  for (const u of users) {
    if (!u.planUntil || u.autopayNotice?.getTime() === u.planUntil.getTime()) continue;
    const plan = getPlan(u.autopayPlan!);
    if (!plan || plan.price <= 0) continue;
    const claim = await db.user.updateMany({ where: { id: u.id, planUntil: u.planUntil, OR: [{ autopayNotice: null }, { autopayNotice: { not: u.planUntil } }] }, data: { autopayNotice: u.planUntil, autopayNoticeAt: now, autopayAmount: plan.price } });
    if (!claim.count) continue;
    const { sendAutopayReminder } = await import('../emails');
    // письмо не ушло — снимаем отметку: без уведомления списания не будет, попробуем в следующий раз
    if (!(await sendAutopayReminder(u.id))) await db.user.update({ where: { id: u.id }, data: { autopayNotice: null, autopayNoticeAt: null, autopayAmount: null } });
  }
}

async function runCharges(now: Date) {
  const users = await db.user.findMany({
    where: { autopayPlan: { not: null }, planUntil: { lte: new Date(now.getTime() + AUTOPAY.chargeBefore), gt: new Date(now.getTime() - AUTOPAY.grace) } },
    include: { cards: { orderBy: { createdAt: 'asc' } } }, take: 100,
  });
  for (const u of users) {
    if (!u.planUntil || u.autopayNotice?.getTime() !== u.planUntil.getTime() || !u.autopayNoticeAt) continue;
    if (now.getTime() < chargeDate(u.planUntil, u.autopayNoticeAt).getTime()) continue;
    if (await db.payment.count({ where: { userId: u.id, recurring: true, status: 'pending' } })) continue;
    const cycle = u.planUntil;
    const primary = u.cards.find((c) => c.isPrimary);
    const since = u.autopayLastTry ? now.getTime() - u.autopayLastTry.getTime() : Infinity;
    let card = null as (typeof u.cards)[number] | null;
    if (primary && u.autopayFails < PRIMARY_TRIES) { if (u.autopayFails === 0 || since >= AUTOPAY.retryGap) card = primary; else continue; }
    else {
      const backup = u.cards.find((c) => !c.isPrimary && c.failedCycle?.getTime() !== cycle.getTime());
      if (!backup) { await disableAutopay(u.id); mail((m) => m.sendAutopayDisabled(u.id)); continue; }
      if (since < AUTOPAY.backupGap) continue;
      card = backup;
    }
    const plan = getPlan(u.autopayPlan!);
    if (!plan || plan.months <= 0) { await disableAutopay(u.id); continue; }
    // «Занимаем» попытку условным обновлением — защита от двойного списания при параллельном запуске
    const claim = await db.user.updateMany({ where: { id: u.id, autopayLastTry: u.autopayLastTry }, data: { autopayLastTry: now } });
    if (!claim.count) continue;
    const amount = u.autopayAmount ?? plan.price;
    const p = await db.payment.create({ data: { userId: u.id, provider: 'yookassa', kind: 'pro', recurring: true, cardId: card.id, planId: plan.id, planName: plan.name, months: plan.months, amount, status: 'pending' } });
    await logEvent(p.id, 'pending', 'autopay', `${card.title}, ${rubString(amount)} RUB`);
    await chargeRecurring(p.id, { userId: u.id, email: u.email, method: card.method, amount, planName: plan.name });
  }
  // Срок вышел больше 3 дней назад, а списать так и не удалось — автопродление выключаем
  const stale = await db.user.findMany({ where: { autopayPlan: { not: null }, planUntil: { lte: new Date(now.getTime() - AUTOPAY.grace) } }, select: { id: true }, take: 100 });
  for (const u of stale) { await disableAutopay(u.id); mail((m) => m.sendAutopayDisabled(u.id)); }
}

async function chargeRecurring(orderId: string, a: { userId: string; email: string; method: string; amount: number; planName: string }) {
  try {
    const remote = await createYkPayment({ orderId, userId: a.userId, kopecks: a.amount, description: `${BRAND.name} ${a.planName} — автопродление`, email: a.email, paymentMethodId: a.method, recurring: true });
    await db.payment.updateMany({ where: { id: orderId, providerPaymentId: null }, data: { providerPaymentId: remote.id } });
    await processYkPayment(remote, 'autopay');
  } catch (e) {
    if (e instanceof YkError && e.status >= 400 && e.status < 500) {
      const moved = await applyStatus(orderId, 'canceled', 'autopay', `отклонено: ${e.code || e.status}`, { silent: true, failReason: e.code || `http_${e.status}` });
      if (moved) await onRecurringFailure(orderId, e.code || '');
    } else console.warn(`[billing] autopay ${orderId}: ${(e as Error).message} — повторим при сверке`); // тот же Idempotence-Key
  }
}

/** Сверка: зависшие автосписания (15 мин) и привязки карт (5 мин) — сами спрашиваем ЮKassa. */
async function reconcile(now: Date) {
  const rows = await db.payment.findMany({
    where: { provider: 'yookassa', status: 'pending', OR: [{ recurring: true, createdAt: { lte: new Date(now.getTime() - AUTOPAY.pendingRecurring) } }, { kind: 'card', createdAt: { lte: new Date(now.getTime() - AUTOPAY.pendingCard) } }] },
    include: { user: { select: { email: true, cards: true } } }, take: 50,
  });
  for (const p of rows) {
    try {
      if (p.providerPaymentId) await processYkPayment(await getYkPayment(p.providerPaymentId), 'reconcile');
      else if (p.recurring) {
        const card = p.user.cards.find((c) => c.id === p.cardId);
        if (card) await chargeRecurring(p.id, { userId: p.userId, email: p.user.email, method: card.method, amount: p.amount, planName: p.planName ?? 'Pro' });
        else { const moved = await applyStatus(p.id, 'canceled', 'reconcile', 'карта удалена', { silent: true, failReason: 'card_removed' }); if (moved) await onRecurringFailure(p.id, 'card_removed'); }
      } else await db.payment.updateMany({ where: { id: p.id, status: 'pending' }, data: { status: 'canceled', failReason: 'create_failed' } });
    } catch (e) { console.warn(`[billing] reconcile ${p.id}:`, (e as Error).message); }
  }
}

export async function runAutopay(now = new Date()) {
  if (!ykReady()) return;
  await reconcile(now);
  await runReminders(now);
  await runCharges(now);
}
