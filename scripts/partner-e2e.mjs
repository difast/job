// E2E интеграции Clymly ⇄ JobToo (формат v1) с заглушкой JobToo.
// Протокол — как в документе JobToo (v1): переход JobToo → Clymly по схеме «Clymly забирает сам» (pull),
// Clymly → JobToo — handoff; JSON, подпись HMAC. Сервер Clymly запускается с переменными:
//   JOBTOO_INTEGRATION_ENABLED=1 JOBTOO_API_URL=http://localhost:4100/api/partner.php JOBTOO_OUTBOUND_SECRET=test-out JOBTOO_INBOUND_SECRET=test-in ADMIN_EMAILS=<ADMIN>
// Запуск: ADMIN=<ADMIN> BASE_URL=http://localhost:3000 node scripts/partner-e2e.mjs
import { readFileSync } from 'node:fs';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { startMockJobToo } from './mock-jobtoo.mjs';
import { startMockSmtp, verifyLink } from './mock-smtp.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const IN_SECRET = process.env.JOBTOO_INBOUND_SECRET ?? 'test-in';
const OUT_SECRET = process.env.JOBTOO_OUTBOUND_SECRET ?? 'test-out';
const ADMIN = process.env.ADMIN ?? 'admin@example.com';
let failed = 0;
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) failed++; };
const section = (t) => console.log(`\n— ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = Date.now();

/** «Браузер» с собственными cookie. */
class Client {
  jar = new Map();
  async req(path, opts = {}) {
    const res = await fetch(BASE + path, { ...opts, redirect: 'manual', headers: { ...(opts.headers ?? {}), cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (!v || /max-age=0|expires=thu, 01 jan 1970/i.test(c)) this.jar.delete(k); else this.jar.set(k, v); }
    const loc = res.headers.get('location');
    if (loc && /^https?:/.test(loc) && loc.startsWith(BASE)) res.headers.set?.('location', loc.slice(BASE.length));
    return res;
  }
  json(path, body, method = 'POST') { return this.req(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
}

/** Подписанный запрос JobToo → Clymly (их события на наш /api/partner/v1/events). */
async function jobtooToUs(path, { json, secret = IN_SECRET, requestId = randomUUID(), ts = Math.floor(Date.now() / 1000), partner = 'jobtoo' }) {
  const body = Buffer.from(JSON.stringify(json));
  const sig = createHmac('sha256', secret).update(`${ts}.${requestId}.${createHash('sha256').update(body).digest('hex')}`).digest('hex');
  const res = await fetch(BASE + path, { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'X-Partner-Id': partner, 'X-Request-Id': requestId, 'X-Timestamp': String(ts), 'X-Signature': sig } });
  return { res, data: await res.json().catch(() => null), requestId };
}

const pdf = readFileSync('tests/fixtures/resume.pdf');
const vacancy = readFileSync('tests/fixtures/vacancy.txt', 'utf8');
const file = (name = 'cv.pdf', data = pdf, mime = 'application/pdf') => ({ name, mime, data_b64: Buffer.from(data).toString('base64') });
// payload ответа JobToo на pull (их раздел 3)
const basePayload = (o = {}) => ({
  source: 'jobtoo', jobtoo_user_id: `jt-${T}-1`, email: `jt_${T}_1@example.com`, email_verified: true, name: 'Мария Соколова', phone: '+79990000000',
  target_position: 'Ведущий продакт-менеджер', experience_level: 'middle', skills: ['SQL', 'A/B-тесты'], resume_id: 'r-1', resume_file: file(),
  vacancy: { id: 'v-1', title: 'Продуктовый менеджер', company: 'ФинПлюс', description: vacancy }, ...o,
});
/** Переход из JobToo: открыть страницу с кодом и (по желанию) принять условия. */
async function transition(c, code, { accept = true } = {}) {
  const r0 = await c.req(`/partner/jobtoo/start?code=${code}`);
  if (!accept) return { start: r0 };
  const r = await c.json('/api/partner/jobtoo/accept', { consent: true });
  return { start: r0, status: r.status, data: await r.json().catch(() => ({})) };
}
const pathOf = (u) => { const x = new URL(u); return x.pathname + x.search; };

const mock = await startMockJobToo({ port: 4100, secret: OUT_SECRET });
// SMTP-заглушка на 465 (TLS). Сервер Clymly: SMTP_HOST=localhost SMTP_PORT=465 SMTP_USER=mailer SMTP_PASSWORD=mailer-pass SMTP_FROM=… NODE_EXTRA_CA_CERTS=<cert>
const smtp = await startMockSmtp({ port: Number(process.env.SMTP_PORT ?? 465), cert: process.env.SMTP_CERT, key: process.env.SMTP_KEY });
const mailFor = async (email, after = 0) => {
  for (let i = 0; i < 40; i++) { const m = smtp.state.messages.filter((x) => x.to.includes(email)).slice(after); if (m.length) return m[0]; await sleep(250); }
  return null;
};
/** Регистрирует пользователя и (по желанию) подтверждает e-mail по ссылке из письма. */
async function registerUser(email, { verify = false, profession = 'product-manager' } = {}) {
  const c = new Client();
  await c.json('/api/auth/register', { name: 'Тест Пользователь', email, password: 'password123', consent: true });
  await c.json('/api/profile', { professionId: profession, level: 'middle' }, 'PATCH');
  if (verify) { const m = await mailFor(email); await c.req(verifyLink(m.raw)); }
  return c;
}

/* ───────── Подтверждение e-mail ───────── */
section('Подтверждение e-mail (SMTP, порт 465, TLS)');
{
  const em = `verify_${T}@example.com`;
  const c = new Client();
  await c.json('/api/auth/register', { name: 'Вера Проверкина', email: em, password: 'password123', consent: true });
  await c.json('/api/profile', { professionId: 'product-manager', level: 'middle' }, 'PATCH');
  const m = await mailFor(em);
  ok(!!m && m.authed && smtp.state.authFailures === 0, 'после регистрации письмо отправлено по SMTP с TLS и авторизацией');
  ok(m && /Subject: =\?UTF-8|Subject: Подтвердите/i.test(m.raw) && /no-reply@clymly\.ru/.test(m.raw), 'тема и отправитель письма');
  ok(m && /Reply-To: support@clymly\.ru/i.test(m.raw), 'ответы на письмо уходят на support@clymly.ru');
  const link = m && verifyLink(m.raw);
  ok(!!link && link.startsWith('/verify-email?token='), 'в письме ссылка подтверждения');
  let pg = await (await c.req('/dashboard')).text();
  ok(pg.includes('data-testid="verify-banner"'), 'в кабинете напоминание «Подтвердите e-mail»');
  ok((await new Client().req('/verify-email?token=' + 'x'.repeat(43)).then((r) => r.text())).includes('data-result="invalid"'), 'поддельная ссылка → «недействительна»');
  pg = await (await new Client().req(link)).text();
  ok(pg.includes('data-result="verified"'), 'переход по ссылке (даже без входа) → «E-mail подтверждён»');
  pg = await (await new Client().req(link)).text();
  ok(pg.includes('data-result="already"'), 'повторный переход (например, почтовым сканером) → «уже подтверждён»');
  pg = await (await c.req('/dashboard')).text();
  ok(!pg.includes('data-testid="verify-banner"'), 'после подтверждения напоминание исчезает');
  pg = await (await c.req('/settings')).text();
  ok(pg.includes('Подтверждён'), 'настройки: статус «Подтверждён»');
  const r1 = await (await c.json('/api/auth/verify-email/resend', {})).json();
  ok(r1.already === true, 'подтверждённому повторное письмо не отправляется');

  const em2 = `verify2_${T}@example.com`;
  const c2 = new Client();
  await c2.json('/api/auth/register', { name: 'Пётр', email: em2, password: 'password123', consent: true });
  await mailFor(em2);
  const s1 = (await c2.json('/api/auth/verify-email/resend', {})).status;
  const m2 = await mailFor(em2, 1);
  ok(s1 === 200 && !!m2, 'повторная отправка письма работает');
  await c2.json('/api/auth/verify-email/resend', {}); await c2.json('/api/auth/verify-email/resend', {});
  ok((await c2.json('/api/auth/verify-email/resend', {})).status === 429, 'частые повторные отправки ограничены');
  const oldLink = verifyLink((await mailFor(em2)).raw);
  pg = await (await new Client().req(verifyLink(m2.raw))).text();
  ok(pg.includes('data-result="verified"'), 'подтверждение по новой ссылке');
  ok((await (await new Client().req(oldLink)).text()).includes('data-result="already"'), 'старая ссылка после подтверждения — «уже подтверждён»');
}



/* ───────── JobToo → Clymly: страница приёма и согласие ───────── */
section('JobToo → Clymly: страница приёма и согласие');
let page, r, res;
const anna = new Client();
const code1 = mock.issueCode(basePayload());
res = await anna.req(`/partner/jobtoo/start?code=${code1}`);
ok(res.status === 303 && res.headers.get('location') === '/partner/jobtoo' && anna.jar.has('jobtoo_start'), 'ссылка JobToo → код убран из адресной строки (в httpOnly-cookie), показ условий');
page = await (await anna.req('/partner/jobtoo')).text();
ok(page.includes('Продолжить в Clymly') && page.includes('Резюме — файл или текст') && page.includes('data-testid="inbound-consent"') && !page.includes(code1), 'страница: что получим от JobToo, согласие; кода в HTML нет');
ok(mock.state.pulls.length === 0, 'до согласия Clymly ничего не запрашивает у JobToo');
ok((await anna.json('/api/partner/jobtoo/accept', {})).status === 400, 'без согласия продолжить нельзя');
r = await anna.json('/api/partner/jobtoo/accept', { consent: true });
let d = await r.json();
ok(r.status === 200 && /^\/vacancies\/\w+$/.test(d.landing) && anna.jar.has('session') && !anna.jar.has('jobtoo_start'), `согласие → данные получены, вход выполнен, сразу на анализ вакансии (${d.landing})`);
const pull1 = mock.state.pulls.at(-1);
ok(mock.state.badSignatures === 0 && pull1.body.code === code1 && pull1.body.consent?.version && pull1.body.consent?.accepted_at, 'pull подписан, передан код и сведения о согласии');
ok(!('clymly_user_id' in pull1.body), 'в pull не передаём clymly_user_id (защита от чужой связки)');
page = await (await anna.req(d.landing)).text();
ok(page.includes('Продуктовый менеджер') && page.includes('соответствия вакансии'), 'вакансия из JobToo проанализирована');
page = await (await anna.req('/resume')).text();
ok(page.includes('cv.pdf') && page.includes('Сильные стороны'), 'резюме из JobToo (PDF в base64) загружено и проанализировано');
page = await (await anna.req('/dashboard')).text();
ok(page.includes('Продакт-менеджер') && page.includes('Middle'), 'профессия сопоставлена («Ведущий продакт-менеджер» → Продакт-менеджер), уровень Middle');
ok((await anna.req('/api/resume', { method: 'PUT' })).status === 200, 'согласие на обработку записано на странице приёма — кабинет доступен сразу');
page = await (await anna.req('/settings')).text();
ok(page.includes('Задайте пароль') && page.includes('JobToo → Clymly') && page.includes('Аккаунт связан'), 'настройки: задать пароль, связь и история');
ok(!page.includes('+79990000000'), 'телефон не сохранён');
const pwBefore = smtp.state.messages.filter((x) => x.to.includes(`jt_${T}_1@example.com`)).length;
ok((await anna.json('/api/profile/password', { password: 'newpass123' })).status === 400, 'без кода из письма пароль не задать');
await anna.json('/api/profile/code', { purpose: 'password' });
const pwCode = (await mailFor(`jt_${T}_1@example.com`, pwBefore))?.raw.match(/>(\d{6})</)?.[1];
ok((await anna.json('/api/profile/password', { code: pwCode, password: 'newpass123' })).status === 200 && (await new Client().json('/api/auth/login', { email: `jt_${T}_1@example.com`, password: 'newpass123' })).status === 200, 'пароль задан по коду из письма — вход по e-mail и паролю работает');
await sleep(1500);
ok(mock.state.events.some((e) => e.event === 'login_completed' && e.request_id === mock.handoffRequestId(code1)), 'JobToo получил login_completed с их handoff_request_id');

// повторное использование кода и чужие коды
const reuse = new Client();
r = await transition(reuse, code1);
ok(r.status === 410 && /устарела/.test(r.data.error), 'тот же код второй раз → «ссылка устарела» (410 code_expired)');
r = await transition(new Client(), 'x'.repeat(40));
ok(r.status === 410, 'неизвестный код → «ссылка устарела»');
res = await new Client().req('/partner/jobtoo/start?code=<script>');
page = await (await new Client().req('/partner/jobtoo')).text();
ok(res.status === 303 && page.includes('data-testid="inbound-expired"'), 'некорректный код не сохраняется; без кода — «Ссылка устарела»');

// отказ от условий
const declCode = mock.issueCode(basePayload({ jobtoo_user_id: `jt-${T}-d`, email: `jt_${T}_d@example.com` }));
const dc = new Client();
const pullsBefore = mock.state.pulls.length;
await dc.req(`/partner/jobtoo/start?code=${declCode}`);
ok((await dc.json('/api/partner/jobtoo/decline', {})).status === 200 && !dc.jar.has('jobtoo_start'), 'отказ от условий принят');
await sleep(1200);
ok(mock.state.pulls.length === pullsBefore, 'после отказа данные у JobToo не запрашиваются');
ok(mock.state.events.some((e) => e.event === 'consent_declined' && e.request_id === createHash('sha256').update(declCode).digest('hex')), 'JobToo получил consent_declined (request_id = sha256 кода)');

// первое действие — в аналитике Clymly, JobToo его не ждёт
ok((await anna.json('/api/vacancies', { text: vacancy })).status === 200, 'пользователь из JobToo анализирует ещё одну вакансию');
await sleep(800);
ok(!mock.state.events.some((e) => e.event === 'first_action'), 'first_action не отправляется в JobToo (нет в их протоколе)');

/* ───────── JobToo → Clymly: данные и ошибки ───────── */
section('JobToo → Clymly: проверка данных');
r = await transition(new Client(), mock.issueCode(null, { status: 422, error: { code: 'resume_unreadable', message: 'нет резюме' } }));
ok(r.status === 502 || r.status === 422, `у человека нет резюме в JobToo → понятная ошибка (${r.status})`);
ok(/резюме/i.test(r.data.error ?? ''), 'текст ошибки про резюме');
r = await transition(new Client(), mock.issueCode(basePayload({ jobtoo_user_id: `jt-${T}-e1`, email: 'not-an-email' })));
ok(r.status === 502 && /неожиданном формате/.test(r.data.error), 'некорректный payload от JobToo → ошибка, аккаунт не создаётся');
r = await transition(new Client(), mock.issueCode(basePayload({ jobtoo_user_id: `jt-${T}-e2`, email: `jt_${T}_e2@example.com`, resume_file: file('cv.pdf', Buffer.from('PK\x03\x04 fake docx')) })));
ok(r.status === 415, 'содержимое файла не совпадает с типом → 415');
r = await transition(new Client(), mock.issueCode(basePayload({ jobtoo_user_id: `jt-${T}-e3`, email: `jt_${T}_e3@example.com`, resume_file: file('cv.exe', pdf, 'application/octet-stream') })));
ok(r.status === 415, 'неподдерживаемый формат → 415');
r = await transition(new Client(), mock.issueCode(basePayload({ jobtoo_user_id: `jt-${T}-e4`, email: `jt_${T}_e4@example.com`, resume_file: file('cv.pdf', Buffer.concat([Buffer.from('%PDF'), Buffer.alloc(6 * 1024 * 1024, 65)])) })));
ok(r.status === 413, 'файл больше 5 МБ → 413');
const txt = readFileSync('tests/fixtures/resume.pdf').length && 'Опыт работы: продакт-менеджер в финтехе, запуск онбординга, рост конверсии на 20%. Навыки: SQL, A/B-тесты, Customer Development, Jira, аналитика продукта.';
r = await transition(new Client(), mock.issueCode(basePayload({ jobtoo_user_id: `jt-${T}-e5`, email: `jt_${T}_e5@example.com`, resume_file: file('cv.pdf', Buffer.from('%PDF-broken')), resume_text: txt, vacancy: null })));
ok(r.status === 200 && r.data.landing === '/resume', 'файл не читается, но есть resume_text → берём текст');

/* ───────── Повторный переход, уровень и профессия ───────── */
section('JobToo → Clymly: повторный переход, уровень и профессия');
const again = new Client();
r = await transition(again, mock.issueCode(basePayload({ vacancy: null, resume_file: file('cv-v2.pdf') })));
ok(r.status === 200 && r.data.landing === '/resume' && again.jar.has('session'), 'тот же jobtoo_user_id → вход в связанный аккаунт, новая версия резюме');
const noLevel = new Client();
r = await transition(noLevel, mock.issueCode(basePayload({ jobtoo_user_id: `jt-${T}-2`, email: `jt_${T}_2@example.com`, experience_level: undefined, vacancy: null })));
ok(r.status === 200 && r.data.landing === '/onboarding', 'уровня нет в payload → выбор уровня при входе');
r = await noLevel.json('/api/profile', { professionId: 'product-manager', level: 'senior' }, 'PATCH');
ok((await r.json()).landing === '/resume', 'после выбора — резюме из JobToo применено');
const odd = new Client();
r = await transition(odd, mock.issueCode(basePayload({ jobtoo_user_id: `jt-${T}-3`, email: `jt_${T}_3@example.com`, target_position: 'Космонавт-исследователь', vacancy: null })));
ok(r.status === 200 && r.data.landing === '/onboarding', 'профессия не распознана → выбор профессии');

/* ───────── E-mail уже зарегистрирован → привязка ───────── */
section('JobToo → Clymly: e-mail уже зарегистрирован');
const ownerEmail = `owner_${T}@example.com`;
await registerUser(ownerEmail, { profession: 'accountant' });
const stranger = new Client();
r = await transition(stranger, mock.issueCode(basePayload({ jobtoo_user_id: `jt-${T}-o`, email: ownerEmail, vacancy: null })));
ok(r.status === 200 && r.data.landing === '/link/jobtoo' && !stranger.jar.has('session') && stranger.jar.has('partner_link'), 'почта не подтверждена в Clymly → без входа, на привязку');
page = await (await stranger.req('/link/jobtoo')).text();
ok(page.includes('У вас уже есть аккаунт Clymly') && !page.includes(ownerEmail), 'без входа: просим войти, почта замаскирована');
ok((await stranger.json('/api/integrations/jobtoo/link', { action: 'link' })).status === 401, 'привязка без входа невозможна');
await stranger.json('/api/auth/login', { email: ownerEmail, password: 'password123' });
page = await (await stranger.req('/link/jobtoo')).text();
ok(page.includes('Связать аккаунт Clymly с JobToo?') && page.includes(ownerEmail), 'после входа — подтверждение, обе почты видны');
r = await stranger.json('/api/integrations/jobtoo/link', { action: 'link' });
ok(r.status === 200 && (await r.json()).landing === '/resume', 'аккаунты связаны, резюме импортировано');
r = await transition(new Client(), mock.issueCode(basePayload({ jobtoo_user_id: `jt-${T}-o`, email: ownerEmail, vacancy: null })));
ok(r.status === 200 && r.data.landing === '/resume', 'следующий переход — сразу вход');
await sleep(1200);
ok(mock.state.events.filter((e) => e.event === 'login_completed').length >= 3, 'JobToo получает login_completed по каждому входу');

/* ───────── Защита от навязанной привязки ───────── */
section('Защита от навязанной привязки');
{
  const victimEmail = `victim_${T}@example.com`;
  const victim = await registerUser(victimEmail);
  // злоумышленник указал в JobToo чужую почту без подтверждения и прислал жертве ссылку перехода
  let x = await transition(victim, mock.issueCode(basePayload({ jobtoo_user_id: `jt-${T}-att`, email: victimEmail, email_verified: false, vacancy: null })));
  ok(x.status === 200 && x.data.landing === '/link/jobtoo', 'чужая неподтверждённая почта → только экран привязки');
  page = await (await victim.req('/link/jobtoo')).text();
  ok(page.includes('Подтвердите почту в JobToo') && !page.includes('data-testid="link-confirm"'), 'кнопки «Связать» нет');
  ok((await victim.json('/api/integrations/jobtoo/link', { action: 'link' })).status === 403, 'привязка отклонена (403)');

  const ownerB = `ownerb_${T}@example.com`;
  await registerUser(ownerB);
  const other = await registerUser(`other_${T}@example.com`);
  x = await transition(other, mock.issueCode(basePayload({ jobtoo_user_id: `jt-${T}-b`, email: ownerB, vacancy: null })));
  page = await (await other.req('/link/jobtoo')).text();
  ok(page.includes('Это другой аккаунт Clymly') && !page.includes('data-testid="link-confirm"'), 'вошли в аккаунт с другой почтой: связать нельзя');
  ok((await other.json('/api/integrations/jobtoo/link', { action: 'link' })).status === 403 && other.jar.has('partner_link'), 'отказ 403, билет привязки не сгорел');
  await other.json('/api/auth/logout', {});
  await other.json('/api/auth/login', { email: ownerB, password: 'password123' });
  ok((await other.json('/api/integrations/jobtoo/link', { action: 'link' })).status === 200, 'после входа в аккаунт с той же почтой привязка выполнена');
  x = await transition(other, mock.issueCode(basePayload({ jobtoo_user_id: `jt-${T}-b2`, email: ownerB, vacancy: null })));
  ok(x.data.landing === '/link/jobtoo' && (await other.json('/api/integrations/jobtoo/link', { action: 'link' })).status === 409, 'существующая связь не перезаписывается (409)');
}

/* ───────── Почта подтверждена с обеих сторон ───────── */
section('Почта подтверждена с обеих сторон');
{
  const em = `both_${T}@example.com`;
  await registerUser(em, { verify: true });
  const br = new Client();
  let x = await transition(br, mock.issueCode(basePayload({ jobtoo_user_id: `jt-${T}-v`, email: em, vacancy: null })));
  ok(x.status === 200 && x.data.landing === '/resume' && br.jar.has('session'), 'подтверждена в Clymly и в JobToo → связь и вход без пароля');
  const em3 = `half_${T}@example.com`;
  await registerUser(em3, { verify: true });
  x = await transition(new Client(), mock.issueCode(basePayload({ jobtoo_user_id: `jt-${T}-h`, email: em3, email_verified: false, vacancy: null })));
  ok(x.data.landing === '/link/jobtoo', 'подтверждена только в Clymly → привязка через вход');
}

/* ───────── Clymly → JobToo ───────── */
section('Clymly → JobToo');
page = await (await anna.req('/resume')).text();
ok(page.includes('Перейти к вакансиям в JobToo') && page.includes('data-testid="jobtoo-resume"'), 'кнопка «Перейти к вакансиям в JobToo» в «Моём резюме»');
ok((await (await anna.req('/vacancies')).text()).includes('data-testid="jobtoo-vacancies"'), 'кнопка в «Вакансиях»');
{ const vl = await (await anna.req('/dashboard')).text(); ok((vl.match(/data-testid="jobtoo-(dashboard|resume|vacancies|adaptation|interview)"/g) ?? []).length === 1, 'на экране один переход в JobToo'); }
page = await (await anna.req('/dashboard')).text();
ok(page.includes('data-testid="jobtoo-dashboard"'), 'кнопка на главной');
r = await anna.json('/api/integrations/jobtoo/handoff', { placement: 'resume' });
ok(r.status === 403, 'без согласия передача невозможна (403)');
ok((await anna.json('/api/integrations/jobtoo/consent', { placement: 'resume' })).status === 200, 'согласие на передачу в JobToo записано');
r = await anna.json('/api/integrations/jobtoo/handoff', { placement: 'resume' });
let out = await r.json();
ok(r.status === 200 && out.url?.startsWith('http://localhost:4100/sso/clymly') && out.requestId, 'передача прошла, получена ссылка входа в JobToo');
const sent = mock.state.handoffs.at(-1);
ok(mock.state.badSignatures === 0 && sent.requestId === out.requestId, 'запрос подписан, request_id совпадает');
const p = sent.payload;
ok(p.source === 'clymly' && p.email === `jt_${T}_1@example.com` && p.email_verified === false /* почта не подтверждена в Clymly */ && p.target_position === 'Продакт-менеджер' && p.experience_level === 'middle' && p.resume_text.length > 100 && p.consent.version && p.utm.placement === 'resume', 'состав данных по формату v1 (email_verified=false)');
ok(p.jobtoo_user_id === `jt-${T}-1`, 'передан связанный jobtoo_user_id');
ok(!('phone' in p) && !('passwordHash' in p), 'лишние данные не передаются');
ok((await anna.json('/api/integrations/jobtoo/track', { event: 'redirect_opened', placement: 'resume', requestId: out.requestId })).status === 200, 'событие redirect_opened записано');

mock.state.mode = 'foreign';
r = await anna.json('/api/integrations/jobtoo/handoff', { placement: 'resume' });
out = await r.json();
ok(r.status === 502 && !out.url && /некорректную ссылку/.test(out.error), 'ссылка на чужой домен отклонена, переход не выполняется');
mock.state.mode = 'error';
r = await anna.json('/api/integrations/jobtoo/handoff', { placement: 'dashboard' });
out = await r.json();
ok(r.status === 502 && out.error.includes('JobToo: не удалось разобрать резюме'), 'ошибка JobToo показывается пользователю понятным текстом');
mock.state.mode = 'busy';
r = await anna.json('/api/integrations/jobtoo/handoff', { placement: 'dashboard' });
out = await r.json();
ok(r.status === 503 && out.error.includes('JobToo временно недоступен') && !out.error.includes('обрабатывается') && out.retryAfter === 30, '503 с retry_after 30: сразу понятная ошибка и срок повтора, без «ещё обрабатывается»');
const busyId = mock.state.handoffs.at(-1).requestId;
ok(mock.state.handoffs.filter((x) => x.requestId === busyId).length === 1, 'при retry_after 30 повтор раньше срока не отправляется');
mock.state.mode = 'flaky';
const before = mock.state.handoffs.length;
r = await anna.json('/api/integrations/jobtoo/handoff', { placement: 'dashboard' });
out = await r.json();
const fl = mock.state.handoffs.slice(before);
ok(r.status === 200 && out.url && fl.length === 2 && fl[0].requestId === fl[1].requestId, '503 с retry_after 1: один повтор через секунду с тем же X-Request-Id — передача прошла');
{ const adm = new Client();
  await adm.json('/api/auth/register', { name: 'Админ', email: ADMIN, password: 'password123', consent: true }).catch(() => {});
  await adm.json('/api/auth/login', { email: ADMIN, password: 'password123' });
  await adm.json('/api/profile', { professionId: 'product-manager', level: 'middle' }, 'PATCH');
  page = await (await adm.req('/admin/integrations?days=30')).text(); }
ok(page.includes('Последние неудачные обмены') && page.includes(busyId) && page.includes('МСК (UTC+3)'), 'админка: X-Request-Id и время неудачных обменов для поддержки JobToo');
mock.state.mode = 'ok';

// JobToo создаёт новый аккаунт: external_user_id пустой — связку не сохраняем; email_verified=true для подтверждённой почты
{
  const vu = await registerUser(`out_${T}@example.com`, { verify: true });
  const fd = new FormData(); fd.set('file', new Blob([pdf], { type: 'application/pdf' }), 'cv.pdf');
  await vu.req('/api/resume', { method: 'POST', body: fd });
  await vu.json('/api/integrations/jobtoo/consent', { placement: 'resume' });
  mock.state.mode = 'created';
  const o = await vu.json('/api/integrations/jobtoo/handoff', { placement: 'resume' });
  mock.state.mode = 'ok';
  ok(o.status === 200 && mock.state.handoffs.at(-1).payload.email_verified === true, 'email_verified=true для почты, подтверждённой в Clymly');
  ok((await (await vu.req('/settings')).text()).includes('Аккаунт не связан'), 'account=created с пустым external_user_id — связка не сохраняется');
}

// JobToo сообщает о входе по нашей ссылке
const outReq = mock.state.handoffs.find((h) => h.payload.utm.placement === 'resume').requestId;
r = await jobtooToUs('/api/partner/v1/events', { json: { events: [{ request_id: outReq, event: 'login_completed', occurred_at: new Date().toISOString(), partner_user_id: 'jt' }, { request_id: randomUUID(), event: 'login_completed' }] } });
ok(r.res.status === 200 && r.data.accepted === 1, 'события от JobToo: принято только для нашего request_id');
r = await jobtooToUs('/api/partner/v1/events', { json: { events: [{ request_id: outReq, event: 'login_completed' }] }, secret: 'wrong' });
ok(r.res.status === 401, 'события без верной подписи отклоняются');

// Отзыв согласия
ok((await anna.req('/api/integrations/jobtoo/consent', { method: 'DELETE' })).status === 200, 'согласие отозвано');
ok((await anna.json('/api/integrations/jobtoo/handoff', { placement: 'resume' })).status === 403, 'после отзыва передача невозможна');

/* ───────── Аналитика ───────── */
section('Аналитика переходов');
{ const rr = await anna.req('/admin/integrations'); const t = await rr.text(); ok((rr.status === 404 || t.includes('Страница не найдена')) && !t.includes('Частые ошибки'), 'отчёт недоступен обычному пользователю («не найдено»)'); }
ok((await anna.req('/api/admin/integrations/export')).status === 404, 'выгрузка CSV недоступна обычному пользователю');
const admin = new Client();
await admin.json('/api/auth/register', { name: 'Админ', email: ADMIN, password: 'password123', consent: true }).catch(() => {});
await admin.json('/api/auth/login', { email: ADMIN, password: 'password123' });
await admin.json('/api/profile', { professionId: 'product-manager', level: 'middle' }, 'PATCH');
res = await admin.req('/admin/integrations?days=30');
page = await res.text();
ok(res.status === 200 && page.includes('Clymly → JobToo') && page.includes('JobToo → Clymly') && page.includes('Частые ошибки'), 'отчёт: обе воронки и ошибки');
res = await admin.req('/api/admin/integrations/export?days=30');
const csv = await res.text();
ok(res.status === 200 && (res.headers.get('content-type') ?? '').startsWith('text/csv'), 'выгрузка CSV');
const evs = new Set(csv.split('\n').slice(1).map((l) => l.split(';').slice(1, 3).join(':')));
const need = ['in:start_opened', 'in:inbound_consent_accepted', 'in:inbound_consent_declined', 'in:pull_succeeded', 'in:pull_failed', 'in:handoff_accepted', 'in:login_completed', 'in:account_linked', 'in:link_rejected', 'in:first_action',
  'out:consent_accepted', 'out:handoff_sent', 'out:handoff_succeeded', 'out:handoff_failed', 'out:redirect_opened', 'out:partner_login_completed', 'out:consent_revoked'];
const miss = need.filter((n) => !evs.has(n));
ok(miss.length === 0, `в аналитике есть все шаги воронки${miss.length ? ' — нет: ' + miss.join(', ') : ''}`);
ok(!/@example\.com|cv\.pdf|login_url|code=|data_b64/.test(csv), 'в аналитике нет e-mail, файлов, ссылок и кодов входа');

await mock.close();
await smtp.close();
console.log(failed ? `\n${failed} проверок провалено` : '\nВсе проверки интеграции пройдены');
process.exit(failed ? 1 : 0);
