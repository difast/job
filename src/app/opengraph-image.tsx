import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { BRAND, BRAND_COLORS, MARK } from '@/lib/brand';

export const alt = `${BRAND.name} — ${BRAND.tagline.toLowerCase()}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const font = (f: string) => readFileSync(path.join(process.cwd(), 'node_modules/@fontsource/onest/files', f));

// Превью для соцсетей и мессенджеров: текстовый логотип с фирменными «y» и знак
export default function OgImage() {
  const c = BRAND_COLORS;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: c.canvas, padding: '72px 84px', fontFamily: 'Onest, OnestCyr' }}>
        <svg width="96" height="96" viewBox="0 0 64 64">
          <rect width="64" height="64" rx="15" fill={c.wine} />
          <path d={MARK.arm} stroke={c.terracottaLight} strokeWidth={MARK.stroke} strokeLinecap="round" fill="none" />
          <path d={MARK.stem} stroke={c.milk} strokeWidth={MARK.stroke} strokeLinecap="round" fill="none" />
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 168, fontWeight: 600, letterSpacing: '-0.04em', color: c.ink, lineHeight: 1 }}>
            <span>Cl</span><span style={{ color: c.terracotta }}>y</span><span>ml</span><span style={{ color: c.wine }}>y</span>
          </div>
          <div style={{ marginTop: 28, fontSize: 44, fontWeight: 600, color: c.ink, letterSpacing: '-0.02em', lineHeight: 1.2, maxWidth: 920 }}>
            Резюме, вакансии и собеседования — под вашу профессию
          </div>
          <div style={{ marginTop: 18, fontSize: 30, color: '#6f675e' }}>{BRAND.domain}</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Onest', data: font('onest-latin-600-normal.woff'), weight: 600, style: 'normal' },
        { name: 'OnestCyr', data: font('onest-cyrillic-600-normal.woff'), weight: 600, style: 'normal' },
      ],
    },
  );
}
