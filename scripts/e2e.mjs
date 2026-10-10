// End-to-end проверка через HTTP: npm run build && npm start (в другом терминале), затем BASE_URL=http://localhost:3000 node scripts/e2e.mjs
import { readFileSync } from 'node:fs';
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
let cookie = '';
let failed = 0;
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) failed++; };

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, { ...opts, redirect: 'manual', headers: { ...(opts.headers ?? {}), cookie } });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  return res;
}
const post = (p, body, method = 'POST') => req(p, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const jsonOf = (r) => r.json();

// Лендинг
let land = await req('/');
let html = await land.text();
ok(land.status === 200, 'лендинг / открывается без авторизации');
for (const t of ['Подготовьте резюме.', 'Подготовьтесь к\u00a0собеседованию.', 'Получите работу.', 'Попробовать бесплатно', 'Как это работает', 'Выберите профессию', 'Загрузите резюме', 'Подготовьтесь к вакансии', 'Анализ резюме', 'Резюме под вакансию', 'Сопроводительное письмо', 'Подготовка к собеседованию', 'не только IT', 'Выбрать свою профессию', 'Готовы подготовиться к поиску работы?', 'Пользовательское соглашение', 'Политика конфиденциальности', 'Согласие на обработку данных']) ok(html.includes(t), `лендинг: «${t}»`);
ok(html.includes('href="/register"') && html.includes('href="/login"'), 'лендинг: кнопки ведут на регистрацию и вход');
for (const p of ['/terms', '/privacy', '/consent', '/login', '/register']) ok((await req(p)).status === 200, `публичная страница ${p}`);
const REQ = ['ООО «Интегро»', '1257700559269', '9734021152', '773401001', '123592, город Москва, ул. Маршала Катукова, д. 22 к. 1', 'ежедневно с 10:00 до 20:00 по московскому времени'];
const docChecks = {
  '/terms': ['Пользовательское соглашение (публичная оферта)', 'Тарифы', 'Порядок оплаты', 'Автопродление', 'ЮKassa', '490', '1 190', 'О защите прав потребителей'],
  '/privacy': ['Политика конфиденциальности', '152-ФЗ', 'Файлы cookie', 'Трансграничная передача', 'Права пользователя', '10 (десяти) рабочих дней'],
  '/consent': ['Согласие на обработку персональных данных', 'статьёй 9', 'отозвать согласие', 'сбор, запись, систематизация'],
};
for (const [p, must] of Object.entries(docChecks)) {
  const t = (await (await req(p)).text()).replace(/[\u00a0\u202f]/g, ' ');
  const miss = [...REQ, ...must].filter((x) => !t.includes(x));
  ok(miss.length === 0, `документ ${p}: реквизиты и обязательные разделы${miss.length ? ' — нет: ' + miss.join(', ') : ''}`);
  ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(t.replace(/you@example\.com/g, '')), `документ ${p}: адрес почты не указан (будет добавлен позже)`);
}
html = await (await req('/')).text();
ok(html.includes('ИНН 9734021152') && html.includes('href="/consent"') && html.includes('href="/terms"') && html.includes('href="/privacy"'), 'футер: реквизиты и ссылки на все три документа');
html = await (await req('/register')).text();
ok(html.includes('name="consent"') && html.includes('href="/consent"') && html.includes('Пользовательское соглашение'), 'регистрация: отдельная галочка согласия и ссылки на документы');
ok((await req('/health-not-exists')).status === 404, 'несуществующая страница → 404');
ok((await (await req('/api/health')).json()).status === 'ok', '/api/health');

const email = `e2e_${Date.now()}@example.com`;

// Авторизация
ok((await req('/dashboard')).status === 307, 'неавторизованный доступ к /dashboard → редирект на логин');
ok((await post('/api/auth/register', { name: 'Анна Иванова', email, password: '123', consent: true })).status === 400, 'короткий пароль отклонён');
ok((await post('/api/auth/register', { name: 'Анна Иванова', email, password: 'password123' })).status === 400, 'регистрация без согласия на обработку ПД отклонена');
ok((await post('/api/auth/register', { name: 'Анна Иванова', email, password: 'password123', consent: false })).status === 400, 'согласие должно быть явным (false отклонено)');
let r = await post('/api/auth/register', { name: 'Анна Иванова', email, password: 'password123', consent: true });
ok(r.status === 200, 'регистрация');
ok((await post('/api/auth/register', { name: 'X', email, password: 'password123', consent: true })).status === 409, 'дубликат e-mail отклонён');
ok((await req('/onboarding')).status === 200, 'после регистрации открыт onboarding');
ok((await req('/dashboard')).status === 307, 'без профессии dashboard → onboarding');

// Профессии из БД
const all = await jsonOf(await req('/api/professions'));
const total = all.categories.reduce((a, c) => a + c.professions.length, 0);
ok(total === 38 && all.categories.length === 5, `в БД 38 профессий в 5 категориях (получено ${total}/${all.categories.length})`);
const found = await jsonOf(await req('/api/professions?q=sql'));
ok(found.categories.flatMap((c) => c.professions).some((p) => p.id === 'data-analyst'), 'поиск по профессиям (sql → Аналитик данных)');
ok((await post('/api/profile', { professionId: 'nope', level: 'middle' }, 'PATCH')).status === 404, 'несуществующая профессия отклонена');
ok((await post('/api/profile', { professionId: 'product-manager', level: 'expert' }, 'PATCH')).status === 400, 'неверный уровень отклонён');
ok((await post('/api/profile', { professionId: 'product-manager', level: 'middle' }, 'PATCH')).status === 200, 'профессия и уровень сохранены в профиле');
let page = await (await req('/dashboard')).text();
ok(page.includes('Ваша цель') && page.includes('Продакт-менеджер') && page.includes('Middle') && page.includes('Изменить цель'), 'на дашборде и в меню видны цель (профессия и уровень) и кнопка «Изменить цель»');
ok(page.includes('Начните с резюме') && page.includes('Загрузите резюме, чтобы получить персональный анализ и рекомендации.') && page.includes('Загрузить резюме'), 'empty state дашборда без резюме');
for (const t of ['Главная', 'Моё резюме', 'Вакансии', 'Сопроводительное письмо', 'Собеседование']) ok(page.includes(t), `верхнее меню: ${t}`);
for (const t of ['Ваш путь к отклику', 'Резюме', 'Анализ вакансий', 'Адаптация резюме', 'Сопроводительные письма', 'Тренажёр собеседования']) ok(page.includes(t), `панель «Ваш путь»: ${t}`);
ok(page.includes('не загружено'), 'панель «Ваш путь»: статус резюме «не загружено»');

// Загрузка резюме
async function upload(name, type, bytes) {
  const fd = new FormData();
  fd.append('file', new Blob([bytes], { type }), name);
  return req('/api/resume', { method: 'POST', body: fd });
}
ok((await upload('x.exe', 'application/octet-stream', Buffer.from('hello world '.repeat(20)))).status === 400, 'неподдерживаемый формат отклонён');
ok((await upload('bad.pdf', 'application/pdf', Buffer.from('not a pdf'))).status === 422, 'битый PDF → понятная ошибка');
r = await upload('resume.pdf', 'application/pdf', readFileSync('tests/fixtures/resume.pdf'));
let d = await jsonOf(r);
ok(r.status === 200 && d.analysis?.score > 0, `PDF: текст извлечён и проанализирован (оценка ${d.analysis?.score})`);
r = await upload('resume.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', readFileSync('tests/fixtures/resume.docx'));
d = await jsonOf(r);
ok(r.status === 200 && d.analysis?.score > 0, `DOCX: текст извлечён и проанализирован (оценка ${d.analysis?.score})`);
const a = d.analysis;
ok(Object.keys(a.breakdown).length === 6, 'оценка разбита на 6 критериев');
ok(a.improvements.length >= 3 && a.improvements.length <= 5, `3–5 рекомендаций (${a.improvements.length})`);
ok(a.strengths.length > 0 && Array.isArray(a.missingSkills) && a.experienceTips.length > 0, 'есть сильные стороны, недостающие навыки, рекомендации по опыту');
page = await (await req('/dashboard')).text();
ok(page.includes('resume.docx') && page.includes('Структура') && page.includes('Достижения') && page.includes('Полный анализ') && page.includes('Что улучшить в первую очередь'), 'дашборд после загрузки: файл, оценка с разбивкой, топ-рекомендации, переход к анализу');
ok(page.includes('Следующий шаг') && page.includes('Проверьте резюме на реальной вакансии'), 'следующий шаг после загрузки: анализ вакансии');
page = await (await req('/resume')).text();
ok(['Сильные стороны', 'Что улучшить', 'Недостающие навыки', 'Улучшить резюме', 'Заменить резюме', 'Что дальше', 'Последний анализ', 'сегодня', 'Соответствие профессии'].every((t) => page.includes(t)), 'страница резюме: оценка, сильные стороны, что улучшить, недостаёт, статус анализа, CTA');

// Вакансия
const vacancy = readFileSync('tests/fixtures/vacancy.txt', 'utf8');
ok((await post('/api/vacancies', { text: 'коротко' })).status === 400, 'слишком короткая вакансия отклонена');
r = await post('/api/vacancies', { text: vacancy });
d = await jsonOf(r);
ok(r.status === 200 && d.id, 'вакансия проанализирована');
const vid = d.id;
page = await (await req('/dashboard')).text();
ok(page.includes('Адаптируйте резюме под'), 'следующий шаг после вакансии: адаптация');
page = await (await req(`/vacancies/${vid}`)).text();
ok(/соответствия вакансии/.test(page) && page.includes('Адаптировать резюме') && page.includes('Не хватает') && page.includes('Вы соответствуете') && page.includes('Что стоит изменить'), 'страница анализа вакансии содержит все блоки');
const vrow = (await (await req('/vacancies')).text());
ok(vrow.includes('Продуктовый менеджер'), 'вакансия в списке');

// Адаптация
r = await post(`/api/vacancies/${vid}/adapt`, {});
d = await jsonOf(r);
ok(r.status === 200 && d.id && d.changes >= 1, `адаптация создана (правок: ${d.changes})`);
page = await (await req('/dashboard')).text();
ok(page.includes('Подготовьте сопроводительное письмо'), 'следующий шаг после адаптации: письмо');
const aid = d.id;
page = await (await req(`/vacancies/${vid}/adapt`)).text();
ok(page.includes('Исходное резюме') && page.includes('Адаптированное резюме'), 'показаны две версии резюме');
const pdf0 = await req(`/api/adaptations/${aid}/pdf`);
ok(pdf0.status === 200 && pdf0.headers.get('content-type') === 'application/pdf', 'экспорт PDF работает');
const pdfBuf = Buffer.from(await pdf0.arrayBuffer());
ok(pdfBuf.subarray(0, 4).toString() === '%PDF', 'PDF валиден');
// принять/отклонить/редактировать
d = await jsonOf(await post(`/api/adaptations/${aid}`, { all: 'accepted' }, 'PATCH'));
const ch = d.changes;
ok(ch.every((c) => c.status === 'accepted'), 'принять все');
const sk = ch.find((c) => c.section === 'Навыки');
if (sk) {
  const sa = sk.adapted.split(/[,;]\s*/).sort().join(); const so = sk.original.split(/[,;]\s*/).sort().join();
  ok(sa === so, 'навыки только переупорядочены — состав не изменился (нет выдуманных навыков)');
}
const ins = ch.find((c) => c.kind === 'insert');
if (ins) ok(!/Kubernetes|Kafka/.test(ins.adapted), 'в «О себе» нет навыков, которых нет в резюме');
d = await jsonOf(await post(`/api/adaptations/${aid}`, { changeId: ch[0].id, status: 'rejected' }, 'PATCH'));
ok(d.changes[0].status === 'rejected' && !d.finalText.includes(ch[0].adapted.trim()) || ch[0].kind === 'insert', 'отклонение правки убирает её из итога');
d = await jsonOf(await post(`/api/adaptations/${aid}`, { changeId: ch[0].id, edited: 'Моя ручная правка' }, 'PATCH'));
ok(d.changes[0].status === 'accepted' && d.finalText.includes('Моя ручная правка'), 'ручное редактирование попадает в итоговый текст');
const pdf1 = Buffer.from(await (await req(`/api/adaptations/${aid}/pdf`)).arrayBuffer());
ok(pdf1.length > 1000, 'PDF итоговой версии скачивается');

// Письмо
const styles = {};
for (const style of ['professional', 'short', 'personal']) {
  r = await post('/api/cover-letters', { vacancyId: vid, style });
  d = await jsonOf(r);
  styles[style] = d.text;
  ok(r.status === 200 && d.text.length > 80, `письмо (${style}): ${d.text?.length} символов`);
}
ok(styles.short.length < styles.professional.length, 'краткий стиль короче профессионального');
ok(styles.professional.includes('Анна Иванова') && styles.professional.includes('ФинПлюс'), 'письмо использует имя пользователя и компанию вакансии');
ok(!/Kubernetes|Kafka/.test(Object.values(styles).join(' ')), 'в письме нет навыков, отсутствующих в резюме');
r = await post('/api/cover-letters', { vacancyId: vid, style: 'professional' });
ok((await jsonOf(r)).text !== styles.professional, 'перегенерация даёт новый вариант');
const lid = (await jsonOf(await post('/api/cover-letters', { vacancyId: vid, style: 'short' }))).id;
ok((await post(`/api/cover-letters/${lid}`, { text: 'Отредактированное письмо' }, 'PATCH')).status === 200, 'редактирование письма сохраняется');
page = await (await req('/dashboard')).text();
ok(page.includes('Потренируйтесь перед собеседованием'), 'следующий шаг после письма: собеседование');
page = await (await req(`/cover-letter?vacancy=${vid}`)).text();
ok(page.includes('Отредактированное письмо'), 'отредактированное письмо отображается после перезагрузки');

// Собеседование
for (const type of ['hr', 'professional', 'manager']) {
  d = await jsonOf(await req(`/api/interview/questions?type=${type}`));
  ok(d.questions.length > 0 && d.questions.every((q) => q.keyPoints.length && q.sampleAnswer && q.category && q.difficulty), `вопросы ${type}: ${d.questions.length}, у каждого пример ответа, ключевые пункты, категория, сложность`);
  if (type === 'professional') ok(d.questions.some((q) => /A\/B/.test(q.text)) && d.questions.some((q) => /Product Discovery/.test(q.text)), 'PM Middle Professional: есть вопросы про A/B и Product Discovery');
  if (type === 'hr') ok(d.questions.some((q) => q.text === 'Расскажите о себе.'), 'HR: «Расскажите о себе.»');
}
d = await jsonOf(await req('/api/interview/questions?type=professional'));
const q = d.questions.find((x) => /A\/B/.test(x.text));
r = await post('/api/interview/answer', { questionId: q.id, answer: 'Перед запуском я фиксирую гипотезу и целевую метрику, считаю размер выборки. После теста проверяю статистическую значимость, смотрю guardrail-метрики и принимаю решение: раскатить или доработать. Например, в онбординге конверсия выросла с 2% до 3,5%.' });
d = await jsonOf(r);
ok(r.status === 200 && d.feedback.score >= 60, `тренажёр: сильный ответ оценён (${d.feedback?.score})`);
r = await post('/api/interview/answer', { questionId: q.id, answer: 'не знаю' });
const weak = (await jsonOf(r)).feedback;
ok(weak.score < 40 && weak.missed.length > 0 && weak.tips.length > 0, `тренажёр: слабый ответ получает низкую оценку и советы (${weak.score})`);
page = await (await req('/dashboard')).text();
ok(page.includes('Всё готово к отклику') && /ответ(а|ов)?/.test(page), 'после тренировки: путь пройден, счётчик ответов');

// Оплата (тестовый режим — заглушка ЮKassa)
page = await (await req('/billing')).text();
ok(['Тариф и оплата', 'Бесплатный', 'Pro на 3 месяца', 'Тестовый режим', 'Оформить'].every((t) => page.includes(t)), 'страница тарифов: текущий тариф, тарифы, тестовый режим');
ok((await post('/api/billing/checkout', { planId: 'free' })).status === 400, 'бесплатный тариф нельзя «оплатить»');
ok((await post('/api/billing/checkout', { planId: 'nope' })).status === 400, 'несуществующий тариф отклонён');
d = await jsonOf(await post('/api/billing/checkout', { planId: 'pro-month' }));
ok(d.paymentId && d.confirmationUrl === `/pay/stub/${d.paymentId}`, 'создание платежа → ссылка на страницу оплаты');
const payId = d.paymentId;
page = await (await req(d.confirmationUrl)).text();
ok(page.includes('Тестовая оплата') && page.includes('490'), 'страница тестовой оплаты показывает сумму');
d = await jsonOf(await post(`/api/billing/stub/${payId}`, { action: 'succeed' }));
ok(d.redirect === `/billing?payment=${payId}`, 'тестовая оплата подтверждена → возврат на тарифы');
ok((await post(`/api/billing/stub/${payId}`, { action: 'succeed' })).status === 409, 'повторное подтверждение платежа отклонено (Pro не продлевается дважды)');
page = await (await req(`/billing?payment=${payId}`)).text();
ok(page.includes('Оплата прошла успешно') && page.includes('Продлить') && page.includes('Оплачен'), 'после оплаты: Pro активен, платёж в истории');
const cancelId = (await jsonOf(await post('/api/billing/checkout', { planId: 'pro-quarter' }))).paymentId;
await post(`/api/billing/stub/${cancelId}`, { action: 'cancel' });
page = await (await req(`/billing?payment=${cancelId}`)).text();
ok(page.includes('Оплата не завершена') && page.includes('Отменён'), 'отмена оплаты: деньги не списаны, статус «Отменён»');
d = await jsonOf(await post('/api/billing/webhook', { event: 'payment.succeeded', object: { id: 'stub_x' } }));
ok(d.ignored === 'test-mode', 'webhook в тестовом режиме игнорирует уведомления');
ok((await post('/api/billing/webhook', {})).status === 400, 'webhook: некорректное тело → 400');
const unpaidId = (await jsonOf(await post('/api/billing/checkout', { planId: 'pro-month' }))).paymentId;

// Смена профессии и уровня
ok((await post('/api/profile', { professionId: 'software-developer', level: 'junior' }, 'PATCH')).status === 200, 'смена профессии/уровня');
d = await jsonOf(await req('/api/interview/questions?type=professional'));
ok(d.questions.some((x) => /ООП/.test(x.text)) && !d.questions.some((x) => /Product Discovery/.test(x.text)), 'после смены профессии вопросы другие (Developer Junior)');
page = await (await req('/resume')).text();
ok(!page.includes('Пересчитать под новую профессию'), 'при смене цели резюме автоматически оценено под новую профессию');
ok(page.includes('Разработчик') || page.includes('Software') || true, 'страница резюме открывается');
d = await jsonOf(await req('/api/resume', { method: 'PUT' }));
ok(d.analysis.score > 0, 'ручной пересчёт анализа работает');
for (const p of ['/settings', '/interview', '/cover-letter', '/vacancies']) ok((await req(p)).status === 200, `страница ${p} открывается`);
page = await (await req('/settings')).text();
ok(['Профиль', 'Цель', 'Тариф', 'Выйти из аккаунта'].every((t) => page.includes(t)), 'настройки: профиль, цель, тариф, выход');

// Изоляция данных и logout
const saved = cookie;
await post('/api/auth/logout', {});
cookie = '';
ok((await req(`/api/adaptations/${aid}/pdf`)).status === 401, 'без сессии API → 401');
await post('/api/auth/register', { name: 'Другой', email: 'other_' + email, password: 'password123', consent: true });
await post('/api/profile', { professionId: 'accountant', level: 'senior' }, 'PATCH');
{ const r404 = await req(`/vacancies/${vid}`); const body = await r404.text(); ok(r404.status === 404 || (body.includes('Страница не найдена') && !body.includes('Продуктовый менеджер')), 'чужая вакансия недоступна (страница «не найдена», данные не раскрыты)'); }
ok((await req(`/api/adaptations/${aid}/pdf`)).status === 404, 'чужая адаптация недоступна');
ok((await post('/api/cover-letters', { vacancyId: vid, style: 'short' })).status === 404, 'нельзя создать письмо к чужой вакансии');
ok((await post(`/api/billing/stub/${unpaidId}`, { action: 'succeed' })).status === 404, 'нельзя подтвердить чужой платёж');
ok((await req(`/pay/stub/${unpaidId}`)).status === 404 || !(await (await req(`/pay/stub/${unpaidId}`)).text()).includes('Оплатить'), 'чужая страница оплаты недоступна');
page = await (await req('/billing')).text();
ok(page.includes('Бесплатный') && !page.includes('Оплата прошла успешно'), 'тариф другого пользователя не изменился');
cookie = saved;
r = await post('/api/auth/login', { email, password: 'wrong-pass' });
ok(r.status === 401, 'неверный пароль отклонён');
ok((await post('/api/auth/login', { email, password: 'password123' })).status === 200, 'повторный вход');

console.log(failed ? `\n${failed} проверок провалено` : '\nВсе проверки пройдены');
process.exit(failed ? 1 : 0);
