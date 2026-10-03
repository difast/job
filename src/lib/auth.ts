import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from './db';
import { ApiError } from './http';

export const SESSION_COOKIE = 'session';
const TTL_MS = 1000 * 60 * 60 * 24 * 30;

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  await db.session.create({ data: { id: hashToken(token), userId, expiresAt: new Date(Date.now() + TTL_MS) } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: TTL_MS / 1000,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function getUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { id: hashToken(token) }, include: { user: { include: { profession: true } } } });
  if (!s || s.expiresAt < new Date()) return null;
  return s.user;
}

/** Для страниц: редирект на логин/онбординг. */
export async function requirePageUser({ onboarded = true }: { onboarded?: boolean } = {}) {
  const user = await getUser();
  if (!user) redirect('/login');
  if (onboarded && (!user.professionId || !user.level)) redirect('/onboarding');
  return user;
}

/** Для API: 401 вместо редиректа. */
export async function requireApiUser() {
  const user = await getUser();
  if (!user) throw new ApiError(401, 'Необходима авторизация');
  return user;
}
