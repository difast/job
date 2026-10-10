// ЮMoney: приём оплаты на кошелёк через платёжную форму (Quickpay) и HTTP-уведомления.
//
// Официальный сценарий ЮMoney «API для сбора денег»: сайт отправляет форму на https://yoomoney.ru/quickpay/confirm
// (receiver — номер кошелька, sum, label — номер нашего заказа, paymentType AC — банковская карта / PC — кошелёк),
// после оплаты ЮMoney присылает HTTP-уведомление (POST, application/x-www-form-urlencoded) на адрес из настроек
// кошелька. Подлинность уведомления — параметр sign: HMAC-SHA256 (hex, нижний регистр) от URL-кодированной строки
// всех параметров кроме sign, отсортированных по алфавиту; ключ — секрет из настроек HTTP-уведомлений.
// sha1_hash устарел (с 18.05.2026 не присылается) — поддержан только как запасной вариант для старых уведомлений.
// Дополнительно (если задан OAuth-токен с правом operation-details) операция перепроверяется через API кошелька.
//
// Возврат пользователя по successURL ничего не подтверждает: Pro включается только по проверенному уведомлению.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const QUICKPAY_URL = 'https://yoomoney.ru/quickpay/confirm';
const API = 'https://yoomoney.ru/api';

export interface YooMoneyConfig { wallet: string; secret: string; token: string | null }
export type YooMoneyState = { state: 'off' } | { state: 'misconfigured'; missing: string[] } | { state: 'ready'; config: YooMoneyConfig };

/** Конфигурация только из окружения сервера. Без ЮMoney приложение работает как раньше. */
export function yooMoneyState(env: Record<string, string | undefined> = process.env): YooMoneyState {
  if (!/^(1|true|yes)$/i.test(env.YOOMONEY_ENABLED ?? '')) return { state: 'off' };
  const wallet = (env.YOOMONEY_WALLET ?? '').trim();
  const secret = (env.YOOMONEY_NOTIFICATION_SECRET ?? '').trim();
  const missing = [!/^\d{11,20}$/.test(wallet) && 'YOOMONEY_WALLET', !secret && 'YOOMONEY_NOTIFICATION_SECRET'].filter(Boolean) as string[];
  if (missing.length) return { state: 'misconfigured', missing };
  return { state: 'ready', config: { wallet, secret, token: (env.YOOMONEY_ACCESS_TOKEN ?? '').trim() || null } };
}

export const PAYMENT_TYPES = { AC: 'Банковской картой', PC: 'Кошельком ЮMoney' } as const;
export type QuickpayType = keyof typeof PAYMENT_TYPES;

/** Поля формы Quickpay. Секретов здесь нет: номер кошелька публичен по природе формы. */
export function quickpayFields(cfg: YooMoneyConfig, o: { orderId: string; amount: number; description: string; successURL: string; paymentType: QuickpayType }) {
  return {
    receiver: cfg.wallet,
    'quickpay-form': 'button',
    paymentType: o.paymentType,
    sum: (o.amount / 100).toFixed(2),
    label: o.orderId,
    targets: o.description.slice(0, 150),
    successURL: o.successURL,
  };
}

/* ───────── Проверка уведомления ───────── */

// «URL-кодированная строка» в документации не уточняет вариант кодирования. Пробуем однозначные варианты
// (form-urlencoded, RFC 3986, Java URLEncoder) — все они детерминированы, подделать без секрета ни один нельзя.
const encoders: ((v: string) => string)[] = [
  (v) => new URLSearchParams([['', v]]).toString().slice(1),
  (v) => encodeURIComponent(v).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()),
  (v) => encodeURIComponent(v).replace(/%20/g, '+').replace(/[!'()~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()),
];

export function signString(params: Record<string, string>, enc = encoders[0]) {
  return Object.keys(params).filter((k) => k !== 'sign').sort().map((k) => `${enc(k)}=${enc(params[k])}`).join('&');
}

export function computeSign(params: Record<string, string>, secret: string, enc = encoders[0]) {
  return createHmac('sha256', secret).update(signString(params, enc), 'utf8').digest('hex');
}

function safeEq(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Устаревшая подпись sha1_hash (фиксированный порядок полей). */
export function legacySha1(p: Record<string, string>, secret: string) {
  const s = [p.notification_type, p.operation_id, p.amount, p.currency, p.datetime, p.sender, p.codepro, secret, p.label].map((v) => v ?? '').join('&');
  return createHash('sha1').update(s, 'utf8').digest('hex');
}

export function verifySignature(params: Record<string, string>, secret: string): boolean {
  if (params.sign) {
    const got = params.sign.toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(got)) return false;
    return encoders.some((enc) => safeEq(computeSign(params, secret, enc), got));
  }
  if (params.sha1_hash && /^[0-9a-f]{40}$/i.test(params.sha1_hash)) return safeEq(legacySha1(params, secret), params.sha1_hash.toLowerCase());
  return false;
}

export interface Notification {
  type: 'p2p-incoming' | 'card-incoming';
  operationId: string;
  orderId: string;
  amount: number; // зачислено на кошелёк, копейки (за вычетом комиссии)
  withdrawAmount: number | null; // списано с плательщика, копейки — сверяется с ценой заказа
  currency: string; // 643 = RUB
  unaccepted: boolean;
  codepro: boolean;
  test: boolean;
}

const money = (v: string | undefined) => (v && /^\d{1,9}(\.\d{1,2})?$/.test(v) ? Math.round(Number(v) * 100) : null);

/** Разбор уведомления строго по ожидаемому формату. null — формат не тот. */
export function parseNotification(p: Record<string, string>): Notification | null {
  if (p.notification_type !== 'p2p-incoming' && p.notification_type !== 'card-incoming') return null;
  const test = p.test_notification === 'true';
  if (!p.operation_id || !/^[\w.-]{1,64}$/.test(p.operation_id)) return null;
  const amount = money(p.amount);
  if (amount === null || !/^\d{3}$/.test(p.currency ?? '') || !p.datetime) return null;
  const orderId = p.label ?? '';
  if (!test && !/^[a-z0-9]{20,40}$/.test(orderId)) return null;
  return {
    type: p.notification_type, operationId: p.operation_id, orderId, amount, withdrawAmount: money(p.withdraw_amount),
    currency: p.currency, unaccepted: p.unaccepted === 'true', codepro: p.codepro === 'true', test,
  };
}

/* ───────── Проверка операции через API кошелька (необязательно, нужен OAuth-токен) ───────── */

export interface OperationDetails { status: string; direction: string; label: string | null; amount: number | null }

/** POST /api/operation-details. Ошибки сети и API — исключение (уведомление будет повторено). */
export async function fetchOperation(token: string, operationId: string, fetchImpl: typeof fetch = fetch): Promise<OperationDetails> {
  const r = await fetchImpl(`${API}/operation-details`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ operation_id: operationId }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`ЮMoney operation-details: HTTP ${r.status}`);
  const d = await r.json() as { error?: string; status?: string; direction?: string; label?: string; amount?: number };
  if (d.error) throw new Error(`ЮMoney operation-details: ${d.error}`);
  return { status: String(d.status ?? ''), direction: String(d.direction ?? ''), label: d.label ?? null, amount: typeof d.amount === 'number' ? Math.round(d.amount * 100) : null };
}
