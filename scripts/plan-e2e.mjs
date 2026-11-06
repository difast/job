// E2E разграничения тарифов и учёта токенов: Free — 2 анализа резюме и 1 разбор вакансии в месяц, остальное — Pro;
// баннеры Pro для Free; расход токенов в админке. ИИ — МОК GigaChat (scripts/mock-gigachat.mjs), оплата — заглушка stub.
// Сервер: AI_PROVIDER=gigachat GIGACHAT_AUTH_KEY=<любой Base64> GIGACHAT_AUTH_URL=http://localhost:4200/api/v2/oauth
//         GIGACHAT_API_URL=http://localhost:4200/api/v1 GIGACHAT_MAX_RETRIES=1 GIGACHAT_TIMEOUT_MS=5000 ADMIN_EMAILS=<ADMIN>
//         (PLAN_LIMITS не задавать — лимиты включены). Запуск: ADMIN=<ADMIN> DATABASE_URL=… BASE_URL=http://localhost:3000 node scripts/plan-e2e.mjs
import { chromium } from 'playwright-core';
import { PrismaClient } from '@prisma/client';
import { startMockGigaChat } from './mock-gigachat.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const ADMIN = process.env.ADMIN ?? 'admin_e2e@example.com';
const SHOTS = process.env.SHOTS; // папка для скриншотов (необязательно)
const db = new PrismaClient();
let failed = 0;
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) failed++; };
const section = (t) => console.log(`\n— ${t}`);
const T = Date.now();
await startMockGigaChat({ port: 4200 });
const mode = (m) => fetch(`http://localhost:4200/__mode?m=${m}`);

class Client {
  jar = new Map();
  async req(path, opts = {}) {
    const res = await fetch(BASE + path, { ...opts, redirect: 'manual', headers: { ...(opts.headers ?? {}), cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); this.jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    return res;
  }
  json(path, body, method = 'POST') { return this.req(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  text(path) { return this.req(path).then((r) => r.text()); }
  upload(name, text) { const fd = new FormData(); fd.append('file', new Blob([text], { type: 'text/plain' }), name); return this.req('/api/resume', { method: 'POST', body: fd }); }
}
async function user(email) {
  const c = new Client();
  await c.json('/api/auth/register', { name: 'Иван Петров', email, password: 'password123', consent: true });
  await c.json('/api/profile', { professionId: 'software-developer', level: 'middle' }, 'PATCH');
  c.email = email; c.id = (await db.user.findUnique({ where: { email } })).id;
  return c;
}
const body = async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) });
const clean = (h) => h.replace(/<!-- -->/g, '').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&laquo;|&raquo;/g, '"');

const RESUME = `Иван Петров
Продавец-консультант
Опыт работы
2019–2024 — Продавец-консультант, магазин «Электроника»
- Консультировал покупателей по выбору бытовой техники
- Общение с клиентами и оформление возвратов
- Выполнял план продаж на 110%
Образование
2018 — Колледж торговли
Навыки: работа с кассой, общение с клиентами`;
const vacancy = (n) => `Вакансия: Менеджер по работе с клиентами ${n}
Требования:
- Опыт продаж от 2 лет
- Общение с клиентами и заказчиками
- Работа с возражениями
Обязанности: консультирование клиентов, ведение базы
Условия: офис, полный день`;

/* ───────── Free: лимиты ───────── */
section('Free: анализ резюме — 2 раза в месяц');
const F = await user(`plan_free_${T}@example.com`);
let r = await body(await F.upload('resume.txt', RESUME));
ok(r.status === 200 && r.analysis, 'первый анализ резюме — бесплатно');
let h = clean(await F.text('/resume'));
ok(h.includes('Бесплатно осталось 1 из 2'), 'на странице резюме — остаток лимита «1 из 2»');
ok(h.includes('data-testid="pro-banner"'), 'на странице резюме — баннер Pro');
r = await body(await F.req('/api/resume', { method: 'PUT' }));
ok(r.status === 200, 'второй анализ (пересчёт) — бесплатно');
r = await body(await F.req('/api/resume', { method: 'PUT' }));
ok(r.status === 402 && r.upgrade === true && r.error.includes('2 анализа резюме в месяц') && r.error.includes('Pro'), 'третий анализ — 402 «лимит исчерпан» с предложением Pro');
r = await body(await F.upload('resume2.txt', RESUME.replace('110%', '120%')));
ok(r.status === 402, 'загрузка нового резюме сверх лимита — тоже 402');
ok(clean(await F.text('/resume')).includes('Лимит бесплатного тарифа исчерпан'), 'на странице резюме — «лимит исчерпан» и дата обновления');
ok(await db.featureUse.count({ where: { userId: F.id, feature: 'resume' } }) === 2, 'в учёте ровно 2 использования');

section('Неудачная попытка лимит не тратит');
const G = await user(`plan_fail_${T}@example.com`);
await mode('500');
r = await body(await G.upload('resume.txt', RESUME));
await mode('ok');
ok(r.status === 503 && await db.featureUse.count({ where: { userId: G.id } }) === 0, 'сбой ИИ — использование не засчитано');
r = await body(await G.upload('resume.txt', RESUME));
ok(r.status === 200 && clean(await G.text('/resume')).includes('Бесплатно осталось 1 из 2'), 'после сбоя доступны оба бесплатных анализа');

section('Free: разбор вакансии — 1 раз в месяц');
r = await body(await F.json('/api/vacancies', { text: vacancy(1) }));
const vid = r.id;
ok(r.status === 200 && vid, 'первая вакансия — бесплатно');
r = await body(await F.json('/api/vacancies', { text: vacancy(1) }));
ok(r.status === 200 && r.duplicate && r.id === vid, 'повторная отправка той же вакансии — без списания лимита');
r = await body(await F.json('/api/vacancies', { text: vacancy(2) }));
ok(r.status === 402 && r.upgrade && r.error.includes('1 разбор вакансии в месяц'), 'вторая вакансия — 402 «лимит исчерпан»');
ok(clean(await F.text('/vacancies')).includes('Лимит бесплатного тарифа исчерпан: разбор вакансии'), 'на странице вакансий — лимит исчерпан');

section('Free: остальные функции — только Pro');
for (const [name, res] of [
  ['адаптация резюме', await F.json(`/api/vacancies/${vid}/adapt`, {})],
  ['сопроводительное письмо', await F.json('/api/cover-letters', { vacancyId: vid, style: 'professional' })],
  ['банк вопросов собеседования', await F.req('/api/interview/questions?type=hr')],
  ['вопросы под вакансию', await F.json('/api/interview/vacancy-questions', { vacancyId: vid, type: 'hr' })],
  ['оценка ответа', await F.json('/api/interview/answer', { questionId: 'x', answer: 'Мой ответ на вопрос' })],
]) {
  const b = await body(res);
  ok(b.status === 402 && b.upgrade === true && b.error.includes('Pro'), `${name} — 402 «в тарифе Pro»`);
}
for (const [path, what] of [['/cover-letter', 'Сопроводительные письма — в тарифе Pro'], ['/interview', 'Тренажёр собеседований — в тарифе Pro']]) {
  h = clean(await F.text(path));
  ok(h.includes('data-testid="pro-paywall"') && h.includes(what), `${path}: вместо инструмента — предложение Pro`);
}
h = clean(await F.text(`/vacancies/${vid}`));
ok(h.includes('data-testid="vacancy-pro-actions"') && !h.includes('data-testid="interview-for-vacancy"'), 'страница вакансии: адаптация, письмо и тренажёр — с замком Pro');
h = clean(await F.text('/dashboard'));
ok(h.includes('data-testid="pro-banner"') && h.includes('(в тарифе Pro)'), 'главная: баннер Pro, в меню замки у Pro-разделов');

section('Смена профессии на Free без лимита');
const before = (await db.resume.findFirst({ where: { userId: F.id }, orderBy: { createdAt: 'desc' } })).analyzedAt.getTime();
r = await body(await F.json('/api/profile', { professionId: 'sales-manager', level: 'middle' }, 'PATCH'));
const after = (await db.resume.findFirst({ where: { userId: F.id }, orderBy: { createdAt: 'desc' } })).analyzedAt.getTime();
ok(r.status === 200 && before === after && await db.featureUse.count({ where: { userId: F.id, feature: 'resume' } }) === 2, 'профессия сохранена, пересчёт пропущен — лимит не превышен');

/* ───────── Pro ───────── */
section('После оплаты Pro — без ограничений');
const d = await body(await F.json('/api/billing/checkout', { planId: 'pro-month' }));
await F.json(`/api/billing/stub/${d.paymentId}`, { action: 'succeed' });
r = await body(await F.json('/api/vacancies', { text: vacancy(2) }));
ok(r.status === 200 && r.id, 'Pro: вторая вакансия в месяце');
r = await body(await F.req('/api/resume', { method: 'PUT' }));
ok(r.status === 200, 'Pro: третий анализ резюме');
r = await body(await F.json(`/api/vacancies/${vid}/adapt`, {}));
ok(r.status === 200, 'Pro: адаптация резюме');
r = await body(await F.json('/api/cover-letters', { vacancyId: vid, style: 'short' }));
ok(r.status === 200 && r.text, 'Pro: сопроводительное письмо');
r = await body(await F.req('/api/interview/questions?type=hr'));
ok(r.status === 200 && r.questions.length > 0, 'Pro: банк вопросов собеседования');
h = clean(await F.text('/dashboard'));
ok(!h.includes('data-testid="pro-banner"') && !h.includes('(в тарифе Pro)'), 'Pro: баннеров и замков нет');
ok(!clean(await F.text('/interview')).includes('pro-paywall'), 'Pro: тренажёр открыт');

/* ───────── Токены ───────── */
section('Учёт токенов');
const calls = await db.aiCall.findMany({ where: { userId: F.id } });
ok(calls.length >= 6 && calls.every((c) => c.provider === 'gigachat'), `каждый запрос к ИИ записан с пользователем (${calls.length})`);
ok(calls.some((c) => c.feature === 'analyzeResume') && calls.some((c) => c.feature === 'letter') && calls.filter((c) => c.ok).every((c) => c.totalTokens > 0 && c.totalTokens === c.promptTokens + c.completionTokens), 'по функциям, токены запроса и ответа из usage');
ok(await db.aiCall.count({ where: { userId: G.id, ok: false, errorKind: 'unavailable' } }) >= 1, 'неудачный запрос записан с типом ошибки');
const admin = new Client();
await admin.json('/api/auth/register', { name: 'Админ', email: ADMIN, password: 'password123', consent: true });
await admin.json('/api/auth/login', { email: ADMIN, password: 'password123' });
await admin.json('/api/profile', { professionId: 'software-developer', level: 'middle' }, 'PATCH');
h = clean(await admin.text('/admin/ai?period=7'));
ok(h.includes('data-testid="ai-totals"') && h.includes('Анализ резюме') && h.includes('Сопроводительное письмо') && h.includes(F.email), 'админка «ИИ»: итоги, функции, пользователи с наибольшим расходом');
ok(h.includes('gigachat · GigaChat-2-Pro'), 'админка «ИИ»: расход по модели');
const anon = await F.req('/admin/ai');
const anonText = await anon.text();
ok(anon.status === 404 || anonText.includes('Страница не найдена'), 'админка «ИИ» недоступна обычному пользователю');

section('Удаление аккаунта обезличивает учёт');
// без почты (SMTP не задан) удаление подтверждается паролем
r = await body(await F.json('/api/profile', { password: 'password123' }, 'DELETE'));
ok(r.status === 200 && await db.aiCall.count({ where: { userId: F.id } }) === 0 && await db.featureUse.count({ where: { userId: F.id } }) === 0, 'токены остаются в статистике без привязки, лимиты удалены');

/* ───────── Интерфейс ───────── */
section('Интерфейс');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const H = await user(`plan_ui_${T}@example.com`);
await H.upload('resume.txt', RESUME);
const hv = (await body(await H.json('/api/vacancies', { text: vacancy(3) }))).id;
for (const [w, hgt, tag] of [[1280, 900, 'd'], [390, 844, 'm']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: hgt } });
  await ctx.addCookies([...H.jar].map(([name, value]) => ({ name, value, url: BASE })));
  const p = await ctx.newPage();
  const noScroll = async () => (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0;
  const seen = (id) => p.getByTestId(id).waitFor({ timeout: 15_000 }).then(() => true, () => false);
  await p.goto(`${BASE}/dashboard`);
  ok(await seen('pro-banner') && await noScroll(), `${tag}: главная — баннер Pro, без горизонтальной прокрутки`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/plan-${tag}-dashboard.png` });
  await p.goto(`${BASE}/vacancies/${hv}`);
  ok(await seen('vacancy-pro-actions') && await noScroll(), `${tag}: вакансия — действия Pro с замком`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/plan-${tag}-vacancy.png`, fullPage: true });
  await p.goto(`${BASE}/interview`);
  ok(await seen('pro-paywall') && await noScroll(), `${tag}: собеседования — предложение Pro`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/plan-${tag}-paywall.png` });
  await p.goto(`${BASE}/vacancies`);
  await p.locator('#vacancy-text').waitFor();
  await p.fill('#vacancy-text', vacancy(4));
  await p.getByRole('button', { name: /Анализировать/ }).click();
  ok(await p.getByTestId('upgrade-link').waitFor({ timeout: 15_000 }).then(() => true, () => false), `${tag}: вакансия сверх лимита — сообщение с кнопкой «Подключить Pro»`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/plan-${tag}-limit.png` });
  await ctx.close();
}
const actx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await actx.addCookies([...admin.jar].map(([name, value]) => ({ name, value, url: BASE })));
const ap = await actx.newPage();
await ap.goto(`${BASE}/admin/ai`);
ok(await ap.getByTestId('ai-totals').waitFor({ timeout: 15_000 }).then(() => true, () => false) && (await ap.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, 'm: админка «ИИ» без горизонтальной прокрутки');
if (SHOTS) await ap.screenshot({ path: `${SHOTS}/plan-m-admin-ai.png`, fullPage: true });
await browser.close();

await db.$disconnect();
console.log(failed ? `\n❌ Провалено: ${failed}` : '\n✅ Все проверки тарифов и учёта токенов пройдены');
process.exit(failed ? 1 : 0);
