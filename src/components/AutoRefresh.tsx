'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Периодически перезапрашивает серверные данные страницы (ограниченное число раз). */
export default function AutoRefresh({ everyMs = 5000, maxTimes = 24 }: { everyMs?: number; maxTimes?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => { if (++n > maxTimes || document.hidden) { if (n > maxTimes) clearInterval(t); return; } router.refresh(); }, everyMs);
    return () => clearInterval(t);
  }, [router, everyMs, maxTimes]);
  return null;
}
