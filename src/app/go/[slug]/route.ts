import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { CONSENT_COOKIE, VISITOR_COOKIE, VISITOR_TTL_SEC, recordClick } from '@/lib/marketing/track';
import { allow } from '@/lib/partners/ratelimit';

export const dynamic = 'force-dynamic';

// Маркетинговая ссылка: https://clymly.ru/go/<slug>?utm_source=…  → записываем переход и сразу ведём на сайт.
// Адрес перехода берётся только из настроек ссылки (внутренний путь) — параметры запроса на него не влияют.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const jar = await cookies();
  // IP используется только как ключ лимита в памяти и нигде не сохраняется
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
  let res: Awaited<ReturnType<typeof recordClick>> = null;
  if (allow(`go:${ip}`, 30)) {
    try {
      res = await recordClick({
        slug: slug.toLowerCase(), params: url.searchParams, ua: req.headers.get('user-agent') ?? '', referrer: req.headers.get('referer'),
        lang: req.headers.get('accept-language'), visitorId: jar.get(VISITOR_COOKIE)?.value ?? null, consent: jar.get(CONSENT_COOKIE)?.value ?? null,
      });
    } catch (e) { console.warn('[marketing] click not recorded', e); }
  }
  const out = new NextResponse(null, { status: 302, headers: { Location: res?.target ?? '/', 'Cache-Control': 'no-store', 'Referrer-Policy': 'strict-origin-when-cross-origin' } });
  if (res?.visitorId) {
    const secure = process.env.NODE_ENV === 'production';
    out.cookies.set(VISITOR_COOKIE, res.visitorId, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: VISITOR_TTL_SEC });
    // метка без идентификатора — чтобы показать уведомление об аналитических cookie
    out.cookies.set('cl_mk', '1', { httpOnly: false, sameSite: 'lax', secure, path: '/', maxAge: VISITOR_TTL_SEC });
  }
  return out;
}
