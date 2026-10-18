// E2E оплаты подписки через ЮKassa с автопродлением и несколькими картами — против ИМИТАТОРА API ЮKassa
// (scripts/mock-yookassa.mjs), без реальных платежей. Сервер Clymly:
//   PAYMENT_PROVIDER=yookassa YOOKASSA_SHOP_ID=test-shop YOOKASSA_SECRET_KEY=test-secret YOOKASSA_API_URL=http://localhost:4300/v3
//   AUTOPAY_INTERVAL_MS=1500 REMINDER_HOURS=0-24 ADMIN_EMAILS=<ADMIN>
//   SMTP_HOST=localhost SMTP_PORT=465 SMTP_USER=mailer SMTP_PASSWORD=mailer-pass SMTP_FROM=… NODE_EXTRA_CA_CERTS=<cert>
// Запуск: SMTP_CERT=<cert> SMTP_KEY=<key> DATABASE_URL=… BASE_URL=http://localhost:3000 node scripts/autopay-e2e.mjs
import { PrismaClient } from '@prisma/client';
import { startMockYooKassa } from './mock-yookassa.mjs';
import { startMockSmtp } from './mock-smtp.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const ADMIN = process.env.ADMIN ?? 'admin_e2e@example.com';
const db = new PrismaClient();
let failed = 0;
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) failed++; };
const section = (t) => console.log(`\n— ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = Date.now();
const D = 86_400_000, H = 3_600_000;

const yk = await startMockYooKassa({ port: 4300 });
const smtpOpts = { port: 465, cert: process.env.SMTP_CERT, key: process.env.SMTP_KEY };
let smtp = await startMockSmtp(smtpOpts);
const mails = [];
const collect = () => { for (const m of smtp.state.messages.splice(0)) mails.push({ to: m.to.join(','), kind: m.raw.match(/^X-Clymly-Mail: (.+)$/m)?.[1]?.trim(), raw: Buffer.from(m.raw.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8') }); };
const mailOf = (email, kind) => { collect(); return mails.filter((m) => m.to.includes(email) && m.kind === kind); };
async function waitFor(fn, ms = 12_000) { for (let t = 0; t < ms; t += 300) { const v = await fn(); if (v) return v; await sleep(300); } return null; }
const ykCtl = (path, body = {}) => fetch(`http://localhost:4300${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const ykReqs = () => fetch('http://localhost:4300/__requests').then((r) => r.json());
const hook = (event, id) => fetch(`${BASE}/api/billing/yookassa`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'notification', event, object: { id } }) });

class Client {
  jar = new Map();
  async req(path, opts = {}) {
    const res = await fetch(BASE + path, { ...opts, redirect: 'manual', headers: { ...(opts.headers ?? {}), cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); this.jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    return res;
  }
  json(path, body, method = 'POST') { return this.req(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }); }
  text(path) { return this.req(path).then((r) => r.text()); }
}
const body = async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) });
async function user(tag) {
  const c = new Client(); const email = `ap_${tag}_${T}@example.com`;
  await c.json('/api/auth/register', { name: 'Анна Тест', email, password: 'password123', consent: true });
  await c.json('/api/profile', { professionId: 'product-manager', level: 'middle' }, 'PATCH');
  c.email = email; c.id = (await db.user.findUnique({ where: { email } })).id;
  return c;
}
/** Оплата Pro через имитатор: checkout → «оплата на странице ЮKassa» → уведомление. */
async function buy(c, planId, { save = false, card, hookIt = true } = {}) {
  const d = await body(await c.json('/api/billing/checkout', { planId }));
  if (d.status !== 200) return d;
  const p = await db.payment.findUnique({ where: { id: d.paymentId } });
  await ykCtl(`/__pay/${p.providerPaymentId}`, { save, card });
  if (hookIt) await hook('payment.succeeded', p.providerPaymentId);
  return { ...d, ykId: p.providerPaymentId };
}
const u = (id) => db.user.findUnique({ where: { id }, include: { cards: { orderBy: { createdAt: 'asc' } } } });
/** Подготовить цикл автосписания: напоминание отправлено N дней назад, Pro заканчивается через ms. */
async function dueSoon(id, { endsIn = 12 * H, noticeAgo = 4 * D, amount } = {}) {
  const planUntil = new Date(Date.now() + endsIn);
  await db.user.update({ where: { id }, data: { planUntil, autopayNotice: planUntil, autopayNoticeAt: new Date(Date.now() - noticeAgo), ...(amount ? { autopayAmount: amount } : {}), autopayLastTry: null } });
  return planUntil;
}
const recurring = (id) => db.payment.findMany({ where: { userId: id, recurring: true }, orderBy: { createdAt: 'asc' } });

/* ───────── Оплата подписки ───────── */
section('Оплата Pro через ЮKassa');
const A = await user('a');
let d = await body(await A.json('/api/billing/checkout', { planId: 'pro-month' }));
ok(d.status === 200 && d.confirmationUrl?.startsWith('http://localhost:4300/checkout/'), 'checkout: ссылка на страницу оплаты ЮKassa');
let req = (await ykReqs()).filter((r) => r.path === '/v3/payments').at(-1);
let pay = await db.payment.findUnique({ where: { id: d.paymentId } });
ok(req.key === pay.id && req.body.amount.value === '499.00' && req.body.amount.currency === 'RUB' && req.body.capture === true, 'POST /v3/payments: Idempotence-Key = номер заказа, сумма строкой «499.00», capture');
ok(req.body.metadata.order_id === pay.id && req.body.metadata.user_id === A.id && !('save_payment_method' in req.body), 'metadata {order_id, user_id}; save_payment_method не передаётся (решает галочка покупателя)');
ok(req.body.receipt?.customer?.email === A.email && req.body.receipt.items[0].vat_code === 1 && req.body.receipt.items[0].payment_mode === 'full_payment' && req.body.receipt.items[0].payment_subject === 'service', 'чек 54-ФЗ: e-mail, vat_code 1, full_payment, service');
ok(/\/payment\/return\?order=[a-z0-9]+&r=[\w-]{20,}$/.test(req.body.confirmation.return_url) && pay.returnKeyHash && !req.body.confirmation.return_url.includes(pay.returnKeyHash), 'return_url с одноразовым ключом; в базе только его хеш');
await ykCtl(`/__pay/${pay.providerPaymentId}`, { save: false });
ok((await hook('payment.succeeded', pay.providerPaymentId)).status === 200, 'уведомление payment.succeeded принято');
let ua = await u(A.id);
ok(ua.plan === 'pro' && ua.planUntil > new Date() && !ua.autopayPlan && ua.cards.length === 0, 'Pro включён по ответу API; без галочки — автопродление выключено, карт нет');
const until1 = ua.planUntil;
await hook('payment.succeeded', pay.providerPaymentId);
ok(+(await u(A.id)).planUntil === +until1, 'повторное уведомление не продлевает дважды');
ok((await waitFor(() => mailOf(A.email, 'payment')[0]))?.raw.includes('не включено'), 'письмо «Pro подключён»: «Автопродление — не включено»');
ok((await hook('payment.succeeded', 'yk-unknown-0000000000')).status === 200 && (await hook('payment.succeeded', '../x')).status === 400, 'неизвестный платёж — 200 без действий; мусорный id — 400');

section('Подмена суммы');
const B = await user('b');
d = await body(await B.json('/api/billing/checkout', { planId: 'pro-quarter' }));
pay = await db.payment.findUnique({ where: { id: d.paymentId } });
await ykCtl(`/__pay/${pay.providerPaymentId}`, { save: true });
await ykCtl(`/__tamper/${pay.providerPaymentId}`, { value: '1.00' });
await hook('payment.succeeded', pay.providerPaymentId);
pay = await db.payment.findUnique({ where: { id: d.paymentId } });
ok(pay.status === 'pending' && pay.issue === 'amount_mismatch' && (await u(B.id)).plan === 'free', 'сумма в ЮKassa не совпала с заказом — Pro не включён, заказ «требует проверки»');

/* ───────── Сохранение карты и автопродление ───────── */
section('Галочка «Запомнить данные карты» → автопродление');
const C = await user('c');
await buy(C, 'pro-month', { save: true, card: { type: 'Visa', last4: '1111' } });
let uc = await u(C.id);
ok(uc.autopayPlan === 'pro-month' && uc.cards.length === 1 && uc.cards[0].isPrimary && uc.cards[0].title === 'Visa •• 1111', 'карта сохранена как основная («Visa •• 1111»), автопродление тарифа «1 месяц» включено');
ok((await waitFor(() => mailOf(C.email, 'payment')[0]))?.raw.includes('включено'), 'письмо «Pro подключён» — с датой и суммой следующего списания');
let h = await C.text('/billing');
ok(h.includes('data-testid="cards-list"') && h.includes('Visa •• 1111') && h.includes('основная') && h.includes('data-testid="next-charge"'), '«Тариф и оплата»: карта, метка «основная», следующее списание');
ok((await body(await C.json('/api/billing/checkout', { planId: 'pro-month' }))).status === 409, 'при автопродлении «1 месяц» повторно купить месяц нельзя (409)');

section('Напоминание и списание только после него');
await smtp.close();
let pu = new Date(Date.now() + 2 * D);
await db.user.update({ where: { id: C.id }, data: { planUntil: pu, autopayNotice: null, autopayNoticeAt: null } });
await sleep(4500);
uc = await u(C.id);
ok(!uc.autopayNotice && (await recurring(C.id)).length === 0, 'письмо-напоминание не ушло (почта недоступна) — отметки нет, списания нет');
smtp = await startMockSmtp(smtpOpts);
const reminder = await waitFor(() => mailOf(C.email, 'autopay-reminder')[0]);
uc = await u(C.id);
ok(reminder && +uc.autopayNotice === +pu && uc.autopayAmount === 49900 && reminder.raw.includes('Visa •• 1111') && reminder.raw.includes('499'), 'почта снова работает — напоминание с датой, суммой 499 ₽ и картой; сумма зафиксирована');
await sleep(3000);
ok((await recurring(C.id)).length === 0, 'меньше 3 дней после напоминания — не списываем');
const cycleEnd = await dueSoon(C.id);
const r1 = await waitFor(async () => (await recurring(C.id)).find((p) => p.status === 'succeeded'));
req = (await ykReqs()).filter((r) => r.body?.payment_method_id).at(-1);
ok(r1 && req.body.payment_method_id === uc.cards[0].method && req.body.capture === true && !req.body.confirmation && req.body.metadata.recurring === '1' && req.key === r1.id && req.body.receipt, 'автосписание: payment_method_id основной карты, capture, без confirmation, recurring=1, чек, Idempotence-Key = заказ');
uc = await u(C.id);
ok(r1 && +r1.accessFrom === +cycleEnd && uc.planUntil > cycleEnd && Math.round((uc.planUntil - cycleEnd) / D) >= 28, 'Pro продлён на месяц от прежней даты окончания');
ok(!!(await waitFor(() => mailOf(C.email, 'autopay-renewed')[0])), 'письмо «Pro продлён»');
await sleep(3500);
ok((await recurring(C.id)).length === 1, 'повторных списаний в том же цикле нет');

section('Новая цена — только после уведомления');
await dueSoon(C.id, { amount: 45000 });
const r2 = await waitFor(async () => (await recurring(C.id)).find((p) => p.status === 'succeeded' && p.id !== r1.id));
ok(r2?.amount === 45000 && (await ykReqs()).filter((r) => r.body?.payment_method_id).at(-1).body.amount.value === '450.00', 'списана сумма из напоминания (450 ₽), а не текущая цена');

section('Неудачи: 3 попытки с основной, затем запасная карта');
const E = await user('e');
await buy(E, 'pro-month', { save: true, card: { last4: '0001' } });
let ue = await u(E.id);
await db.userCard.create({ data: { userId: E.id, method: `pm-backup-${T}`, title: 'MIR •• 0002', isPrimary: false } });
await ykCtl(`/__card/${ue.cards[0].method}`, { behavior: 'decline' });
await dueSoon(E.id);
await waitFor(async () => (await u(E.id)).autopayFails === 1);
ok((await u(E.id)).autopayFails === 1 && !!(await waitFor(() => mailOf(E.email, 'autopay-failed')[0]?.raw.includes('8 часов'))), 'попытка 1 не прошла — письмо «попробуем ещё раз через 8 часов»');
await sleep(3500);
ok((await recurring(E.id)).length === 1, 'повтор не раньше чем через 8 часов');
for (const n of [2, 3]) { await db.user.update({ where: { id: E.id }, data: { autopayLastTry: new Date(Date.now() - 9 * H) } }); await waitFor(async () => (await u(E.id)).autopayFails === n); }
ok((await u(E.id)).autopayFails === 3 && !!(await waitFor(() => mailOf(E.email, 'autopay-failed').find((m) => m.raw.includes('другой привязанной карты')))), '3-я неудача — письмо «попробуем другую карту»');
await db.user.update({ where: { id: E.id }, data: { autopayLastTry: new Date(Date.now() - 3 * 60_000) } });
const eOk = await waitFor(async () => (await recurring(E.id)).find((p) => p.status === 'succeeded'));
ue = await u(E.id);
ok(eOk && eOk.cardId === ue.cards.find((c) => c.title === 'MIR •• 0002').id && ue.autopayFails === 0, 'запасная карта прошла — Pro продлён, счётчик неудач сброшен');

section('Не прошло ни с одной карты');
const F = await user('f');
await buy(F, 'pro-month', { save: true, card: { last4: '0003' } });
const fCard = (await u(F.id)).cards[0];
await ykCtl(`/__card/${fCard.method}`, { behavior: 'decline' });
await dueSoon(F.id);
await waitFor(async () => (await u(F.id)).autopayFails === 1);
for (let i = 0; i < 2; i++) { const n = (await u(F.id)).autopayFails; await db.user.update({ where: { id: F.id }, data: { autopayLastTry: new Date(Date.now() - 9 * H) } }); await waitFor(async () => (await u(F.id)).autopayFails > n || !(await u(F.id)).autopayPlan); }
let uf = await waitFor(async () => { const x = await u(F.id); return !x.autopayPlan ? x : null; });
ok(uf && uf.cards.length === 0 && uf.plan === 'pro', 'автопродление выключено, карты удалены, Pro до конца срока');
ok(!!(await waitFor(() => mailOf(F.email, 'autopay-disabled')[0])), 'письмо «Автопродление Pro отключено»');

section('Отозванная карта удаляется сразу');
const G = await user('g');
await buy(G, 'pro-month', { save: true, card: { last4: '0004' } });
const gPrimary = (await u(G.id)).cards[0];
await db.userCard.create({ data: { userId: G.id, method: `pm-g2-${T}`, title: 'Visa •• 0005', isPrimary: false } });
await ykCtl(`/__card/${gPrimary.method}`, { behavior: 'permission_revoked' });
await dueSoon(G.id);
const gOk = await waitFor(async () => (await recurring(G.id)).find((p) => p.status === 'succeeded'), 15_000);
let ug = await u(G.id);
ok(!ug.cards.some((c) => c.id === gPrimary.id) && ug.cards[0]?.isPrimary && gOk?.cardId === ug.cards[0].id, 'отозванная основная удалена, следующая карта стала основной и списание прошло');

/* ───────── Привязка карты 1 ₽ ───────── */
section('Привязка новой карты проверочным платежом 1 ₽');
d = await body(await C.json('/api/billing/cards'));
let cp = await db.payment.findUnique({ where: { id: d.orderId } });
req = (await ykReqs()).filter((r) => r.path === '/v3/payments').at(-1);
ok(d.status === 200 && cp.kind === 'card' && req.body.amount.value === '1.00' && req.body.capture === false && req.body.save_payment_method === true && req.body.metadata.kind === 'card' && req.body.receipt, 'POST /api/billing/cards: 1.00, capture false, save_payment_method, metadata kind=card, чек');
await ykCtl(`/__pay/${cp.providerPaymentId}`, { save: true, card: { type: 'MIR', last4: '2222' } });
await hook('payment.waiting_for_capture', cp.providerPaymentId);
cp = await db.payment.findUnique({ where: { id: d.orderId } });
uc = await u(C.id);
const remote = (await fetch('http://localhost:4300/__payments').then((r) => r.json())).find((p) => p.id === cp.providerPaymentId);
ok(cp.status === 'card_saved' && uc.cards.length === 2 && uc.cards.find((c) => c.title === 'MIR •• 2222' && !c.isPrimary), 'карта добавлена (не основной), заказ «карта привязана»');
ok(remote.status === 'canceled' && remote.canceledByMerchant && (await ykReqs()).some((r) => r.path.endsWith('/cancel') && r.key === `${cp.id}-cancel`), '1 ₽ отменён: POST /cancel с Idempotence-Key «<заказ>-cancel»');
ok(!!(await waitFor(() => mailOf(C.email, 'card-bound')[0])), 'письмо «Карта привязана»');
d = await body(await C.json('/api/billing/cards'));
cp = await db.payment.findUnique({ where: { id: d.orderId } });
await ykCtl(`/__pay/${cp.providerPaymentId}`, { save: true, card: { type: 'Visa', last4: '3333' } });
h = await C.text(`/billing/result?order=${cp.id}`); // без уведомления: сверка при возврате
ok(h.includes('Карта привязана') && (await u(C.id)).cards.length === 3, 'без уведомления: страница возврата сама сверила статус — карта привязана');
ok(!(await C.text('/admin/payments?period=7')).includes(cp.id), 'проверочные платежи не показываются среди оплат');
for (let i = 0; i < 2; i++) await db.userCard.create({ data: { userId: C.id, method: `pm-fill-${i}-${T}`, title: `Card •• 900${i}`, isPrimary: false } });
ok((await body(await C.json('/api/billing/cards'))).status === 409, 'больше 5 карт привязать нельзя');
ok((await body(await A.json('/api/billing/cards'))).status === 200 && (await body(await (await user('nopro')).json('/api/billing/cards'))).status === 409, 'без действующего Pro привязать карту нельзя');

section('Карты в профиле: основная и удаление по одной');
uc = await u(C.id);
const second = uc.cards.find((c) => !c.isPrimary);
ok((await C.json(`/api/billing/cards/${second.id}/primary`)).status === 200 && (await u(C.id)).cards.find((c) => c.id === second.id).isPrimary, '«Сделать основной»');
const other = await user('other');
ok((await other.json(`/api/billing/cards/${second.id}/delete`)).status === 404, 'чужую карту удалить нельзя (404)');
await C.json(`/api/billing/cards/${second.id}/delete`);
uc = await u(C.id);
ok(uc.cards.length === 4 && uc.cards.filter((c) => c.isPrimary).length === 1 && uc.cards[0].isPrimary && uc.autopayPlan, 'удалили основную — основной стала самая ранняя, автопродление работает');
ok(!!(await waitFor(() => mailOf(C.email, 'card-removed')[0])), 'письмо «Карта удалена»');
for (const c of uc.cards) await C.json(`/api/billing/cards/${c.id}/delete`);
uc = await u(C.id);
ok(uc.cards.length === 0 && !uc.autopayPlan && uc.plan === 'pro', 'удалили последнюю — автопродление выключено, Pro до конца срока');
ok(!!(await waitFor(() => mailOf(C.email, 'card-unlinked')[0])) && (await C.text('/billing')).includes('data-testid="autopay-off"'), 'письмо «Карта отвязана»; в профиле «Автопродление выключено» и «Привязать карту»');

/* ───────── Возврат ───────── */
section('Возврат денег');
const R = await user('r');
const rb = await buy(R, 'pro-month', { save: true });
const before = (await u(R.id)).planUntil;
const refund = await ykCtl(`/__refund/${rb.ykId}`);
await hook('refund.succeeded', refund.id);
const rp = await db.payment.findUnique({ where: { id: rb.paymentId } });
const ur = await u(R.id);
ok(rp.status === 'refunded' && ur.planUntil < before && ur.planUntil <= new Date(Date.now() + 60_000) && !ur.autopayPlan && ur.cards.length === 0, 'полный возврат: статус «Возврат», срок сокращён, автопродление выключено, карты удалены');

/* ───────── Возврат в другом браузере ───────── */
section('Возврат на сайт в другом браузере');
const Q = await user('q');
d = await body(await Q.json('/api/billing/checkout', { planId: 'pro-month' }));
const rurl = (await ykReqs()).filter((r) => r.path === '/v3/payments').at(-1).body.confirmation.return_url;
const key = new URL(rurl).searchParams.get('r');
const stranger = new Client();
h = await stranger.text(`/payment/return?order=${d.paymentId}&r=${key}`);
ok(h.includes('data-testid="return-wait"'), 'чужой браузер: страница возврата восстанавливает вход по ключу');
ok((await stranger.json('/api/billing/resume', { order: d.paymentId, r: 'x'.repeat(30) })).status === 403, 'неверный ключ — 403');
ok((await stranger.json('/api/billing/resume', { order: d.paymentId, r: key })).status === 200 && (await stranger.req('/billing/result?order=' + d.paymentId)).status === 200, 'верный ключ: вход восстановлен, результат открывается');
ok((await new Client().json('/api/billing/resume', { order: d.paymentId, r: key })).status === 403, 'ключ одноразовый');
const P2 = await db.payment.findUnique({ where: { id: d.paymentId } });
ok(!P2.returnKeyHash, 'после использования хеш ключа удалён');

/* ───────── Админка ───────── */
section('Админка');
const admin = new Client();
await admin.json('/api/auth/register', { name: 'Админ', email: ADMIN, password: 'password123', consent: true });
await admin.json('/api/auth/login', { email: ADMIN, password: 'password123' });
await admin.json('/api/profile', { professionId: 'product-manager', level: 'middle' }, 'PATCH');
h = (await admin.text('/admin/payments?period=7')).replace(/<!-- -->/g, '');
ok(h.includes('автопродление') && !h.includes(cp.id), 'платежи: автосписания помечены, проверочные 1 ₽ скрыты');
ok((await admin.text('/admin/payments?period=7&status=refunded')).includes(rb.paymentId), 'фильтр «Возврат»');
ok((await admin.text('/admin')).includes('data-testid="kpi-autopay"'), 'обзор: «С автопродлением»');

await yk.close(); await smtp.close(); await db.$disconnect();
console.log(failed ? `\n❌ Провалено: ${failed}` : '\n✅ Все проверки автопродления (имитатор ЮKassa) пройдены');
process.exit(failed ? 1 : 0);
