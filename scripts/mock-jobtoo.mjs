// Тестовая заглушка JobToo по их протоколу v1: единый адрес /api/partner.php?op=pull|handoff|events, JSON, подпись HMAC.
// pull — Clymly забирает профиль по коду перехода; handoff — Clymly присылает профиль; events — события Clymly.
import { createServer } from 'node:http';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export function startMockJobToo({ port = 4100, secret }) {
  const state = { mode: 'ok', handoffs: [], events: [], pulls: [], badSignatures: 0, codes: new Map() };
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  const valid = (req, body) => {
    const ts = req.headers['x-timestamp'], rid = req.headers['x-request-id'], sig = req.headers['x-signature'];
    if (req.headers['x-partner-id'] !== 'clymly' || !ts || !rid || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
    const exp = Buffer.from(createHmac('sha256', secret).update(`${ts}.${rid}.${sha(body)}`).digest('hex'), 'hex');
    const got = Buffer.from(String(sig), 'hex');
    return exp.length === got.length && timingSafeEqual(exp, got);
  };
  /** Человек нажал «Перейти в Clymly»: заглушка выдаёт одноразовый код (15 минут) для payload. */
  const issueCode = (payload, { ttlMs = 15 * 60_000, status = 200, error = null } = {}) => {
    const code = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
    state.codes.set(code, { payload, expires: Date.now() + ttlMs, used: false, status, error, handoffRequestId: randomUUID() });
    return code;
  };
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const send = (status, obj, type = 'application/json') => { res.writeHead(status, { 'Content-Type': type }); res.end(type === 'application/json' ? JSON.stringify(obj) : obj); };
    const url = new URL(req.url, 'http://x');
    const rid = req.headers['x-request-id'];
    if (url.pathname === '/api/partner.php' && req.method === 'POST') {
      if (req.headers['content-type'] !== 'application/json') return send(400, { status: 'error', request_id: rid, error: { code: 'invalid_payload', message: 'нужен JSON' } });
      if (!valid(req, body)) { state.badSignatures++; return send(401, { status: 'error', request_id: rid, error: { code: 'invalid_signature', message: 'bad signature' } }); }
      const data = JSON.parse(body.toString());
      const op = url.searchParams.get('op');
      if (op === 'pull') {
        state.pulls.push({ requestId: rid, body: data });
        const c = state.codes.get(data.code);
        if (!data.consent?.accepted_at || !data.consent?.version) return send(403, { status: 'error', request_id: rid, error: { code: 'consent_missing', message: 'нет согласия' } });
        if (!c || c.used || c.expires < Date.now()) return send(410, { status: 'error', request_id: rid, error: { code: 'code_expired', message: 'код просрочен' } });
        c.used = true;
        if (c.status !== 200) return send(c.status, { status: 'error', request_id: rid, error: c.error });
        return send(200, { status: 'ok', request_id: rid, handoff_request_id: c.handoffRequestId, external_user_id: c.payload?.jobtoo_user_id ?? '', payload: c.payload });
      }
      if (op === 'handoff') {
        state.handoffs.push({ requestId: rid, payload: data });
        // Как у JobToo на бою: первый запрос — 503, повтор с тем же X-Request-Id — 409 «ещё обрабатывается»
        if (state.mode === 'busy') { state.busy ??= new Set(); if (state.busy.has(rid)) return send(409, { status: 'error', request_id: rid, error: { code: 'request_in_progress', message: 'Запрос ещё обрабатывается' } }); state.busy.add(rid); return send(503, { status: 'error', request_id: rid, error: { code: 'unavailable', message: 'Service unavailable' } }); }
        if (state.mode === 'error') return send(422, { status: 'error', request_id: rid, error: { code: 'resume_unreadable', message: 'JobToo: не удалось разобрать резюме' } });
        const login = state.mode === 'foreign' ? 'https://evil.example/login?code=x' : `http://localhost:${port}/sso/clymly?code=mock-${rid}`;
        const created = state.mode === 'created';
        return send(200, { status: 'ok', request_id: rid, external_user_id: created ? '' : `jt_${data.clymly_user_id}`, account: created ? 'created' : 'found', login_url: login, expires_at: new Date(Date.now() + 120_000).toISOString() });
      }
      if (op === 'events') { state.events.push(...data.events); return send(200, { status: 'ok', request_id: rid }); }
      return send(400, { status: 'error', request_id: rid, error: { code: 'invalid_payload', message: 'unknown op' } });
    }
    if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (url.pathname.startsWith('/sso/clymly')) return send(200, '<!doctype html><title>JobToo</title><h1>JobToo: вы вошли</h1>', 'text/html; charset=utf-8');
    send(404, { status: 'error' });
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ state, issueCode, handoffRequestId: (code) => state.codes.get(code)?.handoffRequestId, close: () => new Promise((r) => server.close(r)) })));
}
