import type { MetadataRoute } from 'next';
import { BRAND, BRAND_COLORS } from '@/lib/brand';

const V = 'v=2'; // версия иконок — увеличить при их замене, чтобы сбросить кэш

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name} — ${BRAND.tagline.toLowerCase()}`,
    short_name: BRAND.name,
    description: BRAND.description,
    lang: 'ru',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: BRAND_COLORS.canvas,
    theme_color: BRAND_COLORS.graphite,
    icons: [
      { src: `/icons/icon-192.png?${V}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `/icons/icon-512.png?${V}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `/icons/maskable-512.png?${V}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
