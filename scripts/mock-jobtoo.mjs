// Тестовая заглушка JobToo: принимает подписанные запросы Clymly (handoff, events) и умеет отвечать
// успехом, ошибкой или ссылкой на чужой домен. Используется в scripts/partner-e2e.mjs и ui-check.
import { createServer } from 'node:http';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function startMockJobToo({ port = 4100, secret }) {
  const state = { mode: 'ok', handoffs: [], events: [], badSignatures: 0 };
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  const valid = (req, body) => {
    const ts = req.headers['x-timestamp'], rid = req.headers['x-request-id'], sig = req.headers['x-signature'];
    if (req.headers['x-partner-id'] !== 'clymly' || !ts || !rid || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
    const exp = Buffer.from(createHmac('sha256', secret).update(`${ts}.${rid}.${sha(body)}`).digest('hex'), 'hex');
    const got = Buffer.from(String(sig), 'hex');
    return exp.length === got.length && timingSafeEqual(exp, got);
  };
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const send = (status, obj, type = 'application/json') => { res.writeHead(status, { 'Content-Type': type }); res.end(type === 'application/json' ? JSON.stringify(obj) : obj); };
    const rid = req.headers['x-request-id'];
    if (req.url === '/api/partner/v1/handoff' && req.method === 'POST') {
      if (!valid(req, body)) { state.badSignatures++; return send(401, { status: 'error', request_id: rid, error: { code: 'invalid_signature', message: 'bad signature' } }); }
      const form = await new Request('http://x', { method: 'POST', headers: { 'content-type': req.headers['content-type'] }, body }).formData();
      const payload = JSON.parse(form.get('payload'));
      state.handoffs.push({ requestId: rid, payload });
      if (state.mode === 'error') return send(422, { status: 'error', request_id: rid, error: { code: 'resume_unreadable', message: 'JobToo: не удалось разобрать резюме' } });
      if (state.mode === 'slow') await new Promise((r) => setTimeout(r, 17_000));
      const url = state.mode === 'foreign' ? 'https://evil.example/login?code=x' : `http://localhost:${port}/sso/clymly?code=mock-${rid}`;
      return send(200, { status: 'ok', request_id: rid, external_user_id: `jt_${payload.clymly_user_id}`, account: 'created', login_url: url, expires_at: new Date(Date.now() + 120_000).toISOString() });
    }
    if (req.url === '/api/partner/v1/events' && req.method === 'POST') {
      if (!valid(req, body)) { state.badSignatures++; return send(401, { status: 'error' }); }
      state.events.push(...JSON.parse(body.toString()).events);
      return send(200, { status: 'ok', request_id: rid, accepted: 1 });
    }
    if (req.url === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (req.url?.startsWith('/sso/clymly')) return send(200, '<!doctype html><title>JobToo</title><h1>JobToo: вы вошли</h1>', 'text/html; charset=utf-8');
    send(404, { status: 'error' });
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ state, close: () => new Promise((r) => server.close(r)) })));
}
