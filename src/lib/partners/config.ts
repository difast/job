// Настройки интеграции с JobToo. Все секреты — только в переменных окружения сервера.
//
//   JOBTOO_INTEGRATION_ENABLED=1        — включить интеграцию (по умолчанию выключена)
//   JOBTOO_API_URL=https://jobtoo.ru/api/partner.php — единый адрес API JobToo; операция — параметр ?op=pull|handoff|events
//   JOBTOO_LOGIN_ORIGIN=https://jobtoo.ru  — домен ссылок входа JobToo (по умолчанию — домен API)
//   JOBTOO_OUTBOUND_SECRET=…             — подпись запросов Clymly → JobToo (pull, handoff, events)
//   JOBTOO_INBOUND_SECRET=…              — проверка запросов JobToo → Clymly (события JobToo)
import { SITE_URL } from '../brand';

export const PARTNER = 'jobtoo' as const;
export const PARTNER_NAME = 'JobToo';

export { JOBTOO_CONSENT_VERSION } from './shared';

export const MAX_SKEW_SEC = 300;
export const LINK_TICKET_TTL_MS = 15 * 60 * 1000;
export const OUTBOUND_TIMEOUT_MS = 15_000;
export const LINK_COOKIE = 'partner_link';
/** Код перехода из JobToo: живёт у них 15 минут; храним только в httpOnly-cookie, не в адресной строке. */
export const START_COOKIE = 'jobtoo_start';
export const START_TTL_SEC = 15 * 60;

const env = (k: string) => (process.env[k] ?? '').trim();

export const jobtoo = {
  enabled: () => env('JOBTOO_INTEGRATION_ENABLED') === '1',
  apiUrl: () => env('JOBTOO_API_URL'),
  /** Адрес операции API JobToo: …/partner.php?op=… */
  endpoint: (op: 'pull' | 'handoff' | 'events') => {
    const u = new URL(env('JOBTOO_API_URL'));
    u.searchParams.set('op', op);
    return u.toString();
  },
  loginOrigin: () => {
    const o = env('JOBTOO_LOGIN_ORIGIN') || env('JOBTOO_API_URL');
    try { return o ? new URL(o).origin : ''; } catch { return ''; }
  },
  outboundSecret: () => env('JOBTOO_OUTBOUND_SECRET'),
  inboundSecret: () => env('JOBTOO_INBOUND_SECRET'),
  /** Можно ли отправлять в JobToo (кнопка «Перейти в JobToo»). */
  outboundReady: () => jobtoo.enabled() && !!jobtoo.apiUrl() && !!jobtoo.outboundSecret(),
  /** Можно ли принимать переходы из JobToo (страница приёма + запрос pull) и их события. */
  inboundReady: () => jobtoo.outboundReady() && !!jobtoo.inboundSecret(),
};

export const siteOrigin = () => new URL(SITE_URL).origin;

/** http разрешён только для локальной разработки и тестов. */
export const isAllowedScheme = (u: URL) => u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname));

/** Проверка ссылки, полученной от партнёра: только его домен, только https. */
export function isPartnerLoginUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const origin = jobtoo.loginOrigin();
  try {
    const u = new URL(raw);
    return !!origin && u.origin === origin && isAllowedScheme(u) && !u.username && !u.password;
  } catch { return false; }
}
