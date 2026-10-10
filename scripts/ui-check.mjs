// Автоматизированные сценарии в реальном Chromium (не заменяют тестирование с живыми пользователями).
// Сценарии A–E: новый пользователь → резюме → вакансия и адаптация → письмо → собеседование; + оплата, адаптивность, консоль.
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? '/tmp/claude-0/shots';
mkdirSync(OUT, { recursive: true });
let failed = 0;
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) failed++; };
const section = (t) => console.log(`\n— ${t}`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();
const errors = [];
const watch = (p) => { p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text())); p.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`)); };
watch(page);
const shot = async (n, full = true, p = page) => { await p.waitForTimeout(900); await p.screenshot({ path: `${OUT}/${n}.png`, fullPage: full }); };
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const toast = async (re) => { try { await page.waitForFunction((src) => new RegExp(src, 'i').test(document.querySelector('[data-testid=toast]')?.textContent ?? ''), re.source, { timeout: 6000 }); return true; } catch { return false; } };

/* ───────── Бренд ───────── */
section('Бренд Clymly');
const logoColors = (p, scope) => p.evaluate((sel) => {
  const logo = document.querySelector(`${sel} [data-testid=logo]`);
  if (!logo) return null;
  const c = (el) => getComputedStyle(el).color;
  return { text: c(logo), y1: c(logo.querySelector('.brand-y1')), y2: c(logo.querySelector('.brand-y2')), label: logo.getAttribute('aria-label'), visible: logo.textContent.trim() };
}, scope);
await page.goto(BASE + '/');
const light = await logoColors(page, 'header');
ok(light && light.visible === 'Clymly' && light.label === 'Clymly', 'лендинг: текстовый логотип «Clymly»');
ok(light && light.y1 === 'rgb(180, 71, 42)' && light.y2 === 'rgb(91, 35, 33)' && light.text === 'rgb(28, 26, 23)', `светлый фон: 1-я y терракотовая, 2-я винная, остальные буквы — цвет текста (${JSON.stringify(light)})`);
ok(await page.evaluate(() => !/Карьерн|навигатор/i.test(document.body.innerText + document.title)), 'лендинг: нет старого названия ни в тексте, ни в title');
ok((await page.title()).startsWith('Clymly'), `title: ${await page.title()}`);

/* ───────── A. Новый пользователь ───────── */
section('A. Новый пользователь');
await page.goto(BASE + '/');
await page.click('main >> text=Попробовать бесплатно');
await page.waitForURL('**/register');
ok(true, 'лендинг → «Попробовать бесплатно» → регистрация');
await page.fill('input[name=name]', 'Анна Иванова');
await page.fill('input[name=email]', `ui_${Date.now()}@example.com`);
await page.fill('input[name=password]', 'password123');
await page.click('button[type=submit]');
await page.waitForTimeout(400);
ok(page.url().endsWith('/register'), 'регистрация без отметки согласия не отправляется');
await page.check('[data-testid=consent]');
await page.click('button[type=submit]');
await page.waitForURL('**/onboarding');
await page.fill('input[aria-label="Поиск профессии"]', 'продакт');
await page.click('button:has-text("Продакт-менеджер")');
await page.click('button:has-text("Далее")');
await page.click('[role=radio]:has-text("Middle")');
await page.click('button:has-text("Перейти в кабинет")');
await page.waitForURL('**/dashboard');
ok(true, 'онбординг: профессия → уровень → кабинет');
ok((await page.textContent('[data-testid=target-profession]')) === 'Продакт-менеджер' && (await page.textContent('[data-testid=target-level]')) === 'Middle', 'верхняя панель: цель видна (профессия и уровень)');
ok(await page.locator('text=Начните с резюме').isVisible() && await page.getByRole('button', { name: 'Загрузить резюме' }).isVisible(), 'главная: очевидно, как загрузить резюме (единственный CTA)');
ok(await page.locator('nav[aria-label="Ваш путь"]').isVisible(), 'главная: панель «Ваш путь» со статусами');
const dark = await logoColors(page, 'header');
ok(dark && dark.y1 === 'rgb(230, 144, 111)' && dark.y2 === 'rgb(211, 156, 149)' && dark.text === 'rgb(251, 249, 245)', `тёмный фон (кабинет): светлые варианты фирменных цветов (${JSON.stringify(dark)})`);
await shot('A1-dashboard-empty');

/* ───────── B. Анализ резюме ───────── */
section('B. Анализ резюме');
await page.setInputFiles('[data-testid=resume-file]', 'tests/fixtures/resume.pdf');
await page.waitForURL('**/resume');
await page.waitForSelector('[data-testid=resume-score]');
ok(await page.locator('h2:has-text("Что улучшить")').isVisible(), 'резюме: рекомендации видны');
ok(await page.locator('h2:has-text("Сильные стороны")').isVisible() && await page.locator('h2:has-text("Недостающие навыки")').isVisible(), 'резюме: сильные стороны и недостающие навыки');
ok(await page.getByRole('link', { name: /Улучшить резюме/ }).isVisible(), 'резюме: главный CTA «Улучшить резюме»');
await shot('B1-resume');
await page.goto(BASE + '/dashboard');
await page.waitForSelector('[data-testid=next-step]');
ok((await page.textContent('[data-testid=next-step]')).includes('Проверьте резюме на реальной вакансии'), 'главная: следующий шаг — анализ вакансии');
await shot('B2-dashboard');
await page.locator('[data-testid=next-step] a').click();
await page.waitForURL('**/vacancies');
ok(true, 'главная → следующий шаг ведёт на «Вакансии» (1 клик)');

/* ───────── C. Вакансия и адаптация ───────── */
section('C. Вакансия и адаптация');
const longReq = '- Опыт работы с системами аналитики ' + 'и'.repeat(0) + 'СуперДлинноеНазваниеИнструментаБезПробеловКоторыйНеДолженЛоматьВерсткуНаМобильныхУстройствах';
await page.fill('#vacancy-text', readFileSync('tests/fixtures/vacancy.txt', 'utf8').replace('- Уверенный SQL', '- Уверенный SQL\n' + longReq));
await page.getByRole('button', { name: 'Анализировать', exact: true }).click();
await page.waitForURL(/\/vacancies\/[^/]+$/);
await page.waitForSelector('[data-testid=match-score]');
ok(await page.getByRole('button', { name: /Адаптировать резюме/ }).isVisible(), 'вакансия: CTA «Адаптировать резюме» рядом с оценкой');
ok(await page.locator('#req-match').isVisible() && await page.locator('#req-missing').isVisible(), 'вакансия: группы «соответствуете / не хватает»');
await shot('C1-vacancy');
const vacancyUrl = page.url();
await page.getByRole('button', { name: /Адаптировать резюме/ }).click();
await page.waitForURL('**/adapt');
await page.click('button:has-text("Принять все")');
await page.waitForFunction(() => document.querySelector('[data-testid=accepted-count]')?.textContent !== '0');
ok((await page.textContent('[data-testid=adapted-resume]')).length > 200, 'адаптация: итоговая версия резюме отображается');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=download-pdf]')]);
ok(dl.suggestedFilename().endsWith('.pdf'), 'адаптация: скачивание PDF');
await shot('C2-adapt');

/* ───────── D. Сопроводительное письмо ───────── */
section('D. Сопроводительное письмо');
await page.getByRole('link', { name: /Создать сопроводительное письмо/ }).click();
await page.waitForURL('**/cover-letter**');
await page.waitForSelector('[data-testid=letter-text]');
ok(true, 'письмо создаётся автоматически после выбора вакансии');
await page.getByRole('button', { name: /Копировать/ }).click();
ok(await toast(/скопировано/i), 'копирование → уведомление');
await page.getByRole('button', { name: /Редактировать/ }).click();
await page.fill('textarea[aria-label="Текст письма"]', 'Здравствуйте!\n\nОтредактированный текст письма.\n\nС уважением,\nАнна');
await page.getByRole('button', { name: 'Сохранить' }).click();
ok(await toast(/сохранены/i), 'редактирование → сохранено, уведомление');
ok((await page.textContent('[data-testid=letter-text]')).includes('Отредактированный'), 'отредактированный текст отображается');
await page.getByRole('button', { name: 'Создать другой вариант' }).click();
ok(await toast(/новый вариант/i), '«Создать другой вариант» → новый текст');
await shot('D1-letter');

/* ───────── E. Собеседование ───────── */
section('E. Собеседование');
await page.goto(BASE + '/interview');
await page.waitForSelector('[data-testid=question-text]');
await page.getByRole('radio', { name: 'Профессиональное' }).click();
await page.waitForFunction(() => /Как вы определяете приоритеты|MVP|метрик/.test(document.querySelector('[data-testid=question-text]')?.textContent ?? ''));
ok(true, 'выбор типа интервью меняет вопросы');
await page.getByRole('button', { name: 'Пример сильного ответа' }).click();
ok(await page.locator('[data-testid=hint]').isVisible(), 'пример сильного ответа доступен до ответа');
await shot('E1-interview');
const q1 = await page.textContent('[data-testid=question-text]');
await page.fill('#answer', 'Сначала фиксирую цели и метрики, затем оцениваю идеи по RICE: охват, влияние, уверенность и трудозатраты. Например, в прошлом проекте мы так выбрали онбординг и подняли конверсию на 20%. Решение согласовываю с командой и стейкхолдерами.');
await page.getByRole('button', { name: 'Ответить', exact: true }).click();
await page.waitForSelector('[data-testid=feedback]');
const fbText = await page.textContent('[data-testid=feedback]');
ok(['Что хорошо', 'Как усилить ответ'].every((t) => fbText.includes(t)), 'оценка ответа: что хорошо / как усилить');
await shot('E2-feedback');
await page.getByRole('button', { name: /Следующий вопрос|Завершить/ }).click();
await page.waitForFunction((q) => document.querySelector('[data-testid=question-text]')?.textContent !== q, q1);
ok(true, 'переход к следующему вопросу');

/* ───────── Цель, настройки, оплата ───────── */
section('Цель, настройки, оплата');
await page.goto(BASE + '/dashboard');
ok((await page.textContent('[data-testid=next-step]')).includes('Всё готово к отклику'), 'главная: путь пройден — следующий шаг обновился');
await page.click('header button[aria-label^="Цель:"]');
await page.waitForSelector('[role=dialog]');
await shot('F1-goal-dialog', false);
await page.click('[role=dialog] button:has-text("Отмена")');
await page.click('[aria-label="Профиль и настройки"]');
await page.click('[data-testid=plan-link]');
await page.waitForURL('**/billing');
await page.locator('[data-testid=plan-pro-month] button').click();
await page.waitForURL('**/pay/stub/**');
await page.getByRole('button', { name: /Оплатить/ }).click();
await page.waitForSelector('text=Оплата прошла успешно');
ok((await page.textContent('[data-testid=current-tier]')) === 'Pro', 'оплата (заглушка): Pro активирован');
await page.goto(BASE + '/settings');
await page.fill('#name', 'Анна Петрова');
await page.getByRole('button', { name: 'Сохранить' }).click();
ok(await toast(/сохранено/i), 'настройки: имя сохранено, уведомление');
await shot('F2-settings');

/* ───────── Адаптивность ───────── */
section('Адаптивность (desktop / tablet / mobile)');
const state = await ctx.storageState();
const vacPath = new URL(vacancyUrl).pathname;
const pages = [['/terms', 'оферта'], ['/privacy', 'политика'], ['/consent', 'согласие'], ['/dashboard', 'главная'], ['/resume', 'резюме'], ['/vacancies', 'вакансии'], [vacPath, 'анализ вакансии (длинный текст)'], [vacPath + '/adapt', 'адаптация'], ['/cover-letter', 'письмо'], ['/interview', 'собеседование'], ['/settings', 'настройки'], ['/billing', 'тарифы']];
for (const [w, h, label] of [[1440, 900, 'desktop'], [820, 1180, 'tablet'], [390, 844, 'mobile']]) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, storageState: state });
  const p = await c.newPage(); watch(p);
  const bad = [];
  for (const [path, name] of pages) {
    await p.goto(BASE + path); await p.waitForSelector('main h1');
    if (['/terms', '/consent'].includes(path) && label !== 'tablet') await shot(`L-${label}-${path.slice(1)}`, false, p);
    if (await overflow(p)) bad.push(name);
    if (label !== 'desktop' && ['/dashboard', '/resume', '/interview', vacPath].includes(path)) await shot(`M-${label}-${name.split(' ')[0]}`, label === 'mobile', p);
  }
  ok(bad.length === 0, `${label}: нет горизонтального скролла на ${pages.length} страницах${bad.length ? ' — проблемы: ' + bad.join(', ') : ''}`);
  if (label === 'mobile') {
    await p.goto(BASE + '/dashboard');
    await p.locator('[data-testid=bottom-nav]').getByRole('link', { name: 'Моё резюме' }).click();
    await p.waitForURL('**/resume');
    ok(true, 'mobile: нижняя навигация переключает разделы');
    await p.click('[aria-label="Профиль и настройки"]');
    ok(await p.locator('[role=menu]').isVisible(), 'mobile: меню профиля открывается');
  }
  await c.close();
}

ok(errors.length === 0, `нет ошибок в консоли браузера${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
console.log(failed ? `\n${failed} проверок провалено` : '\nВсе UI-проверки пройдены');
process.exit(failed ? 1 : 0);
