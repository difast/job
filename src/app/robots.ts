import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/brand';

// Публичные страницы индексируются; личный кабинет, оплата и API — нет.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/dashboard', '/resume', '/vacancies', '/cover-letter', '/interview', '/settings', '/billing', '/onboarding', '/pay/'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
