// Одноразовые коды входа и привязки. В БД — только sha256 кода.
import { randomBytes } from 'node:crypto';
import { db } from '../db';
import { PARTNER } from './config';
import { sha256Hex } from './signing';

export type CodePurpose = 'login' | 'link' | 'link_ticket';

export async function issueCode(purpose: CodePurpose, ttlMs: number, data: { userId?: string | null; importId?: string | null; requestId: string; next?: string | null }) {
  const code = randomBytes(32).toString('base64url');
  await db.partnerLoginCode.create({
    data: { codeHash: sha256Hex(code), partner: PARTNER, purpose, userId: data.userId ?? null, importId: data.importId ?? null, requestId: data.requestId, next: data.next ?? null, expiresAt: new Date(Date.now() + ttlMs) },
  });
  return code;
}

export type ConsumeResult =
  | { ok: true; code: Awaited<ReturnType<typeof db.partnerLoginCode.findUnique>> & {} }
  | { ok: false; reason: 'expired' | 'reused' | 'invalid'; requestId?: string };

/** Погашает код атомарно: второй запрос с тем же кодом получит reused. */
export async function consumeCode(code: string | null | undefined, purpose: CodePurpose): Promise<ConsumeResult> {
  if (!code || code.length < 20 || code.length > 200) return { ok: false, reason: 'invalid' };
  const codeHash = sha256Hex(code);
  const upd = await db.partnerLoginCode.updateMany({ where: { codeHash, purpose, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
  const row = await db.partnerLoginCode.findUnique({ where: { codeHash } });
  if (upd.count === 1 && row) return { ok: true, code: row };
  if (!row || row.purpose !== purpose) return { ok: false, reason: 'invalid' };
  return { ok: false, reason: row.usedAt ? 'reused' : 'expired', requestId: row.requestId };
}

/** Проверяет код без погашения (для показа страницы привязки). */
export async function peekCode(code: string | null | undefined, purpose: CodePurpose) {
  if (!code) return null;
  const row = await db.partnerLoginCode.findUnique({ where: { codeHash: sha256Hex(code) } });
  return row && row.purpose === purpose && !row.usedAt && row.expiresAt > new Date() ? row : null;
}
