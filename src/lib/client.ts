'use client';
// Клиентские запросы к API: тайм-аут вместо бесконечного ожидания, понятные сообщения об ошибках.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

export async function request<T = Record<string, unknown>>(
  url: string,
  { method = 'GET', json, body, timeoutMs = 60_000 }: { method?: string; json?: unknown; body?: BodyInit; timeoutMs?: number } = {},
): Promise<Result<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: json !== undefined ? JSON.stringify(json) : body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const fallback = res.status === 401 ? 'Сессия истекла — войдите снова.' : res.status >= 500 ? 'Сервис временно недоступен. Попробуйте ещё раз через минуту.' : 'Не удалось выполнить действие.';
      return { ok: false, error: (data as { error?: string }).error ?? fallback, status: res.status };
    }
    return { ok: true, data: data as T };
  } catch (e) {
    if ((e as Error).name === 'AbortError') return { ok: false, error: 'Операция заняла слишком много времени. Проверьте соединение и попробуйте ещё раз.' };
    return { ok: false, error: 'Нет соединения с сервером. Проверьте интернет и попробуйте ещё раз.' };
  } finally {
    clearTimeout(timer);
  }
}

export { safeNext } from './safe-next';
