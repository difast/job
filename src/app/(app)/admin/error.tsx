'use client';
import { Button, EmptyState } from '@/components/ui';

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return <EmptyState icon="alert" title="Не удалось загрузить данные админки" text="Попробуйте обновить раздел. Если ошибка повторяется — проверьте логи сервера." action={<Button onClick={reset}>Повторить загрузку</Button>} />;
}
