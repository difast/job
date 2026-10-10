import { Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Загружаем данные">
      <Skeleton className="mb-6 h-8 w-56" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[84px] rounded-xl" />)}</div>
      <Skeleton className="mt-6 h-64 rounded-2xl" />
    </div>
  );
}
