import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { START_COOKIE, START_TTL_SEC } from '@/lib/partners/config';
import { track } from '@/lib/partners/events';

export const dynamic = 'force-dynamic';

// Вход перехода из JobToo: https://clymly.ru/partner/jobtoo/start?code=<код>.
// Код сразу убираем из адресной строки (в httpOnly-cookie на 15 минут) и показываем условия Clymly.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const code = u.searchParams.get('code') ?? '';
  const placement = (u.searchParams.get('placement') ?? '').replace(/[^a-z_]/g, '').slice(0, 40) || null;
  const jar = await cookies();
  if (/^[\w-]{8,200}$/.test(code)) {
    jar.set(START_COOKIE, JSON.stringify({ code, placement }), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: START_TTL_SEC });
    await track({ direction: 'in', event: 'start_opened', placement });
  }
  return new NextResponse(null, { status: 303, headers: { Location: '/partner/jobtoo', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
