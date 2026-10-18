// API ЮKassa v3 (только сервер): платежи, автосписания с сохранённой карты, проверочный платёж 1 ₽, отмена, возвраты.
// Авторизация — Basic shopId:secretKey, у каждого создающего запроса — Idempotence-Key (наш номер заказа).
// YOOKASSA_API_URL переопределяет адрес API (имитатор в тестах); по умолчанию https://api.yookassa.ru/v3.
import { rubString } from './plans';

export interface YkConfig { shopId: string; secretKey: string; apiUrl: string; vatCode: number; taxSystem: number | null; ipCheck: boolean }
type Env = Record<string, string | undefined>;

export function ykConfig(env: Env = process.env): { ok: true; config: YkConfig } | { ok: false; missing: string[] } {
  const shopId = (env.YOOKASSA_SHOP_ID ?? '').trim(), secretKey = (env.YOOKASSA_SECRET_KEY ?? '').trim();
  const missing = [!shopId && 'YOOKASSA_SHOP_ID', !secretKey && 'YOOKASSA_SECRET_KEY'].filter(Boolean) as string[];
  if (missing.length) return { ok: false, missing };
  const vat = Number(env.YOOKASSA_VAT_CODE ?? 1);
  const tax = Number(env.YOOKASSA_TAX_SYSTEM ?? '');
  return {
    ok: true,
    config: {
      shopId, secretKey,
      apiUrl: ((env.YOOKASSA_API_URL ?? '').trim() || 'https://api.yookassa.ru/v3').replace(/\/+$/, ''),
      vatCode: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(vat) ? vat : 1,
      taxSystem: Number.isInteger(tax) && tax >= 1 && tax <= 6 ? tax : null,
      ipCheck: env.YOOKASSA_IP_CHECK === '1',
    },
  };
}

export const ykReady = () => process.env.PAYMENT_PROVIDER === 'yookassa' && ykConfig().ok;

export interface YkPayment {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  paid?: boolean;
  amount: { value: string; currency: string };
  metadata?: Record<string, string>;
  confirmation?: { confirmation_url?: string };
  payment_method?: { id?: string; saved?: boolean; type?: string; card?: { card_type?: string; last4?: string } };
  cancellation_details?: { reason?: string; party?: string };
}
export interface YkRefund { id: string; payment_id: string; status: string; amount: { value: string; currency: string } }

export class YkError extends Error {
  constructor(public status: number, public code: string) { super(`ЮKassa: HTTP ${status}${code ? ` ${code}` : ''}`); }
}

function cfg(): YkConfig {
  const c = ykConfig();
  if (!c.ok) throw new YkError(0, `не заданы ${c.missing.join(', ')}`);
  return c.config;
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, idempotenceKey?: string): Promise<T> {
  const c = cfg();
  let r: Response;
  try {
    r = await fetch(`${c.apiUrl}${path}`, {
      method,
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${c.shopId}:${c.secretKey}`).toString('base64'),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(idempotenceKey ? { 'Idempotence-Key': idempotenceKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new YkError(0, (e as Error).name === 'TimeoutError' ? 'timeout' : 'network');
  }
  const data = await r.json().catch(() => null) as (T & { type?: string; code?: string }) | null;
  if (!r.ok || !data) throw new YkError(r.status, String(data?.code ?? '').slice(0, 60)); // текст ответа не логируем
  return data;
}

/** Чек 54-ФЗ: одна позиция-услуга. */
export function receipt(email: string, description: string, kopecks: number) {
  const c = cfg();
  return {
    customer: { email },
    items: [{ description: description.slice(0, 128), quantity: '1.00', amount: { value: rubString(kopecks), currency: 'RUB' }, vat_code: c.vatCode, payment_mode: 'full_payment', payment_subject: 'service' }],
    ...(c.taxSystem ? { tax_system_code: c.taxSystem } : {}),
  };
}

export interface CreateArgs {
  orderId: string; userId: string; kopecks: number; description: string; email: string;
  returnUrl?: string; // redirect-подтверждение; без него — автосписание
  paymentMethodId?: string; // автосписание с сохранённой карты
  capture?: boolean; // false — проверочный платёж 1 ₽ (только блокируется)
  savePaymentMethod?: boolean; // true — только для привязки карты; при оплате Pro не передаём (решает галочка покупателя)
  kind?: 'pro' | 'card'; recurring?: boolean;
}

export function createYkPayment(a: CreateArgs) {
  return call<YkPayment>('POST', '/payments', {
    amount: { value: rubString(a.kopecks), currency: 'RUB' },
    capture: a.capture ?? true,
    ...(a.returnUrl ? { confirmation: { type: 'redirect', return_url: a.returnUrl } } : {}),
    ...(a.paymentMethodId ? { payment_method_id: a.paymentMethodId } : {}),
    ...(a.savePaymentMethod ? { save_payment_method: true } : {}),
    description: a.description.slice(0, 128),
    metadata: { order_id: a.orderId, user_id: a.userId, ...(a.kind === 'card' ? { kind: 'card' } : {}), ...(a.recurring ? { recurring: '1' } : {}) },
    receipt: receipt(a.email, a.description, a.kopecks),
  }, a.orderId);
}

export const getYkPayment = (id: string) => call<YkPayment>('GET', `/payments/${encodeURIComponent(id)}`);
export const cancelYkPayment = (id: string, orderId: string) => call<YkPayment>('POST', `/payments/${encodeURIComponent(id)}/cancel`, {}, `${orderId}-cancel`);
export const getYkRefund = (id: string) => call<YkRefund>('GET', `/refunds/${encodeURIComponent(id)}`);

/** Подпись карты: «MasterCard •• 4444». */
export const cardTitle = (pm: YkPayment['payment_method']) => `${pm?.card?.card_type || 'Карта'} •• ${pm?.card?.last4 || '????'}`;

/* ───────── IP-адреса уведомлений ЮKassa (опционально, YOOKASSA_IP_CHECK=1) ───────── */
const V4 = ['185.71.76.0/27', '185.71.77.0/27', '77.75.153.0/25', '77.75.154.128/25', '77.75.156.11/32', '77.75.156.35/32'];
const ip4 = (s: string) => s.split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
export function ykIpAllowed(ip: string): boolean {
  const v = ip.trim().replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v)) return V4.some((c) => { const [net, bits] = c.split('/'); const mask = bits === '0' ? 0 : (~0 << (32 - Number(bits))) >>> 0; return (ip4(v) & mask) === (ip4(net) & mask); });
  return /^2a02:5180:/i.test(v); // 2a02:5180::/32
}
