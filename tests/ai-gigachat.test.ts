// Сетевой слой GigaChat на локальном мок-сервере (НЕ настоящий GigaChat): авторизация, кеш и обновление токена,
// повторы, таймауты, коды 401/403/429/5xx, ошибки формата и отсутствие секретов в ошибках.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createGigaChat, gigaChatConfig, parseCompletion, resetGigaChatToken, type GigaChatConfig } from '../src/lib/ai/providers/gigachat';
import { aiStatus, getAiProvider, selectedProvider } from '../src/lib/ai/provider';
import { AiError } from '../src/lib/ai/errors';

const KEY = 'dGVzdC1jbGllbnQtaWQ6dGVzdC1jbGllbnQtc2VjcmV0'; // вымышленный ключ для тестов
type Handler = (req: IncomingMessage, body: string, res: ServerResponse) => void;
let oauth: Handler, chat: Handler;
const calls = { oauth: 0, chat: 0, last: { oauthHeaders: {} as Record<string, unknown>, oauthBody: '', chatHeaders: {} as Record<string, unknown>, chatBody: '' } };
let base = '';
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (req.url === '/oauth') { calls.oauth++; calls.last.oauthHeaders = req.headers; calls.last.oauthBody = body; return oauth(req, body, res); }
    if (req.url === '/v1/chat/completions') { calls.chat++; calls.last.chatHeaders = req.headers; calls.last.chatBody = body; return chat(req, body, res); }
    res.writeHead(404).end();
  });
});
const json = (res: ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}) => res.writeHead(status, { 'Content-Type': 'application/json', ...headers }).end(JSON.stringify(data));
const okToken = (ttlMs = 30 * 60_000, seconds = false): Handler => (_q, _b, res) => json(res, 200, { access_token: `tok-${calls.oauth}-${'x'.repeat(40)}`, expires_at: seconds ? Math.floor((Date.now() + ttlMs) / 1000) : Date.now() + ttlMs });
const okChat = (content = '{"ok":true}', finish = 'stop'): Handler => (_q, _b, res) => json(res, 200, { choices: [{ message: { role: 'assistant', content }, finish_reason: finish }], model: 'GigaChat-2-Pro:2.0' });

before(async () => { await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r())); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
after(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => { resetGigaChatToken(); calls.oauth = 0; calls.chat = 0; oauth = okToken(); chat = okChat(); });

const cfg = (over: Partial<GigaChatConfig> = {}): GigaChatConfig => ({
  authKey: KEY, scope: 'GIGACHAT_API_PERS', model: 'GigaChat-2-Pro', authUrl: `${base}/oauth`, apiUrl: `${base}/v1`,
  timeoutMs: 5_000, maxRetries: 2, ca: null, structured: false, ...over,
});
const ask = (c = cfg(), json = true) => createGigaChat(c).chat({ system: 'Системные правила', user: 'Данные пользователя', json });
async function rejectsKind(p: Promise<unknown>, kind: string) {
  try { await p; } catch (e) { assert.ok(e instanceof AiError, `ожидалась AiError, получено ${e}`); assert.equal(e.kind, kind, e.diagnostic); return e; }
  assert.fail(`ожидалась ошибка ${kind}`);
}

test('конфигурация: без ключа — понятная диагностика, приложение не падает', () => {
  const r = gigaChatConfig({});
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.problem : '', /GIGACHAT_AUTH_KEY/);
  assert.match((gigaChatConfig({ GIGACHAT_AUTH_KEY: `Basic ${KEY}` }) as { problem: string }).problem, /без слова Basic/);
  assert.match((gigaChatConfig({ GIGACHAT_AUTH_KEY: KEY, GIGACHAT_SCOPE: 'WRONG' }) as { problem: string }).problem, /GIGACHAT_SCOPE/);
  assert.match((gigaChatConfig({ GIGACHAT_AUTH_KEY: KEY, GIGACHAT_CA_CERT: '/nonexistent.pem' }) as { problem: string }).problem, /GIGACHAT_CA_CERT/);
  const ok = gigaChatConfig({ GIGACHAT_AUTH_KEY: KEY });
  assert.ok(ok.ok && ok.config.apiUrl === 'https://api.giga.chat/v1' && ok.config.authUrl === 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth' && ok.config.model === 'GigaChat-2-Pro' && ok.config.scope === 'GIGACHAT_API_PERS');
});

test('выбор провайдера и ошибка «не настроен» без секретов в тексте', () => {
  assert.equal(selectedProvider({}), 'none');
  assert.equal(selectedProvider({ GIGACHAT_AUTH_KEY: KEY }), 'gigachat');
  assert.equal(selectedProvider({ ANTHROPIC_API_KEY: 'k' }), 'anthropic');
  assert.equal(selectedProvider({ AI_PROVIDER: 'none', GIGACHAT_AUTH_KEY: KEY }), 'none');
  assert.throws(() => getAiProvider({ AI_PROVIDER: 'gigachat' }), (e: unknown) => e instanceof AiError && e.kind === 'config' && e.status === 503 && /GIGACHAT_AUTH_KEY/.test(e.diagnostic) && !/GIGACHAT/.test(e.message));
  const st = aiStatus({ AI_PROVIDER: 'gigachat' });
  assert.equal(st.configured, false);
  assert.equal(aiStatus({ GIGACHAT_AUTH_KEY: KEY }).configured, true);
});

test('авторизация: Basic-ключ, RqUID, scope; токен переиспользуется', async () => {
  const r = await ask();
  assert.equal(r.text, '{"ok":true}');
  assert.equal(calls.last.oauthHeaders.authorization, `Basic ${KEY}`);
  assert.match(String(calls.last.oauthHeaders.rquid), /^[0-9a-f-]{36}$/);
  assert.equal(calls.last.oauthBody, 'scope=GIGACHAT_API_PERS');
  assert.match(String(calls.last.chatHeaders.authorization), /^Bearer tok-1-/);
  const body = JSON.parse(calls.last.chatBody);
  assert.equal(body.model, 'GigaChat-2-Pro');
  assert.deepEqual(body.messages.map((m: { role: string }) => m.role), ['system', 'user']);
  assert.equal(body.messages[0].content, 'Системные правила');
  assert.equal(body.stream, false);
  assert.ok(!calls.last.chatBody.includes(KEY), 'ключ авторизации не уходит в запрос генерации');
  await ask(); await ask();
  assert.equal(calls.oauth, 1, 'один токен на несколько запросов');
});

test('токен: expires_at в секундах и миллисекундах; истекающий токен обновляется', async () => {
  oauth = okToken(30 * 60_000, true);
  await ask(); await ask();
  assert.equal(calls.oauth, 1, 'секунды распознаны');
  resetGigaChatToken(); calls.oauth = 0;
  oauth = okToken(30_000); // истекает меньше чем через минуту — обновляем заранее
  await ask(); await ask();
  assert.equal(calls.oauth, 2);
});

test('параллельные запросы ждут одну авторизацию', async () => {
  await Promise.all([ask(), ask(), ask()]);
  assert.equal(calls.oauth, 1);
});

test('401 на генерации: одна повторная авторизация, без бесконечного цикла', async () => {
  let n = 0;
  chat = (q, b, res) => (n++ === 0 ? json(res, 401, { message: 'Token has expired' }) : okChat()(q, b, res));
  assert.equal((await ask()).text, '{"ok":true}');
  assert.equal(calls.oauth, 2);
  resetGigaChatToken(); calls.oauth = 0; calls.chat = 0;
  chat = (_q, _b, res) => json(res, 401, { message: 'Unauthorized' });
  await rejectsKind(ask(), 'auth');
  assert.equal(calls.oauth, 2, 'повторная авторизация ровно одна');
  assert.equal(calls.chat, 2);
});

test('ошибки авторизации: 401 — неверный ключ, 400 — scope; ключ не попадает в сообщения', async () => {
  oauth = (_q, _b, res) => json(res, 401, { message: 'Unauthorized' });
  const e = await rejectsKind(ask(), 'auth');
  assert.ok(!e.message.includes(KEY) && !e.diagnostic.includes(KEY));
  assert.match(e.diagnostic, /GIGACHAT_AUTH_KEY/);
  assert.equal(e.status, 503);
  assert.ok(!/GigaChat|401|OAuth/.test(e.message), 'пользователю — без технических подробностей');
  oauth = (_q, _b, res) => json(res, 400, { message: 'scope is invalid' });
  await rejectsKind(ask(), 'config');
  assert.equal(calls.chat, 0);
});

test('429: повтор с Retry-After, затем ошибка лимита после ограниченного числа попыток', async () => {
  let n = 0;
  chat = (q, b, res) => (n++ < 1 ? json(res, 429, { message: 'Too many requests' }, { 'Retry-After': '1' }) : okChat()(q, b, res));
  assert.equal((await ask()).text, '{"ok":true}');
  calls.chat = 0;
  chat = (_q, _b, res) => json(res, 429, {});
  const e = await rejectsKind(ask(cfg({ maxRetries: 2 })), 'rate_limit');
  assert.equal(calls.chat, 3, '1 попытка + 2 повтора');
  assert.equal(e.status, 429);
});

test('5xx и сетевые ошибки: ограниченные повторы, затем «недоступен»', async () => {
  let n = 0;
  chat = (q, b, res) => (n++ < 2 ? json(res, 503, {}) : okChat()(q, b, res));
  assert.equal((await ask()).text, '{"ok":true}');
  calls.chat = 0;
  chat = (_q, _b, res) => json(res, 500, {});
  await rejectsKind(ask(cfg({ maxRetries: 1 })), 'unavailable');
  assert.equal(calls.chat, 2);
  await rejectsKind(ask(cfg({ apiUrl: 'http://127.0.0.1:1/v1', maxRetries: 1 })), 'unavailable');
  await rejectsKind(ask(cfg({ authUrl: 'http://127.0.0.1:1/oauth', maxRetries: 0 })), 'unavailable');
});

test('таймаут: зависший сервер не держит запрос бесконечно', async () => {
  chat = () => { /* не отвечаем */ };
  const t = Date.now();
  await rejectsKind(ask(cfg({ timeoutMs: 800, maxRetries: 0 })), 'unavailable');
  assert.ok(Date.now() - t < 5_000);
});

test('коды 402/403/404/422 и формат ответа', async () => {
  chat = (_q, _b, res) => json(res, 402, {}); await rejectsKind(ask(), 'quota');
  chat = (_q, _b, res) => json(res, 403, {}); await rejectsKind(ask(), 'forbidden');
  chat = (_q, _b, res) => json(res, 404, {}); assert.match((await rejectsKind(ask(), 'config')).diagnostic, /GIGACHAT_MODEL/);
  chat = (_q, _b, res) => json(res, 422, { message: 'bad' }); await rejectsKind(ask(), 'refused');
  chat = (_q, _b, res) => res.writeHead(200).end('<html>не JSON</html>'); await rejectsKind(ask(), 'bad_response');
  chat = (_q, _b, res) => json(res, 200, { choices: [] }); await rejectsKind(ask(), 'bad_response');
  chat = okChat('частичный {"a":', 'length'); await rejectsKind(ask(), 'bad_response');
  chat = okChat('Не могу ответить', 'blacklist'); await rejectsKind(ask(), 'refused');
  assert.equal(parseCompletion(JSON.stringify({ choices: [{ message: { content: ' текст ' }, finish_reason: 'length' }] }), false).text, 'текст');
});

test('структурированный вывод передаётся только при GIGACHAT_STRUCTURED_OUTPUT', async () => {
  await createGigaChat(cfg()).chat({ system: 's', user: 'u', json: true, jsonSchema: { type: 'object' } });
  assert.equal(JSON.parse(calls.last.chatBody).response_format, undefined);
  await createGigaChat(cfg({ structured: true })).chat({ system: 's', user: 'u', json: true, jsonSchema: { type: 'object' } });
  assert.deepEqual(JSON.parse(calls.last.chatBody).response_format, { type: 'json_schema', schema: { type: 'object' } });
});
