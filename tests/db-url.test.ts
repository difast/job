import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error — .mjs без типов
import { normalizeDbUrl } from '../scripts/db-url.mjs';

const ENC = 'postgresql://gen_user:zUtaa%3Fm.1%40%7Dtqy@31554316da12ce153e1bdd37.twc1.net:5432/default_db?sslmode=require';

test('DATABASE_URL: раскодированный пароль (как сохраняет Timeweb) кодируется', () => {
  assert.equal(normalizeDbUrl('postgresql://gen_user:zUtaa?m.1@}tqy@31554316da12ce153e1bdd37.twc1.net:5432/default_db?sslmode=require'), ENC);
});
test('DATABASE_URL: уже закодированная строка не меняется', () => {
  assert.equal(normalizeDbUrl(ENC), ENC);
});
test('DATABASE_URL: простой пароль и другие формы не меняются', () => {
  const simple = 'postgresql://gen_user:Abc123@host:5432/db?sslmode=require';
  assert.equal(normalizeDbUrl(simple), simple);
  assert.equal(normalizeDbUrl('postgres://u:p%25x@h/db'), 'postgres://u:p%25x@h/db');
  assert.equal(normalizeDbUrl(''), '');
});
