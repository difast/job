// Автоматизированные сценарии в реальном Chromium (не заменяют тестирование с живыми пользователями).
// Сценарии A–F: новый пользователь → резюме → вакансия и адаптация → письмо → собеседование → тарифы на лендинге; + оплата, адаптивность, консоль.
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
await page.waitForSelector('[data-testid=progress]');
ok(await page.locator('text=Начните с резюме').isVisible() && await page.getByRole('button', { name: 'Загрузить резюме' }).isVisible(), 'главная: очевидно, как загрузить резюме (единственный CTA)');
ok(await page.locator('[data-testid=progress]').isVisible() && (await page.locator('[data-testid=progress] a').count()) === 5, 'главная: прогресс подготовки — 5 кликабельных шагов');
{
  const tabs = await page.locator('header nav[aria-label="Основное меню"] a').evaluateAll((els) => els.map((e) => e.innerText.trim()));
  ok(JSON.stringify(tabs) === JSON.stringify(['Главная', 'Моё резюме', 'Вакансии', 'Письма', 'Собеседования']), `верхние вкладки: ${tabs.join(' · ')}`);
  ok(await page.locator('header [data-testid=nav-dashboard][aria-current=page]').isVisible(), 'активная вкладка отмечена');
}
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
ok(await page.getByRole('link', { name: /Улучшить под вакансию/ }).isVisible(), 'резюме: главный CTA «Улучшить под вакансию» (честно ведёт в раздел «Вакансии»)');
ok(await toast(/проанализировано/i), 'резюме: уведомление о загрузке');
ok(await page.getByRole('button', { name: /Удалить резюме/ }).isVisible() && !(await page.locator('text=Что дальше').count()), 'резюме: удаление отделено, дублирующего блока «Что дальше» нет');
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
await page.goto(vacancyUrl);
await page.getByRole('button', { name: 'Подготовить заново' }).click();
ok(await page.locator('[role=dialog]:has-text("Подготовить правки заново?")').isVisible(), 'повторная адаптация спрашивает подтверждение (принятые правки не теряются молча)');
await page.click('[role=dialog] button:has-text("Отмена")');
await page.goto(vacancyUrl + '/adapt');
ok((await page.textContent('[data-testid=accepted-count]')) !== '0', 'после отмены принятые правки на месте');

/* ───────── D. Сопроводительное письмо ───────── */
section('D. Сопроводительное письмо');
await page.getByRole('link', { name: /Создать сопроводительное письмо/ }).click();
await page.waitForURL('**/cover-letter**');
await page.waitForSelector('[data-testid=letter-text]');
ok(true, 'кнопка «Создать сопроводительное письмо» сразу создаёт письмо');
await page.getByRole('button', { name: /Копировать/ }).click();
ok(await toast(/скопировано/i), 'копирование → уведомление');
await page.getByRole('button', { name: /Редактировать/ }).click();
await page.fill('textarea[aria-label="Текст письма"]', 'Здравствуйте!\n\nОтредактированный текст письма.\n\nС уважением,\nАнна');
await page.getByRole('button', { name: 'Сохранить' }).click();
ok(await toast(/сохранены/i), 'редактирование → сохранено, уведомление');
ok((await page.textContent('[data-testid=letter-text]')).includes('Отредактированный'), 'отредактированный текст отображается');
await page.locator('[role=radiogroup][aria-label="Стиль письма"]:visible [role=radio]:has-text("Краткий")').click();
await page.waitForTimeout(500);
ok((await page.textContent('[data-testid=letter-text]')).includes('Отредактированный'), 'смена стиля не перезаписывает отредактированное письмо');
await page.getByTestId('create-letter').click();
ok(await toast(/новый вариант/i), '«Создать другой вариант» → новый текст, предыдущие сохранены');
ok((await page.textContent('[data-testid=letter-variant]')).includes('из 2'), 'варианты письма: счётчик «Вариант N из 2»');
await page.getByRole('button', { name: 'Более ранний вариант' }).click();
ok((await page.textContent('[data-testid=letter-text]')).includes('Отредактированный'), 'к предыдущему (отредактированному) варианту можно вернуться');
await shot('D1-letter');

/* ───────── E. Собеседование ───────── */
section('E. Собеседование');
await page.locator('header [data-testid=nav-interview]').click();
await page.waitForURL('**/interview');
await page.waitForSelector('[data-testid=interview-setup]');
ok(await page.locator('header [data-testid=nav-interview][aria-current=page]').isVisible(), 'Собеседования — основная вкладка, активна');
ok(await page.getByTestId('interview-vacancy').isVisible(), 'стартовый экран: тип, вакансия, начало тренировки');
await page.getByTestId('interview-vacancy').selectOption({ index: 1 });
ok(await page.getByTestId('vacancy-focus').isVisible(), 'выбор вакансии показывает, что подготовить');
await shot('E0-interview-setup');
await page.getByRole('radio', { name: 'Профессиональное' }).click();
await page.getByTestId('start-training').click();
await page.waitForFunction(() => /Как вы определяете приоритеты|MVP|метрик/.test(document.querySelector('[data-testid=question-text]')?.textContent ?? ''));
ok((await page.textContent('[data-testid=training-bar]')).includes('по вакансии'), 'тренировка: тип и вакансия видны, профессиональные вопросы');
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
await page.fill('#answer', 'Черновик ответа, который не должен пропасть');
await page.getByRole('button', { name: 'Сменить параметры' }).first().click();
ok(await page.locator('[role=dialog]:has-text("Сменить параметры тренировки?")').isVisible(), 'смена параметров при начатой тренировке спрашивает подтверждение');
await page.click('[role=dialog] button:has-text("Отмена")');
ok((await page.inputValue('#answer')).includes('Черновик'), 'после отмены ответ сохранён');
await page.fill('#answer', '');

// Контекст вакансии, история результатов, Back/Forward
await page.goto(vacancyUrl);
await page.getByTestId('interview-for-vacancy').click();
await page.waitForURL('**/interview?vacancy=**');
ok((await page.getByTestId('interview-vacancy').inputValue()) === new URL(vacancyUrl).pathname.split('/').pop(), 'из вакансии — тренажёр с выбранной вакансией');
ok(await page.getByTestId('interview-history').isVisible(), 'результаты прошлых ответов доступны на стартовом экране');
await page.goBack(); await page.waitForURL(vacancyUrl);
await page.goForward(); await page.waitForURL('**/interview?vacancy=**');
ok(true, 'Back/Forward браузера работают между вакансией и тренажёром');

/* ───────── Цель, настройки, оплата ───────── */
section('Цель, настройки, оплата');
await page.goto(BASE + '/dashboard');
ok((await page.textContent('[data-testid=next-step]')).includes('Всё готово к отклику'), 'главная: путь пройден — следующий шаг обновился');
await page.locator('[data-testid=progress-row]', { hasText: 'Адаптация резюме' }).click();
await page.waitForURL('**/adapt');
await page.waitForSelector('[data-testid=accepted-count]');
ok(true, 'прогресс: «Адаптация резюме» открывает адаптацию последней вакансии');
await page.goBack(); await page.waitForURL('**/dashboard');
await page.waitForSelector('[data-testid=progress-row]');
await page.locator('[data-testid=progress-row]', { hasText: 'Тренировки собеседования' }).click();
await page.waitForURL('**/interview?vacancy=**');
ok(true, 'прогресс: «Тренировки собеседования» открывает тренажёр по последней вакансии');
await page.goto(BASE + '/dashboard');
await page.click('header button[aria-label^="Цель:"]');
await page.waitForSelector('[role=dialog]');
await shot('F1-goal-dialog', false);
await page.click('[role=dialog] button:has-text("Отмена")');
await page.click('[aria-label="Профиль и настройки"]');
await page.click('[data-testid=plan-link]');
await page.waitForURL('**/billing');
await page.locator('[data-testid=plan-pro-month] [data-testid=pay-card]').click();
await page.waitForURL('**/pay/stub/**');
await page.getByRole('button', { name: /Оплатить/ }).click();
await page.waitForSelector('[data-testid=pay-result][data-state=paid]');
ok(await page.locator('text=Оплата подтверждена').isVisible(), 'страница результата: оплата подтверждена сервером');
await page.goto(BASE + '/billing');
ok((await page.textContent('[data-testid=current-tier]')) === 'Pro · 1 месяц', 'оплата (заглушка): Pro · 1 месяц активирован');
await page.goto(BASE + '/settings');
await page.fill('#name', 'Анна Петрова');
await page.getByRole('button', { name: 'Сохранить' }).click();
ok(await toast(/сохранено/i), 'настройки: имя сохранено, уведомление');
await shot('F2-settings');

/* ───────── F. Тарифы на лендинге ───────── */
section('F. Тарифы на лендинге');
{
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage(); watch(p);
  await p.goto(BASE + '/');
  await p.locator('header nav').getByRole('link', { name: 'Тарифы' }).click();
  await p.waitForTimeout(600);
  await p.waitForTimeout(600);
  const ptop = await p.evaluate(() => Math.round(document.querySelector('#pricing').getBoundingClientRect().top));
  ok(Math.abs(ptop) < 120, `шапка → «Тарифы» прокручивает к блоку (top=${ptop})`);
  const cards = ['pricing-free', 'pricing-pro', 'pricing-pro-quarter'];
  ok((await Promise.all(cards.map((t) => p.getByTestId(t).isVisible()))).every(Boolean), 'три карточки: Free, Pro — 1 месяц, Pro — 3 месяца');
  const tops = await Promise.all(cards.map((t) => p.getByTestId(t).evaluate((e) => Math.round(e.getBoundingClientRect().top))));
  ok(new Set(tops).size === 1, `desktop: карточки в один ряд (${tops.join(', ')})`);
  const heights = await Promise.all(cards.map((t) => p.getByTestId(t).evaluate((e) => Math.round(e.getBoundingClientRect().height))));
  ok(new Set(heights).size === 1, `desktop: карточки одной высоты (${heights.join(', ')})`);
  await p.locator('#pricing').screenshot({ path: `${OUT}/F0-pricing-desktop.png` });
  await p.getByTestId('pricing-free').getByRole('link', { name: 'Начать бесплатно' }).click();
  await p.waitForURL('**/register');
  ok(true, 'Free «Начать бесплатно» → регистрация');
  await p.goto(BASE + '/#pricing');
  await p.getByTestId('pricing-pro-quarter').getByRole('link', { name: /Оформить на 3 месяца/ }).click();
  await p.waitForURL('**/register?next=**');
  ok(await p.locator('text=откроется страница подключения Clymly Pro').isVisible(), '«Оформить на 3 месяца» без аккаунта → регистрация с подсказкой');
  await p.fill('input[name=name]', 'Пётр Free');
  await p.fill('input[name=email]', `ui_free_${Date.now()}@example.com`);
  await p.fill('input[name=password]', 'password123');
  await p.check('[data-testid=consent]');
  await p.click('button[type=submit]');
  await p.waitForURL('**/onboarding?next=**');
  await p.fill('input[aria-label="Поиск профессии"]', 'бухгалтер');
  await p.click('button:has-text("Бухгалтер")');
  await p.click('button:has-text("Далее")');
  await p.click('[role=radio]:has-text("Senior")');
  await p.click('button:has-text("Перейти в кабинет")');
  await p.waitForURL('**/billing?plan=pro-quarter');
  ok(await p.locator('[data-testid=plan-pro-quarter][data-selected=true]').waitFor({ timeout: 8000 }).then(() => true, () => false), 'после регистрации и онбординга открыт /billing с выбранным тарифом «Pro на 3 месяца»');
  await p.locator('[data-testid=plan-pro-quarter] [data-testid=pay-card]').click();
  await p.waitForURL('**/pay/stub/**');
  ok((await p.textContent('main')).replace(/[\u00a0\u202f]/g, ' ').includes('1 190'), 'оформление 3 месяцев ведёт на оплату 1 190 ₽ (тестовая страница, деньги не списываются)');
  await p.getByRole('button', { name: /Отменить и вернуться/ }).click();
  await p.waitForSelector('text=Оплата не завершена');
  await p.goto(BASE + '/billing');
  ok((await p.textContent('[data-testid=current-tier]')) === 'Free', 'отмена оплаты: тариф остался Free');
  // Free-пользователь: все разделы доступны, ограничений нет
  const blocked = [];
  for (const path of ['/dashboard', '/resume', '/vacancies', '/cover-letter', '/interview', '/settings']) { const r = await p.goto(BASE + path); if (r.status() !== 200 || !p.url().endsWith(path)) blocked.push(path); }
  ok(blocked.length === 0, `Free: все разделы кабинета открыты без ограничений${blocked.length ? ' — нет: ' + blocked.join(', ') : ''}`);
  await p.goto(BASE + '/');
  await p.getByTestId('pricing-pro').getByRole('link', { name: /Подключить Pro/ }).click();
  await p.waitForURL('**/billing?plan=pro-month');
  ok(await p.locator('[data-testid=plan-pro-month][data-selected=true]').waitFor({ timeout: 8000 }).then(() => true, () => false), 'вошедший пользователь: «Подключить Pro» → /billing с выбранным месячным тарифом');
  await c.close();
  const m = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await m.newPage(); watch(mp);
  await mp.goto(BASE + '/');
  await mp.getByRole('button', { name: 'Открыть меню' }).click();
  await mp.locator('#mobile-nav').getByRole('link', { name: 'Тарифы' }).click();
  await mp.waitForTimeout(600);
  ok(await mp.getByTestId('pricing-free').isVisible(), 'mobile: меню → «Тарифы»');
  ok(!(await overflow(mp)), 'mobile: лендинг с тарифами без горизонтального скролла');
  const mt = await Promise.all(['pricing-free', 'pricing-pro', 'pricing-pro-quarter'].map((t) => mp.getByTestId(t).evaluate((e) => [Math.round(e.getBoundingClientRect().top), Math.round(e.getBoundingClientRect().width)])));
  ok(mt[0][0] < mt[1][0] && mt[1][0] < mt[2][0] && mt.every(([, w]) => w <= 390 - 32 + 1), 'mobile: карточки друг под другом, во всю ширину с полями');
  await mp.locator('#pricing').screenshot({ path: `${OUT}/F0-pricing-mobile.png` });
  for (const w of [320, 820]) { await mp.setViewportSize({ width: w, height: 900 }); await mp.goto(BASE + '/#pricing'); ok(!(await overflow(mp)), `${w}px: лендинг с тарифами без горизонтального скролла`); }
  await mp.setViewportSize({ width: 820, height: 1180 });
  await mp.locator('#pricing').screenshot({ path: `${OUT}/F0-pricing-tablet.png` });
  await m.close();
}

/* ───────── G. Переход в JobToo (если сервер запущен с интеграцией и заглушкой) ───────── */
if (process.env.JOBTOO === '1') {
  section('G. Переход в JobToo');
  const { startMockJobToo } = await import('./mock-jobtoo.mjs');
  const mock = await startMockJobToo({ port: 4100, secret: process.env.JOBTOO_OUTBOUND_SECRET ?? 'test-out' });
  for (const [w, h, label] of [[1440, 900, 'desktop'], [390, 844, 'mobile']]) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, storageState: await ctx.storageState() });
    const p = await c.newPage(); watch(p);
    await p.goto(BASE + '/resume');
    if (label === 'desktop') {
      await p.goto(BASE + new URL(vacancyUrl).pathname + '/adapt');
      ok((await p.getByTestId('jobtoo-adaptation').textContent()).includes('Откликнуться через JobToo'), 'адаптация: «Откликнуться через JobToo»');
      await p.goto(BASE + '/dashboard');
      ok((await p.locator('[data-testid^=jobtoo-]').filter({ hasText: 'JobToo' }).count()) >= 1 && (await p.getByTestId('jobtoo-dashboard').textContent()).includes('Перейти к вакансиям в JobToo'), 'главная: «Перейти к вакансиям в JobToo»');
      await p.goto(BASE + '/resume');
    }
    const btn = p.getByTestId('jobtoo-resume');
    ok(await btn.waitFor({ timeout: 8000 }).then(() => true, () => false), `${label}: кнопка «Перейти в JobToo» в «Моём резюме»`);
    if (label === 'desktop') {
      await btn.click();
      await p.waitForSelector('[role=dialog]:has-text("Передать данные в JobToo?")');
      ok(await p.getByTestId('jobtoo-consent-ok').isDisabled(), 'окно согласия: без галочки продолжить нельзя');
      await p.click('[role=dialog] button:has-text("Отмена")');
      ok(!(await p.locator('[role=dialog]').count()), 'отмена закрывает окно, переход не выполняется');
      await btn.click();
      await p.getByTestId('jobtoo-consent').check();
      await shot('G1-jobtoo-consent', false, p);
      await p.getByTestId('jobtoo-consent-ok').click();
      await p.waitForURL('http://localhost:4100/sso/clymly**', { timeout: 20_000 });
      ok((await p.textContent('h1')).includes('JobToo'), 'после согласия — переход в кабинет JobToo по одноразовой ссылке');
      ok(mock.state.handoffs.length === 1 && mock.state.badSignatures === 0, 'JobToo получил один подписанный запрос');
    } else {
      await btn.click();
      await p.waitForURL('http://localhost:4100/sso/clymly**', { timeout: 20_000 });
      ok(true, 'mobile: повторный переход — без окна согласия');
      await p.goBack();
      await p.waitForSelector('[data-testid=jobtoo-resume]');
      await shot('G2-jobtoo-mobile', false, p);
      ok(!(await overflow(p)), 'mobile: «Моё резюме» с блоком JobToo без горизонтального скролла');
    }
    await c.close();
  }
  // JobToo → Clymly: страница приёма перехода в браузере (desktop и mobile)
  for (const [w, h, label] of [[1440, 900, 'desktop'], [390, 844, 'mobile']]) {
    const c = await browser.newContext({ viewport: { width: w, height: h } });
    const p = await c.newPage(); watch(p);
    const em = `ui_in_${label}_${Date.now()}@example.com`;
    const code = mock.issueCode({ source: 'jobtoo', jobtoo_user_id: `ui-${label}-${Date.now()}`, email: em, email_verified: true, name: 'Ирина Входящая', target_position: 'Продакт-менеджер', experience_level: 'middle',
      resume_file: { name: 'cv.pdf', mime: 'application/pdf', data_b64: readFileSync('tests/fixtures/resume.pdf').toString('base64') },
      vacancy: { id: 'v1', title: 'Продуктовый менеджер', company: 'ФинПлюс', description: readFileSync('tests/fixtures/vacancy.txt', 'utf8') } });
    await p.goto(`${BASE}/partner/jobtoo/start?code=${code}`);
    await p.waitForURL('**/partner/jobtoo');
    ok(!p.url().includes('code='), `${label}: код убран из адресной строки`);
    ok(await p.getByTestId('inbound-accept').isDisabled(), `${label}: без согласия «Продолжить» неактивна`);
    await shot(`G3-inbound-${label}`, label === 'mobile', p);
    ok(!(await overflow(p)), `${label}: страница перехода без горизонтального скролла`);
    await p.getByTestId('inbound-consent').check();
    await p.getByTestId('inbound-accept').click();
    await p.waitForURL('**/vacancies/**', { timeout: 30_000 });
    ok(await p.locator('[data-testid=match-score]').isVisible(), `${label}: после согласия — сразу анализ вакансии из JobToo`);
    await c.close();
  }
  mock.state.mode = 'error';
  { const c = await browser.newContext({ storageState: await ctx.storageState() }); const p = await c.newPage();
    await p.goto(BASE + '/dashboard'); await p.getByTestId('jobtoo-dashboard').click();
    await p.waitForSelector('text=JobToo: не удалось разобрать резюме');
    ok(await p.getByRole('button', { name: 'Повторить' }).isVisible() && p.url().endsWith('/dashboard'), 'ошибка JobToo: понятный текст и «Повторить», пользователь остаётся в Clymly');
    await c.close(); }
  await mock.close();
}

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
