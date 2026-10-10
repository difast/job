// Простой лимит частоты в памяти процесса (приложение работает в одном экземпляре).
const buckets = new Map<string, number[]>();

/** true — запрос разрешён. */
export function allow(key: string, limit: number, windowMs = 60_000, now = Date.now()) {
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) { buckets.set(key, arr); return false; }
  arr.push(now);
  buckets.set(key, arr);
  if (buckets.size > 10_000) for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  return true;
}
