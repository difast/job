# Clymly ⇄ JobToo: формат обмена v1 (сторона Clymly)

Документ для команды JobToo. Формат одинаковый в обе стороны: каждая сторона и принимает, и отправляет.

## Что нужно от JobToo для запуска

1. **Адрес API JobToo** — базовый URL, по которому Clymly будет вызывать `POST /api/partner/v1/handoff` и `POST /api/partner/v1/events` (у Clymly: `JOBTOO_API_BASE`). Боевой и тестовый.
2. **Домен ссылок входа JobToo** — откуда будут `login_url` (у Clymly: `JOBTOO_LOGIN_ORIGIN`), если он отличается от домена API. Ссылки на другие домены Clymly не открывает.
3. **Путь входа** — например `/sso/clymly?code=…`, срок жизни ссылки (ожидаем до 2 минут) и подтверждение, что она одноразовая.
4. **Тестовый стенд JobToo** с тестовыми секретами — для проверки без реальных пользователей.
5. **Секреты подписи** — генерируются один раз (`openssl rand -hex 32`) и передаются защищённым каналом, не в чате и не в репозитории (пары имён — в разделе «Секреты»).
6. **Подтверждение поведения при `account=link_required`** на стороне JobToo: существующий аккаунт по одному лишь e-mail не открывается без входа владельца. Clymly передаёт `email_verified=true` только для почты, подтверждённой по ссылке из письма Clymly.
7. **Значения `utm.placement` и `utm.platform`**, которые будет передавать JobToo (например `profile`, `response_card`; `web`, `miniapp`, `app`) — для отчётов.
8. **Что JobToo считает `first_action`** — какое действие пользователя после входа из Clymly отправлять этим событием.
9. **Юридическая часть** — текст согласия JobToo (с версией) и договор о передаче данных между компаниями.

## Адреса Clymly

| Назначение | Адрес |
|---|---|
| Приём профиля и резюме от JobToo | `POST https://clymly.ru/api/partner/v1/handoff` |
| Приём событий от JobToo | `POST https://clymly.ru/api/partner/v1/events` |
| Ссылка входа, которую Clymly возвращает | `https://clymly.ru/sso/jobtoo?code=…` (2 минуты, одноразовая) |
| Clymly отправляет в JobToo | `POST {JOBTOO_API_BASE}/api/partner/v1/handoff` и `/api/partner/v1/events` |

Ссылки входа JobToo Clymly принимает только на домене `JOBTOO_LOGIN_ORIGIN` (по умолчанию — домен API JobToo) и только по HTTPS.

## Секреты

| У Clymly | У JobToo | Направление |
|---|---|---|
| `JOBTOO_INBOUND_SECRET` | `CLYMLY_OUTBOUND_SECRET` | JobToo → Clymly |
| `JOBTOO_OUTBOUND_SECRET` | `CLYMLY_INBOUND_SECRET` | Clymly → JobToo |

Генерация: `openssl rand -hex 32`. Секреты передаются только через переменные окружения/секреты серверов.

## Заголовки и подпись

| Заголовок | Значение |
|---|---|
| `X-Partner-Id` | `jobtoo` или `clymly` — кто отправляет |
| `X-Request-Id` | UUID v4. Повтор с тем же ID → тот же результат без дублей (ссылка входа — новая, она одноразовая) |
| `X-Timestamp` | Unix-время в секундах, допуск ±300 с |
| `X-Signature` | `hex(HMAC-SHA256(secret, X-Timestamp + "." + X-Request-Id + "." + hex(sha256(сырое тело запроса))))` |

## Handoff: тело запроса

`multipart/form-data`: поле `payload` — JSON (UTF-8), поле `resume_file` — PDF/DOCX/TXT до 5 МБ (или `resume_text` в JSON, до 30 000 символов).

### JobToo → Clymly

| Поле | Обяз. | Примечание |
|---|---|---|
| `source` | да | `"jobtoo"` |
| `jobtoo_user_id` | да | ID пользователя в JobToo |
| `clymly_user_id` | нет | Clymly ему не доверяет: связь определяется по `jobtoo_user_id` |
| `email`, `email_verified`, `name` | да | |
| `phone` | нет | принимается, но **не сохраняется** |
| `target_position` | да | свободный текст; Clymly сопоставит со своим справочником (38 профессий). Если не удалось — пользователь выберет профессию при входе |
| `experience_level` | нет | `junior` / `middle` / `senior` / `lead` |
| `skills` | нет | |
| `resume_id` | да | |
| `resume_file` / `resume_text` | одно из двух | файл приоритетнее |
| `vacancy` | нет | `{ id, title, company, description, url }` — при наличии `description` Clymly сразу делает анализ соответствия; `url` принимается только на домене JobToo |
| `consent` | да | `{ accepted_at, version }` |
| `utm` | нет | `{ placement, platform }` — для аналитики |

### Clymly → JobToo

`source="clymly"`, `clymly_user_id`, `jobtoo_user_id` (если связаны), `email`, `email_verified` (`true` — пользователь подтвердил почту по ссылке из письма Clymly, иначе `false`), `name`, `target_position`, `target_position_id`, `experience_level`, `resume_id`, `resume_text` (файл не передаётся — Clymly хранит только текст), `resume_adapted_text`, `skills_detected`, `consent`, `utm` (`placement`: `dashboard` / `resume` / `adaptation`, `platform`: `web`).

## Ответ

```json
{ "status": "ok", "request_id": "…", "external_user_id": "…", "account": "created|found|link_required",
  "login_url": "https://…", "expires_at": "ISO-8601" }
```
```json
{ "status": "error", "request_id": "…", "error": { "code": "…", "message": "…" }, "retry_after": 30 }
```

Коды: 400 `invalid_payload`, 401 `invalid_signature`, 403 `consent_missing`, 409 `duplicate_request`, 413 `file_too_large`, 415 `unsupported_file`, 422 `resume_unreadable`, 429 `rate_limited`, 503 `unavailable`.
Лимиты Clymly: 10 запросов в минуту на пользователя JobToo, 100 в минуту от партнёра.

### Как Clymly определяет аккаунт

1. Есть связь по `jobtoo_user_id` → `found`, вход сразу.
2. Пользователь с таким e-mail уже есть в Clymly:
   * почта подтверждена **и в Clymly, и в JobToo** (`email_verified=true`), а аккаунт Clymly ещё не связан с другим аккаунтом JobToo → связь создаётся автоматически, `found`;
   * иначе → `link_required`: ссылка ведёт на `/link/jobtoo`, владелец входит своим паролем Clymly и подтверждает привязку. До этого `external_user_id` имеет вид `pending:…` — сохранять его как ID не нужно.

   Защита от навязанной привязки на экране `/link/jobtoo`: связать можно только аккаунт Clymly **с той же почтой**, что и в JobToo, и только если JobToo подтвердил её (`email_verified=true`). Обе почты показываются полностью. Существующая связь не перезаписывается (409).
3. Иначе → `created`: аккаунт без пароля (пользователь может задать пароль в настройках). Перед началом работы пользователь принимает условия Clymly.

## События: `POST /api/partner/v1/events`

Подпись и заголовки те же. Тело — JSON:

```json
{ "events": [ { "request_id": "<X-Request-Id исходного handoff>", "event": "login_completed", "occurred_at": "ISO", "partner_user_id": "…" } ] }
```

* Clymly **отправляет** в JobToo по переходам JobToo → Clymly: `login_completed`, `account_linked`, `first_action` (первый анализ вакансии, письмо, адаптация или ответ в тренажёре; один раз).
* Clymly **принимает** от JobToo по переходам Clymly → JobToo: `login_completed`, `account_linked`, `first_action`, `login_link_expired`, `login_link_reused`. События с неизвестным `request_id` игнорируются.
* Отправка асинхронная, батчами до 50, с повторами (до 10 попыток).

## Аналитика в Clymly

Воронки обоих направлений — `/admin/integrations` (доступ по `ADMIN_EMAILS`), выгрузка CSV. Персональные данные, ссылки и коды входа в аналитику не попадают.
