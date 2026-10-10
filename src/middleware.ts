import { NextResponse, type NextRequest } from 'next/server';

// Быстрый редирект на вход для разделов кабинета без cookie. Полная проверка сессии — на сервере (requirePageUser / API),
// поэтому здесь только ускорение; неизвестные адреса получают обычный 404.
const PRIVATE = ['/dashboard', '/resume', '/vacancies', '/cover-letter', '/interview', '/settings', '/billing', '/onboarding', '/pay'];
const isPrivate = (p: string) => PRIVATE.some((x) => p === x || p.startsWith(x + '/'));

export function middleware(req: NextRequest) {
  if (!req.cookies.has('session') && isPrivate(req.nextUrl.pathname)) {
    const url = new URL('/login', req.url);
    const { pathname, search } = req.nextUrl;
    if (pathname !== '/onboarding') url.searchParams.set('next', pathname + search); // после входа — обратно в нужный раздел
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Статика бренда (иконки, manifest, robots, sitemap, превью) доступна без входа
export const config = { matcher: ['/((?!_next|favicon.ico|icon|apple-icon|manifest.webmanifest|robots.txt|sitemap.xml|opengraph-image|twitter-image|icons/).*)'] };
