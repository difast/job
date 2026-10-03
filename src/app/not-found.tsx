import Link from 'next/link';
import { buttonClass, Logo } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Link href="/"><Logo /></Link>
      <h1 className="mt-10 text-[28px] font-semibold tracking-tight">Страница не найдена</h1>
      <p className="mt-2 max-w-sm text-[15px] text-ink-2">Возможно, ссылка устарела или была набрана с ошибкой.</p>
      <Link href="/" className={buttonClass({ size: 'lg', className: 'mt-8' })}>На главную</Link>
    </main>
  );
}
