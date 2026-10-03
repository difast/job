import { Card, Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Загрузка">
      <Skeleton className="h-8 w-64" /><Skeleton className="mb-8 mt-3 h-4 w-96 max-w-full" />
      <Card><div className="flex flex-col gap-8 sm:flex-row sm:items-center"><Skeleton className="h-32 w-32 shrink-0 !rounded-full" /><div className="grid flex-1 gap-4 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i}><Skeleton className="mb-2 h-3 w-24" /><Skeleton className="h-1.5 w-full" /></div>)}</div></div></Card>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36 !rounded-xl" />)}</div>
    </div>
  );
}
