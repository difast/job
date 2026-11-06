// Сопоставление свободного текста должности (из JobToo) со справочником профессий Clymly.
import { db } from '../db';
import { keyStems, norm } from '../text';
import { parseJson } from '../types';

export async function matchProfession(position: string | undefined | null): Promise<string | null> {
  const q = norm(position ?? '').trim();
  if (q.length < 2) return null;
  // «Другая профессия» не сопоставляется; синонимы («специалист по сбыту») — наравне с названием
  const all = await db.profession.findMany({ where: { active: true, id: { not: 'custom' } }, select: { id: true, name: true, nameEn: true, aliases: true } });
  const names = all.map((p) => ({ id: p.id, names: [norm(p.name), norm(p.nameEn ?? '')].filter((n) => n.length > 1) }));
  const aliases = all.map((p) => ({ id: p.id, names: parseJson<string[]>(p.aliases, []).map(norm).filter((n) => n.length > 1) }));
  // 1) точное совпадение названия, синонима или id
  const exact = names.find((p) => p.id === q || p.names.includes(q)) ?? aliases.find((p) => p.names.includes(q));
  if (exact) return exact.id;
  // 2) название (или синоним из нескольких слов) содержится в должности («Ведущий продакт-менеджер» → «Продакт-менеджер»).
  // Однословные синонимы («исследователь») — только точным совпадением, иначе «Космонавт-исследователь» стал бы научным сотрудником.
  const multi = (n: string) => /\s/.test(n);
  const contained = [...names.map((p) => ({ id: p.id, hits: p.names.filter((n) => n.length > 3 && q.includes(n)) })),
    ...aliases.map((p) => ({ id: p.id, hits: p.names.filter((n) => multi(n) && q.includes(n)) }))]
    .filter((p) => p.hits.length).sort((a, b) => Math.max(...b.hits.map((n) => n.length)) - Math.max(...a.hits.map((n) => n.length)));
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
