# Clymly

Clymly (https://clymly.ru) — SaaS-платформа подготовки к поиску работы. Центральная сущность — **профессия пользователя**: выбрав профессию и уровень, пользователь получает анализ резюме, адаптацию под вакансию, сопроводительное письмо и тренажёр собеседования, настроенные под эту профессию.

## Стек
Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · шрифт Inter (локально, @fontsource) · Prisma 6 + PostgreSQL · собственная cookie-сессия (bcrypt, токен хранится хэшем) · pdf-parse / mammoth (PDF/DOCX → текст) · pdfkit (экспорт PDF) · Anthropic SDK (опционально).

## Что внутри
* **Лендинг** (`/`) — hero с превью продукта, «Как это работает», возможности, профессии, финальный CTA, футер; `/terms` и `/privacy` — страницы-заглушки.
* **Личный кабинет** — единая дизайн-система (`src/app/globals.css` — токены, `src/components/ui.tsx` — кнопки, карточки, оценки, состояния, `Icon.tsx` — иконки), боковая панель на desktop и верхняя + нижняя навигация на mobile, диалог «Ваша цель» (смена профессии пересчитывает оценку резюме и вопросы собеседования), skeleton/empty/error-состояния.

## Оплата (ЮKassa)
* Тарифы и цены — `src/lib/billing/plans.ts` (сейчас значения-заглушки; ограничения тарифов к функциям не применяются).
* Провайдер — `src/lib/billing/provider.ts`: по умолчанию тестовая заглушка (`/pay/stub/[id]`), ЮKassa включается `PAYMENT_PROVIDER=yookassa` + `YOOKASSA_SHOP_ID` + `YOOKASSA_SECRET_KEY`.
* Поток: `POST /api/billing/checkout` → страница оплаты → возврат на `/billing?payment=…` (статус сверяется с провайдером) и уведомление `POST /api/billing/webhook` (статус всегда перепроверяется запросом к API ЮKassa). Продление Pro идемпотентно.

## Запуск
```bash
npm install
cp .env.example .env          # DATABASE_URL (PostgreSQL), (опц.) ANTHROPIC_API_KEY
npm run db:setup              # создаёт БД и наполняет справочники (профессии, вопросы)
npm run dev                   # http://localhost:3000
```
Прод: `npm run build && npm start`. Повторный `npm run db:seed` безопасен: данные пользователей не затрагиваются.

### AI-движок
* С `ANTHROPIC_API_KEY` анализ/адаптация/письма/оценка ответов выполняет Claude (модель — `ANTHROPIC_MODEL`, по умолчанию `claude-sonnet-5-5`); ответы валидируются zod-схемами.
* Без ключа (или при любой ошибке API) автоматически работает встроенный детерминированный движок (`src/lib/ai/heuristic.ts`). Интерфейс честно показывает, чем выполнен анализ.
* **Защита от выдумок** (`src/lib/ai/guard.ts`): правки резюме от AI отбрасываются, если вносят числа, технологии или названия, которых нет в исходной строке. Эвристическая адаптация только переставляет навыки, усиливает формулировки и собирает «шапку» из уже подтверждённых фактов.

## Архитектура данных (`prisma/schema.prisma`)
* `ProfessionCategory → Profession → ProfessionLevelProfile (junior/middle/senior/lead)` — id, название, категория, описание, типичные навыки и требования, профиль каждого уровня.
* `InterviewQuestion` — иерархия **Profession → Level → Interview Type → Question**: `professionId`/`level` могут быть `null` (универсальный вопрос), у вопроса есть текст, категория, сложность 1–3, пример сильного ответа и ключевые пункты.
* `User` (профессия, уровень), `Session`, `Resume`, `Vacancy`, `Adaptation` (правки со статусами), `CoverLetter`, `PracticeAttempt`.

### Как расширять
* **Профессия** — добавить запись в `prisma/data/professions.ts` (или прямо в таблицу) и выполнить `npm run db:seed`; UI, поиск и AI-контекст подхватят её сами. Ограничения «38 профессий» нигде нет.
* **Вопросы** — добавить `q(...)` в `prisma/data/questions.ts` (id стабилен: хэш от профессии, уровня, типа и текста).

## Структура
```
src/app/(auth)        вход / регистрация          src/app/api      REST-эндпоинты
src/app/onboarding    профессия → уровень         src/lib/ai       LLM, эвристики, guard
src/app/(app)         dashboard, резюме,          src/lib          auth, db, извлечение текста, PDF, diff
                      вакансии, письма,           prisma/          схема, seed, данные справочников
                      собеседование, настройки    scripts/         e2e и UI-проверки
```

## Проверки
```bash
npm test                                         # юнит-тесты логики и справочников
npm run build && npx next start -p 3100 &        # затем:
BASE_URL=http://localhost:3100 npm run e2e       # сквозной сценарий через HTTP (~110 проверок, включая лендинг)
BASE_URL=http://localhost:3100 npm run ui-check  # сценарий в реальном Chromium + скриншоты, mobile/tablet
```

## Вне MVP (по ТЗ)
LinkedIn и трекер откликов не реализованы.

## Деплой (Timeweb Cloud Apps)
Фреймворк Next.js, команда сборки `npm run build`, директория сборки `.next`, команда запуска `npm run start:prod`, проверка состояния `GET /api/health`. SSR должен быть включён. Поле системных зависимостей — пустое. Обязательна переменная `DATABASE_URL` — строка подключения к PostgreSQL 16+ (`postgresql://user:pass@host:5432/db?sslmode=require`). При каждом старте `start:prod` синхронизирует схему (`prisma db push`, без удаления данных) и обновляет справочники профессий и вопросов; данные пользователей не затрагиваются.

## Бренд
* Единый источник — `src/lib/brand.ts`: название, домен, `SITE_URL`, цвета и геометрия знака. Логотип — компонент `Logo`/`LogoMark` в `src/components/ui.tsx` (две «y» — классы `brand-y1`/`brand-y2` на токенах из `globals.css`).
* Иконки (favicon.ico, icon.svg, apple-icon.png, PWA 192/512/maskable) генерируются из одного SVG: `npx tsx scripts/generate-icons.ts`. При замене иконок увеличьте `V` в `src/app/manifest.ts`.
* `APP_URL=https://clymly.ru` — canonical, Open Graph, sitemap, robots и возврат после оплаты.
