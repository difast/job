// E2E служебных писем с SMTP-заглушкой: подтверждение → приветствие, восстановление и смена пароля,
// письмо об оплате, напоминание и окончание Pro. Сервер Clymly:
//   SMTP_HOST=localhost SMTP_PORT=465 SMTP_USER=mailer SMTP_PASSWORD=mailer-pass SMTP_FROM="Clymly <no-reply@clymly.ru>"
//   NODE_EXTRA_CA_CERTS=<cert> MAIL_JOBS_INTERVAL_MS=2000 (тариф — заглушка stub)
// Запуск: SMTP_CERT=<cert> SMTP_KEY=<key> DATABASE_URL=… BASE_URL=http://localhost:3000 node scripts/mail-e2e.mjs
import { PrismaClient } from '@prisma/client';
import { startMockSmtp } from './mock-smtp.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const db = new PrismaClient();
let failed = 0;
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) failed++; };
const section = (t) => console.log(`\n— ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = Date.now();

class Client {
  jar = new Map();
  async req(path, opts = {}) {
    const res = await fetch(BASE + path, { ...opts, redirect: 'manual', headers: { ...(opts.headers ?? {}), cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (!v || /max-age=0/i.test(c)) this.jar.delete(k); else this.jar.set(k, v); }
    return res;
  }
  json(path, body, method = 'POST') { return this.req(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  text(path) { return this.req(path).then((r) => r.text()); }
}

const smtp = await startMockSmtp({ port: Number(process.env.SMTP_PORT ?? 465), cert: process.env.SMTP_CERT, key: process.env.SMTP_KEY });
/** Письмо: тип из заголовка X-Clymly-Mail, тело с декодированием quoted-printable / base64. */
function parse(m) {
  const kind = m.raw.match(/^X-Clymly-Mail: (.+)$/m)?.[1]?.trim();
  const qp = Buffer.from(m.raw.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8');
  const b64 = [...m.raw.matchAll(/\r\n\r\n([A-Za-z0-9+/=\r\n]{40,})\r\n/g)].map((x) => Buffer.from(x[1].replace(/\r\n/g, ''), 'base64').toString('utf8')).join('\n');
  const subj = (m.raw.match(/^Subject: ((?:.*\r\n[ \t].*)*.*)$/m)?.[1] ?? '').replace(/\r\n[ \t]/g, ' ').replace(/\?=\s+=\?/g, '?==?').replace(/=\?UTF-8\?([BQ])\?([^?]*)\?=/gi, (_, e, v) => e.toUpperCase() === 'B' ? Buffer.from(v, 'base64').toString('utf8') : Buffer.from(v.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8')).replace(/\s+/g, ' ');
  return { kind, to: m.to, subject: subj, body: (qp + '\n' + b64).replace(/[  ]/g, ' ') };
}
const mails = (email, kind) => smtp.state.messages.map(parse).filter((x) => x.to.includes(email) && (!kind || x.kind === kind));
async function waitMail(email, kind, count = 1, ms = 10_000) {
  for (let t = 0; t < ms; t += 250) { const m = mails(email, kind); if (m.length >= count) return m[count - 1]; await sleep(250); }
  return null;
}

async function register(email, c = new Client()) {
  await c.json('/api/auth/register', { name: 'Анна Тестова', email, password: 'password123', consent: true });
  await c.json('/api/profile', { professionId: 'product-manager', level: 'middle' }, 'PATCH');
  return c;
}

/* ───────── Подтверждение и приветствие ───────── */
section('Подтверждение e-mail → приветствие');
const email = `mail_${T}@example.com`;
const A = await register(email);
const v = await waitMail(email, 'verify');
ok(!!v && v.subject === 'Подтвердите e-mail в Clymly', 'после регистрации — письмо подтверждения');
ok(mails(email, 'welcome').length === 0, 'приветствие не отправляется до подтверждения адреса');
const link = v?.body.match(/\/verify-email\?token=[\w-]+/)?.[0];
await A.text(link);
const w = await waitMail(email, 'welcome');
ok(!!w && w.subject === 'Добро пожаловать в Clymly' && w.body.includes('Анна, адрес подтверждён') && w.body.includes('/dashboard'), 'после подтверждения — приветствие с переходом в кабинет');
await A.text(link); await sleep(800);
ok(mails(email, 'welcome').length === 1, 'повторное открытие ссылки не присылает второе приветствие');

/* ───────── Восстановление пароля ───────── */
section('Восстановление пароля');
let h = await A.text('/login');
ok(true, 'страница входа');
const anon = new Client();
h = await anon.text('/login');
ok(h.includes('href="/forgot-password"') && h.includes('Забыли пароль?'), 'на странице входа есть «Забыли пароль?»');
ok((await anon.text('/forgot-password')).includes('Восстановление пароля'), 'страница восстановления открывается');
let r = await anon.json('/api/auth/password/forgot', { email: `nobody_${T}@example.com` });
const unknownBody = await r.json();
r = await anon.json('/api/auth/password/forgot', { email: email.toUpperCase() });
const knownBody = await r.json();
ok(r.status === 200 && JSON.stringify(unknownBody) === JSON.stringify(knownBody), 'ответ одинаковый для существующего и несуществующего адреса');
const reset1 = await waitMail(email, 'password-reset');
await sleep(800);
ok(smtp.state.messages.every((m) => !m.to.includes(`nobody_${T}@example.com`)), 'на несуществующий адрес письмо не уходит');
ok(!!reset1 && reset1.subject === 'Восстановление пароля в Clymly' && reset1.body.includes('60 минут') && reset1.body.includes('проигнорируйте'), 'письмо восстановления: ссылка, срок, что делать, если не вы');
const tok1 = reset1?.body.match(/\/reset-password\?token=([\w-]+)/)?.[1];
h = await anon.text(`/reset-password?token=${tok1}`);
ok(h.includes('data-state="ok"') && h.includes('Новый пароль'), 'ссылка открывает форму нового пароля');
h = await anon.text(`/reset-password?token=${tok1}`);
ok(h.includes('data-state="ok"'), 'открытие страницы не тратит ссылку (почтовые сканеры)');
await anon.json('/api/auth/password/forgot', { email });
const reset2 = await waitMail(email, 'password-reset', 2);
const tok2 = reset2?.body.match(/\/reset-password\?token=([\w-]+)/)?.[1];
ok(tok2 && tok2 !== tok1 && (await anon.text(`/reset-password?token=${tok1}`)).includes('data-state="expired"'), 'новый запрос отменяет прежнюю ссылку');
ok((await anon.text('/reset-password?token=bad')).includes('data-state="invalid"'), 'испорченная ссылка — «недействительна»');
r = await anon.json('/api/auth/password/reset', { token: tok2, password: 'short' });
ok(r.status === 400, 'короткий пароль отклонён');
r = await anon.json('/api/auth/password/reset', { token: tok1, password: 'newpassword456' });
ok(r.status === 400 && (await r.json()).error.includes('устарела'), 'старой ссылкой пароль не сменить');
const B = new Client(); await B.json('/api/auth/login', { email, password: 'password123' });
ok((await B.req('/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"planId":"x"}' })).status === 400, 'до смены пароля сеанс B активен');
r = await anon.json('/api/auth/password/reset', { token: tok2, password: 'newpassword456' });
ok(r.status === 200 && anon.jar.has('session'), 'пароль сменён по ссылке, выполнен вход');
ok((await B.json('/api/billing/checkout', { planId: 'x' })).status === 401 && (await A.json('/api/billing/checkout', { planId: 'x' })).status === 401, 'все прежние сеансы завершены');
ok((await new Client().json('/api/auth/login', { email, password: 'password123' })).status === 401, 'старый пароль больше не подходит');
ok((await new Client().json('/api/auth/login', { email, password: 'newpassword456' })).status === 200, 'новый пароль подходит');
ok((await anon.json('/api/auth/password/reset', { token: tok2, password: 'another789' })).status === 400, 'ссылка срабатывает один раз');
const ch1 = await waitMail(email, 'password-changed');
ok(!!ch1 && ch1.subject === 'Пароль в Clymly изменён' && ch1.body.includes('по ссылке восстановления') && ch1.body.includes('/forgot-password'), 'письмо «пароль изменён» после восстановления');
for (let i = 0; i < 2; i++) await anon.json('/api/auth/password/forgot', { email });
r = await anon.json('/api/auth/password/forgot', { email });
ok(r.status === 429, 'частые запросы ссылки на один адрес ограничены');
const JT = `nopass_${T}@example.com`;
await register(JT);
await db.user.update({ where: { email: JT }, data: { hasPassword: false, emailVerifiedAt: null } });
await new Client().json('/api/auth/password/forgot', { email: JT });
const jtTok = (await waitMail(JT, 'password-reset'))?.body.match(/\/reset-password\?token=([\w-]+)/)?.[1];
r = await new Client().json('/api/auth/password/reset', { token: jtTok, password: 'jobtoo-pass-1' });
const jt = await db.user.findUnique({ where: { email: JT } });
ok(r.status === 200 && jt.hasPassword && jt.emailVerifiedAt, 'аккаунт без пароля (из JobToo) может задать пароль по ссылке; адрес считается подтверждённым');

/* ───────── Смена пароля в настройках ───────── */
section('Смена пароля в настройках');
const codeOf = (m) => m?.body.match(/\b(\d{6})\b/)?.[1];
r = await anon.json('/api/profile/password', { password: 'settings-pass-7' });
ok(r.status === 400 && (await r.json()).error.includes('6 цифр'), 'без кода из письма пароль не сменить');
r = await anon.json('/api/profile/code', { purpose: 'password' });
const pc1 = await waitMail(email, 'code-password');
ok(r.status === 200 && !!pc1 && pc1.subject === 'Код для смены пароля в Clymly' && /\d{6}/.test(pc1.body) && pc1.body.includes('15 минут'), 'письмо «Код для смены пароля» с 6-значным кодом');
ok((await anon.json('/api/profile/code', { purpose: 'password' })).status === 429, 'повторный код — не чаще раза в минуту');
const C2 = new Client(); await C2.json('/api/auth/login', { email, password: 'newpassword456' });
const bad = codeOf(pc1) === '000000' ? '111111' : '000000';
r = await anon.json('/api/profile/password', { code: bad, password: 'settings-pass-7' });
ok(r.status === 400 && (await r.json()).error.includes('Осталось попыток: 4'), 'неверный код отклонён, показан остаток попыток');
r = await anon.json('/api/profile/password', { code: codeOf(pc1), password: 'settings-pass-7' });
const ch2 = await waitMail(email, 'password-changed', 2);
ok(r.status === 200 && !!ch2 && ch2.body.includes('в настройках') && ch2.body.includes('других устройствах'), 'пароль сменён по коду; письмо «Пароль изменён»');
ok((await anon.json('/api/billing/checkout', { planId: 'x' })).status === 400 && (await C2.json('/api/billing/checkout', { planId: 'x' })).status === 401, 'текущий сеанс остался, другие завершены');
ok((await new Client().json('/api/auth/login', { email, password: 'settings-pass-7' })).status === 200, 'новый пароль подходит');
ok((await anon.json('/api/profile/password', { code: codeOf(pc1), password: 'another-pass-9' })).status === 400, 'код срабатывает один раз');
const bf = new Client(); await register(`brute_${T}@example.com`, bf);
await bf.json('/api/profile/code', { purpose: 'password' });
const bc = codeOf(await waitMail(`brute_${T}@example.com`, 'code-password'));
for (let i = 0; i < 5; i++) await bf.json('/api/profile/password', { code: bc === '000000' ? '111111' : '000000', password: 'brute-pass-1' });
ok((await bf.json('/api/profile/password', { code: bc, password: 'brute-pass-1' })).status === 400, 'после 5 неверных попыток код больше не принимается даже верный');

/* ───────── Оплата ───────── */
section('Оплата');
let d = await (await anon.json('/api/billing/checkout', { planId: 'pro-month' })).json();
await anon.json(`/api/billing/stub/${d.paymentId}`, { action: 'succeed' });
const pm = await waitMail(email, 'payment');
ok(!!pm && pm.subject === 'Оплата «Pro — 1 месяц» прошла — Clymly', 'письмо об оплате с названием тарифа в теме');
ok(pm && pm.body.includes('499 ₽') && pm.body.includes(d.paymentId) && pm.body.includes('Pro действует до') && pm.body.includes('Автопродление') && pm.body.includes('не включено') && pm.body.includes('деньги не списывались'), 'в письме: сумма, номер заказа, срок, «автопродление не включено», пометка тестового режима');
d = await (await anon.json('/api/billing/checkout', { planId: 'pro-quarter' })).json();
await anon.json(`/api/billing/stub/${d.paymentId}`, { action: 'cancel' });
await sleep(1000);
ok(mails(email, 'payment').length === 1, 'за отменённый заказ письмо не приходит');
d = await (await anon.json('/api/billing/checkout', { planId: 'pro-quarter' })).json();
await anon.json(`/api/billing/stub/${d.paymentId}`, { action: 'succeed' });
await anon.json(`/api/billing/stub/${d.paymentId}`, { action: 'succeed' });
const pm2 = await waitMail(email, 'payment', 2);
await sleep(800);
ok(!!pm2 && pm2.body.includes('1 190 ₽') && pm2.body.includes('Новый период начнётся после окончания текущего') && mails(email, 'payment').length === 2, 'продление: письмо одно, с датой начала нового периода');

/* ───────── Окончание Pro ───────── */
section('Напоминание и окончание Pro');
await db.user.update({ where: { email }, data: { planUntil: new Date(Date.now() + 2 * 86_400_000), proReminderFor: null, proEndedFor: null } });
const end1 = await waitMail(email, 'pro-ending', 1, 15_000);
ok(!!end1 && end1.subject.startsWith('Clymly Pro закончится') && end1.body.includes('Автопродление не включено') && end1.body.includes('/billing'), 'за 3 дня до конца — напоминание с продлением');
await sleep(5000);
ok(mails(email, 'pro-ending').length === 1, 'напоминание не повторяется для того же срока');
await db.user.update({ where: { email }, data: { planUntil: new Date(Date.now() - 3_600_000) } });
const ended = await waitMail(email, 'pro-ended', 1, 15_000);
ok(!!ended && ended.subject === 'Период Clymly Pro закончился' && ended.body.includes('данные сохранены'), 'после окончания — письмо «Период Pro закончился»');
await sleep(5000);
ok(mails(email, 'pro-ended').length === 1, 'письмо об окончании не повторяется');
const old = `old_${T}@example.com`;
await register(old);
await db.user.update({ where: { email: old }, data: { plan: 'pro', planUntil: new Date(Date.now() - 30 * 86_400_000) } });
await sleep(5000);
ok(mails(old, 'pro-ended').length === 0, 'о давно истёкшем Pro (больше 7 дней) не пишем');
const fresh = `free_${T}@example.com`;
await register(fresh); await sleep(4000);
ok(mails(fresh).every((m) => m.kind === 'verify'), 'пользователю Free без покупок — только письмо подтверждения');

/* ───────── Безопасность писем ───────── */
section('Содержимое писем');
/* ───────── Удаление аккаунта ───────── */
section('Удаление аккаунта');
const delEmail = `del_${T}@example.com`;
const D = await register(delEmail);
let dd = await (await D.json('/api/billing/checkout', { planId: 'pro-month' })).json();
await D.json(`/api/billing/stub/${dd.paymentId}`, { action: 'succeed' });
const dUser = await db.user.findUnique({ where: { email: delEmail } });
ok((await D.json('/api/profile', {}, 'DELETE')).status === 400, 'без кода аккаунт не удалить');
await D.json('/api/profile/code', { purpose: 'delete' });
const dc = await waitMail(delEmail, 'code-delete');
ok(!!dc && dc.subject === 'Код для удаления аккаунта Clymly' && dc.body.includes('необратимо'), 'письмо «Код для удаления аккаунта»');
const D2 = new Client(); await D2.json('/api/auth/login', { email: delEmail, password: 'password123' });
r = await D.json('/api/profile', { code: codeOf(dc) }, 'DELETE');
ok(r.status === 200 && !D.jar.has('session'), 'аккаунт удалён по коду, сеанс завершён');
const gone = await db.user.findUnique({ where: { id: dUser.id } });
ok(!!gone.deletedAt && gone.email !== delEmail && gone.name === 'Удалённый пользователь' && gone.plan === 'free' && !gone.autopayPlan, 'личные данные стёрты, Pro и автопродление сняты');
ok((await db.resume.count({ where: { userId: dUser.id } })) === 0 && (await db.session.count({ where: { userId: dUser.id } })) === 0, 'резюме и все сеансы удалены');
ok((await db.payment.count({ where: { userId: dUser.id, status: 'succeeded' } })) === 1, 'платёж сохранён (обезличенно) для учёта');
ok((await D2.json('/api/billing/checkout', { planId: 'x' })).status === 401 && (await new Client().json('/api/auth/login', { email: delEmail, password: 'password123' })).status === 401, 'войти в удалённый аккаунт нельзя');
const ad = await waitMail(delEmail, 'account-deleted');
ok(!!ad && ad.subject === 'Аккаунт Clymly удалён' && ad.body.includes('Автопродление Pro отключено') && ad.body.includes('обезличенном'), 'письмо «Аккаунт удалён»');
ok((await (await new Client().req('/login?deleted=1')).text()).includes('Аккаунт удалён'), 'после удаления на странице входа — сообщение');
ok((await new Client().json('/api/auth/register', { name: 'Снова', email: delEmail, password: 'password123', consent: true })).status === 200, 'с тем же адресом можно зарегистрироваться заново');

const all = smtp.state.messages.map(parse);
ok(all.every((m) => !/password123|newpassword456|settings-pass-7|brute-pass-1/.test(m.body)), 'пароли в письма не попадают');
ok(all.every((m) => m.kind), 'у каждого письма есть тип');

await smtp.close(); await db.$disconnect();
console.log(failed ? `\n❌ Провалено: ${failed}` : '\n✅ Все проверки писем пройдены');
process.exit(failed ? 1 : 0);
