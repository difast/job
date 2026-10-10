// Нормализует DATABASE_URL: если пароль вставлен без URL-кодирования (Timeweb раскодирует значения переменных),
// кодирует логин и пароль. Хост не может содержать «@», поэтому разделителем учётных данных считается последний «@».
// Уже закодированная строка не меняется. Печатает результат в stdout (используется в start:prod).
export function normalizeDbUrl(raw) {
  const m = /^(postgres(?:ql)?:\/\/)(.*)$/i.exec((raw ?? '').trim());
  if (!m) return raw;
  const [, scheme, rest] = m;
  const at = rest.lastIndexOf('@');
  if (at < 0) return raw;
  const creds = rest.slice(0, at), tail = rest.slice(at + 1);
  const colon = creds.indexOf(':');
  const enc = (s) => { try { return encodeURIComponent(decodeURIComponent(s)); } catch { return encodeURIComponent(s); } };
  const user = colon < 0 ? creds : creds.slice(0, colon);
  const pass = colon < 0 ? null : creds.slice(colon + 1);
  return `${scheme}${enc(user)}${pass === null ? '' : ':' + enc(pass)}@${tail}`;
}

if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(normalizeDbUrl(process.env.DATABASE_URL ?? ''));
