'use client';
import { Button, EmptyState } from '@/components/ui';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <EmptyState icon="alert" title="Не удалось загрузить страницу" text="Что-то пошло не так на нашей стороне. Попробуйте обновить — ваши данные не потеряны." action={<Button size="lg" onClick={reset}>Попробовать снова</Button>} />;
}
