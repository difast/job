// Настройки интеграции с JobToo. Все секреты — только в переменных окружения сервера.
//
//   JOBTOO_INTEGRATION_ENABLED=1        — включить интеграцию (по умолчанию выключена)
//   JOBTOO_API_BASE=https://…            — адрес API JobToo (без /api/partner/v1)
//   JOBTOO_LOGIN_ORIGIN=https://…        — домен, на который JobToo выдаёт ссылки входа (по умолчанию — домен API)
//   JOBTOO_OUTBOUND_SECRET=…             — подпись запросов Clymly → JobToo   (у JobToo это CLYMLY_INBOUND_SECRET)
//   JOBTOO_INBOUND_SECRET=…              — проверка запросов JobToo → Clymly  (у JobToo это CLYMLY_OUTBOUND_SECRET)
import { SITE_URL } from '../brand';

export const PARTNER = 'jobtoo' as const;
export const PARTNER_NAME = 'JobToo';
export const API_PATH = '/api/partner/v1';

export { JOBTOO_CONSENT_VERSION } from './shared';

export const MAX_SKEW_SEC = 300;
export const LOGIN_CODE_TTL_MS = 2 * 60 * 1000;
export const LINK_TICKET_TTL_MS = 15 * 60 * 1000;
export const OUTBOUND_TIMEOUT_MS = 15_000;
export const LINK_COOKIE = 'partner_link';

const env = (k: string) => (process.env[k] ?? '').trim();

export const jobtoo = {
  enabled: () => env('JOBTOO_INTEGRATION_ENABLED') === '1',
  apiBase: () => env('JOBTOO_API_BASE').replace(/\/$/, ''),
  loginOrigin: () => {
    const o = env('JOBTOO_LOGIN_ORIGIN') || env('JOBTOO_API_BASE');
    try { return o ? new URL(o).origin : ''; } catch { return ''; }
  },
  outboundSecret: () => env('JOBTOO_OUTBOUND_SECRET'),
  inboundSecret: () => env('JOBTOO_INBOUND_SECRET'),
  /** Можно ли отправлять в JobToo (кнопка «Перейти в JobToo»). */
  outboundReady: () => jobtoo.enabled() && !!jobtoo.apiBase() && !!jobtoo.outboundSecret(),
  /** Можно ли принимать запросы от JobToo. */
  inboundReady: () => jobtoo.enabled() && !!jobtoo.inboundSecret(),
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
