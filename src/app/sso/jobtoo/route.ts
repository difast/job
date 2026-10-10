import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createSession } from '@/lib/auth';
import { LINK_COOKIE, LINK_TICKET_TTL_MS, PARTNER } from '@/lib/partners/config';
import { consumeCode, issueCode } from '@/lib/partners/codes';
import { applyImport } from '@/lib/partners/imports';
import { enqueuePartnerEvent, flushOutbox, track } from '@/lib/partners/events';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Относительный адрес: за прокси хостинга req.url может содержать внутренний адрес сервера
const to = (_req: Request, path: string) => new NextResponse(null, { status: 303, headers: { Location: path, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });

// Вход по одноразовой ссылке из JobToo
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get('code');
  const r = await consumeCode(code, 'login').then(async (x) => (x.ok || x.reason !== 'invalid' ? x : consumeCode(code, 'link')));
  if (!r.ok) {
    await track({ direction: 'in', event: r.reason === 'reused' ? 'login_link_reused' : r.reason === 'expired' ? 'login_link_expired' : 'login_link_invalid', requestId: r.requestId ?? null });
    return to(req, `/sso/expired`);
  }
  const c = r.code;
  const h = await db.partnerHandoff.findUnique({ where: { partner_direction_requestId: { partner: PARTNER, direction: 'in', requestId: c.requestId } } });
  await track({ direction: 'in', event: 'login_link_opened', requestId: c.requestId, userId: c.userId, partnerUserId: h?.externalUserId, placement: h?.placement, platform: h?.platform });

  // Аккаунт с таким e-mail уже есть: вход только после подтверждения владельцем (пароль Clymly)
  if (c.purpose === 'link') {
    const ticket = await issueCode('link_ticket', LINK_TICKET_TTL_MS, { importId: c.importId, requestId: c.requestId });
    (await cookies()).set(LINK_COOKIE, ticket, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: LINK_TICKET_TTL_MS / 1000 });
    return to(req, '/link/jobtoo');
  }

  const userId = c.userId!;
  await createSession(userId);
  await track({ direction: 'in', event: 'login_completed', requestId: c.requestId, userId, partnerUserId: h?.externalUserId, placement: h?.placement, platform: h?.platform });
  await enqueuePartnerEvent('login_completed', c.requestId, h?.externalUserId ?? null);
  void flushOutbox();

  // Данные могли ещё обрабатываться в фоне — применяем здесь или дожидаемся фоновой обработки (до 25 с)
  let landing = '/dashboard';
  if (c.importId && h) {
    let res: { landing: string; applied: boolean } | null = null;
    try { res = await applyImport(c.importId, userId); } catch (e) { console.warn('[integration] import on login failed', e); }
    if (res && (res.applied || res.landing === '/onboarding')) landing = res.landing;
    else {
      for (let i = 0; i < 50; i++) {
        const cur = await db.partnerHandoff.findUnique({ where: { id: h.id } });
        const l = JSON.parse(cur?.result ?? '{}').landing as string | undefined;
        if (l) { landing = l; break; }
        if (await db.partnerImport.findUnique({ where: { id: c.importId } })) break; // импорт снова в очереди (ошибка) — не ждём
        await new Promise((r2) => setTimeout(r2, 500));
      }
    }
  }
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.pdConsentAt) return to(req, `/welcome?next=${encodeURIComponent(landing)}`);
  if (!user.professionId || !user.level) return to(req, `/onboarding?next=${encodeURIComponent(landing === '/onboarding' ? '/dashboard' : landing)}`);
  return to(req, landing === '/onboarding' ? '/dashboard' : landing);
}
