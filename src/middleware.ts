import { NextResponse, type NextRequest } from 'next/server';

// Быстрый редирект на вход для разделов кабинета без cookie. Полная проверка сессии — на сервере (requirePageUser / API),
// поэтому здесь только ускорение; неизвестные адреса получают обычный 404.
const PRIVATE = ['/dashboard', '/resume', '/vacancies', '/cover-letter', '/interview', '/settings', '/billing', '/onboarding', '/pay'];
const isPrivate = (p: string) => PRIVATE.some((x) => p === x || p.startsWith(x + '/'));

// Старые адреса проекта → 301 на основной домен (только GET/HEAD страниц; API, вебхуки оплаты и health-check не затрагиваются).
// Пример: LEGACY_HOSTS="difast-job-8beb.twc1.net"  APP_URL="https://clymly.ru"
const LEGACY = (process.env.LEGACY_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(':')[0].toLowerCase();
  if (LEGACY.length && LEGACY.includes(host) && process.env.APP_URL && (req.method === 'GET' || req.method === 'HEAD') && !pathname.startsWith('/api/')) {
    return NextResponse.redirect(`${process.env.APP_URL.replace(/\/$/, '')}${pathname}${search}`, 301);
  }
  const has = req.cookies.has('session');
  if (!has && isPrivate(pathname)) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

// Статика бренда (иконки, manifest, robots, sitemap, превью) доступна без входа
export const config = {
  runtime: 'nodejs', // переменные окружения (LEGACY_HOSTS, APP_URL) читаются при запуске, а не при сборке
  matcher: ['/((?!_next|favicon.ico|icon|apple-icon|manifest.webmanifest|robots.txt|sitemap.xml|opengraph-image|twitter-image|icons/).*)'],
};
