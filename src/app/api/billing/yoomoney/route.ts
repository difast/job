import { db } from '@/lib/db';
import { applyStatus, flagIssue, logEvent } from '@/lib/billing/service';
import { fetchOperation, parseNotification, verifySignature, yooMoneyState } from '@/lib/billing/yoomoney';

/**
 * HTTP-уведомления ЮMoney о входящих переводах (форма Quickpay).
 * Адрес для настроек кошелька (yoomoney.ru → Настройки → HTTP-уведомления): https://<домен>/api/billing/yoomoney
 *
 * Ответ 200 — уведомление принято (в т.ч. если оно отклонено по сути и записано для проверки: повтор не поможет).
 * 4xx — неверный формат или подпись; 5xx — временная ошибка, ЮMoney повторит (через 10 минут и через час).
 * В логи не пишутся подпись, секрет и данные плательщика — только номер заказа и id операции.
 */
const ok = (note = 'OK') => new Response(note, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
const fail = (status: number, note: string) => new Response(note, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

export async function POST(req: Request) {
  const st = yooMoneyState();
  if (st.state === 'off') return fail(404, 'Not found');
  if (st.state === 'misconfigured') { console.error('[yoomoney] уведомление не обработано: не заданы', st.missing.join(', ')); return fail(503, 'Not configured'); }
  const { secret, token } = st.config;

  if (!(req.headers.get('content-type') ?? '').includes('application/x-www-form-urlencoded')) return fail(400, 'Bad request');
  const raw = await req.text();
  if (raw.length > 8_000) return fail(400, 'Bad request');
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) { if (k in params) return fail(400, 'Bad request'); params[k] = v; }

  if (!verifySignature(params, secret)) { console.warn('[yoomoney] отклонено: неверная подпись уведомления'); return fail(400, 'Bad signature'); }
  const n = parseNotification(params);
  if (!n) { console.warn('[yoomoney] отклонено: неожиданный формат уведомления'); return fail(400, 'Bad request'); }
  if (n.test) return ok(); // проверочное уведомление из настроек кошелька: подпись верна, заказов не касается

  const p = await db.payment.findUnique({ where: { id: n.orderId } });
  if (!p || p.provider !== 'yoomoney') { console.warn(`[yoomoney] перевод не относится к заказу Clymly (label ${n.orderId}, операция ${n.operationId})`); return ok(); }
  const tag = `операция ${n.operationId}`;

  // Повтор того же уведомления
  if (p.providerPaymentId === n.operationId && p.status !== 'pending') { await logEvent(p.id, 'duplicate', 'notification', `повторное уведомление, ${tag}`); return ok(); }
  // Заказ уже оплачен другой операцией — второй раз Pro не продлеваем, деньги требуют ручного разбора
  if (p.status === 'succeeded') { await flagIssue(p.id, 'duplicate_payment', 'notification', tag); return ok(); }
  if (p.status === 'canceled') { await flagIssue(p.id, 'paid_after_cancel', 'notification', tag); return ok(); }
  if (n.codepro || n.unaccepted) { await flagIssue(p.id, 'unaccepted', 'notification', `${tag}: перевод не зачислен (codepro/unaccepted)`); return ok(); }
  if (n.currency !== '643' || p.currency !== 'RUB') { await flagIssue(p.id, 'currency_mismatch', 'notification', `${tag}: валюта ${n.currency}`); return ok(); }
  if (n.withdrawAmount !== p.amount) {
    await flagIssue(p.id, 'amount_mismatch', 'notification', `${tag}: оплачено ${n.withdrawAmount === null ? '—' : (n.withdrawAmount / 100).toFixed(2)}, ожидалось ${(p.amount / 100).toFixed(2)}`);
    return ok();
  }

  // Дополнительная сверка операции через API кошелька, если выдан токен
  if (token) {
    try {
      const op = await fetchOperation(token, n.operationId);
      if (op.status !== 'success' || op.direction !== 'in' || op.label !== p.id || (op.amount !== null && op.amount !== n.amount)) {
        await flagIssue(p.id, 'verify_failed', 'notification', `${tag}: API ЮMoney не подтвердил операцию (${op.status || '—'})`);
        return ok();
      }
    } catch (e) {
      console.error(`[yoomoney] не удалось сверить операцию для заказа ${p.id}:`, e instanceof Error ? e.message.slice(0, 200) : 'error');
      return fail(500, 'Retry later');
    }
  }

  // Операция закрепляется за заказом (уникальный индекс): одна операция не может оплатить два заказа
  try {
    const bound = await db.payment.updateMany({ where: { id: p.id, status: 'pending', OR: [{ providerPaymentId: null }, { providerPaymentId: n.operationId }] }, data: { providerPaymentId: n.operationId } });
    if (!bound.count) { await logEvent(p.id, 'duplicate', 'notification', `${tag}: заказ уже обработан`); return ok(); }
  } catch {
    await flagIssue(p.id, 'duplicate_payment', 'notification', `${tag}: операция уже привязана к другому заказу`);
    return ok();
  }
  await applyStatus(p.id, 'succeeded', 'notification', `${tag}, ${n.type}`);
  return ok();
}
