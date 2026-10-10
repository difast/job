// E2E оплаты через ЮMoney с мок-уведомлениями (реальные запросы в ЮMoney не отправляются).
// Сервер A: YOOMONEY_ENABLED=1 YOOMONEY_WALLET=4100111111111111 YOOMONEY_NOTIFICATION_SECRET=<SECRET> ADMIN_EMAILS=<ADMIN> (карта — заглушка stub).
// Сервер B (необязательно, BASE2): без ЮMoney, PAYMENT_PROVIDER=yookassa без ключей — проверка «способ не подключён» и ошибки создания платежа.
// Запуск: BASE_URL=http://localhost:3000 BASE2=http://localhost:3001 SECRET=<SECRET> ADMIN=<ADMIN> DATABASE_URL=… node scripts/yoomoney-e2e.mjs
import { createHmac } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const BASE2 = process.env.BASE2;
const SECRET = process.env.SECRET ?? 'e2e-notification-secret';
const ADMIN = process.env.ADMIN ?? 'admin_e2e@example.com';
const db = new PrismaClient();
let failed = 0;
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) failed++; };
const section = (t) => console.log(`\n— ${t}`);
const T = Date.now();

class Client {
  jar = new Map();
  constructor(base = BASE) { this.base = base; }
  async req(path, opts = {}) {
    const res = await fetch(this.base + path, { ...opts, redirect: 'manual', headers: { ...(opts.headers ?? {}), cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (!v || /max-age=0/i.test(c)) this.jar.delete(k); else this.jar.set(k, v); }
    return res;
  }
  json(path, body, method = 'POST') { return this.req(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  text(path) { return this.req(path).then((r) => r.text()); }
}
async function newUser(email, base = BASE) {
  const c = new Client(base);
  await c.json('/api/auth/register', { name: 'Тест', email, password: 'password123', consent: true });
  await c.json('/api/profile', { professionId: 'product-manager', level: 'middle' }, 'PATCH');
  return c;
}
const checkout = async (c, body) => { const r = await c.json('/api/billing/checkout', body); return { status: r.status, ...(await r.json()) }; };

/* Уведомление ЮMoney: подпись sign = HMAC-SHA256(hex) от URL-кодированной строки параметров, отсортированных по алфавиту */
const enc = (v) => new URLSearchParams([['', v]]).toString().slice(1);
const sign = (p, secret = SECRET) => createHmac('sha256', secret).update(Object.keys(p).sort().map((k) => `${enc(k)}=${enc(p[k])}`).join('&')).digest('hex');
let opSeq = 0;
function note(orderId, over = {}, secret = SECRET) {
  const p = { notification_type: 'card-incoming', operation_id: `op${T}${++opSeq}`, amount: '485.03', withdraw_amount: '499.00', currency: '643', datetime: new Date().toISOString(), sender: '', codepro: 'false', label: orderId, unaccepted: 'false', ...over };
  return { ...p, sign: sign(p, secret) };
}
const notify = (params, contentType = 'application/x-www-form-urlencoded') => fetch(BASE + '/api/billing/yoomoney', { method: 'POST', headers: { 'Content-Type': contentType }, body: new URLSearchParams(params).toString() });
const user = (email) => db.user.findUnique({ where: { email } });
const pay = (id) => db.payment.findUnique({ where: { id }, include: { events: { orderBy: { createdAt: 'asc' } } } });
const days = (a, b) => Math.round((b - a) / 86_400_000);

/* ───────── Создание заказа ───────── */
section('Создание заказа ЮMoney');
const emailA = `ym_a_${T}@example.com`;
const A = await newUser(emailA);
let d = await checkout(A, { planId: 'pro-month', method: 'yoomoney', amount: 1, price: 1, userId: 'someone-else' });
ok(d.status === 200 && d.confirmationUrl === `/pay/yoomoney/${d.paymentId}`, 'Pro — 1 месяц: заказ создан, ссылка на переход к оплате ЮMoney');
const m1 = d.paymentId;
let p = await pay(m1);
ok(p.amount === 49900 && p.currency === 'RUB' && p.planId === 'pro-month' && p.planName === 'Pro — 1 месяц' && p.months === 1 && p.provider === 'yoomoney', 'сумма, срок и название — с сервера (подмена amount/price/userId игнорируется)');
ok(p.userId === (await user(emailA)).id && p.status === 'pending' && p.providerPaymentId === null && !p.paidAt && !p.accessFrom, 'заказ привязан к пользователю, начальный статус pending, доступ не выдан');
ok(p.events.length === 1 && p.events[0].status === 'pending' && p.events[0].source === 'checkout', 'история статусов: создание заказа');
d = await checkout(A, { planId: 'pro-month', method: 'yoomoney' });
ok(d.paymentId === m1 && (await db.payment.count({ where: { userId: p.userId } })) === 1, 'повторный запрос не создаёт второй заказ');
const both = await Promise.all([checkout(A, { planId: 'pro-quarter', method: 'yoomoney' }), checkout(A, { planId: 'pro-quarter', method: 'yoomoney' })]);
ok(both[0].paymentId === both[1].paymentId, 'параллельные запросы на один тариф — один заказ');
const q1 = both[0].paymentId;
p = await pay(q1);
ok(p.amount === 119000 && p.months === 3 && p.planName === 'Pro — 3 месяца', 'Pro — 3 месяца: 1 190 ₽, 3 месяца');
ok((await checkout(A, { planId: 'free', method: 'yoomoney' })).status === 400, 'бесплатный тариф оплатить нельзя');
ok((await checkout(A, { planId: 'pro-forever', method: 'yoomoney' })).status === 400, 'несуществующий тариф — 400');
ok((await checkout(A, { planId: 'pro-month', method: 'bitcoin' })).status === 400, 'неизвестный способ оплаты — 400');
ok((await checkout(new Client(), { planId: 'pro-month', method: 'yoomoney' })).status === 401, 'без входа — 401');

section('Страница перехода к оплате');
let h = await A.text(`/pay/yoomoney/${m1}`);
ok(h.includes('action="https://yoomoney.ru/quickpay/confirm"') && h.includes(`name="label" value="${m1}"`) && h.includes('name="sum" value="499.00"') && h.includes('name="receiver" value="4100111111111111"'), 'форма Quickpay: номер кошелька, сумма и номер заказа');
ok(h.includes('Банковской картой') && h.includes('Кошельком ЮMoney') && h.includes(`/billing/result?order=${m1}`), 'выбор карта / кошелёк, адрес возврата на страницу результата');
ok(!h.includes(SECRET), 'секрет уведомлений не попадает в страницу');
const B = await newUser(`ym_b_${T}@example.com`);
ok((await B.req(`/pay/yoomoney/${m1}`)).status === 404, 'чужой заказ — 404');

section('Возврат до подтверждения');
h = await A.text(`/billing/result?order=${m1}&success=true&status=succeeded`);
ok(h.includes('data-state="awaiting"') && h.includes('Ждём подтверждения оплаты') && h.includes('data-testid="pay-refresh"'), 'возврат с «success» в адресе — «ждём подтверждения», есть обновление статуса');
ok((await user(emailA)).plan === 'free', 'Pro не включён по странице возврата');
ok((await B.text(`/billing/result?order=${m1}`)).includes('data-state="unknown"'), 'чужой заказ на странице результата — «не удалось проверить»');

/* ───────── Уведомления ───────── */
section('Уведомления: формат и подлинность');
let r = await notify({});
ok(r.status === 400, 'пустое уведомление — 400');
r = await fetch(BASE + '/api/billing/yoomoney', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(note(m1)) });
ok(r.status === 400, 'не form-urlencoded — 400');
r = await notify(note(m1, {}, 'forged-secret'));
ok(r.status === 400, 'подпись чужим секретом — 400');
const forged = note(m1); forged.withdraw_amount = '1.00';
ok((await notify(forged)).status === 400, 'изменённая после подписи сумма — 400');
const noSign = note(m1); delete noSign.sign;
ok((await notify(noSign)).status === 400, 'без подписи — 400');
ok((await notify(note(m1, { notification_type: 'outgoing-transfer' }))).status === 400, 'неожиданный тип уведомления — 400');
ok((await notify(note('', { test_notification: 'true' }))).status === 200, 'проверочное уведомление из настроек кошелька — 200 без действий');
p = await pay(m1);
ok(p.status === 'pending' && (await user(emailA)).plan === 'free', 'после отклонённых уведомлений заказ не оплачен, Pro не включён');

section('Уведомления: несовпадения');
r = await notify(note(q1, { withdraw_amount: '499.00' }));
p = await pay(q1);
ok(r.status === 200 && p.status === 'pending' && p.issue === 'amount_mismatch' && (await user(emailA)).plan === 'free', 'сумма не совпала (499 вместо 1 190) — заказ «требует проверки», Pro не включён');
ok((await A.text(`/billing/result?order=${q1}`)).includes('data-state="review"'), 'страница результата: «не удалось проверить оплату»');
const c1 = (await checkout(B, { planId: 'pro-month', method: 'yoomoney' })).paymentId;
r = await notify(note(c1, { currency: '840' }));
ok(r.status === 200 && (await pay(c1)).issue === 'currency_mismatch', 'валюта не RUB — «требует проверки»');
const u1 = (await checkout(B, { planId: 'pro-quarter', method: 'yoomoney' })).paymentId;
r = await notify(note(u1, { withdraw_amount: '1190.00', unaccepted: 'true' }));
ok(r.status === 200 && (await pay(u1)).issue === 'unaccepted' && (await user(`ym_b_${T}@example.com`)).plan === 'free', 'перевод не зачислен (unaccepted) — не активируем');
r = await notify(note('cm0000000000000000000000', {}));
ok(r.status === 200, 'перевод с чужим label — 200, без действий');

section('Подтверждённая оплата');
const good = note(m1);
r = await notify(good);
p = await pay(m1);
let ua = await user(emailA);
ok(r.status === 200 && (await r.text()) === 'OK', 'верное уведомление — 200 OK');
ok(p.status === 'succeeded' && p.providerPaymentId === good.operation_id && p.paidAt && p.issue === null, 'заказ оплачен, сохранён id операции ЮMoney и дата оплаты');
ok(ua.plan === 'pro' && +ua.planUntil === +p.accessUntil && days(p.accessFrom, p.accessUntil) >= 28 && days(p.accessFrom, p.accessUntil) <= 31, 'Pro включён на 1 календарный месяц');
const firstUntil = ua.planUntil;
h = await A.text(`/billing/result?order=${m1}`);
ok(h.includes('data-state="paid"') && h.includes('Оплата подтверждена') && h.includes('Pro — 1 месяц'), 'страница результата: «оплата подтверждена», тариф и срок');
h = (await A.text('/billing')).replace(/[  ]/g, ' ');
ok(h.includes('data-testid="current-tier">Pro · 1 месяц<') && h.includes('ЮMoney') && h.includes('Pro с '), 'кабинет: текущий тариф «Pro · 1 месяц», в истории — ЮMoney и срок доступа');

section('Повторы и защита от двойной активации');
r = await notify(good);
ua = await user(emailA);
ok(r.status === 200 && +ua.planUntil === +firstUntil, 'повтор того же уведомления — 200, срок не продлён повторно');
r = await notify(note(m1));
p = await pay(m1);
ok(r.status === 200 && p.issue === 'duplicate_payment' && +(await user(emailA)).planUntil === +firstUntil, 'вторая оплата уже оплаченного заказа — «требует проверки», Pro не продлён');
await db.payment.update({ where: { id: m1 }, data: { issue: null } });
const q2 = (await checkout(B, { planId: 'pro-quarter', method: 'yoomoney' })).paymentId;
r = await notify(note(q2, { operation_id: good.operation_id, withdraw_amount: '1190.00' }));
ok(r.status === 200 && (await pay(q2)).status === 'pending' && (await pay(q2)).issue === 'duplicate_payment', 'операция другого заказа не оплачивает чужой заказ');
p = await pay(m1);
ok(p.events.some((e) => e.status === 'duplicate') && p.events.filter((e) => e.status === 'succeeded').length === 1, 'история: одно «оплачен», повторы записаны отдельно');

section('Покупка во время активного Pro');
const q3 = (await checkout(A, { planId: 'pro-quarter', method: 'yoomoney' })).paymentId;
ok(q3 !== q1, 'заказ с проблемой не переиспользуется — создан новый');
r = await notify(note(q3, { withdraw_amount: '1190.00', amount: '1156.70' }));
p = await pay(q3); ua = await user(emailA);
ok(r.status === 200 && p.status === 'succeeded' && +p.accessFrom === +firstUntil, '3 месяца добавлены к концу текущего периода');
ok(+ua.planUntil === +p.accessUntil && days(p.accessFrom, p.accessUntil) >= 89 && days(p.accessFrom, p.accessUntil) <= 92, '3 месяца, а не 1: срок продлён на 3 календарных месяца');

section('Способ «карта» (заглушка) по-прежнему работает');
const C = await newUser(`ym_c_${T}@example.com`);
d = await checkout(C, { planId: 'pro-quarter' });
ok(d.confirmationUrl === `/pay/stub/${d.paymentId}`, 'карта: тестовая страница оплаты');
r = await C.json(`/api/billing/stub/${d.paymentId}`, { action: 'succeed' });
const sr = await r.json();
p = await pay(d.paymentId);
ok(sr.redirect === `/billing/result?order=${d.paymentId}` && p.status === 'succeeded' && p.provider === 'stub' && days(p.accessFrom, p.accessUntil) >= 89, 'карта: оплата 3 месяцев, возврат на страницу результата');

/* ───────── Админка ───────── */
section('Админка');
const admin = new Client();
await admin.json('/api/auth/register', { name: 'Админ', email: ADMIN, password: 'password123', consent: true });
await admin.json('/api/auth/login', { email: ADMIN, password: 'password123' });
await admin.json('/api/profile', { professionId: 'product-manager', level: 'middle' }, 'PATCH');
h = (await admin.text('/admin/payments?period=7&provider=yoomoney')).replace(/<!-- -->/g, '');
ok(h.includes('data-testid="payment-provider">ЮMoney<') && !h.includes('data-provider="stub"'), 'фильтр по провайдеру: ЮMoney');
ok(h.includes('>Pro · 1 месяц<') && h.includes('>Pro · 3 месяца<') && h.includes(good.operation_id), 'тарифы различимы, видны номер заказа и id операции');
ok(h.includes('Сумма не совпала с заказом') && h.includes('Повторная оплата заказа'), 'причины «требует проверки» видны');
{ const since7 = new Date(Date.now() - 6 * 86_400_000); since7.setUTCHours(0, 0, 0, 0); since7.setTime(since7.getTime() - 3 * 3_600_000);
  const w = { provider: 'yoomoney', createdAt: { gte: since7 } };
  const [pend, rev] = await Promise.all([db.payment.count({ where: { ...w, status: 'pending', issue: null } }), db.payment.count({ where: { ...w, issue: { not: null } } })]);
  const val = (id) => h.match(new RegExp(`data-testid="${id}"[\\s\\S]*?tabular[^>]*>(\\d+)<`))?.[1];
  ok(val('pay-pending') === String(pend) && val('pay-review') === String(rev) && rev > 0, `KPI: «Ожидают оплаты» (${pend}) без заказов «Требуют проверки» (${rev})`); }
h = (await admin.text('/admin/payments?period=7&status=review')).replace(/<!-- -->/g, '');
ok(h.includes(q1) && !h.includes(`>${m1}<`), 'фильтр «требует проверки»');
h = (await admin.text('/admin/payments?period=7&plan=pro-quarter&provider=yoomoney')).replace(/<!-- -->/g, '');
ok(h.includes(q3) && !h.includes(`>${m1}<`), 'фильтр по тарифу');
const stat = (html, plan, id) => { const i = html.indexOf(`data-plan="${plan}"`); const m = html.slice(i).match(new RegExp(`data-testid="${id}"[^>]*>([^<]*)<`)); return m?.[1]; };
h = (await admin.text('/admin/payments?period=7&provider=yoomoney')).replace(/<!-- -->/g, '').replace(/[  ]/g, ' ');
// Ожидаемые значения — из базы (тестовая БД может содержать прошлые прогоны)
const since = new Date(Date.now() - 6 * 86_400_000); since.setUTCHours(0, 0, 0, 0); since.setTime(since.getTime() - 3 * 3_600_000);
const ymPaid = await db.payment.findMany({ where: { provider: 'yoomoney', status: 'succeeded', createdAt: { gte: since } } });
const rub = (k) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(k / 100).replace(/[\u00a0\u202f]/g, ' ');
const by = (plan) => ymPaid.filter((x) => x.planId === plan);
const allPending = await db.payment.count({ where: { provider: 'yoomoney', status: { not: 'succeeded' }, createdAt: { gte: since } } });
ok(allPending > 0 && stat(h, 'pro-month', 'plan-stat-purchases') === String(by('pro-month').length) && stat(h, 'pro-quarter', 'plan-stat-purchases') === String(by('pro-quarter').length), 'по тарифам: только подтверждённые покупки (несовпадения и ожидающие не считаются)');
ok(stat(h, 'pro-month', 'plan-stat-revenue') === rub(by('pro-month').reduce((a, x) => a + x.amount, 0)) && stat(h, 'pro-quarter', 'plan-stat-revenue') === rub(by('pro-quarter').reduce((a, x) => a + x.amount, 0)), 'выручка по тарифам из фактических сумм заказов');
ok(stat(h, 'pro-quarter', 'plan-stat-buyers') === String(new Set(by('pro-quarter').map((x) => x.userId)).size) && new RegExp(`data-testid="plan-stat-buyers-total"[^>]*>${new Set(ymPaid.map((x) => x.userId)).size}<`).test(h), 'уникальные покупатели: купивший оба тарифа в итоге считается один раз');
h = (await admin.text(`/admin/users?q=${encodeURIComponent(emailA)}`)).replace(/<!-- -->/g, '');
ok(h.includes('Последняя зафиксированная активность') && h.includes('data-testid="user-plan">Pro · 1 месяц'), 'пользователи: текущий тариф «Pro · 1 месяц» (3 месяца начнутся после него)');
h = (await admin.text('/admin')).replace(/<!-- -->/g, '');
ok(h.includes('Покупки по тарифам') && h.includes('data-testid="plan-stats"'), 'обзор: покупки по тарифам');

/* ───────── Сервер без ЮMoney ───────── */
if (BASE2) {
  section('Сервер без ЮMoney и с ненастроенной ЮKassa');
  const D = await newUser(`ym_d_${T}@example.com`, BASE2);
  d = await checkout(D, { planId: 'pro-month', method: 'yoomoney' });
  ok(d.status === 400 && d.error.includes('ЮMoney не подключена'), 'ЮMoney не настроен — понятное сообщение, заказ не создаётся');
  ok(!(await D.text('/billing')).includes('pay-yoomoney'), 'кнопки ЮMoney нет, если способ не включён');
  ok((await fetch(BASE2 + '/api/billing/yoomoney', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'a=1' })).status === 404, 'адрес уведомлений выключен');
  d = await checkout(D, { planId: 'pro-month' });
  const last = await db.payment.findFirst({ where: { user: { email: `ym_d_${T}@example.com` } }, orderBy: { createdAt: 'desc' }, include: { events: true } });
  ok(d.status === 502 && d.error.includes('временно недоступен') && last.status === 'canceled' && last.events.some((e) => e.status === 'canceled'), 'ошибка создания платежа у провайдера — 502, заказ отменён, без ссылки на оплату');
}

await db.$disconnect();
console.log(failed ? `\n❌ Провалено: ${failed}` : '\n✅ Все проверки ЮMoney пройдены');
process.exit(failed ? 1 : 0);
