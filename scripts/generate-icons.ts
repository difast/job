// Генератор иконок бренда из единого источника (src/lib/brand.ts → markSvg).
// Запуск: npx tsx scripts/generate-icons.ts — результат коммитится в репозиторий.
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { markSvg } from '../src/lib/brand';

const png = (size: number, rounded: boolean) => sharp(Buffer.from(markSvg({ size: 512, rounded }))).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/** ICO с PNG-вложениями (поддерживается всеми современными браузерами). */
function ico(images: { size: number; data: Buffer }[]) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((img, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(img.size >= 256 ? 0 : img.size, e); header.writeUInt8(img.size >= 256 ? 0 : img.size, e + 1);
    header.writeUInt8(0, e + 2); header.writeUInt8(0, e + 3); header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(img.data.length, e + 8); header.writeUInt32LE(offset, e + 12);
    offset += img.data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

async function main() {
  mkdirSync('public/icons', { recursive: true });
  // Браузерные иконки — по соглашениям Next.js App Router (ссылки с хешем для сброса кэша добавляются автоматически)
  writeFileSync('src/app/icon.svg', markSvg({ size: 64, rounded: true }));
  writeFileSync('src/app/favicon.ico', ico(await Promise.all([16, 32, 48].map(async (s) => ({ size: s, data: await png(s, true) })))));
  // Apple Touch Icon: непрозрачный квадрат без скругления — iOS скругляет углы сам
  writeFileSync('src/app/apple-icon.png', await png(180, false));
  // PWA: обычные (any) и маскируемая (maskable, знак в безопасной зоне 80%)
  writeFileSync('public/icons/icon-192.png', await png(192, true));
  writeFileSync('public/icons/icon-512.png', await png(512, true));
  writeFileSync('public/icons/maskable-512.png', await png(512, false));
  console.log('Иконки обновлены: src/app/{icon.svg,favicon.ico,apple-icon.png}, public/icons/*.png');
}
main();
