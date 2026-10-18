// Имитатор API ЮKassa v3 для тестов (НЕ настоящая ЮKassa). Clymly обращается к нему через YOOKASSA_API_URL.
// Управление из теста: POST /__pay/:id {save, card, outcome}, POST /__refund/:id, POST /__card/:method {behavior},
// POST /__tamper/:id {value}, GET /__requests, GET /__payments.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

export function startMockYooKassa({ port = 4300, shopId = 'test-shop', secretKey = 'test-secret' } = {}) {
  const state = { payments: new Map(), byKey: new Map(), refunds: new Map(), cards: new Map(), requests: [] };
  const auth = 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64');
  const pub = (p) => JSON.parse(JSON.stringify(p));
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const send = (s, d) => res.writeHead(s, { 'Content-Type': 'application/json' }).end(JSON.stringify(d));
      const url = new URL(req.url, 'http://x');
      const data = body ? JSON.parse(body) : {};
      // ── управление ──
      let m;
      if ((m = url.pathname.match(/^\/__pay\/(.+)$/))) {
        const p = state.payments.get(m[1]); if (!p) return send(404, {});
        if (data.outcome === 'canceled') { p.status = 'canceled'; p.cancellation_details = { party: 'payment_network', reason: data.reason ?? 'insufficient_funds' }; return send(200, pub(p)); }
        p.payment_method = { type: 'bank_card', id: data.method ?? `pm-${randomUUID().slice(0, 8)}`, saved: !!data.save, card: { card_type: data.card?.type ?? 'MasterCard', last4: data.card?.last4 ?? '4444' } };
        p.status = p.capture ? 'succeeded' : 'waiting_for_capture'; p.paid = true;
        return send(200, pub(p));
      }
      if ((m = url.pathname.match(/^\/__refund\/(.+)$/))) {
        const p = state.payments.get(m[1]); if (!p) return send(404, {});
        const r = { id: `rf-${randomUUID()}`, payment_id: p.id, status: 'succeeded', amount: data.amount ?? p.amount };
        state.refunds.set(r.id, r); return send(200, r);
      }
      if ((m = url.pathname.match(/^\/__card\/(.+)$/))) { state.cards.set(m[1], data.behavior); return send(200, {}); }
      if ((m = url.pathname.match(/^\/__tamper\/(.+)$/))) { const p = state.payments.get(m[1]); p.amount.value = data.value; return send(200, pub(p)); }
      if (url.pathname === '/__requests') return send(200, state.requests);
      if (url.pathname === '/__payments') return send(200, [...state.payments.values()]);
      // ── API ──
      if (req.headers.authorization !== auth) return send(401, { type: 'error', code: 'invalid_credentials' });
      state.requests.push({ method: req.method, path: url.pathname, key: req.headers['idempotence-key'] ?? null, body: data });
      if (req.method === 'POST' && url.pathname === '/v3/payments') {
        const key = req.headers['idempotence-key'];
        if (!key) return send(400, { type: 'error', code: 'invalid_request' });
        if (state.byKey.has(key)) return send(200, pub(state.payments.get(state.byKey.get(key))));
        const id = `yk-${randomUUID()}`;
        const p = { id, status: 'pending', paid: false, amount: data.amount, capture: data.capture !== false, description: data.description, metadata: data.metadata, created_at: new Date().toISOString() };
        if (data.confirmation) p.confirmation = { type: 'redirect', confirmation_url: `http://localhost:${port}/checkout/${id}`, return_url: data.confirmation.return_url };
        if (data.payment_method_id) {
          const b = state.cards.get(data.payment_method_id) ?? 'ok';
          p.payment_method = { type: 'bank_card', id: data.payment_method_id, saved: true, card: { card_type: 'MasterCard', last4: '4444' } };
          if (b === 'ok') { p.status = 'succeeded'; p.paid = true; }
          else if (b !== 'pending') { p.status = 'canceled'; p.cancellation_details = { party: 'payment_network', reason: b === 'decline' ? 'insufficient_funds' : b }; }
        }
        state.payments.set(id, p); state.byKey.set(key, id);
        return send(200, pub(p));
      }
      if ((m = url.pathname.match(/^\/v3\/payments\/([^/]+)\/cancel$/)) && req.method === 'POST') {
        const p = state.payments.get(m[1]); if (!p) return send(404, { type: 'error', code: 'not_found' });
        if (p.status === 'waiting_for_capture' || p.status === 'pending') { p.status = 'canceled'; p.cancellation_details = { party: 'merchant', reason: 'canceled_by_merchant' }; p.canceledByMerchant = true; }
        return send(200, pub(p));
      }
      if ((m = url.pathname.match(/^\/v3\/payments\/([^/]+)$/))) { const p = state.payments.get(m[1]); return p ? send(200, pub(p)) : send(404, { type: 'error', code: 'not_found' }); }
      if ((m = url.pathname.match(/^\/v3\/refunds\/([^/]+)$/))) { const r = state.refunds.get(m[1]); return r ? send(200, r) : send(404, { type: 'error', code: 'not_found' }); }
      send(404, { type: 'error', code: 'not_found' });
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ state, close: () => new Promise((r) => server.close(r)) })));
}
