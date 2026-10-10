// JobToo → Clymly по схеме «Clymly забирает сам»:
// человек открывает /partner/jobtoo/start?code=… → принимает условия Clymly → сервер вызывает
// POST {JOBTOO_API_URL}?op=pull с кодом и сведениями о согласии и получает профиль и резюме.
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db';
import { hashPassword } from '../auth';
import { ApiError } from '../http';
import { extractResumeText, MAX_FILE_BYTES } from '../extract';
import { LEGAL_EDITION } from '../legal';
import { LEVELS } from '../types';
import { LINK_TICKET_TTL_MS, PARTNER, jobtoo } from './config';
import { CLYMLY_INBOUND_CONSENT_VERSION } from './shared';
import { partnerPost } from './http';
import { issueCode } from './codes';
import { applyImport, type ImportPayload } from './imports';
import { enqueuePartnerEvent, flushOutbox, track } from './events';
import { sha256Hex } from './signing';

export class PartnerError extends Error {
  constructor(public code: string, message: string, public status = 400, public retryAfter?: number) { super(message); }
}
export function errorResponse(requestId: string | null, e: PartnerError) {
  return Response.json({ status: 'error', request_id: requestId, error: { code: e.code, message: e.message }, ...(e.retryAfter ? { retry_after: e.retryAfter } : {}) }, { status: e.status });
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
  target_position: z.string().trim().max(120).optional().nullable(),
  experience_level: z.enum(LEVELS as [string, ...string[]]).optional().nullable(),
  skills: z.array(z.string().max(80)).max(100).optional().nullable(),
  resume_id: z.string().max(100).optional().nullable(),
  resume_file: z.object({ name: str(200), mime: z.string().max(120), data_b64: z.string().max(14_000_000) /* размер — после декодирования, с понятной ошибкой */ }).optional().nullable(),
  resume_text: z.string().max(30_000).optional().nullable(),
  vacancy: z.object({
    id: z.string().max(100).optional().nullable(), title: z.string().max(200).optional().nullable(),
    company: z.string().max(200).optional().nullable(), description: z.string().max(20_000).optional().nullable(),
  }).optional().nullable(),
  utm: z.object({ placement: z.string().max(40).optional().nullable(), platform: z.string().max(20).optional().nullable() }).optional().nullable(),
});
type Payload = z.infer<typeof payloadSchema>;

const MIME: Record<string, string[]> = {
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  txt: ['text/plain'],
};

/** Файл резюме из pull: тип по расширению, MIME и содержимому должен совпадать. */
async function resumeFromFile(f: NonNullable<Payload['resume_file']>) {
  const ext = f.name.toLowerCase().split('.').pop() ?? '';
  const mime = f.mime.toLowerCase().split(';')[0].trim();
  if (!MIME[ext] || !MIME[ext].includes(mime)) throw new PartnerError('unsupported_file', 'Резюме в JobToo в неподдерживаемом формате (нужен PDF, DOCX или TXT).', 415);
  const buf = Buffer.from(f.data_b64, 'base64');
  if (!buf.length) throw new PartnerError('resume_unreadable', 'Файл резюме пустой.', 422);
  if (buf.length > MAX_FILE_BYTES) throw new PartnerError('file_too_large', 'Файл резюме больше 5 МБ.', 413);
  const magic = buf.subarray(0, 4).toString('latin1');
  if ((ext === 'pdf' && magic !== '%PDF') || (ext === 'docx' && magic !== 'PK\x03\x04')) throw new PartnerError('unsupported_file', 'Содержимое файла резюме не совпадает с его типом.', 415);
  try {
    return { fileName: f.name, text: await extractResumeText(f.name, buf) };
  } catch (e) {
    throw new PartnerError('resume_unreadable', e instanceof ApiError ? e.message : 'Не удалось прочитать резюме.', 422);
  }
}

export type AcceptResult =
  | { kind: 'login'; userId: string; landing: string; created: boolean }
  | { kind: 'link'; ticket: string };

const USER_MESSAGES: Record<string, string> = {
  code_expired: 'Ссылка из JobToo устарела или уже использована. Вернитесь в JobToo и нажмите «Перейти в Clymly» ещё раз.',
  resume_unreadable: 'В JobToo не нашлось резюме, которое можно прочитать. Загрузите резюме в JobToo или прямо в Clymly.',
  rate_limited: 'Слишком много попыток. Подождите минуту и попробуйте снова.',
  timeout: 'JobToo не ответил вовремя. Вернитесь в JobToo и попробуйте ещё раз.',
};

/**
 * Человек принял условия на странице приёма. Забираем данные у JobToo и определяем аккаунт:
 * связка → вход; e-mail уже есть → автосвязь только если почта подтверждена и у нас, и в JobToo, иначе привязка после входа владельца;
 * иначе — новый аккаунт (согласие на обработку дано на странице приёма).
 */
export async function acceptInbound(code: string, meta: { placement?: string | null }): Promise<AcceptResult> {
  if (!jobtoo.inboundReady()) throw new ApiError(503, 'Переход из JobToo временно недоступен');
  const consentAt = new Date();
  const res = await partnerPost<{ handoff_request_id?: string; external_user_id?: string; payload?: unknown }>('pull', {
    code, consent: { accepted_at: consentAt.toISOString(), version: CLYMLY_INBOUND_CONSENT_VERSION },
  });
  if (!res.ok) {
    await track({ direction: 'in', event: 'pull_failed', errorCode: res.code, durationMs: res.durationMs, placement: meta.placement });
    throw new ApiError(res.status === 410 ? 410 : res.status === 429 ? 429 : 502, USER_MESSAGES[res.code] ?? res.message ?? 'JobToo не смог передать данные. Попробуйте позже.');
  }
  const handoffRequestId = typeof res.data.handoff_request_id === 'string' && /^[\w-]{8,64}$/.test(res.data.handoff_request_id) ? res.data.handoff_request_id : res.requestId;
  const parsed = payloadSchema.safeParse(res.data.payload);
  if (!parsed.success) {
    await track({ direction: 'in', event: 'pull_failed', requestId: handoffRequestId, errorCode: 'invalid_payload', durationMs: res.durationMs });
    throw new ApiError(502, 'JobToo передал данные в неожиданном формате. Мы уже знаем о проблеме — попробуйте позже.');
  }
  const p = parsed.data;
  const placement = p.utm?.placement ?? meta.placement ?? null, platform = p.utm?.platform ?? null;
  const fields = Object.keys(p).filter((k) => (p as Record<string, unknown>)[k] != null && k !== 'source');

  // Журнал перехода (без содержимого). request_id — идентификатор перехода у JobToo, по нему сопоставляются события.
  const existingHandoff = await db.partnerHandoff.findUnique({ where: { partner_direction_requestId: { partner: PARTNER, direction: 'in', requestId: handoffRequestId } } });
  if (existingHandoff) throw new ApiError(410, USER_MESSAGES.code_expired);
  const h = await db.partnerHandoff.create({ data: { partner: PARTNER, direction: 'in', requestId: handoffRequestId, externalUserId: p.jobtoo_user_id, status: 'processing', fields: JSON.stringify(fields), placement, platform } });
  const fail = async (e: PartnerError) => {
    await db.partnerHandoff.update({ where: { id: h.id }, data: { status: 'error', errorCode: e.code, durationMs: res.durationMs } });
    await track({ direction: 'in', event: 'pull_failed', requestId: handoffRequestId, partnerUserId: p.jobtoo_user_id, errorCode: e.code, placement, platform });
    throw new ApiError(e.status, e.message);
  };
  await track({ direction: 'in', event: 'pull_succeeded', requestId: handoffRequestId, partnerUserId: p.jobtoo_user_id, placement, platform, durationMs: res.durationMs });

  // Резюме: файл приоритетнее текста; если файл не читается, но есть текст — берём текст
  let resume: ImportPayload['resume'] = null;
  if (p.resume_file) {
    try { resume = await resumeFromFile(p.resume_file); }
    catch (e) { if (!(e instanceof PartnerError)) throw e; if (!p.resume_text || p.resume_text.trim().length < 80) return fail(e); }
  }
  if (!resume && p.resume_text && p.resume_text.trim().length >= 80) resume = { fileName: 'Резюме из JobToo.txt', text: p.resume_text.trim() };
  if (!resume) return fail(new PartnerError('resume_unreadable', USER_MESSAGES.resume_unreadable, 422));

  const importPayload: ImportPayload = {
    externalUserId: p.jobtoo_user_id, email: p.email, emailVerified: p.email_verified, name: p.name,
    targetPosition: p.target_position ?? '', level: (p.experience_level as ImportPayload['level']) ?? null, resume,
    vacancy: p.vacancy?.description ? { title: p.vacancy.title ?? null, company: p.vacancy.company ?? null, description: p.vacancy.description, url: null } : null,
  };

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
      await db.partnerLink.create({ data: { partner: PARTNER, userId: existing.id, externalUserId: p.jobtoo_user_id } });
      account = 'found'; userId = existing.id; autoLinked = true;
    } else account = 'link_required';
  } else {
    account = 'created';
    const u = await db.user.create({ data: {
      email: p.email, name: p.name, passwordHash: await hashPassword(randomBytes(24).toString('hex')), hasPassword: false, source: PARTNER,
      pdConsentAt: consentAt, pdConsentVer: LEGAL_EDITION, // согласие дано на странице приёма перехода
    } });
    await db.partnerLink.create({ data: { partner: PARTNER, userId: u.id, externalUserId: p.jobtoo_user_id } });
    userId = u.id;
  }

  const imp = await db.partnerImport.create({ data: { partner: PARTNER, handoffId: h.id, userId, payload: JSON.stringify(importPayload) } });
  await db.partnerHandoff.update({ where: { id: h.id }, data: { status: 'ok', account, userId, result: JSON.stringify({ account }), durationMs: res.durationMs } });
  await track({ direction: 'in', event: 'handoff_accepted', requestId: handoffRequestId, userId, partnerUserId: p.jobtoo_user_id, account, placement, platform });
  if (autoLinked) await track({ direction: 'in', event: 'account_linked', requestId: handoffRequestId, userId, partnerUserId: p.jobtoo_user_id, account: 'auto' });

  if (account === 'link_required') {
    const ticket = await issueCode('link_ticket', LINK_TICKET_TTL_MS, { importId: imp.id, requestId: handoffRequestId });
    return { kind: 'link', ticket };
  }
  await db.partnerLink.update({ where: { partner_userId: { partner: PARTNER, userId: userId! } }, data: { lastInboundRequestId: handoffRequestId } });
  let landing = '/dashboard';
  try { landing = (await applyImport(imp.id, userId!)).landing; } catch (e) { console.warn('[integration] import failed', e); }
  await track({ direction: 'in', event: 'login_completed', requestId: handoffRequestId, userId, partnerUserId: p.jobtoo_user_id, placement, platform });
  await enqueuePartnerEvent('login_completed', handoffRequestId, p.jobtoo_user_id);
  void flushOutbox();
  return { kind: 'login', userId: userId!, landing, created: account === 'created' };
}

/** Человек отказался от условий Clymly: данные не запрашиваем, код у JobToo сгорит сам. */
export async function declineInbound(code: string, meta: { placement?: string | null }) {
  // handoff_request_id до pull неизвестен — JobToo сопоставляет событие по sha256 кода (см. docs/partner-api-v1.md)
  const ref = sha256Hex(code);
  await track({ direction: 'in', event: 'inbound_consent_declined', placement: meta.placement });
  await enqueuePartnerEvent('consent_declined', ref, null);
  void flushOutbox();
}
