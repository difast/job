import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error — .mjs без типов
import { normalizeDbUrl } from '../scripts/db-url.mjs';

// Вымышленные данные с теми же спецсимволами, что бывают в паролях Timeweb
const ENC = 'postgresql://app_user:Pa%3Fss.1%40%7Dword@db.example.com:5432/app_db?sslmode=require';

test('DATABASE_URL: раскодированный пароль (как сохраняет Timeweb) кодируется', () => {
  assert.equal(normalizeDbUrl('postgresql://app_user:Pa?ss.1@}word@db.example.com:5432/app_db?sslmode=require'), ENC);
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
