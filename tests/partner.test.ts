import { test } from 'node:test';
import assert from 'node:assert/strict';

test('подпись запросов партнёра: верная проходит, любые искажения отклоняются', async () => {
  const { sign, verify } = await import('../src/lib/partners/signing');
  const body = Buffer.from('{"a":1}');
  const now = Date.now();
  const ts = String(Math.floor(now / 1000));
  const rid = '3f2a1c9e-1111-4222-8333-444455556666';
  const sig = sign('s3cret', ts, rid, body);
  const h = { partnerId: 'jobtoo', requestId: rid, timestamp: ts, signature: sig };
  assert.equal(verify('s3cret', h, 'jobtoo', body, now).ok, true);
  assert.equal(verify('other', h, 'jobtoo', body, now).ok, false, 'чужой секрет');
  assert.equal(verify('s3cret', h, 'jobtoo', Buffer.from('{"a":2}'), now).ok, false, 'изменённое тело');
  assert.equal(verify('s3cret', { ...h, partnerId: 'x' }, 'jobtoo', body, now).ok, false, 'чужой партнёр');
  assert.equal(verify('s3cret', h, 'jobtoo', body, now + 301_000).ok, false, 'устаревшая метка времени');
  assert.equal(verify('s3cret', { ...h, signature: sig.slice(0, -2) + '00' }, 'jobtoo', body, now).ok, false, 'подделанная подпись');
  assert.equal(verify('', h, 'jobtoo', body, now).ok, false, 'секрет не задан');
  assert.equal(verify('s3cret', { ...h, requestId: 'bad id!' }, 'jobtoo', body, now).ok, false, 'неверный request_id');
});

test('ссылка входа от JobToo: только домен партнёра и https', async () => {
  process.env.JOBTOO_API_URL = 'https://jobtoo.example/api/partner.php';
  process.env.JOBTOO_LOGIN_ORIGIN = 'https://jobtoo.example';
  const { isPartnerLoginUrl, jobtoo } = await import('../src/lib/partners/config');
  assert.equal(jobtoo.endpoint('pull'), 'https://jobtoo.example/api/partner.php?op=pull', 'адрес операции API JobToo');
  assert.equal(isPartnerLoginUrl('https://jobtoo.example/sso/clymly?code=abc'), true);
  assert.equal(isPartnerLoginUrl('http://jobtoo.example/sso/clymly?code=abc'), false, 'http');
  assert.equal(isPartnerLoginUrl('https://jobtoo.example.evil.com/sso'), false, 'похожий домен');
  assert.equal(isPartnerLoginUrl('https://user:pass@jobtoo.example/sso'), false, 'учётные данные в URL');
  assert.equal(isPartnerLoginUrl('javascript:alert(1)'), false);
  assert.equal(isPartnerLoginUrl(undefined), false);
  process.env.JOBTOO_LOGIN_ORIGIN = 'http://localhost:4100';
  assert.equal(isPartnerLoginUrl('http://localhost:4100/sso/clymly?code=1'), true, 'http разрешён только для localhost');
});

test('лимит частоты запросов', async () => {
  const { allow } = await import('../src/lib/partners/ratelimit');
  const t = 1_000_000;
  for (let i = 0; i < 3; i++) assert.equal(allow('k', 3, 60_000, t + i), true);
  assert.equal(allow('k', 3, 60_000, t + 10), false);
  assert.equal(allow('k', 3, 60_000, t + 61_000), true, 'окно сдвинулось');
});
