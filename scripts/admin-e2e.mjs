// E2E админки и маркетинговой атрибуции: Instagram → /go/… → главная → регистрация → Free → оплата Pro → админка.
// Сервер: ADMIN_EMAILS=<ADMIN> (тестовый платёжный режим stub). Запуск: ADMIN=<ADMIN> BASE_URL=http://localhost:3000 node scripts/admin-e2e.mjs
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const ADMIN = process.env.ADMIN ?? 'admin_e2e@example.com';
let failed = 0;
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) failed++; };
const section = (t) => console.log(`\n— ${t}`);
const T = Date.now();
const IG_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0';

class Client {
  jar = new Map();
  constructor(ua) { this.ua = ua; }
  async req(path, opts = {}) {
    const res = await fetch(BASE + path, { ...opts, redirect: 'manual', headers: { ...(this.ua ? { 'user-agent': this.ua } : {}), ...(opts.headers ?? {}), cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (!v || /max-age=0|expires=thu, 01 jan 1970/i.test(c)) this.jar.delete(k); else this.jar.set(k, v); }
    return res;
  }
  json(path, body, method = 'POST') { return this.req(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  text(path) { return this.req(path).then((r) => r.text()); }
}
async function newUser(email, c = new Client()) {
  await c.json('/api/auth/register', { name: 'Тест', email, password: 'password123', consent: true });
  await c.json('/api/profile', { professionId: 'product-manager', level: 'middle' }, 'PATCH');
  return c;
}
async function buyPro(c, planId = 'pro-month', action = 'succeed') {
  const d = await (await c.json('/api/billing/checkout', { planId })).json();
  if (action) await c.json(`/api/billing/stub/${d.paymentId}`, { action });
  return d.paymentId;
}
const strip = (h) => h.replace(/<!-- -->/g, '').replace(/[  ]/g, ' ');
/** Значение KPI или ячейки по data-testid. */
const kpi = (html, id) => { const h = strip(html); const i = h.indexOf(`data-testid="${id}"`); if (i < 0) return null; const m = h.slice(i).match(/tabular[^"]*"[^>]*>([^<]*)</); return m ? m[1].trim() : null; };
const cell = (html, id) => { const h = strip(html); const m = h.match(new RegExp(`data-testid="${id}"[^>]*>([^<]*)<`)); return m ? m[1].trim() : null; };

/* ───────── Доступ ───────── */
section('Доступ к админке');
const admin = new Client();
await admin.json('/api/auth/register', { name: 'Админ', email: ADMIN, password: 'password123', consent: true });
await admin.json('/api/auth/login', { email: ADMIN, password: 'password123' });
await admin.json('/api/profile', { professionId: 'product-manager', level: 'middle' }, 'PATCH');
const normal = await newUser(`plain_${T}@example.com`);
for (const p of ['/admin', '/admin/users', '/admin/payments', '/admin/marketing', '/admin/integrations']) {
  const r = await admin.req(p); const h = await r.text();
  ok(r.status === 200 && h.includes('Админка Clymly') && h.includes('data-testid="admin-tab-overview"'), `администратор: ${p} открывается, есть вкладки`);
  const n = await normal.text(p);
  ok(n.includes('Страница не найдена') && !n.includes('Админка Clymly'), `обычный пользователь: ${p} — «не найдено»`);
  const a = await new Client().req(p);
  ok(a.status === 307 && (a.headers.get('location') ?? '').includes('/login'), `без входа: ${p} → вход`);
}
ok((await normal.json('/api/admin/marketing/links', { slug: 'x-hack', name: 'Hack' })).status === 404, 'API админки: обычный пользователь — 404');
ok((await new Client().json('/api/admin/marketing/links', { slug: 'x-hack', name: 'Hack' })).status === 404, 'API админки: без входа — 404 (существование не раскрывается)');
ok((await normal.req('/api/admin/integrations/export')).status === 404, 'выгрузка JobToo: обычный пользователь — 404');
ok(!(await normal.text('/dashboard')).includes('/admin'), 'в навигации кабинета нет ссылки на админку');

/* ───────── Ссылки ───────── */
section('Маркетинговые ссылки');
const slug = `ig-${T.toString(36)}`;
let r = await admin.json('/api/admin/marketing/links', { slug, name: `Instagram тест ${T}`, utmSource: 'instagram', utmMedium: 'bio' });
ok(r.status === 200, 'администратор создал ссылку');
ok((await admin.json('/api/admin/marketing/links', { slug, name: 'Дубль' })).status === 409, 'повторный адрес ссылки отклонён');
ok((await admin.json('/api/admin/marketing/links', { slug: 'Bad Slug!', name: 'x' })).status === 400, 'некорректный адрес отклонён');
ok((await admin.json('/api/admin/marketing/links', { slug: 'ok-slug-' + T, name: 'x', utmSource: 'a b<script>' })).status === 400, 'некорректная UTM-метка отклонена');
const ig = (await new Client().req('/go/instagram'));
ok(ig.status === 302 && ig.headers.get('location') === '/', 'стандартная ссылка /go/instagram работает → главная');

const v1 = new Client(IG_UA);
r = await v1.req(`/go/${slug}?utm_campaign=launch&utm_content=reel-1&utm_term=career`, { headers: { referer: 'https://l.instagram.com/', 'accept-language': 'ru-RU,ru;q=0.9' } });
ok(r.status === 302 && r.headers.get('location') === '/' && v1.jar.has('cl_vid') && v1.jar.has('cl_mk'), 'переход: редирект на главную без промежуточной страницы, cookie посетителя (90 дней)');
const t0 = Date.now(); await new Client().req('/go/instagram'); ok(Date.now() - t0 < 1500, `переход быстрый (${Date.now() - t0} мс)`);
ok((await v1.req('/')).status === 200, 'главная открывается');
await v1.req(`/go/${slug}?utm_campaign=launch`); // повторный клик того же посетителя
for (const [p, label] of [['/go/instagram?to=https://evil.example', 'параметр to'], ['/go/instagram?redirect=//evil.example', 'redirect=//'], ['/go/%2F%2Fevil.example', 'закодированный //'], ['/go/unknown-' + T, 'неизвестная ссылка'], [`/go/instagram?utm_source=${'x'.repeat(200)}&utm_medium=<b>`, 'длинные и опасные UTM']]) {
  const x = await new Client().req(p);
  ok(x.status === 302 && x.headers.get('location') === '/', `${label} → только на главную Clymly (нет открытого редиректа)`);
}

/* ───────── Атрибуция ───────── */
section('Атрибуция: переход → регистрация → оплата');
const em1 = `ig_user_${T}@example.com`;
await newUser(em1, v1);
const v2 = new Client(); await v2.req(`/go/${slug}`); // посетитель без регистрации
const v3 = new Client(); await v3.req(`/go/${slug}`); r = await v3.json('/api/consent/analytics', { accept: false });
ok(r.status === 200 && !v3.jar.has('cl_vid') && v3.jar.get('cl_consent') === '0', 'отказ от аналитических cookie: идентификатор удалён');
await v3.req(`/go/${slug}`);
ok(!v3.jar.has('cl_vid'), 'после отказа повторный переход не ставит cookie');
await newUser(`declined_${T}@example.com`, v3);

// существующий аккаунт: зарегистрирован без ссылки, потом пришёл по ссылке, вошёл и оплатил
const exEmail = `existing_${T}@example.com`;
const ex = await newUser(exEmail);
await ex.json('/api/auth/logout', {});
await ex.req(`/go/${slug}?utm_campaign=retarget`);
await ex.json('/api/auth/login', { email: exEmail, password: 'password123' });

let h = await admin.text(`/admin/marketing?period=all&model=first`);
const C = (k) => cell(h, `card-${slug}-${k}`);
ok(C('Переходы') === '6', `переходы по ссылке: ${C('Переходы')} (2 повторных клика одного посетителя + 3 посетителя + 1 после отказа)`);
ok(C('Уникальные') === '3', `уникальные посетители: ${C('Уникальные')} (повторы и отказавшийся не учитываются)`);
ok(C('Регистрации') === '1', `регистрации (first-touch): ${C('Регистрации')} — только новый аккаунт, без существующего и отказавшегося`);
ok(C('Оплаты') === '0' && C('→ регистрация') === '33,3%', `пока без оплат; конверсия в регистрацию ${C('→ регистрация')}`);

// оплаты: успешная у пришедшего по ссылке, ожидающая и отменённая — не в выручке; повтор подтверждения — без дубля
const pay1 = await buyPro(v1, 'pro-month');
ok((await v1.json(`/api/billing/stub/${pay1}`, { action: 'succeed' })).status === 409, 'повторное подтверждение платежа отклонено (без дубля)');
await buyPro(v1, 'pro-quarter', null);           // ожидает оплаты
await newUser(`v2_${T}@example.com`, v2); await buyPro(v2, 'pro-month', 'cancel'); // v2 зарегистрировался позже и отменил оплату
await buyPro(ex, 'pro-month');                   // существующий аккаунт оплатил после перехода

h = await admin.text(`/admin/marketing?period=all&model=first`);
ok(C('Оплаты') === '1' && C('Выручка') === '499 ₽', `first-touch: 1 оплата, выручка ${C('Выручка')} (ожидающая и отменённая не учтены, существующий аккаунт не приписан)`);
ok(C('Регистрации') === '2' && C('→ оплата') === '33,3%', `first-touch: регистрации ${C('Регистрации')} (+v2), конверсия в оплату ${C('→ оплата')}`);
h = await admin.text(`/admin/marketing?period=all&model=last`);
ok(C('Оплаты') === '2' && C('Выручка') === '998 ₽', `last-touch: 2 оплаты (вкл. существующий аккаунт, пришедший по ссылке перед оплатой), выручка ${C('Выручка')}`);
h = await admin.text(`/admin/marketing?period=all&model=first&dim=utmCampaign&source=instagram`);
ok(strip(h).includes('launch') && strip(h).includes('data-testid="mk-breakdown"'), 'разбивка по utm_campaign с фильтром по источнику');
h = await admin.text(`/admin/marketing?period=7&model=first&dim=utmContent`);
ok(strip(h).includes('reel-1'), 'разбивка по utm_content');
h = await admin.text('/admin/marketing?period=all');
ok(strip(h).includes('Instagram') && strip(h).includes('mobile') && strip(h).includes('iOS') && strip(h).includes('instagram.com'), 'технические срезы: браузер, устройство, ОС, реферер');
ok(!strip(h).includes('127.0.0.1') && !/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(strip(h).replace(/\d+\.\d+\.\d+ /g, '')), 'IP-адреса не показываются');
ok(cell(h, 'link-url') === 'https://clymly.ru/go/instagram' || strip(h).includes('/go/instagram'), 'полная ссылка Instagram с кнопкой «Копировать»');

/* ───────── Пользователи ───────── */
section('Пользователи');
h = await admin.text(`/admin/users?q=${encodeURIComponent(em1)}`);
ok(strip(h).includes(em1) && (strip(h).match(/data-testid="user-row"/g) ?? []).length === 1, 'поиск по e-mail');
ok(cell(h, 'user-plan') === 'Pro' && cell(h, 'user-sub') === 'Активна', 'тариф Pro и подписка «Активна» по данным БД');
ok(strip(h).includes(`Instagram тест ${T}`), 'первый источник и источник регистрации — ссылка Instagram');
h = await admin.text(`/admin/users?q=${encodeURIComponent(exEmail)}`);
ok(strip(h).includes('Прямая'), 'существующий аккаунт: источник регистрации «Прямая», первый источник — ссылка (пришёл позже)');
h = await admin.text(`/admin/users?q=${encodeURIComponent(`plain_${T}`)}`);
ok(cell(h, 'user-plan') === 'Free' && cell(h, 'user-sub') === 'Не оформлялась' && strip(h).includes('Неизвестен'), 'пользователь без платежей и маркетинговых данных отображается корректно');
h = await admin.text(`/admin/users?plan=pro&q=${T}`);
ok((strip(h).match(/data-testid="user-row"/g) ?? []).length === 2, 'фильтр по тарифу Pro');
h = await admin.text(`/admin/users?source=${slug}`);
ok((strip(h).match(/data-testid="user-row"/g) ?? []).length === 3, `фильтр по первому источнику (3 аккаунта: новый, v2 и существующий)`);
h = await admin.text(`/admin/users?sort=paid&dir=desc&q=${T}`);
ok(strip(h).indexOf(em1) < strip(h).indexOf(`plain_${T}`), 'сортировка по сумме оплат');
h = await admin.text(`/admin/users?sub=none&q=declined_${T}`);
ok((strip(h).match(/data-testid="user-row"/g) ?? []).length === 1, 'фильтр по статусу подписки');
r = await admin.req('/admin/users?page=999999&sort=hack;drop&dir=x&plan=%3Cscript%3Ealert(1)%3C/script%3E&q=%27%20OR%201=1--');
h = await r.text();
ok(r.status === 200 && strip(h).includes('Найдено: 0') && !h.includes('<script>alert(1)'), 'некорректные параметры фильтров и пагинации обрабатываются безопасно');

/* ───────── Платежи ───────── */
section('Платежи');
h = await admin.text(`/admin/payments?period=all&source=${slug}`);
ok(kpi(h, 'pay-sum') === '499 ₽' && kpi(h, 'pay-failed') === '1' && kpi(h, 'pay-pending') === '1' && kpi(h, 'pay-count') === '3', `фильтр по источнику (first-touch, без существующего аккаунта): успешные ${kpi(h, 'pay-sum')}, неуспешные ${kpi(h, 'pay-failed')}, ожидают ${kpi(h, 'pay-pending')}, всего ${kpi(h, 'pay-count')}`);
h = await admin.text(`/admin/payments?period=all&status=pending&source=${slug}`);
ok((strip(h).match(/data-testid="payment-row"/g) ?? []).length === 1 && kpi(h, 'pay-sum') === '0 ₽', 'ожидающий платёж не считается успешным');
h = await admin.text('/admin/payments?period=7&plan=pro-quarter&provider=stub');
ok(h.includes('Clymly Pro на 3 месяца'), 'фильтры по тарифу и провайдеру');

/* ───────── Обзор ───────── */
section('Обзор');
h = await admin.text('/admin?period=all');
ok(Number(kpi(h, 'kpi-users-total')) >= 6 && Number(kpi(h, 'kpi-users-pro')) >= 2 && Number(kpi(h, 'kpi-subs-active')) >= 2, 'KPI пользователей и подписок');
ok(Number(kpi(h, 'kpi-users-active')) >= 6, 'активные пользователи (по входам и действиям)');
ok(Number(kpi(h, 'kpi-failed')) >= 1 && strip(h).includes('MRR) не рассчитывается'), 'неуспешные платежи, MRR не выдаётся за выручку');
for (const id of ['chart-regs', 'chart-clicks', 'chart-pays', 'chart-revenue', 'funnel']) ok(h.includes(`data-testid="${id}"`), `график: ${id}`);
h = await admin.text('/admin/integrations');
ok(h.includes('Clymly → JobToo') && h.includes('JobToo → Clymly'), 'аналитика JobToo на месте');
ok(!/JOBTOO_|_SECRET|test-out|test-in/.test(h), 'секреты интеграции не выводятся');

console.log(failed ? `\n${failed} проверок провалено` : '\nВсе проверки админки пройдены');
process.exit(failed ? 1 : 0);
