import { db } from '@/lib/db';
import { handler, json } from '@/lib/http';
import { norm } from '@/lib/text';

// Список профессий из БД, сгруппированный по категориям. ?q= — поиск по названию/описанию/навыкам.
export const GET = handler(async (req: Request) => {
  const q = norm(new URL(req.url).searchParams.get('q') ?? '').trim();
  const cats = await db.professionCategory.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { professions: { where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, nameEn: true, description: true, skills: true } } },
  });
  const result = cats
    .map((c) => ({
      id: c.id, name: c.name,
      professions: c.professions
        .filter((p) => !q || norm(`${p.name} ${p.nameEn ?? ''} ${p.skills}`).includes(q))
        .map((p) => ({ id: p.id, name: p.name, nameEn: p.nameEn, description: p.description })),
    }))
    .filter((c) => c.professions.length);
  return json({ categories: result });
});
