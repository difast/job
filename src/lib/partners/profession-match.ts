// Сопоставление свободного текста должности (из JobToo) со справочником профессий Clymly.
import { db } from '../db';
import { keyStems, norm } from '../text';

export async function matchProfession(position: string | undefined | null): Promise<string | null> {
  const q = norm(position ?? '').trim();
  if (q.length < 2) return null;
  const all = await db.profession.findMany({ where: { active: true }, select: { id: true, name: true, nameEn: true } });
  const names = all.map((p) => ({ id: p.id, names: [norm(p.name), norm(p.nameEn ?? '')].filter(Boolean) }));
  // 1) точное совпадение названия или id
  const exact = names.find((p) => p.id === q || p.names.includes(q));
  if (exact) return exact.id;
  // 2) название профессии содержится в должности («Ведущий продакт-менеджер» → «Продакт-менеджер»)
  const contained = names.filter((p) => p.names.some((n) => n.length > 3 && q.includes(n))).sort((a, b) => Math.max(...b.names.map((n) => n.length)) - Math.max(...a.names.map((n) => n.length)));
  if (contained[0]) return contained[0].id;
  // 3) пересечение основ слов: все значимые слова названия профессии есть в должности
  const qs = new Set(keyStems(q));
  let best: { id: string; score: number } | null = null;
  for (const p of names) for (const n of p.names) {
    const ks = keyStems(n);
    if (!ks.length) continue;
    const hit = ks.filter((k) => qs.has(k)).length;
    const score = hit / ks.length;
    if (score === 1 && (!best || ks.length > best.score)) best = { id: p.id, score: ks.length };
  }
  return best?.id ?? null;
}
