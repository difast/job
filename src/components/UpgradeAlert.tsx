// Ошибка 402 «доступно в Pro / лимит исчерпан» — с кнопкой подключения тарифа вместо «попробуйте ещё раз».
import Link from 'next/link';
import { Alert } from './ui';

export const isUpgrade = (r: { status?: number; body?: Record<string, unknown> }) => r.status === 402 || r.body?.upgrade === true;

export function UpgradeAlert({ message, className }: { message: string; className?: string }) {
  return (
    <Alert tone="warn" className={className}>
      <span>{message} <Link href="/billing" className="font-semibold underline underline-offset-2" data-testid="upgrade-link">Подключить Pro</Link></span>
    </Alert>
  );
}
