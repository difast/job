import { NextResponse, type NextRequest } from 'next/server';

// Быстрая проверка наличия cookie; полная валидация сессии — на сервере (getUser).
const PUBLIC = ['/', '/login', '/register', '/terms', '/privacy'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const has = req.cookies.has('session');
  if (!has && !PUBLIC.includes(pathname) && !pathname.startsWith('/api/')) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next|favicon.ico).*)'] };
