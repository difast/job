// UI-проверка в реальном браузере (Chromium): онбординг → резюме → вакансия → адаптация → письмо → тренажёр.
import { chromium } from 'playwright-core';
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? '/tmp/claude-0/shots';
import { mkdirSync, readFileSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });
let failed = 0;
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) failed++; };

const exe = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(BASE + '/register');
await page.screenshot({ path: `${OUT}/01-register.png` });
await page.fill('input[name=name]', 'Анна Иванова');
await page.fill('input[name=email]', `ui_${Date.now()}@example.com`);
await page.fill('input[name=password]', 'password123');
await page.click('button[type=submit]');
await page.waitForURL('**/onboarding');
ok(true, 'регистрация через форму → onboarding');

await page.fill('input[aria-label="Поиск профессии"]', 'продакт');
await page.waitForSelector('button:has-text("Продакт-менеджер")');
ok((await page.locator('section h3').count()) === 1, 'поиск фильтрует категории');
await page.fill('input[aria-label="Поиск профессии"]', '');
await page.waitForSelector('text=Другие профессиональные направления');
await page.screenshot({ path: `${OUT}/02-onboarding-professions.png`, fullPage: true });
await page.click('button:has-text("Продакт-менеджер")');
await page.click('button:has-text("Далее")');
await page.click('[role=radio]:has-text("Middle")');
await page.screenshot({ path: `${OUT}/03-onboarding-level.png` });
await page.click('button:has-text("Перейти к дашборду")');
await page.waitForURL('**/dashboard');
ok((await page.textContent('[data-testid=target-profession]')) === 'Продакт-менеджер', 'шапка: целевая профессия');
ok((await page.textContent('[data-testid=target-level]')) === 'Middle', 'шапка: уровень');
await page.screenshot({ path: `${OUT}/04-dashboard-empty.png` });

await page.setInputFiles('[data-testid=resume-file]', 'tests/fixtures/resume.pdf');
await page.waitForURL('**/resume');
await page.waitForSelector('[data-testid=resume-score]');
await page.screenshot({ path: `${OUT}/05-resume-analysis.png`, fullPage: true });
await page.goto(BASE + '/dashboard');
await page.waitForSelector('text=Общая оценка');
ok((await page.textContent('[data-testid=resume-file-name]')) === 'resume.pdf', 'дашборд: имя файла');
await page.screenshot({ path: `${OUT}/06-dashboard.png`, fullPage: true });

// смена профессии через шапку
await page.click('button:has-text("Изменить")');
await page.waitForSelector('[role=dialog]');
await page.screenshot({ path: `${OUT}/07-change-modal.png` });
await page.click('[role=dialog] button:has-text("Отмена")');

await page.goto(BASE + '/vacancies');
await page.fill('#vacancy-text', readFileSync('tests/fixtures/vacancy.txt', 'utf8'));
await page.click('button:has-text("Анализировать вакансию")');
await page.waitForURL(/\/vacancies\/[^/]+$/);
await page.waitForSelector('[data-testid=match-score]');
await page.screenshot({ path: `${OUT}/08-vacancy.png`, fullPage: true });
await page.click('button:has-text("Адаптировать резюме")');
await page.waitForURL('**/adapt');
await page.waitForSelector('[data-testid=original-resume]');
const before = await page.textContent('[data-testid=accepted-count]');
await page.click('button:has-text("Принять все")');
await page.waitForFunction(() => document.querySelector('[data-testid=accepted-count]')?.textContent !== '0');
ok(before === '0' && (await page.textContent('[data-testid=accepted-count]')) !== '0', 'принять все меняет счётчик');
await page.screenshot({ path: `${OUT}/09-adapt.png`, fullPage: true });
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=download-pdf]')]);
ok(dl.suggestedFilename().endsWith('.pdf'), `скачивание PDF: ${dl.suggestedFilename()}`);

await page.goto(BASE + '/cover-letter');
await page.click('button:has-text("Создать письмо")');
await page.waitForSelector('[data-testid=letter-text]');
await page.screenshot({ path: `${OUT}/10-letter.png`, fullPage: true });
const t1 = await page.textContent('[data-testid=letter-text]');
await page.click('[role=radio]:has-text("Краткий")');
await page.click('button:has-text("Перегенерировать")');
await page.waitForFunction((t) => document.querySelector('[data-testid=letter-text]')?.textContent !== t, t1);
ok(true, 'смена стиля + перегенерация');

await page.goto(BASE + '/interview');
await page.click('[role=tab]:has-text("Профессиональное")');
await page.waitForSelector('text=Как вы определяете приоритеты продукта?');
await page.click('text=Как вы оцениваете результаты A/B-теста?');
await page.fill('textarea[aria-label], textarea', 'Фиксирую гипотезу и метрику заранее, считаю выборку, проверяю значимость и guardrail-метрики, затем принимаю решение. Например, в онбординге конверсия выросла на 20%.');
await page.click('button:has-text("Получить обратную связь")');
await page.waitForSelector('[data-testid=feedback]');
await page.screenshot({ path: `${OUT}/11-interview.png`, fullPage: true });
ok(true, 'тренажёр собеседования выдаёт обратную связь');

await page.goto(BASE + '/settings');
await page.screenshot({ path: `${OUT}/12-settings.png` });

// мобильная версия
const m = await browser.newContext({ viewport: { width: 390, height: 800 }, storageState: await ctx.storageState() });
const mp = await m.newPage();
await mp.goto(BASE + '/dashboard');
await mp.waitForSelector('text=Общая оценка');
const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
ok(!overflow, 'мобильная версия: нет горизонтального скролла (dashboard)');
await mp.screenshot({ path: `${OUT}/13-mobile-dashboard.png`, fullPage: true });
await mp.click('[aria-label="Открыть меню"]');
await mp.screenshot({ path: `${OUT}/14-mobile-menu.png` });
await mp.goto(BASE + '/vacancies');
ok(!(await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'мобильная версия: нет горизонтального скролла (вакансии)');
const t = await browser.newContext({ viewport: { width: 820, height: 1100 }, storageState: await ctx.storageState() });
const tp = await t.newPage();
await tp.goto(BASE + '/dashboard'); await tp.waitForSelector('text=Общая оценка');
await tp.screenshot({ path: `${OUT}/15-tablet-dashboard.png` });

ok(errors.length === 0, `нет ошибок в консоли браузера${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
process.exit(failed ? 1 : 0);
