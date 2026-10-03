// UI-проверка в реальном браузере (Chromium): лендинг → регистрация → онбординг → кабинет → весь сценарий + скриншоты.
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? '/tmp/claude-0/shots';
mkdirSync(OUT, { recursive: true });
let failed = 0;
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) failed++; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = async (n, full = true) => { await page.waitForTimeout(1000); return page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full }); };

// Лендинг
await page.goto(BASE + '/');
await page.waitForSelector('h1');
await shot('01-landing');
ok((await page.textContent('h1')).includes('Получите работу'), 'лендинг: заголовок');
ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'лендинг: нет горизонтального скролла');
await page.click('main >> text=Попробовать бесплатно');
await page.waitForURL('**/register');
ok(true, '«Попробовать бесплатно» → регистрация');
await shot('02-register', false);
await page.fill('input[name=name]', 'Анна Иванова');
await page.fill('input[name=email]', `ui_${Date.now()}@example.com`);
await page.fill('input[name=password]', 'password123');
await page.click('button[type=submit]');
await page.waitForURL('**/onboarding');

await page.fill('input[aria-label="Поиск профессии"]', 'продакт');
await page.waitForSelector('button:has-text("Продакт-менеджер")');
ok((await page.locator('section h3').count()) === 1, 'онбординг: поиск фильтрует категории');
await page.fill('input[aria-label="Поиск профессии"]', '');
await page.waitForSelector('text=Другие профессиональные направления');
await shot('03-onboarding');
await page.click('button:has-text("Продакт-менеджер")');
await page.click('button:has-text("Далее")');
await page.click('[role=radio]:has-text("Middle")');
await shot('04-onboarding-level', false);
await page.click('button:has-text("Перейти в кабинет")');
await page.waitForURL('**/dashboard');

ok((await page.textContent('[data-testid=target-profession]')) === 'Продакт-менеджер', 'меню: профессия');
ok((await page.textContent('[data-testid=target-level]')) === 'Middle', 'меню: уровень');
ok((await page.textContent('[data-testid=goal-line]')).includes('Продакт-менеджер · Middle'), 'дашборд: «Ваша цель»');
await page.waitForSelector('text=Начните с резюме');
await shot('05-dashboard-empty');

await page.setInputFiles('[data-testid=resume-file]', 'tests/fixtures/resume.pdf');
await page.waitForURL('**/resume');
await page.waitForSelector('[data-testid=resume-score]');
await shot('06-resume');
await page.goto(BASE + '/dashboard');
await page.waitForSelector('text=Посмотреть анализ');
ok((await page.textContent('[data-testid=resume-file-name]')) === 'resume.pdf', 'дашборд: имя файла');
await shot('07-dashboard');

// смена цели через диалог — профессия влияет на всё
await page.click('main >> text=Изменить цель');
await page.waitForSelector('[role=dialog]');
await shot('08-goal-dialog', false);
await page.click('[role=dialog] button:has-text("Отмена")');

await page.goto(BASE + '/vacancies');
await page.fill('#vacancy-text', readFileSync('tests/fixtures/vacancy.txt', 'utf8'));
await page.getByRole('button', { name: 'Анализировать', exact: true }).click();
await page.waitForURL(/\/vacancies\/[^/]+$/);
await page.waitForSelector('[data-testid=match-score]');
await shot('09-vacancy');
await page.getByRole('button', { name: 'Адаптировать резюме' }).click();
await page.waitForURL('**/adapt');
await page.waitForSelector('[data-testid=original-resume]');
ok((await page.textContent('[data-testid=accepted-count]')) === '0', 'адаптация: изначально ничего не принято');
await page.click('button:has-text("Принять все")');
await page.waitForFunction(() => document.querySelector('[data-testid=accepted-count]')?.textContent !== '0');
await shot('10-adapt');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=download-pdf]')]);
ok(dl.suggestedFilename().endsWith('.pdf'), `скачивание PDF: ${dl.suggestedFilename()}`);

await page.getByRole('link', { name: /Создать сопроводительное письмо/ }).click();
await page.waitForURL('**/cover-letter**');
await page.waitForSelector('[data-testid=letter-text]');
await shot('11-letter');
const t1 = await page.textContent('[data-testid=letter-text]');
await page.getByRole('radio', { name: /Краткий/ }).first().click();
await page.waitForFunction((t) => { const e = document.querySelector('[data-testid=letter-text]'); return e && e.textContent !== t; }, t1);
ok(true, 'письмо: смена стиля генерирует новый текст');
await page.getByRole('button', { name: 'Создать другой вариант' }).click();
await page.waitForSelector('[data-testid=letter-text]');
ok(true, 'письмо: «Создать другой вариант»');

await page.goto(BASE + '/interview');
await page.waitForSelector('[data-testid=question-text]');
await page.getByRole('radio', { name: 'Профессиональное' }).click();
await page.waitForFunction(() => /Вопрос\s*\d+\s*из/.test(document.body.innerText));
await shot('12-interview');
const qtext = await page.textContent('[data-testid=question-text]');
await page.fill('#answer', 'Я сначала фиксирую цели и метрики, затем оцениваю идеи по RICE: охват, влияние, уверенность и трудозатраты. Например, в прошлом проекте так мы выбрали онбординг и подняли конверсию на 20%. Решение согласовываю с командой и стейкхолдерами.');
await page.getByRole('button', { name: 'Ответить', exact: true }).click();
await page.waitForSelector('[data-testid=feedback]');
await shot('13-interview-feedback');
for (const t of ['Что хорошо', 'Как усилить ответ']) ok((await page.textContent('[data-testid=feedback]')).includes(t), `тренажёр: блок «${t}»`);
await page.getByRole('button', { name: /Следующий вопрос|Завершить/ }).click();
await page.waitForFunction((q) => document.querySelector('[data-testid=question-text]')?.textContent !== q, qtext);
ok(true, 'тренажёр: следующий вопрос');

await page.goto(BASE + '/settings');
await shot('14-settings');

// Оплата (заглушка)
await page.click('[data-testid=plan-link]');
await page.waitForURL('**/billing');
await shot('15-billing');
await page.locator('[data-testid=plan-pro-month] button').click();
await page.waitForURL('**/pay/stub/**');
await shot('16-pay-stub', false);
await page.getByRole('button', { name: /Оплатить/ }).click();
await page.waitForURL('**/billing?payment=**');
await page.waitForSelector('text=Оплата прошла успешно');
ok((await page.textContent('[data-testid=current-tier]')) === 'Pro', 'оплата: тариф Pro активирован');
ok((await page.textContent('[data-testid=plan-link]')).includes('Pro'), 'меню: тариф Pro');
await shot('17-billing-paid');

// мобильная версия
const m = await browser.newContext({ viewport: { width: 390, height: 800 }, storageState: await ctx.storageState() });
const mp = await m.newPage();
const noOverflow = async (p, name) => ok(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `mobile: нет горизонтального скролла — ${name}`);
await mp.goto(BASE + '/'); await mp.waitForSelector('h1'); await mp.screenshot({ path: `${OUT}/20-mobile-landing.png`, fullPage: true }); await noOverflow(mp, 'лендинг');
for (const [path, name] of [['/dashboard', 'dashboard'], ['/resume', 'резюме'], ['/vacancies', 'вакансии'], ['/cover-letter', 'письмо'], ['/interview', 'собеседование'], ['/settings', 'настройки'], ['/billing', 'тарифы']]) {
  await mp.goto(BASE + path); await mp.waitForSelector('main h1'); await noOverflow(mp, name);
  if (path === '/dashboard') await mp.waitForTimeout(1000); await mp.screenshot({ path: `${OUT}/21-mobile-dashboard.png`, fullPage: false });
  if (path === '/resume') await mp.waitForTimeout(1000), await mp.screenshot({ path: `${OUT}/22-mobile-resume.png`, fullPage: false });
  if (path === '/interview') await mp.screenshot({ path: `${OUT}/23-mobile-interview.png`, fullPage: false });
}
ok((await mp.locator('nav[aria-label="Основное меню"] a').count()) >= 5, 'mobile: нижняя навигация');
await mp.goto(BASE + '/dashboard');
await mp.click('[aria-label="Профиль"]');
await mp.screenshot({ path: `${OUT}/24-mobile-menu.png` });
const t = await browser.newContext({ viewport: { width: 820, height: 1100 }, storageState: await ctx.storageState() });
const tp = await t.newPage();
await tp.goto(BASE + '/dashboard'); await tp.waitForSelector('main h1');
await tp.screenshot({ path: `${OUT}/25-tablet-dashboard.png` });
await tp.goto(BASE + '/'); await tp.waitForSelector('h1'); await tp.screenshot({ path: `${OUT}/26-tablet-landing.png`, fullPage: true });

ok(errors.length === 0, `нет ошибок в консоли браузера${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
process.exit(failed ? 1 : 0);
