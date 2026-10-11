import { z } from 'zod';
import { db } from '@/lib/db';
import { requireApiUser } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';
import { generateQuestions, llmEnabled } from '@/lib/ai';
import { aiRateLimit } from '@/lib/ai/limits';
import { requireProfession, latestResume } from '@/lib/context';
import { parseJson, type VacancyAnalysis } from '@/lib/types';

export const maxDuration = 60;
const schema = z.object({ vacancyId: z.string().min(1).max(40), type: z.enum(['hr', 'professional', 'manager']) });

const view = (q: { id: string; text: string; category: string; difficulty: number; sampleAnswer: string; keyPoints: string; attempts?: { score: number }[] }) => ({
  id: q.id, text: q.text, category: q.category, difficulty: q.difficulty, sampleAnswer: q.sampleAnswer,
  keyPoints: parseJson<string[]>(q.keyPoints, []), lastScore: q.attempts?.[0]?.score ?? null, tailored: true,
});

/**
 * Вопросы под конкретную вакансию пользователя (ИИ). Генерируются один раз на вакансию и тип собеседования
 * и сохраняются: повторный запрос возвращает те же вопросы, без нового обращения к ИИ.
 * В упрощённом режиме без ИИ возвращается пустой список — тренировка идёт по банку вопросов.
 */
export const POST = handler(async (req: Request) => {
  const user = await requireApiUser();
  const { vacancyId, type } = schema.parse(await req.json().catch(() => ({})));
  const vacancy = await db.vacancy.findFirst({ where: { id: vacancyId, userId: user.id } });
  if (!vacancy) throw new ApiError(404, 'Вакансия не найдена');
  const include = { attempts: { where: { userId: user.id }, orderBy: { createdAt: 'desc' as const }, take: 1, select: { score: true } } };
  const existing = await db.interviewQuestion.findMany({ where: { vacancyId, type }, orderBy: { sortOrder: 'asc' }, include });
  if (existing.length) return json({ questions: existing.map(view), engine: 'llm' });
  if (!llmEnabled()) return json({ questions: [], engine: 'heuristic' });
  const p = await requireProfession(user);
  const resume = await latestResume(user.id);
  const analysis = parseJson<VacancyAnalysis | null>(vacancy.analysis, null);
  const gaps = (analysis?.requirements ?? []).filter((r) => r.status !== 'match').map((r) => r.text);
  aiRateLimit(user.id);
  const qs = await generateQuestions({ p, type, vacancyText: vacancy.text, resumeText: resume?.text ?? '', gaps });
  // Параллельный запрос мог уже сохранить вопросы — тогда возвращаем их
  const saved = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'iq:' + vacancyId + ':' + type}))`;
    const again = await tx.interviewQuestion.findMany({ where: { vacancyId, type }, orderBy: { sortOrder: 'asc' }, include });
    if (again.length) return again;
    for (const [i, q] of qs.entries()) {
      await tx.interviewQuestion.create({ data: { vacancyId, type, professionId: null, level: null, text: q.text, category: q.category, difficulty: q.difficulty, sampleAnswer: q.sampleAnswer, keyPoints: JSON.stringify(q.keyPoints), sortOrder: i } });
    }
    return tx.interviewQuestion.findMany({ where: { vacancyId, type }, orderBy: { sortOrder: 'asc' }, include });
  });
  return json({ questions: saved.map(view), engine: 'llm' });
});
