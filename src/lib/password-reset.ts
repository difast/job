// Восстановление пароля по одноразовой ссылке из письма (60 минут, в БД только хеш токена).
import { createHash, randomBytes } from 'node:crypto';
import { db } from './db';
import { SITE_URL } from './brand';
import { hashPassword } from './auth';
import { RESET_TTL_MIN, sendPasswordChanged, sendPasswordReset } from './emails';

const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const validShape = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{30,100}$/.test(t);

/** Отправляет ссылку, если аккаунт существует. Ответ вызывающему одинаков в обоих случаях. */
export async function requestReset(email: string) {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return;
  // Прежние неиспользованные ссылки больше не действуют
  await db.emailToken.updateMany({ where: { userId: user.id, purpose: 'reset', usedAt: null }, data: { usedAt: new Date() } });
  const token = randomBytes(32).toString('base64url');
  await db.emailToken.create({ data: { userId: user.id, tokenHash: hash(token), purpose: 'reset', email: user.email, expiresAt: new Date(Date.now() + RESET_TTL_MIN * 60_000) } });
  await sendPasswordReset(user, `${SITE_URL.replace(/\/$/, '')}/reset-password?token=${token}`);
}

type Row = NonNullable<Awaited<ReturnType<typeof findRow>>>;
const findRow = (token: string) => db.emailToken.findUnique({ where: { tokenHash: hash(token) }, include: { user: true } });

/** Проверка ссылки без её использования (открытие страницы почтовым сканером не тратит ссылку). */
export async function checkResetToken(token: unknown): Promise<'ok' | 'expired' | 'invalid'> {
  if (!validShape(token)) return 'invalid';
  const row = await findRow(token);
  return state(row);
}

function state(row: Row | null): 'ok' | 'expired' | 'invalid' {
  if (!row || row.purpose !== 'reset' || row.user.email !== row.email) return 'invalid';
  if (row.usedAt || row.expiresAt < new Date()) return 'expired';
  return 'ok';
}

/** Задаёт новый пароль: ссылка используется один раз, все сеансы завершаются, адрес считается подтверждённым. */
export async function resetPassword(token: unknown, password: string): Promise<{ ok: true; userId: string } | { ok: false; reason: 'expired' | 'invalid' }> {
  if (!validShape(token)) return { ok: false, reason: 'invalid' };
  const row = await findRow(token);
  const st = state(row);
  if (st !== 'ok' || !row) return { ok: false, reason: st === 'ok' ? 'invalid' : st };
  const claimed = await db.emailToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (!claimed.count) return { ok: false, reason: 'expired' };
  await db.$transaction([
    db.user.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(password), hasPassword: true, ...(row.user.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }) } }),
    db.session.deleteMany({ where: { userId: row.userId } }),
    db.emailToken.updateMany({ where: { userId: row.userId, purpose: 'reset', usedAt: null }, data: { usedAt: new Date() } }),
  ]);
  void sendPasswordChanged(row.user, 'reset');
  return { ok: true, userId: row.userId };
}
