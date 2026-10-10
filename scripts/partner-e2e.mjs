// E2E интеграции Clymly ⇄ JobToo (формат v1) с заглушкой JobToo.
// Сервер Clymly должен быть запущен с переменными:
//   JOBTOO_INTEGRATION_ENABLED=1 JOBTOO_API_BASE=http://localhost:4100 JOBTOO_OUTBOUND_SECRET=test-out JOBTOO_INBOUND_SECRET=test-in ADMIN_EMAILS=<ADMIN>
// Запуск: ADMIN=<ADMIN> BASE_URL=http://localhost:3000 node scripts/partner-e2e.mjs
import { readFileSync } from 'node:fs';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { startMockJobToo } from './mock-jobtoo.mjs';

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

/** Подписанный запрос JobToo → Clymly. */
async function partnerPost(path, { payload, file, json, secret = IN_SECRET, requestId = randomUUID(), ts = Math.floor(Date.now() / 1000), partner = 'jobtoo', tamper = false }) {
  let body, contentType;
  if (json !== undefined) { body = Buffer.from(JSON.stringify(json)); contentType = 'application/json'; }
  else {
    const fd = new FormData();
    if (payload !== undefined) fd.set('payload', typeof payload === 'string' ? payload : JSON.stringify(payload));
    if (file) fd.set('resume_file', new Blob([file.data]), file.name);
    const r = new Request('http://x', { method: 'POST', body: fd });
    body = Buffer.from(await r.arrayBuffer()); contentType = r.headers.get('content-type');
  }
  const sig = createHmac('sha256', secret).update(`${ts}.${requestId}.${createHash('sha256').update(body).digest('hex')}`).digest('hex');
  const res = await fetch(BASE + path, { method: 'POST', body: tamper ? Buffer.concat([body, Buffer.from(' ')]) : body, headers: { 'Content-Type': contentType, 'X-Partner-Id': partner, 'X-Request-Id': requestId, 'X-Timestamp': String(ts), 'X-Signature': sig } });
  return { res, data: await res.json().catch(() => null), requestId };
}

const pdf = readFileSync('tests/fixtures/resume.pdf');
const vacancy = readFileSync('tests/fixtures/vacancy.txt', 'utf8');
const basePayload = (o = {}) => ({
  source: 'jobtoo', jobtoo_user_id: `jt-${T}-1`, email: `jt_${T}_1@example.com`, email_verified: true, name: 'Мария Соколова', phone: '+79990000000',
  target_position: 'Ведущий продакт-менеджер', experience_level: 'middle', skills: ['SQL', 'A/B-тесты'], resume_id: 'r-1',
  vacancy: { id: 'v-1', title: 'Продуктовый менеджер', company: 'ФинПлюс', description: vacancy, url: 'http://localhost:4100/vacancy/1' },
  consent: { accepted_at: new Date().toISOString(), version: 'jt-1' }, utm: { placement: 'profile', platform: 'web' }, ...o,
});
const pathOf = (u) => { const x = new URL(u); return x.pathname + x.search; };

const mock = await startMockJobToo({ port: 4100, secret: OUT_SECRET });

/* ───────── JobToo → Clymly: проверка запросов ───────── */
section('JobToo → Clymly: защита и проверка запросов');
let r = await partnerPost('/api/partner/v1/handoff', { payload: basePayload(), file: { name: 'cv.pdf', data: pdf }, secret: 'wrong' });
ok(r.res.status === 401 && r.data?.error?.code === 'invalid_signature' && r.data.request_id === r.requestId, 'неверный секрет → 401 invalid_signature');
r = await partnerPost('/api/partner/v1/handoff', { payload: basePayload(), file: { name: 'cv.pdf', data: pdf }, tamper: true });
ok(r.res.status === 401, 'изменённое тело запроса → 401');
r = await partnerPost('/api/partner/v1/handoff', { payload: basePayload(), file: { name: 'cv.pdf', data: pdf }, ts: Math.floor(Date.now() / 1000) - 600 });
ok(r.res.status === 401, 'метка времени старше 5 минут → 401');
r = await partnerPost('/api/partner/v1/handoff', { payload: basePayload(), file: { name: 'cv.pdf', data: pdf }, partner: 'other' });
ok(r.res.status === 401, 'чужой X-Partner-Id → 401');
const { consent: _c, ...noConsent } = basePayload();
r = await partnerPost('/api/partner/v1/handoff', { payload: noConsent, file: { name: 'cv.pdf', data: pdf } });
ok(r.res.status === 403 && r.data?.error?.code === 'consent_missing', 'без согласия → 403 consent_missing');
r = await partnerPost('/api/partner/v1/handoff', { payload: basePayload({ email: 'not-an-email' }), file: { name: 'cv.pdf', data: pdf } });
ok(r.res.status === 400 && r.data?.error?.code === 'invalid_payload', 'некорректные поля → 400 invalid_payload');
r = await partnerPost('/api/partner/v1/handoff', { payload: '{oops', file: { name: 'cv.pdf', data: pdf } });
ok(r.res.status === 400, 'некорректный JSON → 400');
r = await partnerPost('/api/partner/v1/handoff', { payload: basePayload({ jobtoo_user_id: `jt-${T}-x` }), file: { name: 'cv.exe', data: pdf } });
ok(r.res.status === 415 && r.data?.error?.code === 'unsupported_file', 'файл .exe → 415 unsupported_file');
r = await partnerPost('/api/partner/v1/handoff', { payload: basePayload({ jobtoo_user_id: `jt-${T}-x` }), file: { name: 'cv.pdf', data: Buffer.from('not a pdf') } });
ok(r.res.status === 422 && r.data?.error?.code === 'resume_unreadable', 'битый PDF → 422 resume_unreadable');
r = await partnerPost('/api/partner/v1/handoff', { payload: basePayload({ jobtoo_user_id: `jt-${T}-x` }), file: { name: 'cv.pdf', data: Buffer.alloc(6 * 1024 * 1024, 65) } });
ok(r.res.status === 413 && r.data?.error?.code === 'file_too_large', 'файл больше 5 МБ → 413 file_too_large');
r = await partnerPost('/api/partner/v1/handoff', { payload: basePayload({ jobtoo_user_id: `jt-${T}-x`, resume_text: undefined }) });
ok(r.res.status === 400, 'нет ни файла, ни текста резюме → 400');

/* ───────── JobToo → Clymly: новый пользователь ───────── */
section('JobToo → Clymly: новый пользователь');
const first = await partnerPost('/api/partner/v1/handoff', { payload: basePayload(), file: { name: 'cv.pdf', data: pdf } });
const d1 = first.data;
ok(first.res.status === 200 && d1.status === 'ok' && d1.account === 'created' && d1.request_id === first.requestId, `новый аккаунт создан (account=${d1?.account})`);
ok(typeof d1.login_url === 'string' && new URL(d1.login_url).pathname === '/sso/jobtoo' && /code=[\w-]{40,}/.test(d1.login_url), 'login_url: /sso/jobtoo с одноразовым кодом');
const ttl = Date.parse(d1.expires_at) - Date.now();
ok(ttl > 60_000 && ttl <= 121_000, `ссылка живёт 2 минуты (${Math.round(ttl / 1000)} с)`);
const again = await partnerPost('/api/partner/v1/handoff', { payload: basePayload(), file: { name: 'cv.pdf', data: pdf }, requestId: first.requestId });
ok(again.res.status === 200 && again.data.external_user_id === d1.external_user_id && again.data.login_url !== d1.login_url, 'повтор с тем же request_id: тот же пользователь, без дубля, новая ссылка');

const anna = new Client();
let res = await anna.req(pathOf(d1.login_url));
const loc1 = res.headers.get('location') ?? '';
ok(res.status === 303 && loc1.startsWith('/welcome?next=') && anna.jar.has('session'), `вход по ссылке → сессия создана, сначала согласие (${loc1})`);
res = await new Client().req(pathOf(d1.login_url));
ok(res.status === 303 && res.headers.get('location') === '/sso/expired', 'повторное открытие той же ссылки → «Ссылка устарела»');
res = await new Client().req(pathOf(again.data.login_url.replace(/code=.*/, 'code=' + 'x'.repeat(43))));
ok(res.headers.get('location') === '/sso/expired', 'поддельный код → «Ссылка устарела»');
ok((await anna.req('/api/resume', { method: 'PUT' })).status === 403, 'до согласия API кабинета недоступно (403)');
let page = await (await anna.req(loc1)).text();
ok(page.includes('добро пожаловать в Clymly') && page.includes('Мы получили ваш профиль и резюме из JobToo'), 'страница приветствия с согласием');
ok((await anna.json('/api/auth/consent', { consent: true })).status === 200, 'согласие на обработку данных принято');
const landing1 = decodeURIComponent(loc1.split('next=')[1]);
ok(/^\/vacancies\/\w+$/.test(landing1), `после входа ведём сразу на анализ вакансии (${landing1})`);
page = await (await anna.req(landing1)).text();
ok(page.includes('Продуктовый менеджер') && page.includes('соответствия вакансии'), 'вакансия из JobToo проанализирована');
page = await (await anna.req('/resume')).text();
ok(page.includes('cv.pdf') && page.includes('Сильные стороны'), 'резюме из JobToo загружено и проанализировано');
page = await (await anna.req('/dashboard')).text();
ok(page.includes('Продакт-менеджер') && page.includes('Middle'), 'профессия сопоставлена («Ведущий продакт-менеджер» → Продакт-менеджер), уровень Middle');
page = await (await anna.req('/settings')).text();
ok(page.includes('Задайте пароль') && page.includes('JobToo → Clymly') && page.includes('Аккаунт связан'), 'настройки: предложено задать пароль, связь и история передач');
ok(!page.includes('+79990000000'), 'телефон не сохранён и не показывается');
ok((await anna.json('/api/profile/password', { password: 'newpass123' })).status === 200, 'пароль задан без текущего (аккаунт создан JobToo)');
ok((await new Client().json('/api/auth/login', { email: `jt_${T}_1@example.com`, password: 'newpass123' })).status === 200, 'теперь можно войти по e-mail и паролю');
ok((await anna.json('/api/profile/password', { password: 'another123' })).status === 400, 'смена пароля требует текущий пароль');

await sleep(1500);
ok(mock.state.events.some((e) => e.event === 'login_completed' && e.request_id === first.requestId), 'JobToo получил событие login_completed по своему request_id');
ok(mock.state.badSignatures === 0, 'события в JobToo подписаны корректно');

const vac = await anna.json('/api/vacancies', { text: vacancy });
ok(vac.status === 200, 'пользователь из JobToo анализирует ещё одну вакансию');
await sleep(1500);
ok(mock.state.events.filter((e) => e.event === 'first_action' && e.request_id === first.requestId).length === 1, 'JobToo получил first_action (ровно один раз)');
await anna.json('/api/vacancies', { text: vacancy });
await sleep(800);
ok(mock.state.events.filter((e) => e.event === 'first_action').length === 1, 'first_action не повторяется');

/* ───────── Повторный переход: аккаунт найден ───────── */
section('JobToo → Clymly: повторный переход');
const second = await partnerPost('/api/partner/v1/handoff', { payload: basePayload({ vacancy: null }), file: { name: 'cv-v2.pdf', data: pdf } });
ok(second.data?.account === 'found' && second.data.external_user_id === d1.external_user_id, 'тот же jobtoo_user_id → account=found');
res = await new Client().req(pathOf(second.data.login_url));
ok(res.status === 303 && res.headers.get('location') === '/resume', `вход без согласия повторно, сразу к новому резюме (${res.headers.get('location')})`);

/* ───────── Профессия не распознана ───────── */
section('JobToo → Clymly: профессия не распознана');
const odd = await partnerPost('/api/partner/v1/handoff', { payload: basePayload({ jobtoo_user_id: `jt-${T}-2`, email: `jt_${T}_2@example.com`, target_position: 'Космонавт-исследователь', experience_level: null, vacancy: null }), file: { name: 'cv.pdf', data: pdf } });
ok(odd.data?.account === 'created', 'аккаунт создан');
const ivan = new Client();
res = await ivan.req(pathOf(odd.data.login_url));
await ivan.json('/api/auth/consent', { consent: true });
res = await ivan.req('/dashboard');
ok(res.status === 307 && (res.headers.get('location') ?? '').includes('/onboarding'), 'без профессии → онбординг');
r = await ivan.json('/api/profile', { professionId: 'product-manager', level: 'senior' }, 'PATCH');
const pd = await r.json();
ok(r.status === 200 && pd.landing === '/resume', 'после выбора профессии резюме из JobToo применено и проанализировано');
page = await (await ivan.req('/resume')).text();
ok(page.includes('cv.pdf'), 'резюме на месте');

/* ───────── E-mail уже есть в Clymly → привязка ───────── */
section('JobToo → Clymly: e-mail уже зарегистрирован');
const owner = new Client();
const ownerEmail = `owner_${T}@example.com`;
await owner.json('/api/auth/register', { name: 'Ольга', email: ownerEmail, password: 'password123', consent: true });
await owner.json('/api/profile', { professionId: 'accountant', level: 'senior' }, 'PATCH');
const lr = await partnerPost('/api/partner/v1/handoff', { payload: basePayload({ jobtoo_user_id: `jt-${T}-3`, email: ownerEmail, email_verified: true, vacancy: null }), file: { name: 'cv.pdf', data: pdf } });
ok(lr.data?.account === 'link_required', 'существующий e-mail → link_required (автовход запрещён даже при email_verified=true)');
const stranger = new Client();
res = await stranger.req(pathOf(lr.data.login_url));
ok(res.status === 303 && res.headers.get('location') === '/link/jobtoo' && !stranger.jar.has('session') && stranger.jar.has('partner_link'), 'ссылка не создаёт сессию — ведёт на привязку');
page = await (await stranger.req('/link/jobtoo')).text();
ok(page.includes('У вас уже есть аккаунт Clymly') && !page.includes(ownerEmail) && page.includes('Войти и связать'), 'без входа: просим войти, e-mail замаскирован');
ok((await stranger.json('/api/integrations/jobtoo/link', { action: 'link' })).status === 401, 'привязка без входа невозможна');
ok((await stranger.json('/api/auth/login', { email: ownerEmail, password: 'password123' })).status === 200, 'владелец входит своим паролем');
page = await (await stranger.req('/link/jobtoo')).text();
ok(page.includes('Связать аккаунт Clymly с JobToo?'), 'после входа — подтверждение привязки');
r = await stranger.json('/api/integrations/jobtoo/link', { action: 'link' });
const lk = await r.json();
ok(r.status === 200 && lk.landing === '/resume', 'аккаунты связаны, резюме импортировано');
ok((await stranger.json('/api/integrations/jobtoo/link', { action: 'link' })).status === 410, 'повторная привязка тем же билетом невозможна');
const lr2 = await partnerPost('/api/partner/v1/handoff', { payload: basePayload({ jobtoo_user_id: `jt-${T}-3`, email: ownerEmail, vacancy: null }), file: { name: 'cv.pdf', data: pdf } });
ok(lr2.data?.account === 'found', 'следующий переход — сразу вход (account=found)');
await sleep(1200);
ok(mock.state.events.some((e) => e.event === 'account_linked' && e.request_id === lr.requestId), 'JobToo получил account_linked');

/* ───────── Clymly → JobToo ───────── */
section('Clymly → JobToo');
page = await (await anna.req('/resume')).text();
ok(page.includes('Перейти в JobToo') && page.includes('data-testid="jobtoo-resume"'), 'кнопка «Перейти в JobToo» в «Моём резюме»');
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
ok(p.source === 'clymly' && p.email === `jt_${T}_1@example.com` && p.email_verified === false && p.target_position === 'Продакт-менеджер' && p.experience_level === 'middle' && p.resume_text.length > 100 && p.consent.version && p.utm.placement === 'resume', 'состав данных по формату v1 (email_verified=false)');
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
mock.state.mode = 'ok';

// JobToo сообщает о входе по нашей ссылке
const outReq = mock.state.handoffs.find((h) => h.payload.utm.placement === 'resume').requestId;
r = await partnerPost('/api/partner/v1/events', { json: { events: [{ request_id: outReq, event: 'login_completed', occurred_at: new Date().toISOString(), partner_user_id: 'jt' }, { request_id: randomUUID(), event: 'login_completed' }] } });
ok(r.res.status === 200 && r.data.accepted === 1, 'события от JobToo: принято только для нашего request_id');
r = await partnerPost('/api/partner/v1/events', { json: { events: [{ request_id: outReq, event: 'login_completed' }] }, secret: 'wrong' });
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
const need = ['in:handoff_received', 'in:handoff_accepted', 'in:handoff_rejected', 'in:login_link_opened', 'in:login_completed', 'in:login_link_reused', 'in:account_linked', 'in:first_action',
  'out:consent_accepted', 'out:handoff_sent', 'out:handoff_succeeded', 'out:handoff_failed', 'out:redirect_opened', 'out:partner_login_completed', 'out:consent_revoked'];
const miss = need.filter((n) => !evs.has(n));
ok(miss.length === 0, `в аналитике есть все шаги воронки${miss.length ? ' — нет: ' + miss.join(', ') : ''}`);
ok(!/@example\.com|cv\.pdf|login_url|code=/.test(csv), 'в аналитике нет e-mail, файлов, ссылок и кодов входа');

await mock.close();
console.log(failed ? `\n${failed} проверок провалено` : '\nВсе проверки интеграции пройдены');
process.exit(failed ? 1 : 0);
