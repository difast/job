// Справочник профессий в браузере: группы, поиск по синонимам, «Моей профессии нет в списке» — компьютер и 390 px.
// Запуск: BASE_URL=http://localhost:3000 [SHOTS=<папка>] node scripts/catalog-ui.mjs (сервер — любой, ИИ не нужен)
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const SHOTS = process.env.SHOTS;
let failed = 0;
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) failed++; };
const T = Date.now();

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
for (const [w, h, tag] of [[1280, 900, 'd'], [390, 844, 'm']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const noScroll = async () => (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0;
  await p.goto(`${BASE}/register`);
  await p.fill('input[name=name]', 'Олег Тестов');
  await p.fill('input[name=email]', `catalog_${tag}_${T}@example.com`);
  await p.fill('input[name=password]', 'password123');
  await p.check('[data-testid=consent]');
  await p.click('button[type=submit]');
  await p.waitForURL('**/onboarding');
  await p.getByTestId('own-profession').waitFor();
  const groups = await p.locator('main section h3').allTextContents();
  ok(groups.length >= 20 && groups.slice(0, 5).join('|') === 'Управление и бизнес|Маркетинг и коммуникации|IT и аналитика|Финансы и право|Другие профессиональные направления', `${tag}: ${groups.length} групп, исходные — первыми`);
  ok(await noScroll(), `${tag}: список профессий без горизонтальной прокрутки`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/catalog-${tag}-list.png` });

  await p.fill('input[aria-label="Поиск профессии"]', 'специалист по работе с клиентами');
  ok(await p.locator('button:has-text("Менеджер по работе с клиентами")').waitFor({ timeout: 5000 }).then(() => true, () => false), `${tag}: поиск по синонимам находит профессию`);
  await p.fill('input[aria-label="Поиск профессии"]', 'сомелье');
  ok(await p.getByText('Ничего не найдено').waitFor({ timeout: 5000 }).then(() => true, () => false), `${tag}: нет в справочнике — подсказка указать профессию самим`);
  await p.getByTestId('own-profession-open').click();
  ok((await p.getByTestId('own-profession-input').inputValue()) === 'сомелье', `${tag}: поле своей профессии заполнено запросом поиска`);
  await p.getByTestId('own-profession-input').fill('Сомелье');
  await p.getByTestId('own-profession-pick').click();
  ok(await p.getByText('Выбрано: Сомелье').isVisible(), `${tag}: своя профессия выбрана`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/catalog-${tag}-own.png` });
  await p.click('button:has-text("Далее")');
  await p.click('[role=radio]:has-text("Senior")');
  await p.click('button:has-text("Перейти в кабинет")');
  await p.waitForURL('**/dashboard');
  ok(await p.getByTestId('goal-line').innerText().then((t) => t.includes('Сомелье · Senior')), `${tag}: цель в кабинете — «Сомелье · Senior»`);
  ok(errors.length === 0, `${tag}: без ошибок в консоли${errors.length ? ` (${errors[0]})` : ''}`);
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n❌ Провалено: ${failed}` : '\n✅ Все проверки справочника профессий пройдены');
process.exit(failed ? 1 : 0);
