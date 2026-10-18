// Платёжные провайдеры. Общая бизнес-логика заказа — в service.ts, здесь только адаптеры.
// «Карта»: заглушка (тестовая оплата без списания денег) или ЮKassa (PAYMENT_PROVIDER=yookassa, YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY).
// ЮMoney — отдельный способ оплаты (YOOMONEY_ENABLED=1, см. yoomoney.ts), работает параллельно со способом «карта».
import { ApiError } from '../http';
import { yooMoneyState } from './yoomoney';
import { createYkPayment, getYkPayment } from './yookassa';

export type PaymentStatus = 'pending' | 'succeeded' | 'canceled';

export interface CreatePaymentInput {
  paymentId: string; // наш id (Payment.id), он же ключ идемпотентности
  amount: number; // копейки
  description: string;
  returnUrl: string;
  customerEmail: string;
  userId?: string;
}

export type ProviderName = 'stub' | 'yookassa' | 'yoomoney';
export const PROVIDER_LABEL: Record<string, string> = { stub: 'Тестовый', yookassa: 'ЮKassa', yoomoney: 'ЮMoney' };

export interface PaymentProvider {
  name: ProviderName;
  /** Создаёт платёж у провайдера. providerPaymentId может появиться позже (у ЮMoney — operation_id из уведомления). */
  createPayment(input: CreatePaymentInput): Promise<{ providerPaymentId: string | null; confirmationUrl: string; status: PaymentStatus }>;
  /** Актуальный статус у провайдера по его id платежа; null — провайдер не умеет проверять статус по запросу. */
  getStatus(providerPaymentId: string): Promise<PaymentStatus | null>;
}

/* ───────── Заглушка ───────── */
const stub: PaymentProvider = {
  name: 'stub',
  async createPayment(i) {
    return { providerPaymentId: `stub_${i.paymentId}`, confirmationUrl: `/pay/stub/${i.paymentId}`, status: 'pending' };
  },
  async getStatus() {
    return null; // статус заглушки хранится только у нас, его меняет страница тестовой оплаты
  },
};

/* ───────── ЮKassa (API v3) — клиент в yookassa.ts ───────── */
const ykStatus = (s: string): PaymentStatus => (s === 'succeeded' ? 'succeeded' : s === 'canceled' ? 'canceled' : 'pending');

const yookassa: PaymentProvider = {
  name: 'yookassa',
  async createPayment(i) {
    // save_payment_method не передаём: сохранить карту для автопродления решает сам покупатель галочкой на странице ЮKassa
    const p = await createYkPayment({ orderId: i.paymentId, userId: i.userId ?? '', kopecks: i.amount, description: i.description, email: i.customerEmail, returnUrl: i.returnUrl });
    return { providerPaymentId: p.id, confirmationUrl: p.confirmation?.confirmation_url ?? '', status: ykStatus(p.status) };
  },
  async getStatus(id) {
    return ykStatus((await getYkPayment(id)).status);
  },
};

/* ───────── ЮMoney (форма Quickpay) ───────── */
const yoomoney: PaymentProvider = {
  name: 'yoomoney',
  async createPayment(i) {
    // У ЮMoney нет API создания платежа: заказ оплачивается формой Quickpay. Страница /pay/yoomoney/<id>
    // отправляет форму на yoomoney.ru с номером заказа в label; id операции придёт в уведомлении.
    return { providerPaymentId: null, confirmationUrl: `/pay/yoomoney/${i.paymentId}`, status: 'pending' };
  },
  async getStatus() {
    return null; // статус подтверждается только уведомлением (см. api/billing/yoomoney)
  },
};

/** Провайдер способа «карта» (основной). */
export function getProvider(): PaymentProvider {
  return process.env.PAYMENT_PROVIDER === 'yookassa' ? yookassa : stub;
}

export function providerByName(name: string): PaymentProvider | null {
  return name === 'yookassa' ? yookassa : name === 'stub' ? stub : name === 'yoomoney' ? yoomoney : null;
}

export type PaymentMethod = 'card' | 'yoomoney';

/** Провайдер выбранного способа оплаты; понятная ошибка, если способ не подключён. */
export function providerForMethod(method: PaymentMethod): PaymentProvider {
  if (method === 'card') return getProvider();
  const st = yooMoneyState();
  if (st.state === 'off') throw new ApiError(400, 'Оплата через ЮMoney не подключена. Выберите другой способ оплаты.');
  if (st.state === 'misconfigured') {
    console.error('[billing] ЮMoney включён, но не настроен: не заданы', st.missing.join(', ')); // только имена переменных
    throw new ApiError(503, 'Оплата через ЮMoney временно недоступна. Выберите другой способ оплаты или попробуйте позже.');
  }
  return yoomoney;
}

/** Способы оплаты для интерфейса: ЮMoney показывается, только если включён на сервере. */
export const yooMoneyOffered = () => yooMoneyState().state !== 'off';

export const isTestMode = () => getProvider().name === 'stub';
