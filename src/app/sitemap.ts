import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/brand';

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: [string, number][] = [['/', 1], ['/register', 0.6], ['/login', 0.4], ['/terms', 0.3], ['/privacy', 0.3], ['/consent', 0.3]];
  return pages.map(([path, priority]) => ({ url: `${SITE_URL}${path === '/' ? '' : path}`, changeFrequency: 'monthly', priority }));
}
