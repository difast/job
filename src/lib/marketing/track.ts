// Маркетинговые переходы: /go/<slug>?utm_… → запись визита → редирект на внутреннюю страницу.
// Приватность: IP не сохраняется, отпечаток устройства не строится. Уникальность — по случайному id
// в first-party cookie (90 дней), который ставится, только если пользователь не отказался от аналитических cookie.
import { randomUUID } from 'node:crypto';
import { db } from '../db';

export const VISITOR_COOKIE = 'cl_vid';
export const CONSENT_COOKIE = 'cl_consent'; // "1" — согласие, "0" — отказ; нет cookie — решение не принято
export const VISITOR_TTL_SEC = 90 * 24 * 3600;

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
/** Значение UTM: латиница, цифры, -, _, ., до 64 символов, в нижнем регистре. Остальное отбрасывается. */
export const cleanUtm = (v: string | null | undefined) => {
  const s = (v ?? '').trim().toLowerCase();
  return /^[a-z0-9._-]{1,64}$/.test(s) ? s : null;
};
export const SLUG_RE = /^[a-z0-9-]{1,40}$/;
export const isUuid = (v: string | undefined | null): v is string => !!v && /^[0-9a-f-]{36}$/.test(v);

/** Внутренний путь назначения ссылки: только «/…», без схемы, хоста и обратных слешей (без открытого редиректа). */
export const safeTarget = (t: string | null | undefined) => (t && /^\/(?!\/)[\w\-/?=&.%]*$/.test(t) && !t.includes('\\') ? t : '/');

/** Грубая классификация User-Agent без сторонних библиотек: тип устройства, ОС, браузер. */
export function parseUA(ua: string) {
  const u = ua.slice(0, 400);
  const tablet = /iPad|Tablet|Android(?!.*Mobile)/i.test(u);
  const mobile = !tablet && /Mobi|iPhone|Android/i.test(u);
  const os = /Windows/i.test(u) ? 'Windows' : /iPhone|iPad|iOS/i.test(u) ? 'iOS' : /Mac OS X|Macintosh/i.test(u) ? 'macOS' : /Android/i.test(u) ? 'Android' : /Linux/i.test(u) ? 'Linux' : null;
  const browser = /Instagram/i.test(u) ? 'Instagram' : /YaBrowser/i.test(u) ? 'Яндекс Браузер' : /Edg\//i.test(u) ? 'Edge' : /OPR\/|Opera/i.test(u) ? 'Opera'
    : /Firefox\//i.test(u) ? 'Firefox' : /Chrome\//i.test(u) ? 'Chrome' : /Safari\//i.test(u) ? 'Safari' : null;
  return { device: u ? (tablet ? 'tablet' : mobile ? 'mobile' : 'desktop') : null, os, browser };
}

export interface ClickInput { slug: string; params: URLSearchParams; ua: string; referrer: string | null; lang: string | null; visitorId: string | null; consent: string | null }

/** Записывает переход. Возвращает адрес редиректа и id посетителя для cookie (null — cookie не ставим). */
export async function recordClick(i: ClickInput): Promise<{ target: string; visitorId: string | null } | null> {
  if (!SLUG_RE.test(i.slug)) return null;
  const link = await db.marketingLink.findUnique({ where: { slug: i.slug } });
  if (!link || !link.active) return null;
  const declined = i.consent === '0';
  const visitorId = declined ? null : isUuid(i.visitorId) ? i.visitorId : randomUUID();
  const utm = Object.fromEntries(UTM_KEYS.map((k) => [k, cleanUtm(i.params.get(k))])) as Record<(typeof UTM_KEYS)[number], string | null>;
  let referrerHost: string | null = null;
  try { referrerHost = i.referrer ? new URL(i.referrer).hostname.slice(0, 100) : null; } catch { referrerHost = null; }
  const lang = (i.lang ?? '').split(',')[0].trim().slice(0, 12).toLowerCase() || null;
  const target = safeTarget(link.target);
  // посетитель уже связан с аккаунтом (вошёл раньше) — привязываем визит к нему
  const known = visitorId ? await db.visit.findFirst({ where: { visitorId, userId: { not: null } }, select: { userId: true } }) : null;
  await db.visit.create({ data: {
    linkId: link.id, visitorId, userId: known?.userId ?? null,
    utmSource: utm.utm_source ?? link.utmSource, utmMedium: utm.utm_medium ?? link.utmMedium, utmCampaign: utm.utm_campaign ?? link.utmCampaign,
    utmContent: utm.utm_content, utmTerm: utm.utm_term, referrerHost, landing: target.split('?')[0], lang, ...parseUA(i.ua),
  } });
  return { target, visitorId };
}

/**
 * Регистрация: связываем визиты этого посетителя с аккаунтом.
 * first-touch — самый ранний визит, last-touch — последний визит перед регистрацией.
 */
export async function attributeSignup(userId: string, visitorId: string | null | undefined) {
  if (!isUuid(visitorId)) return;
  try {
    const visits = await db.visit.findMany({ where: { visitorId, userId: null }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!visits.length) return;
    await db.visit.updateMany({ where: { visitorId, userId: null }, data: { userId } });
    await db.user.update({ where: { id: userId }, data: { firstVisitId: visits[0].id, signupVisitId: visits[visits.length - 1].id } });
  } catch (e) { console.warn('[marketing] signup attribution failed', e); }
}

/** Вход: визиты посетителя, сделанные до входа, связываем с аккаунтом (для атрибуции будущих оплат). Источник регистрации не меняется. */
export async function linkVisitsOnLogin(userId: string, visitorId: string | null | undefined) {
  if (!isUuid(visitorId)) return;
  try { await db.visit.updateMany({ where: { visitorId, userId: null }, data: { userId } }); } catch (e) { console.warn('[marketing] login link failed', e); }
}

/** Отказ от аналитических cookie: визиты посетителя обезличиваются и отвязываются от аккаунта, атрибуция снимается. */
export async function forgetVisitor(visitorId: string | null | undefined) {
  if (!isUuid(visitorId)) return;
  const visits = await db.visit.findMany({ where: { visitorId }, select: { id: true } });
  const ids = visits.map((v) => v.id);
  if (!ids.length) return;
  await db.user.updateMany({ where: { firstVisitId: { in: ids } }, data: { firstVisitId: null } });
  await db.user.updateMany({ where: { signupVisitId: { in: ids } }, data: { signupVisitId: null } });
  await db.visit.updateMany({ where: { id: { in: ids } }, data: { visitorId: null, userId: null } });
}
