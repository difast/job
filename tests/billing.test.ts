import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { PLANS, extendUntil, getPlan, monthlyPrice, planLabel, priceNotes, savings } from '../src/lib/billing/plans';
import { computeSign, fetchOperation, parseNotification, quickpayFields, signString, verifySignature, yooMoneyState } from '../src/lib/billing/yoomoney';
import { periodStartFromPayments } from '../src/lib/admin/subscription';

const nbsp = (s: string) => s.replace(/[  ]/g, ' ');

test('тарифы: единые названия, цены, срок, эквивалент в месяц и экономия', () => {
  const m = getPlan('pro-month')!, q = getPlan('pro-quarter')!;
  assert.equal(m.name, 'Pro — 1 месяц'); assert.equal(q.name, 'Pro — 3 месяца');
  assert.equal(m.label, 'Pro · 1 месяц'); assert.equal(q.label, 'Pro · 3 месяца');
  assert.equal(m.price, 499_00); assert.equal(q.price, 1190_00);
  assert.equal(m.months, 1); assert.equal(q.months, 3);
  assert.equal(monthlyPrice(q), 397_00);
  assert.deepEqual(savings(q), { amount: 307_00, percent: 20.5 });
  assert.equal(savings(m), null);
  const n = priceNotes(q);
  assert.equal(nbsp(n.perMonth), '≈ 397 ₽ в месяц');
  assert.equal(nbsp(n.badge), 'Экономия 307 ₽');
  assert.match(nbsp(n.savings), /307 ₽ \(≈ 20,5 %\)/);
  assert.equal(n.oneTime, 'Разовый платёж, без автопродления');
  assert.equal(PLANS.filter((p) => p.price > 0).length, 2);
});

test('метка тарифа покупки не выводится из суммы, старый id — по снимку', () => {
  assert.equal(planLabel('pro-quarter', { planName: 'что угодно', months: 1 }), 'Pro · 3 месяца');
  assert.equal(planLabel('legacy-6m', { months: 6 }), 'Pro · 6 месяцев');
  assert.equal(planLabel('legacy-x', { planName: 'Старый тариф' }), 'Старый тариф');
});

test('даты: 3 месяца не превращаются в 1, продление во время активного Pro и после окончания', () => {
  const now = new Date('2026-01-31T10:00:00Z');
  assert.equal(extendUntil(null, 3, now).toISOString().slice(0, 10), '2026-04-30');
  assert.equal(extendUntil(null, 1, now).toISOString().slice(0, 10), '2026-02-28');
  assert.equal(extendUntil(new Date('2026-02-10T10:00:00Z'), 3, now).toISOString().slice(0, 10), '2026-05-10');
  assert.equal(extendUntil(new Date('2025-12-10T10:00:00Z'), 1, now).toISOString().slice(0, 10), '2026-02-28');
});

test('админка: начало непрерывного периода Pro по сохранённым датам доступа', () => {
  const d = (s: string) => new Date(s);
  const start = periodStartFromPayments([
    { planId: 'pro-month', paidAt: d('2026-01-01'), accessFrom: d('2026-01-01'), accessUntil: d('2026-02-01') },
    { planId: 'pro-month', paidAt: d('2026-05-01'), accessFrom: d('2026-05-01'), accessUntil: d('2026-06-01') },
    { planId: 'pro-quarter', paidAt: d('2026-05-20'), accessFrom: d('2026-06-01'), accessUntil: d('2026-09-01') },
  ]);
  assert.equal(start?.toISOString().slice(0, 10), '2026-05-01');
});

/* ───────── ЮMoney ───────── */
const SECRET = 'test-notification-secret';
function signed(p: Record<string, string>, secret = SECRET) {
  return { ...p, sign: createHmac('sha256', secret).update(signString(p), 'utf8').digest('hex') };
}
const base = {
  notification_type: 'card-incoming', operation_id: '904035776918098009', amount: '485.03', withdraw_amount: '499.00', currency: '643',
  datetime: '2026-10-10T12:00:00Z', sender: '', codepro: 'false', label: 'cmabcdefghijklmnopqrstuv', unaccepted: 'false',
};

test('ЮMoney: конфигурация только из окружения, без неё способ выключен', () => {
  assert.equal(yooMoneyState({}).state, 'off');
  const mis = yooMoneyState({ YOOMONEY_ENABLED: '1', YOOMONEY_WALLET: 'abc' });
  assert.equal(mis.state, 'misconfigured');
  assert.deepEqual(mis.state === 'misconfigured' && mis.missing, ['YOOMONEY_WALLET', 'YOOMONEY_NOTIFICATION_SECRET']);
  const ok = yooMoneyState({ YOOMONEY_ENABLED: 'true', YOOMONEY_WALLET: '4100111111111111', YOOMONEY_NOTIFICATION_SECRET: 's' });
  assert.equal(ok.state, 'ready');
  assert.equal(ok.state === 'ready' && ok.config.token, null);
});

test('ЮMoney: форма Quickpay — сумма и номер заказа с сервера, секретов нет', () => {
  const f = quickpayFields({ wallet: '4100111111111111', secret: 'SECRET', token: 'TOKEN' }, { orderId: 'ord1', amount: 1190_00, description: 'Clymly Pro — 3 месяца', successURL: 'https://clymly.ru/billing/result?order=ord1', paymentType: 'AC' });
  assert.equal(f.sum, '1190.00'); assert.equal(f.label, 'ord1'); assert.equal(f.receiver, '4100111111111111'); assert.equal(f['quickpay-form'], 'button');
  assert.ok(!JSON.stringify(f).includes('SECRET') && !JSON.stringify(f).includes('TOKEN'));
});

test('ЮMoney: подпись sign (HMAC-SHA256 по отсортированным параметрам) проверяется, подделка отклоняется', () => {
  const p = signed(base);
  assert.equal(signString(base).split('&')[0], 'amount=485.03'); // сортировка по алфавиту
  assert.equal(signString(base).includes('datetime=2026-10-10T12%3A00%3A00Z'), true); // URL-кодирование
  assert.ok(verifySignature(p, SECRET));
  assert.ok(!verifySignature(p, 'wrong-secret'));
  assert.ok(!verifySignature({ ...p, withdraw_amount: '1.00' }, SECRET), 'подмена суммы');
  assert.ok(!verifySignature({ ...p, label: 'cmother0000000000000000' }, SECRET), 'подмена заказа');
  assert.ok(!verifySignature({ ...base }, SECRET), 'без подписи');
  assert.ok(!verifySignature({ ...base, sign: 'zz' }, SECRET), 'мусор вместо подписи');
  assert.equal(computeSign(base, SECRET), p.sign);
});

test('ЮMoney: устаревшая подпись sha1_hash поддержана только с верным секретом', () => {
  const s = [base.notification_type, base.operation_id, base.amount, base.currency, base.datetime, base.sender, base.codepro, SECRET, base.label].join('&');
  const p = { ...base, sha1_hash: createHash('sha1').update(s).digest('hex') };
  assert.ok(verifySignature(p, SECRET));
  assert.ok(!verifySignature({ ...p, amount: '1.00' }, SECRET));
});

test('ЮMoney: разбор уведомления строго по формату', () => {
  const n = parseNotification(base)!;
  assert.equal(n.withdrawAmount, 499_00); assert.equal(n.amount, 485_03); assert.equal(n.orderId, base.label); assert.equal(n.unaccepted, false);
  assert.equal(parseNotification({ ...base, notification_type: 'outgoing' }), null);
  assert.equal(parseNotification({ ...base, amount: '1e3' }), null);
  assert.equal(parseNotification({ ...base, label: '../../etc' }), null);
  assert.equal(parseNotification({ ...base, operation_id: '' }), null);
  assert.equal(parseNotification({ ...base, label: '', test_notification: 'true' })?.test, true);
});

test('ЮMoney: сверка операции через API (мок fetch)', async () => {
  let seen: RequestInit | undefined;
  const mock = (async (_u: string, init?: RequestInit) => { seen = init; return new Response(JSON.stringify({ status: 'success', direction: 'in', label: 'x', amount: 485.03 }), { status: 200 }); }) as unknown as typeof fetch;
  const op = await fetchOperation('tok', '123', mock);
  assert.deepEqual(op, { status: 'success', direction: 'in', label: 'x', amount: 485_03 });
  assert.equal((seen!.headers as Record<string, string>).Authorization, 'Bearer tok');
  const bad = (async () => new Response(JSON.stringify({ error: 'invalid_token' }), { status: 200 })) as unknown as typeof fetch;
  await assert.rejects(fetchOperation('tok', '1', bad));
});
