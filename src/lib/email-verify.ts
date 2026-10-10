// Подтверждение e-mail: одноразовая ссылка из письма (24 часа, в БД только хеш).
import { createHash, randomBytes } from 'node:crypto';
import { db } from './db';
import { SITE_URL } from './brand';
import { layout, mailEnabled, sendMail } from './mail';

export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const hash = (t: string) => createHash('sha256').update(t).digest('hex');

export { mailEnabled };

/** Создаёт ссылку и отправляет письмо. Ошибка отправки не ломает регистрацию — её можно повторить из кабинета. */
export async function sendVerification(user: { id: string; email: string; name: string }): Promise<{ sent: boolean; error?: string }> {
  const token = randomBytes(32).toString('base64url');
  await db.emailToken.create({ data: { userId: user.id, tokenHash: hash(token), purpose: 'verify', email: user.email, expiresAt: new Date(Date.now() + VERIFY_TTL_MS) } });
  const url = `${SITE_URL.replace(/\/$/, '')}/verify-email?token=${token}`;
  const { html, text } = layout({
    title: 'Подтвердите e-mail',
    intro: `${user.name.split(' ')[0]}, подтвердите, что адрес ${user.email} принадлежит вам. Это защищает аккаунт и позволяет связывать его с сервисами-партнёрами без пароля.`,
    button: 'Подтвердить e-mail', url,
    outro: 'Ссылка действует 24 часа. Если вы не регистрировались в Clymly, просто проигнорируйте письмо.',
  });
  try {
    return await sendMail({ to: user.email, subject: 'Подтвердите e-mail в Clymly', html, text });
  } catch (e) {
    console.error('[mail] verification send failed', (e as Error).message);
    return { sent: false, error: 'Не удалось отправить письмо. Попробуйте позже.' };
  }
}

export type VerifyResult = 'verified' | 'already' | 'expired' | 'invalid';

/** Подтверждает e-mail по токену. Повторное открытие ссылки (например, почтовым сканером) не считается ошибкой. */
export async function verifyToken(token: string | null | undefined): Promise<{ result: VerifyResult; userId?: string }> {
  if (!token || token.length < 20 || token.length > 200) return { result: 'invalid' };
  const row = await db.emailToken.findUnique({ where: { tokenHash: hash(token) }, include: { user: true } });
  if (!row || row.purpose !== 'verify') return { result: 'invalid' };
  // адрес мог измениться после отправки письма
  if (row.user.email !== row.email) return { result: 'invalid' };
  if (row.user.emailVerifiedAt) return { result: 'already', userId: row.userId };
  if (row.usedAt || row.expiresAt < new Date()) return { result: 'expired', userId: row.userId };
  const upd = await db.emailToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (!upd.count) return { result: 'already', userId: row.userId };
  await db.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } });
  return { result: 'verified', userId: row.userId };
}
