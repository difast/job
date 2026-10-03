import { db } from '@/lib/db';
import { requireApiUser } from '@/lib/auth';
import { handler, json } from '@/lib/http';
import { parseJson } from '@/lib/types';
import { requireProfession } from '@/lib/context';
import { z } from 'zod';

// Банк вопросов: профессия → уровень → тип. Универсальные вопросы (professionId/level = null) подмешиваются всегда.
export const GET = handler(async (req: Request) => {
  const user = await requireApiUser();
  const p = await requireProfession(user);
  const type = z.enum(['hr', 'professional', 'manager']).parse(new URL(req.url).searchParams.get('type') ?? 'hr');
  const rows = await db.interviewQuestion.findMany({
    where: { type, OR: [{ professionId: p.id }, { professionId: null }], AND: [{ OR: [{ level: p.level }, { level: null }] }] },
    orderBy: [{ difficulty: 'asc' }, { sortOrder: 'asc' }],
    include: { attempts: { where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  return json({
    questions: rows.map((q) => ({
      id: q.id, text: q.text, category: q.category, difficulty: q.difficulty, sampleAnswer: q.sampleAnswer,
      keyPoints: parseJson<string[]>(q.keyPoints, []), lastScore: q.attempts[0]?.score ?? null,
    })),
  });
});
