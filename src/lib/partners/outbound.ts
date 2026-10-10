// Передача профиля и резюме из Clymly в JobToo (кнопка «Перейти в JobToo»).
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { ApiError } from '../http';
import { applyChanges } from '../changes';
import { latestResume } from '../context';
import { norm } from '../text';
import { parseJson, type Change } from '../types';
import { API_PATH, JOBTOO_CONSENT_VERSION, OUTBOUND_TIMEOUT_MS, PARTNER, PARTNER_NAME, isPartnerLoginUrl, jobtoo } from './config';
import { sign } from './signing';
import { allow } from './ratelimit';
import { track } from './events';

type U = { id: string; email: string; name: string; professionId: string | null; level: string | null; emailVerifiedAt: Date | null };

export async function activeConsent(userId: string) {
  return db.partnerConsent.findFirst({ where: { userId, partner: PARTNER, revokedAt: null, version: JOBTOO_CONSENT_VERSION }, orderBy: { acceptedAt: 'desc' } });
}

export async function sendToJobToo(user: U, opts: { placement: string; vacancyId?: string | null; platform?: string }) {
  if (!jobtoo.outboundReady()) throw new ApiError(503, `Переход в ${PARTNER_NAME} временно недоступен`);
  const consent = await activeConsent(user.id);
  if (!consent) throw new ApiError(403, 'Нужно согласие на передачу данных в JobToo');
  if (!allow(`out:${user.id}`, 10)) throw new ApiError(429, 'Слишком много попыток. Подождите минуту и попробуйте снова.');
  const resume = await latestResume(user.id);
  if (!resume) throw new ApiError(400, 'Сначала загрузите резюме — без него JobToo нечего передать');
  const profession = user.professionId ? await db.profession.findUnique({ where: { id: user.professionId } }) : null;
  if (!profession || !user.level) throw new ApiError(400, 'Сначала выберите профессию и уровень');

  let adapted: string | null = null;
  if (opts.vacancyId) {
    const v = await db.vacancy.findFirst({ where: { id: opts.vacancyId, userId: user.id }, include: { adaptation: true } });
    if (v?.adaptation) {
      const changes = parseJson<Change[]>(v.adaptation.changes, []);
      if (changes.some((c) => c.status === 'accepted')) adapted = applyChanges(resume.text, changes);
    }
  }
  const text = norm(resume.text);
  const skills = parseJson<string[]>(profession.skills, []).filter((s) => text.includes(norm(s))).slice(0, 40);
  const link = await db.partnerLink.findUnique({ where: { partner_userId: { partner: PARTNER, userId: user.id } } });

  const payload = {
    source: 'clymly', clymly_user_id: user.id, jobtoo_user_id: link?.externalUserId ?? null,
    email: user.email, email_verified: !!user.emailVerifiedAt, // true — пользователь подтвердил почту по ссылке из письма Clymly
    name: user.name, target_position: profession.name, target_position_id: profession.id, experience_level: user.level,
    resume_id: resume.id, resume_text: resume.text.slice(0, 30_000), resume_adapted_text: adapted?.slice(0, 30_000) ?? null,
    skills_detected: skills, consent: { accepted_at: consent.acceptedAt.toISOString(), version: consent.version },
    utm: { placement: opts.placement, platform: opts.platform ?? 'web' },
  };
  const fields = Object.entries(payload).filter(([k, v]) => v !== null && !['source', 'utm', 'consent'].includes(k) && !(Array.isArray(v) && !v.length)).map(([k]) => k);

  const fd = new FormData();
  fd.set('payload', JSON.stringify(payload));
  const serialized = new Request('http://local', { method: 'POST', body: fd });
  const body = Buffer.from(await serialized.arrayBuffer());
  const contentType = serialized.headers.get('content-type')!;
  const requestId = randomUUID();
  const ts = String(Math.floor(Date.now() / 1000));
  const started = Date.now();
  const h = await db.partnerHandoff.create({ data: { partner: PARTNER, direction: 'out', requestId, userId: user.id, externalUserId: link?.externalUserId, status: 'processing', fields: JSON.stringify(fields), placement: opts.placement, platform: opts.platform ?? 'web' } });
  await track({ direction: 'out', event: 'handoff_sent', requestId, userId: user.id, partnerUserId: link?.externalUserId, placement: opts.placement, platform: opts.platform ?? 'web' });

  const failed = async (code: string, message: string, status = 502) => {
    const durationMs = Date.now() - started;
    await db.partnerHandoff.update({ where: { id: h.id }, data: { status: 'error', errorCode: code, durationMs } });
    await track({ direction: 'out', event: 'handoff_failed', requestId, userId: user.id, errorCode: code, durationMs, placement: opts.placement, platform: opts.platform ?? 'web' });
    throw new ApiError(status, message);
  };

  let res: Response;
  try {
    res = await fetch(`${jobtoo.apiBase()}${API_PATH}/handoff`, {
      method: 'POST', body, signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS), redirect: 'error',
      headers: { 'Content-Type': contentType, 'X-Partner-Id': 'clymly', 'X-Request-Id': requestId, 'X-Timestamp': ts, 'X-Signature': sign(jobtoo.outboundSecret(), ts, requestId, body) },
    });
  } catch (e) {
    const timeout = (e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError';
    return failed(timeout ? 'timeout' : 'network', timeout ? 'JobToo не ответил вовремя. Попробуйте ещё раз.' : 'Не удалось связаться с JobToo. Попробуйте ещё раз.', 504);
  }
  const data = (await res.json().catch(() => null)) as null | { status?: string; error?: { code?: string; message?: string }; external_user_id?: string; account?: string; login_url?: string; expires_at?: string };
  if (!res.ok || data?.status !== 'ok') {
    const code = (data?.error?.code ?? `http_${res.status}`).slice(0, 40);
    const msg = typeof data?.error?.message === 'string' && data.error.message.length < 300 ? data.error.message : 'JobToo не смог принять данные. Попробуйте позже.';
    return failed(code, msg, res.status === 429 ? 429 : 502);
  }
  const expires = Date.parse(data.expires_at ?? '');
  if (!isPartnerLoginUrl(data.login_url) || !Number.isFinite(expires) || expires < Date.now()) return failed('invalid_response', 'JobToo вернул некорректную ссылку для входа. Переход отменён.');

  const account = ['created', 'found', 'link_required'].includes(data.account ?? '') ? data.account! : null;
  const externalUserId = typeof data.external_user_id === 'string' && data.external_user_id.length <= 100 ? data.external_user_id : null;
  if (externalUserId && !externalUserId.startsWith('pending:') && account !== 'link_required') {
    await db.partnerLink.upsert({
      where: { partner_userId: { partner: PARTNER, userId: user.id } },
      update: { externalUserId }, create: { partner: PARTNER, userId: user.id, externalUserId },
    }).catch((e) => console.warn('[integration] link save failed', e));
  }
  const durationMs = Date.now() - started;
  await db.partnerHandoff.update({ where: { id: h.id }, data: { status: 'ok', account, externalUserId, durationMs, result: JSON.stringify({ account, external_user_id: externalUserId }) } });
  await track({ direction: 'out', event: 'handoff_succeeded', requestId, userId: user.id, partnerUserId: externalUserId, account, durationMs, placement: opts.placement, platform: opts.platform ?? 'web' });
  // Ссылку входа не сохраняем и не пишем в журнал — только отдаём браузеру
  return { url: data.login_url, requestId };
}
