// Подпись запросов между Clymly и партнёром: HMAC-SHA256(secret, timestamp.requestId.sha256(body))
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { MAX_SKEW_SEC } from './config';

export const sha256Hex = (b: Buffer | Uint8Array | string) => createHash('sha256').update(b).digest('hex');

export function sign(secret: string, timestamp: string, requestId: string, body: Buffer | Uint8Array | string) {
  return createHmac('sha256', secret).update(`${timestamp}.${requestId}.${sha256Hex(body)}`).digest('hex');
}

export type VerifyError = 'invalid_signature';

/** Проверяет заголовки и подпись. Сравнение — за постоянное время. */
export function verify(
  secret: string,
  h: { partnerId: string | null; requestId: string | null; timestamp: string | null; signature: string | null },
  expectedPartner: string,
  body: Buffer,
  now = Date.now(),
): { ok: true; requestId: string } | { ok: false; error: VerifyError; message: string } {
  const bad = (message: string) => ({ ok: false as const, error: 'invalid_signature' as const, message });
  if (!secret) return bad('Интеграция не настроена');
  if (h.partnerId !== expectedPartner) return bad('Неизвестный партнёр');
  if (!h.requestId || !/^[0-9a-f-]{8,64}$/i.test(h.requestId)) return bad('Нет или неверный X-Request-Id');
  const ts = Number(h.timestamp);
  if (!h.timestamp || !Number.isInteger(ts) || Math.abs(now / 1000 - ts) > MAX_SKEW_SEC) return bad('Неверная или устаревшая метка времени');
  if (!h.signature || !/^[0-9a-f]{64}$/i.test(h.signature)) return bad('Нет подписи');
  const expected = Buffer.from(sign(secret, h.timestamp, h.requestId, body), 'hex');
  const got = Buffer.from(h.signature.toLowerCase(), 'hex');
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return bad('Неверная подпись');
  return { ok: true, requestId: h.requestId };
}
