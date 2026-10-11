// Подписанные запросы Clymly → JobToo: JSON, HMAC-SHA256, тайм-аут 15 с,
// повтор только при сетевой ошибке и 503 — не больше 2 раз и с тем же X-Request-Id. На 503 JobToo присылает retry_after
// (секунды): раньше этого срока не повторяем; если ждать дольше нескольких секунд — отдаём ошибку сразу, с retryAfter.
import { randomUUID } from 'node:crypto';
import { OUTBOUND_TIMEOUT_MS, jobtoo } from './config';
import { sign } from './signing';

export type PartnerResponse<T> =
  | { ok: true; status: number; data: T; requestId: string; durationMs: number }
  | { ok: false; status: number; code: string; message: string | null; requestId: string; durationMs: number; retryAfter?: number };

/** Повтор в рамках одного действия пользователя — только если JobToo просит подождать не дольше этого. */
const MAX_INLINE_WAIT_S = 5;

export async function partnerPost<T = Record<string, unknown>>(op: 'pull' | 'handoff' | 'events', payload: unknown, requestId: string = randomUUID()): Promise<PartnerResponse<T>> {
  const body = Buffer.from(JSON.stringify(payload));
  const started = Date.now();
  let last: PartnerResponse<T> | null = null;
  let unavailable: PartnerResponse<T> | null = null; // первый ответ 503 — настоящая причина неудачи
  for (let attempt = 0; attempt < 3; attempt++) {
    // JobToo держит запрос с тем же X-Request-Id «в обработке» — повторяем не сразу
    if (attempt) await new Promise((r) => setTimeout(r, 1500 * attempt));
    const ts = String(Math.floor(Date.now() / 1000));
    let res: Response;
    try {
      res = await fetch(jobtoo.endpoint(op), {
        method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
        headers: { 'Content-Type': 'application/json', 'X-Partner-Id': 'clymly', 'X-Request-Id': requestId, 'X-Timestamp': ts, 'X-Signature': sign(jobtoo.outboundSecret(), ts, requestId, body) },
      });
    } catch (e) {
      const timeout = (e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError';
      last = { ok: false, status: 0, code: timeout ? 'timeout' : 'network', message: null, requestId, durationMs: Date.now() - started };
      if (timeout) break; // на тайм-ауте не повторяем: запрос мог быть уже выполнен и код погашен
      continue;
    }
    const data = (await res.json().catch(() => null)) as (T & { status?: string; error?: { code?: string; message?: string } }) | null;
    if (res.ok && data?.status === 'ok') return { ok: true, status: res.status, data, requestId, durationMs: Date.now() - started };
    const message = typeof data?.error?.message === 'string' && data.error.message.length < 300 ? data.error.message : null;
    last = { ok: false, status: res.status, code: String(data?.error?.code ?? `http_${res.status}`).slice(0, 40), message, requestId, durationMs: Date.now() - started };
    if (res.status === 503) {
      const raw = (data as { retry_after?: unknown } | null)?.retry_after ?? res.headers.get('retry-after');
      const ra = Number(raw);
      const wait = Number.isFinite(ra) && ra > 0 ? Math.min(Math.ceil(ra), 3600) : 0;
      last = { ...last, ...(wait ? { retryAfter: wait } : {}) };
      unavailable ??= last;
      if (wait > MAX_INLINE_WAIT_S) break; // JobToo просит подождать — не повторяем раньше срока
      if (wait && attempt < 2) await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    // 409 «запрос ещё обрабатывается» на повторе после 503 — не новая ошибка: сообщаем исходную недоступность JobToo
    if (res.status === 409 && unavailable) return { ...unavailable, message: null, durationMs: Date.now() - started };
    break;
  }
  return last!;
}
