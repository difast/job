import { db } from '@/lib/db';
import { handler, json } from '@/lib/http';
import { norm } from '@/lib/text';
import { CUSTOM_PROFESSION_ID } from '@/lib/profession';

// Список профессий из БД, сгруппированный по категориям. ?q= — поиск по названию, синонимам и навыкам.
// «Другая профессия» в списке не показывается — для неё в интерфейсе отдельная кнопка «Моей профессии нет в списке».
export const GET = handler(async (req: Request) => {
  const q = norm(new URL(req.url).searchParams.get('q') ?? '').trim();
  const cats = await db.professionCategory.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { professions: { where: { active: true, id: { not: CUSTOM_PROFESSION_ID } }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, nameEn: true, description: true, skills: true, aliases: true } } },
  });
  const words = q.split(/\s+/).filter(Boolean);
  const result = cats
    .map((c) => ({
      id: c.id, name: c.name,
      professions: c.professions
        .filter((p) => { const hay = norm(`${p.name} ${p.nameEn ?? ''} ${p.aliases} ${p.skills}`); return words.every((w) => hay.includes(w)); })
        .map((p) => ({ id: p.id, name: p.name, nameEn: p.nameEn, description: p.description })),
    }))
    .filter((c) => c.professions.length);
  return json({ categories: result });
});
