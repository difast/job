// Одноразовые коды из письма для действий в настройках: смена пароля и удаление аккаунта.
// 6 цифр, 15 минут, 5 попыток ввода, новый код отменяет прежний. В БД — только sha256 (с id пользователя и временем выдачи).
import { createHash, randomInt } from 'node:crypto';
import { db } from './db';
import { ApiError } from './http';
import { allow } from './partners/ratelimit';
import { CODE_TTL_MIN, sendCode, type CodePurpose } from './emails';

export const CODE_MAX_ATTEMPTS = 5;
const kind = (p: CodePurpose) => `code-${p}`;
const hash = (userId: string, purpose: CodePurpose, code: string, at: Date) => createHash('sha256').update(`${kind(purpose)}:${userId}:${at.getTime()}:${code}`).digest('hex');

/** Выдаёт новый код и отправляет письмо. Ограничения: раз в 60 секунд и не больше 5 в час. */
export async function issueCode(user: { id: string; name: string; email: string }, purpose: CodePurpose) {
  if (!allow(`code:${purpose}:${user.id}`, 1, 60_000)) throw new ApiError(429, 'Код уже отправлен. Новый можно запросить через минуту.');
  if (!allow(`code-hour:${user.id}`, 5, 60 * 60_000)) throw new ApiError(429, 'Слишком много запросов кода. Попробуйте через час.');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const at = new Date();
  await db.$transaction([
    db.emailToken.updateMany({ where: { userId: user.id, purpose: kind(purpose), usedAt: null }, data: { usedAt: at } }),
    db.emailToken.create({ data: { userId: user.id, purpose: kind(purpose), email: user.email, tokenHash: hash(user.id, purpose, code, at), createdAt: at, expiresAt: new Date(at.getTime() + CODE_TTL_MIN * 60_000) } }),
  ]);
  if (!(await sendCode(user, code, purpose))) throw new ApiError(503, 'Не удалось отправить письмо с кодом. Попробуйте позже.');
}

/** Проверяет и гасит код. Ошибки — понятным текстом для пользователя. */
export async function consumeCode(user: { id: string; email: string }, purpose: CodePurpose, code: unknown) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) throw new ApiError(400, 'Введите 6 цифр из письма');
  const row = await db.emailToken.findFirst({ where: { userId: user.id, purpose: kind(purpose), usedAt: null }, orderBy: { createdAt: 'desc' } });
  if (!row || row.email !== user.email || row.expiresAt < new Date() || row.attempts >= CODE_MAX_ATTEMPTS) throw new ApiError(400, 'Код устарел. Запросите новый.');
  if (row.tokenHash !== hash(user.id, purpose, code.trim(), row.createdAt)) {
    const upd = await db.emailToken.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    const left = CODE_MAX_ATTEMPTS - upd.attempts;
    throw new ApiError(400, left > 0 ? `Неверный код. Осталось попыток: ${left}.` : 'Неверный код. Попытки закончились — запросите новый.');
  }
  const claimed = await db.emailToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (!claimed.count) throw new ApiError(400, 'Код уже использован. Запросите новый.');
}
