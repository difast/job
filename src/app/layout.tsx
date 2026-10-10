import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter/index.css';
import '@fontsource-variable/onest/index.css';
import './globals.css';
import { BRAND, BRAND_COLORS, SITE_URL } from '@/lib/brand';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${BRAND.name} — ${BRAND.tagline.toLowerCase()}`, template: `%s — ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  openGraph: { type: 'website', siteName: BRAND.name, locale: 'ru_RU', url: '/', title: BRAND.name, description: BRAND.description },
  twitter: { card: 'summary_large_image', title: BRAND.name, description: BRAND.description },
  appleWebApp: { title: BRAND.name, capable: true, statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: BRAND_COLORS.canvas };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
