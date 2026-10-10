import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter/index.css';
import '@fontsource-variable/onest/index.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Карьерный навигатор — подготовка к поиску работы',
  description: 'Анализ резюме, адаптация под вакансию, сопроводительные письма и подготовка к собеседованию под вашу профессию.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
