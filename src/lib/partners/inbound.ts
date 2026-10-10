// Приём данных от JobToo: POST /api/partner/v1/handoff
import { randomBytes } from 'node:crypto';
import { after } from 'next/server';
import { z } from 'zod';
import { db } from '../db';
import { hashPassword } from '../auth';
import { ApiError } from '../http';
import { extractResumeText, MAX_FILE_BYTES } from '../extract';
import { LEVELS } from '../types';
import { LOGIN_CODE_TTL_MS, PARTNER, jobtoo, siteOrigin } from './config';
import { verify } from './signing';
import { allow } from './ratelimit';
import { issueCode } from './codes';
import { applyImport, type ImportPayload } from './imports';
import { enqueuePartnerEvent, flushOutbox, track } from './events';

export type ErrorCode = 'invalid_payload' | 'invalid_signature' | 'consent_missing' | 'duplicate_request' | 'file_too_large' | 'unsupported_file' | 'resume_unreadable' | 'rate_limited' | 'unavailable';
const STATUS: Record<ErrorCode, number> = { invalid_payload: 400, invalid_signature: 401, consent_missing: 403, duplicate_request: 409, file_too_large: 413, unsupported_file: 415, resume_unreadable: 422, rate_limited: 429, unavailable: 503 };

export class PartnerError extends Error {
  constructor(public code: ErrorCode, message: string, public retryAfter?: number) { super(message); }
}

export function errorResponse(requestId: string | null, e: PartnerError) {
  return Response.json({ status: 'error', request_id: requestId, error: { code: e.code, message: e.message }, ...(e.retryAfter ? { retry_after: e.retryAfter } : {}) }, { status: STATUS[e.code] });
}

const str = (max: number) => z.string().trim().min(1).max(max);
const payloadSchema = z.object({
  source: z.literal('jobtoo'),
  jobtoo_user_id: str(100),
  clymly_user_id: z.string().max(100).optional().nullable(),
  email: z.string().trim().toLowerCase().email().max(200),
  email_verified: z.boolean(),
  name: str(80),
  phone: z.string().max(40).optional().nullable(), // не сохраняем: Clymly телефон не использует
  target_position: str(120),
  experience_level: z.enum(LEVELS as [string, ...string[]]).optional().nullable(),
  skills: z.array(z.string().max(80)).max(100).optional().nullable(),
  resume_id: str(100),
  resume_text: z.string().max(30_000).optional().nullable(),
  vacancy: z.object({
    id: z.string().max(100).optional().nullable(), title: z.string().max(200).optional().nullable(), company: z.string().max(200).optional().nullable(),
    description: z.string().max(20_000).optional().nullable(), url: z.string().max(500).optional().nullable(),
  }).optional().nullable(),
  consent: z.object({ accepted_at: z.string().min(10).max(40), version: str(40) }),
  utm: z.object({ placement: z.string().max(40).optional().nullable(), platform: z.string().max(20).optional().nullable() }).optional().nullable(),
});

const fieldList = (p: Record<string, unknown>, hasFile: boolean) => [...Object.keys(p).filter((k) => p[k] !== undefined && p[k] !== null && k !== 'source'), ...(hasFile ? ['resume_file'] : [])];

/** vacancy.url принимаем только на домене JobToo. */
function safeVacancyUrl(u: string | null | undefined) {
  if (!u) return null;
  try { return new URL(u).origin === jobtoo.loginOrigin() ? u : null; } catch { return null; }
}

export async function handleInboundHandoff(req: Request): Promise<Response> {
  const started = Date.now();
  const requestIdHeader = req.headers.get('x-request-id');
  if (!jobtoo.inboundReady()) return errorResponse(requestIdHeader, new PartnerError('unavailable', 'Интеграция временно недоступна', 300));
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_FILE_BYTES + 200_000) return errorResponse(requestIdHeader, new PartnerError('file_too_large', 'Файл больше 5 МБ'));
  const raw = Buffer.from(await req.arrayBuffer());
  if (raw.length > MAX_FILE_BYTES + 200_000) return errorResponse(requestIdHeader, new PartnerError('file_too_large', 'Файл больше 5 МБ'));

  const v = verify(jobtoo.inboundSecret(), {
    partnerId: req.headers.get('x-partner-id'), requestId: requestIdHeader, timestamp: req.headers.get('x-timestamp'), signature: req.headers.get('x-signature'),
  }, PARTNER, raw);
  if (!v.ok) {
    await track({ direction: 'in', event: 'handoff_rejected', errorCode: 'invalid_signature' });
    return errorResponse(requestIdHeader, new PartnerError('invalid_signature', v.message));
  }
  const requestId = v.requestId;
  if (!allow(`in:${PARTNER}`, 100)) return errorResponse(requestId, new PartnerError('rate_limited', 'Слишком много запросов', 30));

  // Идемпотентность: тот же request_id → тот же результат (ссылка входа — новая, она одноразовая)
  const prev = await db.partnerHandoff.findUnique({ where: { partner_direction_requestId: { partner: PARTNER, direction: 'in', requestId } } });
  if (prev) {
    if (prev.status === 'processing') return errorResponse(requestId, new PartnerError('duplicate_request', 'Запрос ещё обрабатывается', 5));
    if (prev.status === 'error' || !prev.result) return errorResponse(requestId, new PartnerError((prev.errorCode as ErrorCode) ?? 'invalid_payload', 'Запрос уже был отклонён'));
    return reissue(prev.id, requestId, JSON.parse(prev.result));
  }

  let handoffId: string | null = null;
  const fail = async (e: PartnerError, extra: { externalUserId?: string } = {}) => {
    if (handoffId) await db.partnerHandoff.update({ where: { id: handoffId }, data: { status: 'error', errorCode: e.code, durationMs: Date.now() - started } });
    await track({ direction: 'in', event: 'handoff_rejected', requestId, partnerUserId: extra.externalUserId ?? null, errorCode: e.code });
    return errorResponse(requestId, e);
  };

  try {
    const form = await new Request('http://local', { method: 'POST', headers: { 'content-type': req.headers.get('content-type') ?? '' }, body: raw }).formData().catch(() => null);
    const rawPayload = form?.get('payload');
    if (typeof rawPayload !== 'string') return fail(new PartnerError('invalid_payload', 'Нет поля payload (JSON)'));
    let json: unknown;
    try { json = JSON.parse(rawPayload); } catch { return fail(new PartnerError('invalid_payload', 'payload — некорректный JSON')); }
    if (json && typeof json === 'object' && !('consent' in json)) return fail(new PartnerError('consent_missing', 'Нет согласия пользователя на передачу данных'));
    const parsed = payloadSchema.safeParse(json);
    if (!parsed.success) return fail(new PartnerError('invalid_payload', 'Некорректные поля: ' + parsed.error.issues.map((i) => i.path.join('.') || i.message).slice(0, 5).join(', ')));
    const p = parsed.data;
    const file = form?.get('resume_file');
    const hasFile = file instanceof File && file.size > 0;

    await track({ direction: 'in', event: 'handoff_received', requestId, partnerUserId: p.jobtoo_user_id, placement: p.utm?.placement, platform: p.utm?.platform });
    if (!allow(`in:${PARTNER}:user:${p.jobtoo_user_id}`, 10)) return fail(new PartnerError('rate_limited', 'Слишком много запросов для этого пользователя', 60), { externalUserId: p.jobtoo_user_id });

    const h = await db.partnerHandoff.create({ data: {
      partner: PARTNER, direction: 'in', requestId, externalUserId: p.jobtoo_user_id, status: 'processing',
      fields: JSON.stringify(fieldList(p, hasFile)), placement: p.utm?.placement?.slice(0, 40), platform: p.utm?.platform?.slice(0, 20),
    } }).catch(() => null);
    if (!h) return errorResponse(requestId, new PartnerError('duplicate_request', 'Запрос ещё обрабатывается', 5));
    handoffId = h.id;

    // Резюме: файл приоритетнее текста
    let resume: ImportPayload['resume'] = null;
    if (hasFile) {
      const f = file as File;
      if (f.size > MAX_FILE_BYTES) return fail(new PartnerError('file_too_large', 'Файл больше 5 МБ'), { externalUserId: p.jobtoo_user_id });
      if (!/\.(pdf|docx|txt)$/i.test(f.name)) return fail(new PartnerError('unsupported_file', 'Поддерживаются PDF, DOCX и TXT'), { externalUserId: p.jobtoo_user_id });
      try {
        resume = { fileName: f.name.slice(0, 200), text: await extractResumeText(f.name, Buffer.from(await f.arrayBuffer())) };
      } catch (e) {
        const code: ErrorCode = e instanceof ApiError && e.status === 413 ? 'file_too_large' : e instanceof ApiError && e.status === 400 ? 'unsupported_file' : 'resume_unreadable';
        return fail(new PartnerError(code, e instanceof ApiError ? e.message : 'Не удалось прочитать файл'), { externalUserId: p.jobtoo_user_id });
      }
    } else if (p.resume_text && p.resume_text.trim().length >= 80) {
      resume = { fileName: 'Резюме из JobToo.txt', text: p.resume_text.trim() };
    } else if (p.resume_text) {
      return fail(new PartnerError('resume_unreadable', 'В резюме слишком мало текста'), { externalUserId: p.jobtoo_user_id });
    } else {
      return fail(new PartnerError('invalid_payload', 'Нужен resume_file или resume_text'), { externalUserId: p.jobtoo_user_id });
    }

    const importPayload: ImportPayload = {
      externalUserId: p.jobtoo_user_id, email: p.email, emailVerified: p.email_verified, name: p.name, targetPosition: p.target_position, level: (p.experience_level as ImportPayload['level']) ?? null, resume,
      vacancy: p.vacancy?.description ? { title: p.vacancy.title ?? null, company: p.vacancy.company ?? null, description: p.vacancy.description, url: safeVacancyUrl(p.vacancy.url) } : null,
    };

    // Аккаунт: связка → найден; e-mail занят → связываем сами, только если почту подтвердили обе стороны,
    // иначе — только после входа владельца; иначе — новый аккаунт
    const link = await db.partnerLink.findUnique({ where: { partner_externalUserId: { partner: PARTNER, externalUserId: p.jobtoo_user_id } } });
    const existing = link ? null : await db.user.findUnique({ where: { email: p.email } });
    let account: 'found' | 'created' | 'link_required';
    let userId: string | null = null;
    let autoLinked = false;
    if (link) {
      account = 'found'; userId = link.userId;
    } else if (existing) {
      const busy = await db.partnerLink.findUnique({ where: { partner_userId: { partner: PARTNER, userId: existing.id } } });
      if (existing.emailVerifiedAt && p.email_verified === true && !busy) {
        // Почта подтверждена и в Clymly, и в JobToo — это один владелец. Существующую связь не перезаписываем.
        await db.partnerLink.create({ data: { partner: PARTNER, userId: existing.id, externalUserId: p.jobtoo_user_id } });
        account = 'found'; userId = existing.id; autoLinked = true;
      } else {
        account = 'link_required';
      }
    } else {
      account = 'created';
      const u = await db.user.create({ data: { email: p.email, name: p.name, passwordHash: await hashPassword(randomBytes(24).toString('hex')), hasPassword: false, source: PARTNER } });
      await db.partnerLink.create({ data: { partner: PARTNER, userId: u.id, externalUserId: p.jobtoo_user_id } });
      userId = u.id;
    }
    if (userId) await db.partnerLink.update({ where: { partner_userId: { partner: PARTNER, userId } }, data: { lastInboundRequestId: requestId } });

    const imp = await db.partnerImport.create({ data: { partner: PARTNER, handoffId: h.id, userId, payload: JSON.stringify(importPayload) } });
    const result = { external_user_id: userId ?? `pending:${h.id}`, account, importId: imp.id, userId };
    await db.partnerHandoff.update({ where: { id: h.id }, data: { status: 'ok', account, userId, result: JSON.stringify(result), durationMs: Date.now() - started } });
    if (autoLinked) {
      await track({ direction: 'in', event: 'account_linked', requestId, userId, partnerUserId: p.jobtoo_user_id, account: 'auto' });
      await enqueuePartnerEvent('account_linked', requestId, p.jobtoo_user_id);
      void flushOutbox();
    }
    await track({ direction: 'in', event: 'handoff_accepted', requestId, userId, partnerUserId: p.jobtoo_user_id, account, placement: p.utm?.placement, platform: p.utm?.platform, durationMs: Date.now() - started });

    // Анализ резюме и вакансии — после ответа партнёру, чтобы уложиться в его тайм-аут
    if (userId) after(async () => { try { await applyImport(imp.id, userId!); } catch (e) { console.warn('[integration] import failed', e); } });
    return reissue(h.id, requestId, result);
  } catch (e) {
    console.error('[integration] inbound failed', e);
    return fail(new PartnerError('unavailable', 'Временная ошибка, повторите запрос', 30));
  }
}

/** Выдаёт новую одноразовую ссылку входа для результата обработки. */
async function reissue(handoffId: string, requestId: string, r: { external_user_id: string; account: string; importId: string; userId: string | null }) {
  const purpose = r.account === 'link_required' ? 'link' : 'login';
  const code = await issueCode(purpose, LOGIN_CODE_TTL_MS, { userId: r.userId, importId: r.importId, requestId });
  return Response.json({
    status: 'ok', request_id: requestId, external_user_id: r.external_user_id, account: r.account,
    login_url: `${siteOrigin()}/sso/jobtoo?code=${code}`, expires_at: new Date(Date.now() + LOGIN_CODE_TTL_MS).toISOString(),
  });
}
