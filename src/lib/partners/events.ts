// Аналитика переходов и обмен событиями с партнёром.
// В IntegrationEvent и в очередь не попадают персональные данные, ссылки и коды входа.
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { API_PATH, OUTBOUND_TIMEOUT_MS, PARTNER, jobtoo } from './config';
import { sign } from './signing';

export type Direction = 'out' | 'in';

export interface EventData {
  direction: Direction; event: string; requestId?: string | null; userId?: string | null; partnerUserId?: string | null;
  placement?: string | null; platform?: string | null; account?: string | null; errorCode?: string | null; durationMs?: number | null;
}

/** Записывает событие. Ошибка записи аналитики не ломает пользовательский сценарий. */
export async function track(e: EventData) {
  try {
    await db.integrationEvent.create({ data: { partner: PARTNER, ...e, placement: e.placement?.slice(0, 40), platform: e.platform?.slice(0, 20) } });
  } catch (err) { console.warn('[integration] event not saved', err); }
}

/** События, которые мы сообщаем партнёру о его переходах к нам (direction=in у нас). */
export type OutgoingEvent = 'login_completed' | 'account_linked' | 'first_action';

export async function enqueuePartnerEvent(event: OutgoingEvent, requestId: string, partnerUserId: string | null) {
  try {
    await db.partnerEventOutbox.create({ data: { partner: PARTNER, body: JSON.stringify({ request_id: requestId, event, occurred_at: new Date().toISOString(), partner_user_id: partnerUserId }) } });
  } catch (err) { console.warn('[integration] outbox write failed', err); }
}

let flushing = false;

/** Отправляет накопленные события партнёру батчем. Повторы — с растущей паузой, максимум 10 попыток. */
export async function flushOutbox() {
  if (flushing || !jobtoo.outboundReady()) return;
  flushing = true;
  try {
    const batch = await db.partnerEventOutbox.findMany({ where: { sentAt: null, nextAt: { lte: new Date() }, attempts: { lt: 10 } }, orderBy: { createdAt: 'asc' }, take: 50 });
    if (!batch.length) return;
    const body = JSON.stringify({ events: batch.map((b) => JSON.parse(b.body)) });
    const requestId = randomUUID();
    const ts = String(Math.floor(Date.now() / 1000));
    let ok = false;
    try {
      const res = await fetch(`${jobtoo.apiBase()}${API_PATH}/events`, {
        method: 'POST', signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS), body,
        headers: { 'Content-Type': 'application/json', 'X-Partner-Id': 'clymly', 'X-Request-Id': requestId, 'X-Timestamp': ts, 'X-Signature': sign(jobtoo.outboundSecret(), ts, requestId, body) },
      });
      ok = res.ok;
    } catch { ok = false; }
    const ids = batch.map((b) => b.id);
    if (ok) await db.partnerEventOutbox.updateMany({ where: { id: { in: ids } }, data: { sentAt: new Date() } });
    else for (const b of batch) await db.partnerEventOutbox.update({ where: { id: b.id }, data: { attempts: { increment: 1 }, nextAt: new Date(Date.now() + Math.min(60, 2 ** b.attempts) * 60_000) } });
  } catch (err) { console.warn('[integration] outbox flush failed', err); }
  finally { flushing = false; }
}

/** Первое целевое действие пользователя, пришедшего из JobToo: сообщаем партнёру один раз. */
export async function trackFirstAction(userId: string) {
  try {
    const link = await db.partnerLink.findFirst({ where: { userId, partner: PARTNER, firstActionAt: null, lastInboundRequestId: { not: null } } });
    if (!link) return;
    const upd = await db.partnerLink.updateMany({ where: { id: link.id, firstActionAt: null }, data: { firstActionAt: new Date() } });
    if (!upd.count) return;
    await track({ direction: 'in', event: 'first_action', requestId: link.lastInboundRequestId, userId, partnerUserId: link.externalUserId });
    await enqueuePartnerEvent('first_action', link.lastInboundRequestId!, link.externalUserId);
    void flushOutbox();
  } catch (err) { console.warn('[integration] first_action failed', err); }
}
