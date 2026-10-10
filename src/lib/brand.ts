// Единый источник бренда: название, домен, публичный URL, цвета и геометрия знака.
// Используется логотипом, метаданными, manifest, sitemap, юридическими документами и генератором иконок.

export const BRAND = {
  name: 'Clymly',
  domain: 'clymly.ru',
  tagline: 'Подготовка к поиску работы',
  description: 'Анализ и улучшение резюме, адаптация под вакансию, сопроводительные письма и подготовка к собеседованию для вашей профессии и уровня.',
} as const;

/** Публичный адрес сайта. APP_URL переопределяет домен (например, для стенда); по умолчанию — https://clymly.ru. */
export const SITE_URL = (process.env.APP_URL || `https://${BRAND.domain}`).replace(/\/$/, '');

/** Цвета бренда (те же значения, что токены в globals.css) — нужны там, где CSS недоступен: иконки, OG-картинка, manifest. */
export const BRAND_COLORS = {
  milk: '#fbf9f5',
  canvas: '#f6f3ee',
  graphite: '#22201d',
  ink: '#1c1a17',
  terracotta: '#b4472a', // первая «y» на светлом фоне
  terracottaLight: '#e6906f', // первая «y» на тёмном фоне
  wine: '#5b2321', // вторая «y» на светлом фоне, фон знака
  wineLight: '#d39c95', // вторая «y» на тёмном фоне
} as const;

/** Знак Clymly — стилизованная «y»: короткое плечо терракотовое, длинный штрих молочный, на винном фоне. viewBox 0 0 64 64. */
export const MARK = {
  arm: 'M20.5 17 L35.2 32.2', // плечо сходится со штрихом в точке (35.2; 32.2)
  stem: 'M43.5 17 L25.5 50',
  stroke: 7.2,
} as const;

export function markSvg({ size = 64, rounded = true }: { size?: number; rounded?: boolean } = {}) {
  const c = BRAND_COLORS;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">`
    + (rounded ? `<rect width="64" height="64" rx="15" fill="${c.wine}"/>` : `<rect width="64" height="64" fill="${c.wine}"/>`)
    + `<path d="${MARK.arm}" stroke="${c.terracottaLight}" stroke-width="${MARK.stroke}" stroke-linecap="round" fill="none"/>`
    + `<path d="${MARK.stem}" stroke="${c.milk}" stroke-width="${MARK.stroke}" stroke-linecap="round" fill="none"/>`
    + `</svg>`;
}
