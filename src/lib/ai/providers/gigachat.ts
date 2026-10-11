// GigaChat API (Сбер). Только сервер.
//
// Авторизация (официальная документация developers.sber.ru → GigaChat API → Авторизация):
//   POST https://ngw.devices.sberbank.ru:9443/api/v2/oauth
//   Authorization: Basic <ключ авторизации из личного кабинета>, RqUID: <uuid4>,
//   Content-Type: application/x-www-form-urlencoded, тело: scope=GIGACHAT_API_PERS | GIGACHAT_API_B2B | GIGACHAT_API_CORP
//   Ответ: { access_token, expires_at } — токен действует 30 минут.
// Генерация: POST https://api.giga.chat/v1/chat/completions (целевой адрес с 17.07.2026; прежний
//   https://gigachat.devices.sberbank.ru/api/v1 остаётся для старых подключений — задаётся GIGACHAT_API_URL),
//   Authorization: Bearer <access_token>, тело { model, messages: [{ role: system|user|assistant, content }], ... }.
// Сертификаты: серверы GigaChat используют корневой сертификат Минцифры (Russian Trusted Root CA) — путь к нему
//   задаётся в GIGACHAT_CA_CERT (или NODE_EXTRA_CA_CERTS). Проверка сертификата никогда не отключается.
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { rootCertificates } from 'node:tls';
import { AiError } from '../errors';
import type { AiProvider, ChatRequest, ChatResult } from './types';

export const GIGACHAT_DEFAULTS = {
  authUrl: 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
  apiUrl: 'https://api.giga.chat/v1',
  scope: 'GIGACHAT_API_PERS',
  model: 'GigaChat-2-Pro',
  timeoutMs: 45_000,
  maxRetries: 2,
};
const SCOPES = ['GIGACHAT_API_PERS', 'GIGACHAT_API_B2B', 'GIGACHAT_API_CORP'];
const TOKEN_TTL_MAX_MS = 30 * 60_000;
const TOKEN_REFRESH_BEFORE_MS = 60_000;
const MAX_BODY = 2 * 1024 * 1024;

export interface GigaChatConfig {
  authKey: string; scope: string; model: string; authUrl: string; apiUrl: string;
  timeoutMs: number; maxRetries: number; ca: string[] | null; structured: boolean;
}

type Env = Record<string, string | undefined>;

/** Конфигурация из окружения. Ошибки — только с именами переменных, без значений. */
export function gigaChatConfig(env: Env = process.env): { ok: true; config: GigaChatConfig } | { ok: false; problem: string } {
  const authKey = (env.GIGACHAT_AUTH_KEY ?? '').trim();
  if (!authKey) return { ok: false, problem: 'не задан GIGACHAT_AUTH_KEY (ключ авторизации из личного кабинета GigaChat API)' };
  if (!/^[A-Za-z0-9+/=_-]{16,}$/.test(authKey)) return { ok: false, problem: 'GIGACHAT_AUTH_KEY в неверном формате: нужен «Authorization key» (Base64) без слова Basic' };
  const scope = (env.GIGACHAT_SCOPE ?? '').trim() || GIGACHAT_DEFAULTS.scope;
  if (!SCOPES.includes(scope)) return { ok: false, problem: `GIGACHAT_SCOPE должен быть одним из: ${SCOPES.join(', ')}` };
  let ca: string[] | null = null;
  const caRaw = (env.GIGACHAT_CA_CERT ?? '').trim();
  if (caRaw) {
    let pem = caRaw.replace(/\\n/g, '\n');
    if (!pem.includes('-----BEGIN CERTIFICATE-----')) {
      try { pem = readFileSync(caRaw, 'utf8'); } catch { return { ok: false, problem: 'GIGACHAT_CA_CERT: файл сертификата не найден или недоступен' }; }
      if (!pem.includes('-----BEGIN CERTIFICATE-----')) return { ok: false, problem: 'GIGACHAT_CA_CERT: в файле нет сертификата в формате PEM' };
    }
    ca = [...rootCertificates, pem];
  }
  const num = (v: string | undefined, d: number, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : d; };
  return {
    ok: true,
    config: {
      authKey, scope, ca,
      model: (env.GIGACHAT_MODEL ?? '').trim() || GIGACHAT_DEFAULTS.model,
      authUrl: (env.GIGACHAT_AUTH_URL ?? '').trim() || GIGACHAT_DEFAULTS.authUrl,
      apiUrl: ((env.GIGACHAT_API_URL ?? '').trim() || GIGACHAT_DEFAULTS.apiUrl).replace(/\/+$/, ''),
      timeoutMs: num(env.GIGACHAT_TIMEOUT_MS, GIGACHAT_DEFAULTS.timeoutMs, 5_000, 120_000),
      maxRetries: num(env.GIGACHAT_MAX_RETRIES, GIGACHAT_DEFAULTS.maxRetries, 0, 4),
      structured: /^(1|true|yes)$/i.test(env.GIGACHAT_STRUCTURED_OUTPUT ?? ''),
    },
  };
}

/* ───────── HTTP ───────── */
interface HttpResult { status: number; headers: Record<string, string | string[] | undefined>; body: string }
class NetworkError extends Error {}

function send(url: string, opts: { method: string; headers: Record<string, string>; body: string; timeoutMs: number; ca: string[] | null }): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = (u.protocol === 'http:' ? httpRequest : httpsRequest)(u, {
      method: opts.method,
      headers: { ...opts.headers, 'Content-Length': Buffer.byteLength(opts.body).toString() },
      ...(u.protocol === 'https:' && opts.ca ? { ca: opts.ca } : {}),
    }, (res) => {
      const chunks: Buffer[] = []; let size = 0;
      res.on('data', (c: Buffer) => { size += c.length; if (size > MAX_BODY) { req.destroy(new NetworkError('ответ слишком большой')); return; } chunks.push(c); });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', (e) => reject(new NetworkError(e.message)));
    });
    req.setTimeout(opts.timeoutMs, () => req.destroy(new NetworkError(`таймаут ${opts.timeoutMs} мс`)));
    req.on('error', (e) => reject(e instanceof NetworkError ? e : new NetworkError(
      /certificate|self.signed|UNABLE_TO_VERIFY|CERT_/i.test(e.message) ? 'TLS: сертификат сервера не доверен — укажите сертификат Минцифры в GIGACHAT_CA_CERT' : e.message)));
    req.end(opts.body);
  });
}

/** Короткое сообщение провайдера для диагностики — без длинных фрагментов и похожих на токены строк. */
function providerMessage(body: string) {
  try {
    const j = JSON.parse(body) as { message?: unknown; error?: unknown };
    const m = typeof j.message === 'string' ? j.message : typeof j.error === 'string' ? j.error : '';
    return m.replace(/[A-Za-z0-9._-]{32,}/g, '…').slice(0, 120);
  } catch { return ''; }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ───────── Токен доступа ───────── */
interface Token { value: string; expiresAt: number; key: string }
let cached: Token | null = null;
let pending: { key: string; promise: Promise<Token> } | null = null;
const cacheKey = (c: GigaChatConfig) => createHash('sha256').update(`${c.authUrl}|${c.scope}|${c.authKey}`).digest('hex');

/** Для тестов: сбросить кеш токена. */
export function resetGigaChatToken() { cached = null; pending = null; }

async function fetchToken(c: GigaChatConfig, timeoutMs: number): Promise<Token> {
  let r: HttpResult;
  try {
    r = await send(c.authUrl, {
      method: 'POST', timeoutMs, ca: c.ca, body: new URLSearchParams({ scope: c.scope }).toString(),
      headers: { Authorization: `Basic ${c.authKey}`, RqUID: randomUUID(), Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  } catch (e) { throw new AiError('unavailable', `GigaChat OAuth: ${(e as Error).message}`); }
  if (r.status === 401) throw new AiError('auth', 'GigaChat OAuth 401: ключ авторизации отклонён — проверьте GIGACHAT_AUTH_KEY');
  if (r.status === 400) throw new AiError('config', `GigaChat OAuth 400: проверьте GIGACHAT_SCOPE и формат ключа ${providerMessage(r.body)}`.trim());
  if (r.status === 403) throw new AiError('forbidden', 'GigaChat OAuth 403: нет доступа для указанного scope');
  if (r.status === 429) throw new AiError('rate_limit', 'GigaChat OAuth 429: слишком много запросов токена');
  if (r.status !== 200) throw new AiError('unavailable', `GigaChat OAuth HTTP ${r.status}`);
  let j: { access_token?: unknown; expires_at?: unknown };
  try { j = JSON.parse(r.body); } catch { throw new AiError('bad_response', 'GigaChat OAuth: ответ не JSON'); }
  if (typeof j.access_token !== 'string' || j.access_token.length < 10) throw new AiError('bad_response', 'GigaChat OAuth: нет access_token');
  const now = Date.now();
  // expires_at — Unix-время; в документации встречаются и секунды, и миллисекунды
  let exp = typeof j.expires_at === 'number' ? (j.expires_at < 1e12 ? j.expires_at * 1000 : j.expires_at) : now + TOKEN_TTL_MAX_MS - 5 * 60_000;
  exp = Math.min(exp, now + TOKEN_TTL_MAX_MS);
  return { value: j.access_token, expiresAt: exp, key: cacheKey(c) };
}

/** Токен из кеша или новый. Параллельные запросы ждут одну авторизацию. */
async function getToken(c: GigaChatConfig, timeoutMs: number): Promise<string> {
  const key = cacheKey(c);
  if (cached && cached.key === key && cached.expiresAt - TOKEN_REFRESH_BEFORE_MS > Date.now()) return cached.value;
  if (!pending || pending.key !== key) {
    const promise = fetchToken(c, timeoutMs).then((t) => { cached = t; return t; }).finally(() => { if (pending?.promise === promise) pending = null; });
    pending = { key, promise };
  }
  return (await pending.promise).value;
}

/* ───────── Генерация ───────── */
export function createGigaChat(c: GigaChatConfig): AiProvider {
  return {
    name: 'gigachat',
    model: c.model,
    async chat(req: ChatRequest): Promise<ChatResult> {
      const deadline = Date.now() + c.timeoutMs + 15_000; // общий бюджет вызова вместе с повторами
      const body = JSON.stringify({
        model: c.model,
        messages: [{ role: 'system', content: req.system }, ...(req.history ?? []), { role: 'user', content: req.user }],
        temperature: req.temperature ?? 0.3,
        max_tokens: req.maxTokens ?? 2048,
        stream: false,
        ...(c.structured && req.jsonSchema ? { response_format: { type: 'json_schema', schema: req.jsonSchema } } : {}),
      });
      let attempt = 0; let reauthorized = false;
      for (;;) {
        const left = deadline - Date.now();
        if (left < 2_000) throw new AiError('unavailable', 'GigaChat: исчерпано время на запрос');
        const timeoutMs = Math.min(c.timeoutMs, left);
        let token: string;
        try { token = await getToken(c, Math.min(timeoutMs, 20_000)); } catch (e) {
          // временная недоступность сервера авторизации — те же ограниченные повторы
          if (e instanceof AiError && (e.kind === 'unavailable' || e.kind === 'rate_limit') && attempt < c.maxRetries && Date.now() + 1_500 < deadline - 2_000) {
            await sleep(600 * 2 ** attempt++); continue;
          }
          throw e;
        }
        let r: HttpResult | null = null; let netErr = '';
        try {
          r = await send(`${c.apiUrl}/chat/completions`, {
            method: 'POST', timeoutMs, ca: c.ca, body,
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', 'X-Request-ID': randomUUID() },
          });
        } catch (e) { netErr = (e as Error).message; }

        const retryable = !r || r.status === 429 || r.status >= 500;
        if (r && r.status === 401) {
          // Токен истёк или отозван: одна повторная авторизация за вызов — без циклов
          if (reauthorized) throw new AiError('auth', 'GigaChat 401 после повторной авторизации');
          reauthorized = true; cached = null;
          continue;
        }
        if (retryable) {
          if (attempt < c.maxRetries) {
            const ra = Number(r?.headers['retry-after']);
            const wait = Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 600 * 2 ** attempt + Math.random() * 300, 5_000);
            if (Date.now() + wait < deadline - 2_000) { attempt++; await sleep(wait); continue; }
          }
          if (!r) throw new AiError('unavailable', `GigaChat: ${netErr}`);
          if (r.status === 429) throw new AiError('rate_limit', `GigaChat 429 ${providerMessage(r.body)}`.trim());
          throw new AiError('unavailable', `GigaChat HTTP ${r.status}`);
        }
        if (r!.status === 402) throw new AiError('quota', 'GigaChat 402: закончились токены');
        if (r!.status === 403) throw new AiError('forbidden', `GigaChat 403: нет доступа к модели ${c.model}`);
        if (r!.status === 404) throw new AiError('config', `GigaChat 404: модель ${c.model} или адрес ${c.apiUrl} не найдены — проверьте GIGACHAT_MODEL и GIGACHAT_API_URL`);
        if (r!.status === 413 || r!.status === 422) throw new AiError('refused', `GigaChat ${r!.status}: запрос отклонён ${providerMessage(r!.body)}`.trim());
        if (r!.status !== 200) throw new AiError('unavailable', `GigaChat HTTP ${r!.status}`);
        return parseCompletion(r!.body, !!req.json);
      }
    },
  };
}

export function parseCompletion(raw: string, json: boolean): ChatResult {
  let j: { choices?: { message?: { content?: unknown }; finish_reason?: unknown }[]; model?: unknown };
  try { j = JSON.parse(raw); } catch { throw new AiError('bad_response', 'GigaChat: ответ не JSON'); }
  const ch = Array.isArray(j.choices) ? j.choices[0] : undefined;
  const text = typeof ch?.message?.content === 'string' ? ch.message.content.trim() : '';
  const finish = typeof ch?.finish_reason === 'string' ? ch.finish_reason : null;
  if (finish === 'blacklist') throw new AiError('refused', 'GigaChat: ответ заблокирован фильтром провайдера (blacklist)');
  if (finish === 'length' && json) throw new AiError('bad_response', 'GigaChat: ответ обрезан по max_tokens');
  if (!text) throw new AiError('bad_response', 'GigaChat: пустой ответ');
  return { text, finishReason: finish, model: typeof j.model === 'string' ? j.model : null };
}
