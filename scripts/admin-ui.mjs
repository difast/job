// Админка в реальном Chromium: вкладки, копирование ссылки, отсутствие горизонтального переполнения, консоль.
import { chromium } from 'playwright-core';
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const ADMIN = process.env.ADMIN ?? 'admin_e2e@example.com';
const OUT = process.env.OUT ?? '/tmp/claude-0/shots';
let failed = 0;
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) failed++; };
const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
for (const [w, h, label] of [[1440, 900, 'desktop'], [390, 844, 'mobile']]) {
  const c = await b.newContext({ viewport: { width: w, height: h }, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await c.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.request.post(BASE + '/api/auth/login', { data: { email: ADMIN, password: 'password123' } });
  for (const [path, title] of [['/admin', 'Обзор'], ['/admin/users', 'Пользователи'], ['/admin/payments', 'Платежи'], ['/admin/marketing', 'Маркетинг'], ['/admin/integrations', 'Интеграция с JobToo']]) {
    await p.goto(BASE + path);
    await p.waitForSelector('main h1');
    ok((await p.textContent('main h1')).includes(title), `${label}: ${path} — «${title}»`);
    const wide = await p.evaluate(() => {
      if (document.documentElement.scrollWidth <= innerWidth + 1) return '';
      const clipped = (e) => { for (let a = e.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o !== 'visible') return true; } return false; };
      return [...document.body.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && !clipped(e)).slice(0, 3).map((e) => `${e.tagName}.${(e.className + '').slice(0, 60)}`).join(' | ') || 'scrollWidth=' + document.documentElement.scrollWidth;
    });
    ok(!wide, `${label}: ${path} без горизонтального переполнения${wide ? ' — ' + wide : ''}`);
    ok(await p.locator('[aria-current=page]', { hasText: title.split(' ')[0] === 'Интеграция' ? 'Интеграции' : title }).first().isVisible().catch(() => false), `${label}: активная вкладка`);
    await p.screenshot({ path: `${OUT}/ADM-${label}-${path.split('/')[2] ?? 'overview'}.png`, fullPage: true });
  }
  await p.goto(BASE + '/admin');
  await p.getByTestId('admin-tab-users').click(); await p.waitForURL('**/admin/users');
  await p.goBack(); await p.waitForURL(/\/admin$/);
  ok(true, `${label}: переходы по вкладкам и «Назад» работают`);
  if (label === 'desktop') {
    await p.goto(BASE + '/admin/marketing');
    await p.locator('[data-testid=link-card-instagram] button', { hasText: 'Копировать' }).click();
    ok((await p.evaluate(() => navigator.clipboard.readText())).endsWith('/go/instagram'), 'кнопка «Копировать» копирует полную ссылку');
    await p.goto(BASE + '/admin/users?q=example');
    await p.selectOption('select[name=plan]', 'pro'); await p.click('button:has-text("Применить")');
    await p.waitForURL('**plan=pro**');
    ok(true, 'фильтр пользователей применяется формой (состояние в адресе)');
  }
  ok(errors.length === 0, `${label}: нет ошибок в консоли${errors.length ? ': ' + errors.slice(0, 2).join(' | ') : ''}`);
  await c.close();
}
await b.close();
console.log(failed ? `\n${failed} проверок провалено` : '\nВсе UI-проверки админки пройдены');
process.exit(failed ? 1 : 0);
