// Платёжный провайдер. По умолчанию — заглушка (тестовая оплата без списания денег).
// ЮKassa включается переменными окружения PAYMENT_PROVIDER=yookassa, YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY.
import { randomUUID } from 'node:crypto';

export type PaymentStatus = 'pending' | 'succeeded' | 'canceled';

export interface CreatePaymentInput {
  paymentId: string; // наш id (Payment.id), он же ключ идемпотентности
  amount: number; // копейки
  description: string;
  returnUrl: string;
  customerEmail: string;
}

export interface PaymentProvider {
  name: 'stub' | 'yookassa';
  createPayment(input: CreatePaymentInput): Promise<{ providerPaymentId: string; confirmationUrl: string; status: PaymentStatus }>;
  /** Актуальный статус у провайдера — используется для проверки уведомлений и возврата пользователя. */
  getStatus(providerPaymentId: string): Promise<PaymentStatus>;
}

/* ───────── Заглушка ───────── */
const stub: PaymentProvider = {
  name: 'stub',
  async createPayment(i) {
    return { providerPaymentId: `stub_${i.paymentId}`, confirmationUrl: `/pay/stub/${i.paymentId}`, status: 'pending' };
  },
  async getStatus() {
    return 'pending'; // статус заглушки хранится только у нас, его меняет страница тестовой оплаты
  },
};

/* ───────── ЮKassa (API v3) — подготовлено, не проверено на боевом магазине ───────── */
const YK_API = 'https://api.yookassa.ru/v3';

function ykAuth() {
  const shop = process.env.YOOKASSA_SHOP_ID, key = process.env.YOOKASSA_SECRET_KEY;
  if (!shop || !key) throw new Error('YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY не заданы');
  return 'Basic ' + Buffer.from(`${shop}:${key}`).toString('base64');
}

const ykStatus = (s: string): PaymentStatus => (s === 'succeeded' ? 'succeeded' : s === 'canceled' ? 'canceled' : 'pending');

const yookassa: PaymentProvider = {
  name: 'yookassa',
  async createPayment(i) {
    const body: Record<string, unknown> = {
      amount: { value: (i.amount / 100).toFixed(2), currency: 'RUB' },
      capture: true,
      confirmation: { type: 'redirect', return_url: i.returnUrl },
      description: i.description.slice(0, 128),
      metadata: { paymentId: i.paymentId },
    };
    // Чек по 54-ФЗ: включите, если в магазине ЮKassa подключена отправка чеков
    if (process.env.YOOKASSA_RECEIPT === '1') {
      body.receipt = {
        customer: { email: i.customerEmail },
        items: [{ description: i.description.slice(0, 128), quantity: '1.00', amount: body.amount, vat_code: Number(process.env.YOOKASSA_VAT_CODE ?? 1), payment_mode: 'full_payment', payment_subject: 'service' }],
      };
    }
    const r = await fetch(`${YK_API}/payments`, {
      method: 'POST',
      headers: { Authorization: ykAuth(), 'Idempotence-Key': i.paymentId || randomUUID(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`ЮKassa: ${r.status} ${await r.text().catch(() => '')}`);
    const p = await r.json();
    return { providerPaymentId: p.id, confirmationUrl: p.confirmation?.confirmation_url, status: ykStatus(p.status) };
  },
  async getStatus(id) {
    const r = await fetch(`${YK_API}/payments/${encodeURIComponent(id)}`, { headers: { Authorization: ykAuth() } });
    if (!r.ok) throw new Error(`ЮKassa: ${r.status}`);
    return ykStatus((await r.json()).status);
  },
};

export function getProvider(): PaymentProvider {
  return process.env.PAYMENT_PROVIDER === 'yookassa' ? yookassa : stub;
}

export const isTestMode = () => getProvider().name === 'stub';
